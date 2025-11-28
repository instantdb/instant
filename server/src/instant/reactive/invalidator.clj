(ns instant.reactive.invalidator
  (:require
   [clojure.core.async :as a]
   [datascript.core :as ds]
   [instant.config :as config]
   [instant.db.pg-introspect :as pg-introspect]
   [instant.grouped-queue :as grouped-queue]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.wal :as wal]
   [instant.reactive.receive-queue :as receive-queue]
   [instant.reactive.store :as rs]
   [instant.reactive.topics :as topics]
   [instant.util.async :as ua]
   [instant.util.e2e-tracer :as e2e-tracer]
   [instant.util.tracer :as tracer])
  (:import
   (java.sql Timestamp)
   (java.time Instant)
   (java.time.temporal ChronoUnit)
   (java.util Map)
   (java.util.concurrent ConcurrentHashMap)
   (org.postgresql.replication LogSequenceNumber)))

(declare wal-opts)

(declare invalidator-q)

(defn- invalidate!
  "Given a collection of changes, stales all relevant queries and returns
  sockets to be refreshed."
  ;; process-id used for tests
  [_process-id store {:keys [app-id tx-id] :as wal-record}]
  (let [topics      (topics/topics-for-changes wal-record)
        session-ids (rs/mark-stale-topics! store app-id tx-id topics)
        sockets     (keep #(:session/socket (rs/session store %)) session-ids)
        sync-subs (rs/get-stale-sync-subs store app-id topics)]
    {:sockets sockets
     :sync-subs sync-subs}))

(defn- invalidate-byop!
  "Given a collection of changes, stales all relevant queries and returns
  sockets to be refreshed."
  [table-info app-id store {:keys [tx-id] :as record}]
  (let [topics      (topics/topics-for-byop-changes table-info record)
        session-ids (rs/mark-stale-topics! store app-id tx-id topics)
        sockets     (keep #(:session/socket (rs/session store %)) session-ids)]
    sockets))

;; ------
;; wal record xf

(defn app-id-from-columns [columns]
  (some-> columns
          (topics/get-column "app_id")
          (parse-uuid)))

(defn extract-app-id
  [{:keys [columns] :as _change}]
  (app-id-from-columns columns))

(defn id-from-columns [columns]
  (some-> columns
          (topics/get-column "id")
          (parse-uuid)))

(defn extract-id
  [{:keys [columns] :as _change}]
  (id-from-columns columns))

(defn extract-tx-id [{:keys [columns] :as _change}]
  (topics/get-column columns "id"))

(defn extract-tx-created-at [{:keys [columns] :as _change}]
  (when-let [^String created-at (topics/get-column columns "created_at")]
    (.toInstant (Timestamp/valueOf created-at))))

(defn transform-wal-record [{:keys [changes tx-bytes] :as _record}]
  ;; n.b. Add the table to the `add-tables` setting in create-replication-stream
  ;;      or else we will never be notified about it.
  (let [{:strs [idents triples attrs transactions]}
        (group-by :table changes)

        some-changes (or (seq idents)
                         (seq triples)
                         (seq attrs))
        transactions-change (first transactions)
        app-id (extract-app-id transactions-change)]

    (when (and some-changes app-id)
      (let [tx-id (extract-tx-id transactions-change)
            tx-created-at (extract-tx-created-at transactions-change)]
        (e2e-tracer/invalidator-tracking-step! {:tx-id tx-id
                                                :tx-created-at tx-created-at
                                                :name "transform-wal-record"})
        ;; n.b. make sure to update combine-wal-records below if new
        ;;      items are added to this map
        {:attr-changes attrs
         :ident-changes idents
         :triple-changes triples
         :app-id app-id
         :tx-created-at tx-created-at
         :tx-id tx-id
         :tx-bytes tx-bytes}))))

(defn wal-record-xf
  "Filters wal records for supported changes. Returns [app-id changes]"
  []
  (keep #'transform-wal-record))

(defn combine-wal-records
  "Combines a list of wal-records into a single wal-record.
   We combine all of the change lists and advance the tx-id to the
   latest tx-id in the list."
  [r1 r2]
  (when (< (::grouped-queue/combined r1 1) 100)
    ;; Complain loudly if we accidently mix wal-records from multiple apps
    (when (not= (:app-id r1) (:app-id r2))
      (throw (ex-info "app-id mismatch in combine-wal-records" {:r1 r1 :r2 r2})))
    (e2e-tracer/invalidator-tracking-step! {:tx-id (:tx-id r1)
                                            :name "skipped-in-combined-wal-record"})

    ;; Keep the old tx-created-at so that we see the worst case wal-latency-ms
    (-> r1
        (update :attr-changes   (fnil into []) (:attr-changes r2))
        (update :ident-changes  (fnil into []) (:ident-changes r2))
        (update :triple-changes (fnil into []) (:triple-changes r2))
        (update :tx-bytes       (fnil + 0) (:tx-bytes r2))
        (assoc :tx-id           (:tx-id r2)))))

(defn transform-byop-wal-record [{:keys [changes nextlsn]}]
  ;; TODO(byop): if change is empty, then there might be changes to the schema
  (let [triple-changes (filter (fn [c]
                                 (#{:update :insert :delete} (:action c)))
                               changes)]
    (when triple-changes
      {:triple-changes triple-changes
       :tx-id (LogSequenceNumber/.asLong nextlsn)})))

(defn byop-wal-record-xf
  []
  (keep #'transform-byop-wal-record))

;; ------
;; invalidator

(defn- store-snapshot [store app-id]
  (rs/->ReactiveStore
   (ds/conn-from-db @(:sessions store))
   (^[Map] ConcurrentHashMap/new
    (if-let [conn (some-> store
                          :conns
                          (Map/.get app-id)
                          deref
                          ds/conn-from-db)]
      {app-id conn}
      {}))))

(defn wal-latency-ms [{:keys [tx-created-at]}]
  (when tx-created-at
    (.between ChronoUnit/MILLIS tx-created-at (Instant/now))))

(defn process-wal-record [process-id store record-count wal-record]
  (let [{:keys [app-id tx-id tx-created-at tx-bytes]} wal-record]
    (tracer/with-span! {:name "invalidator/work"
                        :attributes {:app-id app-id
                                     :tx-id tx-id
                                     :wal-record-count record-count
                                     :wal-latency-ms (wal-latency-ms wal-record)
                                     :tx-bytes tx-bytes}}

      (try
        (let [{:keys [sockets sync-subs]} (invalidate! process-id store wal-record)]
          (tracer/add-data! {:attributes {:num-sockets (count sockets)
                                          :num-sync-subs (count sync-subs)
                                          :tx-latency-ms (e2e-tracer/tx-latency-ms tx-created-at)}})
          (e2e-tracer/invalidator-tracking-step! {:tx-id tx-id
                                                  :tx-created-at tx-created-at
                                                  :name "send-refreshes"
                                                  :attributes {:num-sockets (count sockets)}})
          (when (or (config/dev?) (seq sync-subs))
            (rs/add-transaction-to-sync-table-txes wal-record))
          (tracer/with-span! {:name "invalidator/send-refreshes"}
            (doseq [{:keys [id]} sockets]
              (receive-queue/put! {:op :refresh
                                   :session-id id
                                   :tx-id tx-id
                                   :tx-created-at tx-created-at}))
            (doseq [{:sync/keys [session-id id]} sync-subs]
              (receive-queue/put! {:op :refresh-sync-table
                                   :app-id app-id
                                   :session-id session-id
                                   :subscription-id id}))))
        (catch Throwable t
          (def -wal-record wal-record)
          (def -store-value (store-snapshot store app-id))
          (tracer/add-exception! t {:escaping? false}))))))

(defn start-worker [process-id store wal-chan]
  (tracer/record-info! {:name "invalidation-worker/start"})
  (let [queue
        (grouped-queue/start
         {:group-key-fn :app-id
          :combine-fn   combine-wal-records
          :process-fn   (fn [_key wal-record]
                          (process-wal-record process-id
                                              store
                                              (::grouped-queue/combined wal-record 1)
                                              wal-record))
          :metrics-path "instant.reactive.invalidator.q"
          :max-workers  8})]
    (a/go
      (loop []
        (when-some [wal-record (a/<! wal-chan)]
          (let [app-id (:app-id wal-record)
                group (get (:groups queue) app-id)
                head (when group (.peek group))
                put-at (some-> head :instant.grouped-queue/put-at)
                latency (if put-at (- (System/currentTimeMillis) put-at) 0)]
            (if (> latency 30000)
              (tracer/record-info! {:name "invalidator/drop-backpressure"
                                    :attributes {:app-id app-id
                                                 :latency latency}})
              (grouped-queue/put! queue wal-record)))
          (recur)))
      (grouped-queue/stop queue)
      (tracer/record-info! {:name "invalidation-worker/shutdown"}))
    queue))

(defn handle-byop-record [table-info app-id store wal-record]
  (when-let [record (transform-byop-wal-record wal-record)]
    (try
      (let [sockets (invalidate-byop! table-info app-id store record)]
        (tracer/add-data! {:attributes {:num-sockets (count sockets)}})
        (tracer/with-span! {:name "invalidator/send-refreshes"}
          (doseq [{:keys [id]} sockets]
            (receive-queue/put! {:op :refresh
                                 :session-id id}))))
      (catch Throwable t
        (def -wal-record wal-record)
        (def -store-value (store-snapshot store app-id))
        (tracer/add-exception! t {:escaping? false})))))

(defn start-byop-worker [store wal-chan]
  (tracer/record-info! {:name "invalidation-worker/start-byop"})
  (let [app-id config/instant-on-instant-app-id
        {:keys [table-info]} (pg-introspect/introspect (aurora/conn-pool :read)
                                                       "public")]
    (loop []
      (let [wal-record (a/<!! wal-chan)]
        (if-not wal-record
          (tracer/record-info! {:name "invalidation-worker/shutdown-byop"})
          (do
            (try
              (handle-byop-record table-info
                                  app-id
                                  store
                                  wal-record)
              (catch Throwable t
                (def -wal-record wal-record)
                (def -store-value store)
                (tracer/add-exception! t {:escaping? false})))
            (recur)))))))

;; ------
;; orchestration

(defn wal-ex-handler [e]
  (tracer/record-exception-span! e {:name "invalidator/wal-ex-handler"
                                    :escaping? false})
  (wal/shutdown! wal-opts))

(defn create-wal-chans []
  (if-not config/instant-on-instant-app-id
    (let [chan (a/chan 1 (wal-record-xf))]
      {:wal-chan chan
       :close-signal-chan (a/chan)
       :worker-chan chan})
    (let [wal-chan (a/chan 1)
          mult (a/mult wal-chan)
          worker-chan (a/chan 1 (wal-record-xf))
          byop-chan (a/chan 1)]
      (a/tap mult worker-chan)
      (a/tap mult byop-chan)
      {:wal-chan wal-chan
       ;; Nothing will ever be put on this chan,
       ;; it will be closed when the wal-chan is closed
       ;; so that the consumer can know to stop waiting for
       ;; its puts to complete
       :close-signal-chan (a/chan)
       :worker-chan worker-chan
       :byop-chan byop-chan})))

(defn start
  "Entry point for invalidator. Starts a WAL listener and pipes WAL records to
  our partition router. Partition router dispatches records to app workers who run `go-work`"
  ([]
   (start @config/process-id))
  ([process-id]
   (let [{:keys [wal-chan worker-chan byop-chan close-signal-chan]}
         (create-wal-chans)

         wal-opts (wal/make-wal-opts {:wal-chan wal-chan
                                      :worker-chan worker-chan
                                      :close-signal-chan close-signal-chan
                                      :ex-handler wal-ex-handler
                                      :get-conn-config (fn []
                                                         (or (config/get-next-aurora-config)
                                                             ;; Use the next db so that we don't
                                                             ;; have to worry about restarting the
                                                             ;; invalidator when failing over to a
                                                             ;; new blue/green deployment
                                                             (config/get-aurora-config)))
                                      :slot-suffix process-id
                                      :slot-type :invalidator})]
     (ua/fut-bg
      (wal/start-worker wal-opts))

     @(:started-promise wal-opts)

     (def invalidator-q
       (start-worker process-id rs/store worker-chan))

     (when byop-chan
       (ua/fut-bg
        (start-byop-worker rs/store byop-chan)))

     wal-opts)))

(defn start-global []
  (def wal-opts (start)))

(defn stop [wal-opts]
  (let [shutdown-future (future (wal/shutdown! wal-opts))]
    (loop []
      (when-not (realized? shutdown-future)
        (wal/kick-wal (aurora/conn-pool :write))
        (Thread/sleep 100)
        (recur))))
  (a/close! (:to wal-opts))
  (a/close! (:close-signal-chan wal-opts))
  (a/close! (:worker-chan wal-opts)))

(defn stop-global []
  (when (bound? #'wal-opts)
    (stop wal-opts)))

(defn restart []
  (stop-global)
  (start-global))
