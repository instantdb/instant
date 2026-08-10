(ns instant.custodian
  "Deletes an app (or a single attr) in small, bounded, committed batches so that
   we don't hand the invalidator one giant WAL transaction.

   The plan for a deletion is stored as a chain of `custodian` rows linked by
   `depends_on`:

     app:  triples <- transactions <- attrs <- app
     attr: triples <- attr

   `depends_on` points at the step that must finish first, so a row is runnable
   once the row it depends on is `done_at`. Each worker claims one runnable row
   with a lease, drains it in `batch-size` chunks (each chunk its own committed
   transaction), then marks it done — which makes its dependent runnable. The
   terminal `app`/`attr` step deletes the app/attr itself; the `app_id`/`attr_id`
   cascades then sweep the whole chain away.

   One worker runs per machine. It loops while there is runnable work and pauses
   for `:custodian-idle-sleep-ms` when there isn't."
  (:require
   [chime.core :as chime-core]
   [clojure.string]
   [instant.config :as config]
   [instant.db.model.attr :as attr-model]
   [instant.db.transaction :as tx]
   [instant.flags :as flags]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.util.async :as ua]
   [instant.util.exception :as ex]
   [instant.util.hsql :as uhsql]
   [instant.util.tracer :as tracer])
  (:import
   (clojure.lang ExceptionInfo)
   (java.io PrintWriter StringWriter)
   (java.lang AutoCloseable)
   (java.time Duration Instant)))

;; ----------
;; Config

(defn- batch-size [] (flags/flag :custodian-batch-size 1000))
(defn- idle-sleep-ms [] (flags/flag :custodian-idle-sleep-ms 5000))

;; Attrs are deleted one at a time: each attr delete cascades to that attr's
;; triples, and right after the triple sweep those are dead-but-not-yet-vacuumed
;; index entries, so the cascade scan is slow. One attr per statement keeps each
;; cascade bounded (and lets autovacuum catch up between batches).
(defn- attr-batch-size [] (flags/flag :custodian-attr-batch-size 1))

;; Lease long enough that a batch (plus its lease renewal) comfortably finishes,
;; short enough that a dead worker's row gets picked up again reasonably soon.
(defn- lease-timeout-seconds [] (flags/flag :custodian-lease-timeout-seconds 120))

;; How many times processing a row may error before we give up and mark it
;; 'failed'. Retries handle transient failures (a lost connection, a deadlock).
(defn- max-attempts [] (flags/flag :custodian-max-attempts 3))

;; How long a 'failed' row lingers before the reaper deletes it (and its stuck
;; dependents): long enough to notice and investigate, not forever.
(defn- failed-retention-seconds [] (flags/flag :custodian-failed-retention-seconds 86400))

;; ----------
;; Enqueue

;; Relies on the (app_id, type, attr_id) unique constraint: re-enqueuing an
;; in-flight plan throws and rolls the whole statement back (no partial chain).
;; The enqueue fns catch that violation, making a re-enqueue an idempotent no-op.
(def enqueue-app-deletion-q
  (uhsql/preformat
   {:with [[:triples-row {:insert-into :custodian
                          :values [{:app-id :?app-id :type [:inline "triples"]}]
                          :returning :id}]
           [:tx-row {:insert-into :custodian
                     :values [{:app-id :?app-id
                               :type [:inline "transactions"]
                               :depends-on {:select :id :from :triples-row}}]
                     :returning :id}]
           [:attrs-row {:insert-into :custodian
                        :values [{:app-id :?app-id
                                  :type [:inline "attrs"]
                                  :depends-on {:select :id :from :tx-row}}]
                        :returning :id}]]
    :insert-into :custodian
    :values [{:app-id :?app-id
              :type [:inline "app"]
              :depends-on {:select :id :from :attrs-row}}]}))

(def enqueue-attr-deletion-q
  (uhsql/preformat
   {:with [[:triples-row {:insert-into :custodian
                          :values [{:app-id :?app-id
                                    :attr-id :?attr-id
                                    :type [:inline "triples"]}]
                          :returning :id}]]
    :insert-into :custodian
    :values [{:app-id :?app-id
              :attr-id :?attr-id
              :type [:inline "attr"]
              :depends-on {:select :id :from :triples-row}}]}))

(defn enqueue-app-deletion!
  "Idempotently enqueues the chain triples <- transactions <- app for an app,
   atomically so a worker never sees a partial chain."
  ([params] (enqueue-app-deletion! (aurora/conn-pool :write) params))
  ([conn {:keys [app-id]}]
   (try
     (sql/do-execute! ::enqueue-app-deletion!
                      conn
                      (uhsql/formatp enqueue-app-deletion-q {:app-id app-id}))
     (catch ExceptionInfo e
       ;; Plan already in flight; the unique constraint rolled the insert back.
       (when-not (= ::ex/record-not-unique (::ex/type (ex-data e)))
         (throw e))))))

(defn enqueue-attr-deletion!
  "Idempotently enqueues the chain triples <- attr for a single attr."
  ([params] (enqueue-attr-deletion! (aurora/conn-pool :write) params))
  ([conn {:keys [app-id attr-id]}]
   (try
     (sql/do-execute! ::enqueue-attr-deletion!
                      conn
                      (uhsql/formatp enqueue-attr-deletion-q {:app-id app-id
                                                              :attr-id attr-id}))
     (catch ExceptionInfo e
       ;; Plan already in flight; the unique constraint rolled the insert back.
       (when-not (= ::ex/record-not-unique (::ex/type (ex-data e)))
         (throw e))))))

;; ----------
;; Claim / lease

(def claim-row-q
  (uhsql/preformat
   {:with [[:claimed {:select :id
                      :from :custodian
                      :where [:and
                              [:= :status [:inline "waiting"]]
                              [:is :depends-on nil]
                              [:is :worker-id nil]]
                      :order-by [:created-at]
                      :for [:update :skip-locked]
                      :limit [:inline 1]}]]
    :update :custodian
    :set {:worker-id :?worker-id :status [:inline "working"]}
    :from :claimed
    :where [:= :custodian.id :claimed.id]
    :returning :custodian.*}))

(def finish-q
  (uhsql/preformat {:delete-from :custodian
                    :where [:and [:= :id :?id] [:= :worker-id :?worker-id]]}))

(def release-q
  (uhsql/preformat {:update :custodian
                    :set {:worker-id nil :status [:inline "waiting"]}
                    :where [:and [:= :id :?id] [:= :worker-id :?worker-id]]}))

;; Record a failed attempt: bump `attempts` and stash the error. Below
;; `max-attempts` we hand the row back (status 'waiting', worker_id cleared) so
;; it gets retried; once we hit the limit we flip it to 'failed' so it stops
;; being retried and can be investigated.
(def fail-q
  (uhsql/preformat {:update :custodian
                    :set {:attempts [:+ :attempts :1]
                          :error :?error
                          :worker-id [:case [:>= [:+ :attempts :1] :?max-attempts]
                                      :worker-id :else nil]
                          :status [:case [:>= [:+ :attempts :1] :?max-attempts]
                                   [:inline "failed"] :else [:inline "waiting"]]}
                    :where [:and [:= :id :?id] [:= :worker-id :?worker-id]]}))

(def reap-stuck-q
  (uhsql/preformat {:update :custodian
                    :set {:worker-id nil :status [:inline "waiting"]}
                    :where [:and [:= :status [:inline "working"]]
                            [:is-not :worker-id nil] [:< :updated-at :?stale]]
                    :returning :id}))

;; Delete rows that have been 'failed' longer than the retention window, plus
;; everything that (transitively) depends on them. We take the dependents too
;; because `depends_on`'s `on delete set null` would otherwise make a failed
;; step's dependent runnable, letting the plan skip a step that never finished.
(def reap-failed-q
  (uhsql/preformat
   {:with-recursive [[:plan {:union [{:select :id
                                      :from :custodian
                                      :where [:and [:= :status [:inline "failed"]]
                                              [:< :updated-at :?stale]]}
                                     {:select :c.id
                                      :from [[:custodian :c]]
                                      :join [[:plan :p] [:= :c.depends-on :p.id]]}]}]]
    :delete-from :custodian
    :where [:in :id {:select :id :from :plan}]
    :returning :id}))

(defn claim-row!
  "Claims one runnable, unowned row (depends_on IS NULL, worker_id IS NULL) under
   FOR UPDATE SKIP LOCKED so workers on different machines cooperate. Sets
   worker_id to this machine. Returns the claimed row, or nil when there's no
   runnable work."
  [conn]
  (sql/execute-one! ::claim-row!
                    conn
                    (uhsql/formatp claim-row-q {:worker-id @config/process-id})))

(defn- finish! [conn id]
  ;; Deletes the finished step; the FK's `on delete set null` clears its
  ;; dependent's depends_on, making that dependent runnable. Ownership-guarded so
  ;; a worker that lost the row can't remove it. For the terminal app/attr step
  ;; the row is already gone via cascade, so this is a no-op.
  (sql/do-execute! ::finish! conn (uhsql/formatp finish-q {:id id
                                                           :worker-id @config/process-id})))

(defn- release! [conn id]
  ;; Give the row back (clear our worker_id) so another worker can reclaim it
  ;; immediately instead of waiting for the reaper. Ownership-guarded.
  (sql/do-execute! ::release! conn (uhsql/formatp release-q {:id id
                                                             :worker-id @config/process-id})))

(defn- fail! [conn id error]
  ;; Record a failed attempt: retry (hand the row back) until we've hit
  ;; `max-attempts`, then mark it failed so it stops being retried and can be
  ;; investigated. Ownership-guarded, so a worker that lost the row can't fail it.
  (sql/do-execute! ::fail! conn (uhsql/formatp fail-q {:id id
                                                       :error error
                                                       :max-attempts (max-attempts)
                                                       :worker-id @config/process-id})))

(defn reap-stuck!
  "Frees 'working' rows whose owner stopped heartbeating (updated_at older than
   the lease timeout), setting them back to 'waiting' so another worker can
   reclaim them. Returns the freed row ids."
  ([] (reap-stuck! (aurora/conn-pool :write)))
  ([conn]
   (let [stale (.minusSeconds (Instant/now) (lease-timeout-seconds))]
     (sql/execute! ::reap-stuck! conn (uhsql/formatp reap-stuck-q {:stale stale})))))

(defn reap-failed!
  "Deletes plans that have been 'failed' longer than the retention window (the
   failed row plus its stuck dependents). The app stays marked for deletion, so
   the sweeper re-enqueues a fresh plan later. Returns the deleted row ids."
  ([] (reap-failed! (aurora/conn-pool :write)))
  ([conn]
   (let [stale (.minusSeconds (Instant/now) (failed-retention-seconds))]
     (sql/execute! ::reap-failed! conn (uhsql/formatp reap-failed-q {:stale stale})))))

;; ----------
;; Backpressure

;; Our deletes produce WAL the invalidator and other logical consumers must keep
;; up with. A chime samples the worst active replication lag every minute; while
;; it's over the threshold the worker backs off so we don't outrun them.
(defn max-replication-lag-bytes [conn]
  (:lag (sql/select-one
         ::max-replication-lag-bytes
         conn
         ["select max(pg_wal_lsn_diff(pg_current_wal_lsn(), confirmed_flush_lsn)) as lag
             from pg_replication_slots
            where confirmed_flush_lsn is not null"])))

(defn- nudge-slots-in-dev! [conn]
  ;; When the db is idle the invalidator and aggregator replication slots never
  ;; flush and the lag climbs until the worker parks. The aggregator only decodes
  ;; `triples`, so we need a real triples change: add then delete a flag on the
  ;; config app — it leaves nothing behind but produces the triples WAL (plus the
  ;; transactions anchor) that advances both slots.
  (when (clojure.string/includes? config/server-origin "localhost")
    (let [attrs (attr-model/get-by-app-id conn config/instant-config-app-id)
          id-attr (attr-model/resolve-attr-id attrs "flags" "id")
          setting-attr (attr-model/resolve-attr-id attrs "flags" "setting")
          value-attr (attr-model/resolve-attr-id attrs "flags" "value")
          entity-id (random-uuid)]
      (tx/transact! conn attrs config/instant-config-app-id
                    [[:add-triple entity-id id-attr entity-id]
                     [:add-triple entity-id setting-attr (str ::bump-slots)]
                     [:add-triple entity-id value-attr "true"]])
      (tx/transact! conn attrs config/instant-config-app-id
                    [[:delete-entity entity-id]]))))

(defn sample-lag! [backing-off?]
  (try
    (let [threshold (flags/flag :custodian-max-replication-lag-bytes (* 100 1024 1024))
          lag (or (max-replication-lag-bytes (aurora/conn-pool :read)) 0)
          paused? (> lag threshold)
          [was-paused?] (reset-vals! backing-off? paused?)]
      ;; Nudge once we're halfway to the limit so the slot keeps advancing and we
      ;; ideally never actually cross it (in dev this is usually just an idle slot).
      (when (> lag (quot threshold 2))
        (try
          (nudge-slots-in-dev! (aurora/conn-pool :write))
          (catch Throwable _ nil)))
      ;; Log the transition (once per pause/resume, not every sample).
      (when (not= was-paused? paused?)
        (tracer/record-info! {:name (if paused? "custodian/pause" "custodian/resume")
                              :attributes {:lag-bytes lag
                                           :threshold-bytes threshold}})))
    (catch Throwable t
      (tracer/record-exception-span! t {:name "custodian/sample-lag-error"}))))

(defn- await-capacity!
  "Blocks while replication is lagging so we don't outrun the WAL consumers.
   Returns early if the worker is stopping."
  [stop? backing-off?]
  (while (and @backing-off? (not @stop?))
    (Thread/sleep (long (idle-sleep-ms)))))

;; ----------
;; Processing

;; Message the batch guard raises when the app/attr is no longer marked for
;; deletion. Shared so the query and the error check can't drift.
(def not-deleted-message "not marked for deletion")

;; Each batch, in one statement: heartbeat the custodian row (bump updated_at)
;; while asserting we still own it, check the app/attr is still marked for
;; deletion, delete up to :limit rows, and report the count. If we lost ownership,
;; the row is gone, or the app/attr is no longer marked, it raises and unwinds the
;; drain. The marked check is its own CTE (referenced once in the final select),
;; so it doesn't slow the per-row scan that finds rows to delete.
(defn- delete-batch-query [table attr-scoped?]
  (let [marked-for-deletion
        [:case (if attr-scoped?
                 [:exists {:select :id :from :attrs
                           :where [:and [:= :id :?attr-id] [:is-not :deletion-marked-at nil]]}]
                 [:exists {:select :id :from :apps
                           :where [:and [:= :id :?app-id] [:is-not :deletion-marked-at nil]]}])
         true
         :else [:raise_exception_message [:inline not-deleted-message]]]]
    (uhsql/preformat
     {:with [[:heartbeat {:update :custodian
                          :set {:updated-at :%now}
                          :where [:and
                                  [:= :id :?id]
                                  [:case [:= :worker-id :?worker-id] true
                                   :else [:raise_exception_message
                                          [:inline "custodian row not owned by this worker"]]]]
                          :returning :id}]
             [:marked {:select [[marked-for-deletion :ok]]}]
             [:to-delete {:select :ctid
                          :from table
                          :where (if attr-scoped?
                                   [:and [:= :app-id :?app-id] [:= :attr-id :?attr-id]]
                                   [:= :app-id :?app-id])
                          :limit :?limit
                          :for :update}]
             [:deleted {:delete-from table
                        :where [:in :ctid {:select :ctid :from :to-delete}]
                        :returning :*}]]
      :select [[{:select :%count.* :from :deleted} :deleted]
               [[:case [:exists {:select :id :from :heartbeat}] true
                 :else [:raise_exception_message
                        [:inline "custodian row no longer exists"]]]
                :present]
               [{:select :ok :from :marked} :marked]]})))

(def delete-app-triples-q (delete-batch-query :triples false))
(def delete-attr-triples-q (delete-batch-query :triples true))
(def delete-app-transactions-q (delete-batch-query :transactions false))
(def delete-app-attrs-q (delete-batch-query :attrs false))

(defn- drain!
  "Deletes rows via `q` in bounded, committed batches of `limit` (default
   `batch-size`), heartbeating and asserting ownership per batch (see
   `delete-batch-query`). `tag` labels the batch query (e.g. ::drain-app-attrs).
   Returns ::completed when the table is drained, or ::stopped if the worker was
   asked to stop mid-drain. Losing ownership throws and unwinds the drain."
  ([tag stop? backing-off? conn id q params]
   (drain! tag stop? backing-off? conn id q params (batch-size)))
  ([tag stop? backing-off? conn id q params limit]
   (loop []
     (await-capacity! stop? backing-off?)
     (if @stop?
       ::stopped
       (let [deleted (-> (sql/do-execute! tag
                                          conn
                                          (uhsql/formatp q (assoc params
                                                                  :id id
                                                                  :worker-id @config/process-id
                                                                  :limit limit)))
                         first
                         :deleted)]
        (if (and deleted (pos? deleted))
          (recur)
          ::completed))))))

(defn- delete-app!
  "Deletes the app at the final stage, but checks if it is still marked as deleted first."
  [conn app-id]
  (sql/do-execute! ::delete-app!
                   conn
                   ["delete from apps where id = ? and deletion_marked_at is not null" app-id]))

(defn- delete-attr!
  "Deletes the attr at the final stage, but checks if it is still marked as deleted first."
  [conn app-id attr-id]
  (sql/do-execute! ::delete-app!
                   conn
                   ["delete from attrs where app_id = ? and id = ? and deletion_marked_at is not null" app-id attr-id]))

(defn- not-deleted-error?
  "True if `e` is the batch guard's raise for an app/attr that isn't marked for
   deletion (vs. some other failure like losing ownership)."
  [e]
  (= not-deleted-message (-> e ex-data ::ex/pg-error-data :server-message)))

(defn- abort-plan!
  "The app/attr has a deletion plan but isn't marked for deletion (a bug, or a
   restore that raced the sweeper). Log an error and delete the plan instead of
   deleting live data."
  [conn app-id attr-id e]
  (tracer/with-new-trace-root
    (tracer/record-exception-span! e {:name "custodian/plan-not-marked-for-deletion"
                                      :attributes {:app-id app-id :attr-id attr-id}}))
  (if attr-id
    (sql/do-execute! ::abort-attr-plan conn
                     ["delete from custodian where app_id = ?::uuid and attr_id = ?::uuid" app-id attr-id])
    (sql/do-execute! ::abort-app-plan conn
                     ["delete from custodian where app_id = ?::uuid and attr_id is null" app-id])))

(defn- error-string
  "The exception's message plus its full stack trace (including causes), for the
   custodian row's `error` column so a failure has enough context to investigate."
  [^Throwable e]
  (let [sw (StringWriter.)]
    (.printStackTrace e (PrintWriter. sw))
    (str sw)))

(defn- process-row! [stop? backing-off? conn {:keys [id type app_id attr_id]}]
  (tracer/with-span! {:name "custodian/process-row"
                      :attributes {:id id :type type :app-id app_id :attr-id attr_id}}
    (try
      (let [outcome (case type
                      "triples" (if attr_id
                                  (drain! ::drain-attr-triples stop? backing-off? conn id delete-attr-triples-q {:app-id app_id :attr-id attr_id})
                                  (drain! ::drain-app-triples stop? backing-off? conn id delete-app-triples-q {:app-id app_id}))
                      "transactions" (drain! ::drain-app-transactions stop? backing-off? conn id delete-app-transactions-q {:app-id app_id})
                      ;; Delete the app's attrs one at a time so each attr's triples
                      ;; cascade is its own bounded, committed statement.
                      "attrs" (drain! ::drain-app-attrs stop? backing-off? conn id delete-app-attrs-q {:app-id app_id} (attr-batch-size))
                      ;; Terminal steps run to completion; they aren't interrupted mid-way.
                      "attr" (do (delete-attr! conn app_id attr_id) ::completed)
                      "app" (do (delete-app! conn app_id) ::completed))]
        ;; ::stopped means the drain exited mid-way — hand the row back rather than
        ;; marking a half-done step finished.
        (case outcome
          ::completed (finish! conn id)
          ::stopped (release! conn id)))
      (catch Throwable e
        ;; The batch guard raises if the app/attr is no longer marked for
        ;; deletion — tear the plan down. Any other failure: record it and mark
        ;; the job failed so it stops being retried and can be investigated.
        (if (not-deleted-error? e)
          (abort-plan! conn app_id attr_id e)
          (do
            (tracer/record-exception-span! e {:name "custodian/process-row-error"
                                              :attributes {:id id :type type :app-id app_id :attr-id attr_id}})
            (fail! conn id (error-string e))))))))

(defn tick!
  "Claims and fully processes one runnable row. Returns true if it did (or
   attempted) work, false when there was nothing to do."
  [stop? backing-off? conn]
  (if (or (flags/failing-over?) (flags/custodian-disabled?))
    false
    (if-let [row (claim-row! conn)]
      (do
        (try
          (process-row! stop? backing-off? conn row)
          (catch Throwable t
            ;; Leave the row leased; a stale lease lets it be retried later.
            (tracer/record-exception-span! t {:name "custodian/process-row-error"
                                              :attributes {:id (:id row)
                                                           :type (:type row)
                                                           :app-id (:app_id row)}})))
        true)
      false)))

;; ----------
;; Worker (one per machine)

(defonce worker (atom nil))

(defn- run-worker [stop? backing-off?]
  (loop []
    (when-not @stop?
      ;; Don't claim new work while we're backing off; drain! also pauses mid-row.
      (await-capacity! stop? backing-off?)
      (when-not @stop?
        (let [did-work? (try
                          (tick! stop? backing-off? (aurora/conn-pool :write))
                          (catch Throwable t
                            (tracer/record-exception-span! t {:name "custodian/tick-error"})
                            false))]
          (when-not did-work?
            (Thread/sleep (long (idle-sleep-ms))))))
      (recur))))

(defn- reap-tick [_]
  (try
    (when-not (or (flags/failing-over?) (flags/custodian-disabled?))
      (reap-stuck!)
      (let [reaped (reap-failed!)]
        (when (seq reaped)
          (tracer/record-info! {:name "custodian/reap-failed"
                                :attributes {:count (count reaped)}}))))
    (catch Throwable t
      (tracer/record-exception-span! t {:name "custodian/reap-error"}))))

(defn start-worker []
  (let [stop? (atom false)
        backing-off? (atom false)
        fut (ua/vfuture (run-worker stop? backing-off?))
        reaper (chime-core/chime-at
                (chime-core/periodic-seq (Instant/now) (Duration/ofHours 1))
                reap-tick)
        lag-sampler (chime-core/chime-at
                     (chime-core/periodic-seq (Instant/now) (Duration/ofMinutes 1))
                     (fn [_] (sample-lag! backing-off?)))]
    (tracer/record-info! {:name "custodian/start"})
    {:stop? stop?
     :backing-off? backing-off?
     :future fut
     :reaper reaper
     :lag-sampler lag-sampler}))

(defn stop-worker [w]
  (tracer/record-info! {:name "custodian/stop"})
  (reset! (:stop? w) true)
  (.close ^AutoCloseable (:reaper w))
  (.close ^AutoCloseable (:lag-sampler w))
  ;; Give the worker a chance to finish its current batch, release its claimed
  ;; row, and exit before we force-cancel it.
  (when (= ::timeout (deref (:future w) 10000 ::timeout))
    (future-cancel (:future w))))

(defn start []
  (swap! worker
         (fn [w]
           (or w (start-worker)))))

(defn stop []
  (swap! worker
         (fn [w]
           (when w
             (stop-worker w))
           nil)))

(defn restart []
  (stop)
  (start))

(defn before-ns-unload []
  (stop))

(defn after-ns-reload []
  (start))
