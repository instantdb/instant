(ns instant.custodian
  "Deletes an app (or a single attr) in small, bounded, committed batches so that
   we don't hand the invalidator one giant WAL transaction.

   The plan for a deletion is stored as a chain of `custodian` rows linked by
   `depends_on`:

     app:  triples <- transactions <- app   (app depends on transactions depends on triples)
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
   [instant.config :as config]
   [instant.db.model.attr :as attr-model]
   [instant.flags :as flags]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.model.app :as app-model]
   [instant.util.async :as ua]
   [instant.util.exception :as ex]
   [instant.util.hsql :as uhsql]
   [instant.util.tracer :as tracer])
  (:import
   (clojure.lang ExceptionInfo)
   (java.lang AutoCloseable)
   (java.time Duration Instant)))

;; ----------
;; Config

(defn- batch-size [] (flags/flag :custodian-batch-size 1000))
(defn- idle-sleep-ms [] (flags/flag :custodian-idle-sleep-ms 5000))

;; Lease long enough that a batch (plus its lease renewal) comfortably finishes,
;; short enough that a dead worker's row gets picked up again reasonably soon.
(defn- lease-timeout-seconds [] (flags/flag :custodian-lease-timeout-seconds 120))

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
                     :returning :id}]]
    :insert-into :custodian
    :values [{:app-id :?app-id
              :type [:inline "app"]
              :depends-on {:select :id :from :tx-row}}]}))

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
                              [:is :depends-on nil]
                              [:is :worker-id nil]]
                      :order-by [:created-at]
                      :for [:update :skip-locked]
                      :limit [:inline 1]}]]
    :update :custodian
    :set {:worker-id :?worker-id}
    :from :claimed
    :where [:= :custodian.id :claimed.id]
    :returning :custodian.*}))

(def finish-q
  (uhsql/preformat {:delete-from :custodian
                    :where [:and [:= :id :?id] [:= :worker-id :?worker-id]]}))

(def release-q
  (uhsql/preformat {:update :custodian
                    :set {:worker-id nil}
                    :where [:and [:= :id :?id] [:= :worker-id :?worker-id]]}))

(def reap-stuck-q
  (uhsql/preformat {:update :custodian
                    :set {:worker-id nil}
                    :where [:and [:is-not :worker-id nil] [:< :updated-at :?stale]]
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

(defn reap-stuck!
  "Frees rows whose owner stopped heartbeating (updated_at older than the lease
   timeout) so another worker can reclaim them. Returns the freed row ids."
  ([] (reap-stuck! (aurora/conn-pool :write)))
  ([conn]
   (let [stale (.minusSeconds (Instant/now) (lease-timeout-seconds))]
     (sql/execute! ::reap-stuck! conn (uhsql/formatp reap-stuck-q {:stale stale})))))

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
            where active and confirmed_flush_lsn is not null"])))

(defn sample-lag! [backing-off?]
  (try
    (let [threshold (flags/flag :custodian-max-replication-lag-bytes (* 100 1024 1024))
          lag (or (max-replication-lag-bytes (aurora/conn-pool :read)) 0)]
      (reset! backing-off? (> lag threshold)))
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

;; Each batch, in one statement: heartbeat the custodian row (bump updated_at)
;; while asserting we still own it, delete up to :limit rows, and report the count.
;; If we no longer own the row it raises (wrong owner) or the final select raises
;; (row gone), unwinding the drain instead of silently deleting or looking done.
(defn- delete-batch-query [table attr-scoped?]
  (uhsql/preformat
   {:with [[:heartbeat {:update :custodian
                        :set {:updated-at :%now}
                        :where [:and
                                [:= :id :?id]
                                [:case [:= :worker-id :?worker-id] true
                                 :else [:raise_exception_message
                                        [:inline "custodian row not owned by this worker"]]]]
                        :returning :id}]
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
              :present]]}))

(def delete-app-triples-q (delete-batch-query :triples false))
(def delete-attr-triples-q (delete-batch-query :triples true))
(def delete-app-transactions-q (delete-batch-query :transactions false))

(defn- drain!
  "Deletes rows via `q` in bounded, committed batches, heartbeating and asserting
   ownership per batch (see `delete-batch-query`). Returns ::completed when the
   table is drained, or ::stopped if the worker was asked to stop mid-drain.
   Losing ownership throws and unwinds the drain."
  [stop? backing-off? conn id q params]
  (loop []
    (await-capacity! stop? backing-off?)
    (if @stop?
      ::stopped
      (let [deleted (-> (sql/do-execute! ::drain!
                                         conn
                                         (uhsql/formatp q (assoc params
                                                                 :id id
                                                                 :worker-id @config/process-id
                                                                 :limit (batch-size))))
                        first
                        :deleted)]
        (if (and deleted (pos? deleted))
          (recur)
          ::completed)))))

(defn- process-row! [stop? backing-off? conn {:keys [id type app_id attr_id]}]
  (tracer/with-span! {:name "custodian/process-row"
                      :attributes {:id id :type type :app-id app_id :attr-id attr_id}}
    (let [outcome (case type
                    "triples" (if attr_id
                                (drain! stop? backing-off? conn id delete-attr-triples-q {:app-id app_id :attr-id attr_id})
                                (drain! stop? backing-off? conn id delete-app-triples-q {:app-id app_id}))
                    "transactions" (drain! stop? backing-off? conn id delete-app-transactions-q {:app-id app_id})
                    ;; Terminal steps run to completion; they aren't interrupted mid-way.
                    "attr" (do (attr-model/hard-delete-multi! conn app_id #{attr_id}) ::completed)
                    "app" (do (app-model/delete-immediately-by-id! conn {:id app_id}) ::completed))]
      ;; ::stopped means the drain exited mid-way — hand the row back rather than
      ;; marking a half-done step finished.
      (case outcome
        ::completed (finish! conn id)
        ::stopped (release! conn id)))))

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
      (reap-stuck!))
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
