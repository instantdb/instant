(ns instant.db.app-backup-jobs
  "On-demand, per-app backups. A user asks for a backup, we insert a row into
   `app_backup_jobs`, and a resizable pool of workers on each machine claims and
   runs them (streaming the app to S3 via `instant.backup`).

   Concurrency per machine is capped by the `on-demand-backup-worker-count`
   flag, applied live to the thread pool. A partial unique index on
   `app_backup_jobs` allows at most one in-flight job per app."
  (:require
   [chime.core :as chime-core]
   [honey.sql :as hsql]
   [instant.backup :as backup]
   [instant.config :as config]
   [instant.dash.ephemeral-app :refer [ephemeral-creator]]
   [instant.flags :as flags]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.util.async :as ua]
   [instant.util.exception :as ex]
   [instant.util.tracer :as tracer])
  (:import
   (clojure.lang ExceptionInfo)
   (java.lang AutoCloseable)
   (java.time Duration Instant)
   (java.util.concurrent LinkedBlockingQueue ThreadPoolExecutor ThreadPoolExecutor$DiscardPolicy TimeUnit)
   (java.util.concurrent.atomic AtomicLong)))

;; `pool` is the live worker pool (a ThreadPoolExecutor). Each task grabs and
;; runs the oldest waiting job, then submits another task so the pool keeps
;; draining the table on its own. At most its core pool size run concurrently,
;; and that size tracks the worker-count flag. `flag-unsub` unregisters the flag
;; listener on stop.
(declare pool schedule flag-unsub run-next!)

;; Absolute ceiling on per-machine concurrency, regardless of the flag.
(def max-worker-count 32)

;; A backup that's been `processing` this long is assumed dead (its worker
;; crashed) and gets marked errored so the app isn't stuck behind the
;; one-in-flight limit forever.
(def stuck-threshold-minutes 120)

;; How often a running job persists its progress (triples copied) to the db.
(def progress-report-interval-ms 1000)

(defn worker-count
  "Per-machine concurrency: the flag value, clamped to [1, max-worker-count]."
  []
  (-> (or (flags/on-demand-backup-worker-count) 1)
      (max 1)
      (min max-worker-count)))

(defn get-by-id
  ([job-id] (get-by-id (aurora/conn-pool :read) job-id))
  ([conn job-id]
   (sql/select-one ::get-by-id
                   conn
                   (hsql/format {:select :*
                                 :from :app-backup-jobs
                                 :where [:= :id job-id]}))))

(defn job->client-format [job]
  ;; Deliberately omits `error`: the raw failure is kept in the db (and the
  ;; run-job! span) for debugging, but the client only needs `job_status` to
  ;; know it failed.
  (select-keys job [:id
                    :app_id
                    :app_backup_id
                    :job_status
                    :description
                    :work_estimate
                    :work_completed
                    :created_at
                    :updated_at
                    :done_at]))

(defn get-by-id-for-client
  ([app-id job-id] (get-by-id-for-client (aurora/conn-pool :read) app-id job-id))
  ([conn app-id job-id]
   (some-> (sql/select-one ::get-by-id-for-client
                           conn
                           (hsql/format {:select :*
                                         :from :app-backup-jobs
                                         :where [:and
                                                 [:= :id job-id]
                                                 [:= :app-id app-id]]}))
           job->client-format)))

(defn get-active-for-client
  "In-progress backup jobs (waiting/processing) for the app, so the dashboard
   can show them even without a job id (e.g. after a page reload)."
  ([app-id] (get-active-for-client (aurora/conn-pool :read) app-id))
  ([conn app-id]
   (->> (sql/select ::get-active-for-client
                    conn
                    (hsql/format {:select :*
                                  :from :app-backup-jobs
                                  :where [:and
                                          [:= :app-id app-id]
                                          [:in :job-status ["waiting" "processing"]]]
                                  :order-by [[:created-at :asc]]}))
        (mapv job->client-format))))

(defn work-estimate
  "Estimates the number of triples we'll process by summing the app's
   attr_sketches totals. Used only to drive the progress display."
  [conn app-id]
  (-> (sql/select-one ::work-estimate
                      conn
                      (hsql/format {:select [[[:coalesce [:sum :total] [:inline 0]] :estimate]]
                                    :from :attr-sketches
                                    :where [:= :app-id app-id]}))
      :estimate
      (or 0)))

(defn in-flight-job
  "The app's currently waiting/processing backup job, if any."
  [conn app-id]
  (sql/select-one ::in-flight-job
                  conn
                  (hsql/format {:select :id
                                :from :app-backup-jobs
                                :where [:and
                                        [:= :app-id app-id]
                                        [:in :job-status ["waiting" "processing"]]]
                                :limit 1})))

(defn throw-in-flight! [app-id]
  (ex/throw-validation-err! :app-backup-job
                            {:app-id app-id}
                            [{:message "A backup is already in progress for this app."}]))

;; Discord invite the dashboard points users at (mirrors
;; `client/www/lib/config.ts`). We ask large apps to reach out here instead of
;; self-serving a backup.
(def discord-invite-url "https://discord.com/invite/VU53p7uQcE")

(defn ephemeral-app?
  "True if the app was created by the ephemeral-app creator (sandbox apps that
   expire on their own and aren't worth backing up)."
  [conn app-id]
  (= (:id @ephemeral-creator)
     (:creator_id (sql/select-one ::ephemeral-app?
                                  conn
                                  (hsql/format {:select :creator-id
                                                :from :apps
                                                :where [:= :id app-id]})))))

(defn assert-backup-allowed!
  "Refuses on-demand backups for apps that shouldn't self-serve: ephemeral apps,
   and apps whose estimated triple count is at or above
   `on-demand-backup-max-triples` (too large to stream on-demand--we run those
   manually, so we point them to Discord). `estimate` is the app's already-
   computed work-estimate, threaded through so we don't recount."
  ([app-id] (assert-backup-allowed! (aurora/conn-pool :read) app-id))
  ([conn app-id] (assert-backup-allowed! conn app-id (work-estimate conn app-id)))
  ([conn app-id estimate]
   (when (ephemeral-app? conn app-id)
     (ex/throw-validation-err! :app-backup-job
                               {:app-id app-id}
                               [{:message "Ephemeral apps can't be backed up."}]))
   (let [max-triples (flags/on-demand-backup-max-triples)]
     (when (and (pos-int? max-triples)
                (>= estimate max-triples))
       (ex/throw-validation-err!
        :app-backup-job
        {:app-id app-id}
        [{:message (str "This app is too large to back up from the dashboard. "
                        "Reach out in Discord and we'll run the backup for you: "
                        discord-invite-url)}])))))

(defn create-job!
  ([params] (create-job! (aurora/conn-pool :write) params))
  ([conn {:keys [app-id description]}]
   (let [estimate (work-estimate conn app-id)]
     (assert-backup-allowed! conn app-id estimate)
     ;; Cheap check for the common case; the partial unique index below is the
     ;; race-safe backstop.
     (when (in-flight-job conn app-id)
       (throw-in-flight! app-id))
     (try
       (sql/execute-one! ::create-job!
                         conn
                         (hsql/format {:insert-into :app-backup-jobs
                                       :values [{:id (random-uuid)
                                                 :app-id app-id
                                                 :description description
                                                 :work-estimate estimate
                                                 :job-status "waiting"}]
                                       :returning :*}))
       (catch ExceptionInfo e
         (if (= ::ex/record-not-unique (::ex/type (ex-data e)))
           (throw-in-flight! app-id)
           (throw e)))))))

(defn submit!
  "Nudges the pool to grab and run the next waiting job. `.execute` uses the
   pool's bounded queue; when it's full the task is silently discarded
   (DiscardPolicy), which is fine because enough grab-tasks are already pending.
   No-op if the pool isn't running (the schedule kick will pick things up)."
  []
  (when (bound? #'pool)
    (.execute ^ThreadPoolExecutor pool ^Runnable run-next!)))

(defn enqueue!
  "Creates a backup job for the app and nudges the pool to run it. Returns the
   job row. Throws a validation error if the app already has a backup in
   flight."
  [{:keys [app-id description]}]
  (let [job (create-job! {:app-id app-id
                          :description description})]
    (submit!)
    job))

(defn grab-oldest-job!
  "Atomically claims the oldest waiting job for this process. Returns the
   claimed row, or nil if there's nothing to do. Concurrent workers skip each
   other's locked rows, so each claims a distinct job."
  ([] (grab-oldest-job! (aurora/conn-pool :write)))
  ([conn]
   (sql/execute-one! ::grab-oldest-job!
                     conn
                     (hsql/format {:update :app-backup-jobs
                                   :set {:worker-id @config/process-id
                                         :job-status "processing"}
                                   :where [:= :id {:select :id
                                                   :from :app-backup-jobs
                                                   :where [:and
                                                           [:= :worker-id nil]
                                                           [:= :job-status "waiting"]]
                                                   :order-by [[:created-at :asc]]
                                                   :limit 1
                                                   :for [:update :skip-locked]}]
                                   :returning :*}))))

;; A worker only owns its job while `worker_id` still points at it and the job is
;; still `processing`. Every write it makes is scoped to that "still mine and
;; still running" predicate, so a cancel (which clears `worker_id` and flips the
;; status, see `cancel-job!`) or a stuck-reclaim (which flips the status) makes
;; the write match nothing--we don't resurrect a cancelled/errored job, and the
;; running worker learns it's been stopped.
(defn owned-and-processing
  "Where-clause matching `job-id` only while it's still claimed by this process
   and still `processing`."
  [job-id]
  [:and
   [:= :id job-id]
   [:= :worker-id @config/process-id]
   [:= :job-status "processing"]])

(defn mark-completed! [conn job-id {:keys [app-backup-id work-completed]}]
  (sql/execute-one! ::mark-completed!
                    conn
                    (hsql/format {:update :app-backup-jobs
                                  :set {:job-status "completed"
                                        :app-backup-id app-backup-id
                                        :work-completed work-completed
                                        :done-at :%now}
                                  :where (owned-and-processing job-id)})))

(defn mark-error! [conn job-id ^Throwable t]
  (sql/execute-one! ::mark-error!
                    conn
                    (hsql/format {:update :app-backup-jobs
                                  :set {:job-status "errored"
                                        :error (.getMessage t)
                                        :done-at :%now}
                                  :where (owned-and-processing job-id)})))

(defn report-progress!
  "Persists the copied-triple count for a running job and doubles as a
   cancellation checkpoint. The update only touches the row while it's still ours
   and still `processing`, so it matches nothing once the job has been cancelled
   (its `worker_id` cleared and status flipped) or reclaimed. Returns true while
   the job is still ours to run, false once it's been taken from us."
  [conn job-id n]
  (let [res (sql/do-execute! ::report-progress!
                             conn
                             (hsql/format {:update :app-backup-jobs
                                           :set {:work-completed n}
                                           :where (owned-and-processing job-id)}))]
    (pos? (:next.jdbc/update-count (first res)))))

(defn cancel-job!
  "Marks a waiting/processing backup job as cancelled so its worker stops.
   Clearing `worker_id` (along with flipping the status) is what the worker's
   `report-progress!` checkpoint detects: its next scoped write no longer matches
   the row, so it cancels the in-flight backup and bails. A waiting job simply
   never gets claimed. Scoped to the app so a caller can only cancel its own
   app's job. Returns the updated row, or nil when there was no in-flight job
   with that id (already done/cancelled)."
  ([app-id job-id] (cancel-job! (aurora/conn-pool :write) app-id job-id))
  ([conn app-id job-id]
   (sql/execute-one! ::cancel-job!
                     conn
                     (hsql/format {:update :app-backup-jobs
                                   :set {:job-status "cancelled"
                                         :worker-id nil
                                         :done-at :%now}
                                   :where [:and
                                           [:= :id job-id]
                                           [:= :app-id app-id]
                                           [:in :job-status ["waiting" "processing"]]]
                                   :returning :*}))))

(defn run-job!
  "Runs the backup for a claimed job and records the outcome. The backup runs on
   a background vthread while this thread waits; between waits it persists the
   copied-triple count so the dashboard can show live progress. The copy loop
   only bumps `copied` (via the `on-triple` callback), so it never blocks on the
   db.

   Each progress tick doubles as a cancellation checkpoint: `report-progress!`
   only touches the row while it's still ours and still `processing`, so once the
   job has been cancelled (or reclaimed) the write matches nothing and we cancel
   the in-flight backup and stop, leaving the cancelled state in place."
  [{:keys [id app_id description]}]
  (tracer/with-span! {:name "app-backup-jobs/run-job"
                      :attributes {:job-id id
                                   :app-id app_id}}
    (let [copied (AtomicLong. 0)
          expires-at (.plus (Instant/now)
                            (Duration/ofDays (flags/on-demand-backup-expiry-days)))
          fut (ua/vfuture
               (backup/backup-app-on-primary! {:app-id app_id
                                               :description (or description "On-demand backup")
                                               :expires-at expires-at
                                               :on-triple (fn [] (.incrementAndGet copied))}))]
      (try
        (loop []
          (let [result (deref fut progress-report-interval-ms ::pending)]
            (if (identical? ::pending result)
              ;; Still running. Persist progress and, in the same write, confirm
              ;; the job is still ours. If it isn't, it's been cancelled out from
              ;; under us, so kill the backup and bail without touching the row.
              (if (report-progress! (aurora/conn-pool :write) id (.get copied))
                (recur)
                (do (future-cancel fut)
                    (tracer/add-data! {:attributes {:cancelled true}})))
              (let [{:keys [triple-count app-backup]} result]
                (mark-completed! (aurora/conn-pool :write)
                                 id
                                 {:app-backup-id (:id app-backup)
                                  :work-completed triple-count})
                (tracer/add-data! {:attributes {:triple-count triple-count
                                                :app-backup-id (:id app-backup)}})))))
        (catch Throwable t
          (tracer/record-exception-span! t {:name "app-backup-jobs/run-job-error"
                                            :escaping? false})
          (mark-error! (aurora/conn-pool :write) id t))))))

(defn run-next!
  "Pool task: claim the oldest waiting job and run it. If it claimed one, submit
   another task so the pool keeps draining the table until it's empty. The chain
   ends when a task finds no waiting job."
  []
  (tracer/with-span! {:name "app-backup-jobs/run-next"}
    (try
      (when-let [job (grab-oldest-job!)]
        (run-job! job)
        (submit!))
      (catch Throwable t
        (tracer/record-exception-span! t {:name "app-backup-jobs/run-next-error"
                                          :escaping? false})))))

(defn kick-workers!
  "Submits enough tasks to get idle workers draining the table, e.g. after a
   restart. Self-continuation keeps them going from there."
  []
  (dotimes [_ (worker-count)]
    (submit!)))

(defn reclaim-stuck-jobs!
  "Marks `processing` jobs with no progress for a while as errored, on the
   assumption their worker died. Running jobs bump `updated_at` as they copy, so
   a long-but-progressing backup won't be reclaimed. Releases the app from the
   one-in-flight limit so it can retry; any partial S3 uploads expire on their
   own via the `expire` tag."
  ([] (reclaim-stuck-jobs! (aurora/conn-pool :write)))
  ([conn]
   (tracer/with-span! {:name "app-backup-jobs/reclaim-stuck-jobs!"}
     (let [res (sql/do-execute! ::reclaim-stuck-jobs!
                                conn
                                (hsql/format {:update :app-backup-jobs
                                              :set {:job-status "errored"
                                                    :error "Backup timed out"
                                                    :done-at :%now}
                                              :where [:and
                                                      [:= :job-status "processing"]
                                                      [:< [:interval [:inline (format "%d minutes"
                                                                                      stuck-threshold-minutes)]]
                                                       [:- :%now :updated-at]]]}))
           reclaimed (:next.jdbc/update-count (first res))]
       (tracer/add-data! {:attributes {:reclaimed-count reclaimed}})
       reclaimed))))

(defn make-pool ^ThreadPoolExecutor [n]
  ;; runs n tasks at a time. The queue is bounded at max-worker-count
  ;; and DiscardPolicy drops `.execute` when it's full
  ;; `allowCoreThreadTimeOut` lets idle threads die so shrinking
  ;; the pool actually releases them.
  (doto (ThreadPoolExecutor. (int n)
                             (int max-worker-count)
                             60 TimeUnit/SECONDS
                             (LinkedBlockingQueue. (int max-worker-count))
                             (ThreadPoolExecutor$DiscardPolicy.))
    (.allowCoreThreadTimeOut true)))

(defn resize-pool! [n]
  (when (bound? #'pool)
    ;; setCorePoolSize starts threads for queued work when growing and reaps
    ;; idle threads when shrinking.
    (.setCorePoolSize ^ThreadPoolExecutor pool n)))

(defn start []
  (tracer/record-info! {:name "app-backup-jobs/start"})
  (def pool (make-pool (worker-count)))

  ;; Apply worker-count flag changes to the live pool without a restart.
  (def flag-unsub (flags/add-flag-listener
                   :on-demand-backup-worker-count
                   (fn [_path _old _new]
                     (resize-pool! (worker-count)))))

  ;; Pick up any jobs left waiting from before this process started.
  (kick-workers!)

  (def schedule (chime-core/chime-at
                 (chime-core/periodic-seq (Instant/now)
                                          (Duration/ofMinutes 10))
                 (fn [_time]
                   (kick-workers!)
                   (reclaim-stuck-jobs!)))))

(defn stop []
  (when (bound? #'schedule)
    (.close ^AutoCloseable schedule))
  (when (and (bound? #'flag-unsub) flag-unsub)
    (flag-unsub))
  (when (bound? #'pool)
    (.shutdown ^ThreadPoolExecutor pool)
    (.awaitTermination ^ThreadPoolExecutor pool 5 TimeUnit/MINUTES)))

(defn restart []
  (stop)
  (start))

(defn before-ns-unload []
  (stop))

(defn after-ns-reload []
  (start))
