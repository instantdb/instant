(ns instant.reactive.invalidator
  (:require
   [clojure.core.async :as a]
   [clojure.set :as set]
   [datascript.core :as ds]
   [instant.config :as config]
   [instant.db.pg-introspect :as pg-introspect]
   [instant.flags :as flags]
   [instant.gauges :as gauges]
   [instant.grouped-queue :as grouped-queue]
   [instant.grpc :as grpc]
   [instant.grpc-client :as grpc-client]
   [instant.isn]
   [instant.jdbc.sql :as sql]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.wal :as wal]
   [instant.model.history :as history-model]
   [instant.reactive.ephemeral :as eph]
   [instant.reactive.receive-queue :as receive-queue]
   [instant.reactive.store :as rs]
   [instant.reactive.topics :as topics]
   [instant.util.async :as ua]
   [instant.util.coll :as ucoll]
   [instant.util.e2e-tracer :as e2e-tracer]
   [instant.util.tracer :as tracer])
  (:import
   (instant.grpc InvalidatorSubscribe PackedWalRecord SlotDisconnect WalRecord)
   (io.grpc Status Status$Code)
   (io.grpc.stub ServerCallStreamObserver StreamObserver)
   (java.sql Timestamp)
   (java.time Instant)
   (java.time.temporal ChronoUnit)
   (java.util ArrayList Map Queue)
   (java.util.concurrent ConcurrentHashMap Executors LinkedBlockingQueue TimeUnit)
   (org.postgresql.replication LogSequenceNumber)))

(declare wal-opts)

(declare invalidator-q)

(defn- schema-changes-require-refreshing-sessions?
  "All sessions may need to know about some schema changes.

   For example, if we create an attr, then all sessions should know about this,
   so they don't accidentally try create the same attr again.

   Right now we detect:
    - Attr creates or deletes
    - Ident changes

   Technically, sessions may need to know about other things: like if an attr
   becomes unique. But I am worried we may end up causing too much thrash
   for larger apps.

   For now, I'm only notifying on these changes."
  [{:keys [attr-changes ident-changes]}]
  (boolean
   (or (some #(#{:insert :delete} (:action %)) attr-changes)
       (seq ident-changes))))

(defn- invalidate!
  "Given a collection of changes, stales all relevant queries and returns
  sockets to be refreshed."
  ;; process-id used for tests
  [_process-id store {:keys [app-id tx-id isn] :as wal-record}]
  (let [topics      (topics/topics-for-changes wal-record)
        session-ids (rs/mark-stale-topics! store app-id tx-id isn topics wal-record)
        sockets     (keep #(:session/socket (rs/session store %)) session-ids)
        sync-subs (rs/get-stale-sync-subs store app-id topics)]
    {:sockets sockets
     :sync-subs sync-subs}))

(defn- invalidate-byop!
  "Given a collection of changes, stales all relevant queries and returns
  sockets to be refreshed."
  [table-info app-id store {:keys [tx-id isn] :as record}]
  (let [topics      (topics/topics-for-byop-changes table-info record)
        session-ids (rs/mark-stale-topics! store app-id tx-id isn topics record)
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

(defn transform-wal-record [{:keys [changes messages tx-bytes nextlsn isn previous-isn] :as _record}]
  ;; n.b. Add the table to the `add-tables` setting in create-replication-stream
  ;;      or else we will never be notified about it.
  (let [{:strs [idents triples attrs transactions
                wal_logs wal_logs_0 wal_logs_1 wal_logs_2 wal_logs_3 wal_logs_4 wal_logs_5 wal_logs_6 wal_logs_7]}
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
        (grpc/->WalRecord app-id
                          tx-id
                          isn
                          previous-isn
                          tx-created-at
                          tx-bytes
                          nextlsn
                          attrs
                          idents
                          triples
                          messages
                          (concat wal_logs wal_logs_0 wal_logs_1 wal_logs_2 wal_logs_3
                                  wal_logs_4 wal_logs_5 wal_logs_6 wal_logs_7))))))

(defn wal-record-xf
  "Filters wal records for supported changes. Returns [app-id changes]"
  []
  (keep #'transform-wal-record))

(defn combine-wal-records
  "Combines a list of wal-records into a single wal-record.
   We combine all of the change lists and advance the tx-id to the
   latest tx-id in the list."
  [r1 r2]
  (when (< (::grouped-queue/combined r1 1) (flags/flag :invalidator-batch-limit 500))
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
        (update :messages       (fnil into []) (:messages r2))
        (update :wal-logs       (fnil into []) (:wal-logs r2))
        (update :tx-bytes       (fnil + 0) (:tx-bytes r2))
        (assoc :tx-id           (:tx-id r2))
        (assoc :isn             (:isn r2))
        (assoc :nextlsn         (:nextlsn r2)))))

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
        (let [{:keys [sync-subs] invalidated-sockets :sockets}
              (invalidate! process-id store wal-record)
              schema-changes? (schema-changes-require-refreshing-sessions?
                               wal-record)

              sockets (if schema-changes?
                        (set/union (rs/all-sockets-for-app store app-id)
                                   invalidated-sockets)
                        invalidated-sockets)]

          (tracer/add-data! {:attributes {:num-sockets (count sockets)
                                          :num-invalidated-sockets (count invalidated-sockets)
                                          :schema-changes? schema-changes?
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
                                   :tx-created-at tx-created-at
                                   :isn (:isn wal-record)}))
            (doseq [{:sync/keys [session-id id]} sync-subs]
              (receive-queue/put! {:op :refresh-sync-table
                                   :app-id app-id
                                   :session-id session-id
                                   :subscription-id id}))))
        (catch Throwable t
          (def -wal-record wal-record)
          (def -store-value (store-snapshot store app-id))
          (tracer/add-exception! t {:escaping? false}))))))

(defn drop-backpressure? [queue wal-record]
  (let [app-id (:app-id wal-record)
        group (get (:groups queue) app-id)
        head (when group (Queue/.peek group))
        put-at (some-> head :instant.grouped-queue/put-at)
        latency (if put-at (- (System/currentTimeMillis) put-at) 0)]
    (when (and (flags/invalidator-drop-backpressure? app-id)
               (> latency (flags/invalidator-drop-tx-latency-ms)))
      (tracer/record-info! {:name "invalidator/drop-backpressure"
                            :attributes {:app-id app-id
                                         :latency latency}})
      true)))

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
          (when-not (drop-backpressure? queue wal-record)
            (grouped-queue/put! queue wal-record))
          (recur)))
      (grouped-queue/stop queue)
      (tracer/record-info! {:name "invalidation-worker/shutdown"}))
    queue))

;; ----
;; BYOP
;; ----

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

;; ---------------------
;; Singleton Invalidator
;; ---------------------

(defn handle-singleton-wal-record
  "This can be called either by the wal listener or by the stream observer,
   so it's either from our machine processing the wal, or by a stream of another
   machine processing the wal.

   You might worry that things will get out of sync, since this function tracks
   the previous isn and it could be called by two different streams simultaneously
   when the wal slot changes machines. It shouldn't be a problem because the calls
   from each individual stream will always be in order.

   The worst case should be that we handle the same record twice."
  [{:keys [queue previous-isn-atom]} ^WalRecord wal-record]
  (let [{:keys [isn previous-isn]} wal-record
        [old-previous next-previous] (swap-vals! previous-isn-atom
                                                 (fn [v]
                                                   (cond (nil? v)
                                                         isn ;; This is our first record

                                                         ;; Don't let previous-isn go backwards
                                                         (neg? (compare isn v))
                                                         v

                                                         :else isn)))]
    (when (and old-previous
               (not= old-previous previous-isn))
      ;; TODO: We should fetch the missing wal-records from the history table
      (tracer/record-info! {:name "singleton-missing-wal-records"
                            :attributes {:isn isn
                                         :previous-isn previous-isn
                                         :old-previous old-previous
                                         :next-previous next-previous
                                         :compare (compare previous-isn old-previous)}}))
    (tracer/with-span! {:name "handle-singleton-wal-record"
                        :attributes {:isn isn
                                     :previous-isn previous-isn
                                     :previous-handled-isn old-previous
                                     :skip? (neg? (compare isn old-previous))}}
      (grouped-queue/put! queue wal-record))))

(defn broadcast-slot-disconnect [{:keys [get-remote-observers]}]
  (let [msg (grpc/->SlotDisconnect)]
    (doseq [^StreamObserver observer (get-remote-observers)]
      (try
        (.onNext observer msg)
        (catch Throwable t
          ;; Isolate failures: one flaky observer must not abort the loop.
          ;; The cancel handler in handle-grpc-subscribe takes care of removing
          ;; dead observers.
          (tracer/record-exception-span! t {:name "invalidator/broadcast-slot-disconnect-observer-error"
                                            :escaping? false}))))))

(defn start-save-history-process
  "Saves wal records to history table in batches of up to 1000.
   Returns a map with `push` function that takes a wal-record
   and a `shutdown` function that will wait for the queue to clear
   before returning."
  [{:keys [flush-lsn-chan
           on-error]}]
  (let [executor (Executors/newSingleThreadExecutor)
        q (LinkedBlockingQueue.)
        stop-gauge (gauges/add-gauge-metrics-fn (fn [_]
                                                  [{:path "instant.reactive.invalidator.save-history-queue.size"
                                                    :value (.size q)}
                                                   {:path "instant.reactive.invalidator.save-history-queue.oldest-waiting-ms"
                                                    :value (when-let [item (.peek q)]
                                                             (when (instance? WalRecord item)
                                                               (- (System/currentTimeMillis)
                                                                  (.toEpochMilli ^Instant (:tx-created-at item)))))}]))
        shutdown-sentinel (Object.)
        shutdown? (atom false)
        process (reify Runnable
                  (run [_]
                    (try
                      (loop [batch (ArrayList.)
                             ;; First item will block
                             item (.take q)]
                        (.add batch item)
                        ;; Grab up to 1000 items from the queue
                        (.drainTo q batch 999)
                        (let [quit? (identical? shutdown-sentinel (.get batch (dec (.size batch))))]
                          (when quit?
                            (.remove batch (dec (.size batch))))
                          (when-not (.isEmpty batch)
                            (history-model/push-batch! batch)
                            (a/put! flush-lsn-chan (:nextlsn (.get batch (dec (.size batch))))))

                          (when-not quit?
                            (recur (ArrayList.)
                                   (.take q)))))
                      (catch Throwable t
                        (on-error t))
                      (finally
                        (when-not @shutdown?
                          (on-error (Exception. "Save history process exited before shut down.")))))))]
    (.submit executor process)
    {:push (fn [wal-record]
             (when @shutdown?
               (throw (Exception. "Put after shutdown to save-history queue")))
             (.put q wal-record))
     :shutdown (fn []
                 (reset! shutdown? true)
                 (.put q shutdown-sentinel)
                 (.shutdown executor)
                 (.awaitTermination executor 20 TimeUnit/SECONDS)
                 (stop-gauge))}))

(defn broadcast-wal-record [get-remote-observers packed-wal-record]
  (let [msg (grpc/->PackedWalRecord packed-wal-record)]
    (doseq [^StreamObserver observer (get-remote-observers)]
      (try
        (.onNext observer msg)
        (catch Throwable t
          ;; Isolate failures: one flaky observer must not abort the loop or
          ;; trigger the outer singleton-worker restart. The cancel handler
          ;; in handle-grpc-subscribe takes care of removing dead observers.
          (tracer/record-exception-span! t {:name "invalidator/broadcast-wal-record-observer-error"
                                            :escaping? false}))))))

(defn start-singleton-worker [{:keys [wal-chan
                                      get-remote-observers
                                      flush-lsn-chan
                                      on-error
                                      stop-lsn
                                      check-disabled
                                      queue
                                      previous-isn-atom]}]
  (tracer/record-info! {:name "invalidator/singleton-worker-start"})
  (let [save-history-process (start-save-history-process {:flush-lsn-chan flush-lsn-chan
                                                          :on-error on-error})
        process (a/go
                  (loop []
                    (if (check-disabled)
                      (on-error (ex-info "Invalidator singleton disabled" {}))
                      (when-let [wal-record (a/<! wal-chan)]
                        ;; Compress and encode it here once so that don't have to encode it for every
                        ;; grpc send and saving history
                        (let [packed-wal-record (history-model/pack-wal-record wal-record)
                              wal-record (with-meta wal-record {:packed packed-wal-record})]
                          (when-not (and stop-lsn
                                         (neg? (compare stop-lsn (:nextlsn wal-record))))
                            (try
                              (broadcast-wal-record get-remote-observers packed-wal-record)
                              (handle-singleton-wal-record {:queue queue
                                                            :previous-isn-atom previous-isn-atom}
                                                           wal-record)
                              ((:push save-history-process) wal-record)
                              (catch Exception e
                                (on-error e)))
                            (recur))))))

                  ((:shutdown save-history-process))
                  (tracer/record-info! {:name "invalidator/singleton-worker-stop"}))]
    {:completed-chan process}))

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
       :worker-chan chan
       :flush-lsn-chan (a/chan (a/sliding-buffer 1))})
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
       :flush-lsn-chan (a/chan (a/sliding-buffer 1))
       :byop-chan byop-chan})))

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

(defn fast-active-slot-check
  "Just checks the db to see if the slot is active. It only works when we're not
   in the middle of switching db instances, but we check for that."
  [{:keys [get-conn-config
           slot-type
           slot-suffix]}]
  (when (:same-as-read-conn (meta get-conn-config))
    (let [slot-name (wal/full-slot-name slot-type slot-suffix)]
      (:active (sql/select-one ::fast-active-slot-check
                               (aurora/conn-pool :read)
                               ["select active from pg_replication_slots where slot_name = ?" slot-name])))))

(defn start-singleton-listener [{:keys [acquire-slot-interval-ms
                                        process-id
                                        check-disabled
                                        stop-lsn
                                        acquire-slot-interrupt-chan
                                        get-conn-config
                                        slot-num
                                        get-remote-observers
                                        previous-isn-atom
                                        queue]}]
  (let [shutdown-chan (a/chan)

        process (a/go
                  (loop [timeout-ch (a/timeout 0)]
                    (let [matched-chan (second (a/alts! [shutdown-chan
                                                         timeout-ch
                                                         acquire-slot-interrupt-chan]))]
                      (cond
                        (= matched-chan shutdown-chan) nil
                        (check-disabled) (recur (a/timeout acquire-slot-interval-ms))

                        (fast-active-slot-check {:get-conn-config get-conn-config
                                                 :slot-type :invalidator})
                        (recur (a/timeout acquire-slot-interval-ms))

                        :else
                        (let [{:keys [wal-chan worker-chan flush-lsn-chan close-signal-chan]}
                              (create-wal-chans)

                              wal-opts (wal/make-wal-opts {:wal-chan wal-chan
                                                           :worker-chan worker-chan
                                                           :close-signal-chan close-signal-chan
                                                           :ex-handler wal-ex-handler
                                                           :get-conn-config get-conn-config
                                                           :flush-lsn-chan flush-lsn-chan
                                                           :slot-type :invalidator
                                                           :slot-num slot-num})

                              wal-started-promise (:started-promise wal-opts)
                              signal-chan (a/chan)

                              wal-worker (ua/fut-bg
                                          (try
                                            (wal/start-singleton-worker wal-opts)
                                            (finally
                                              (deliver wal-started-promise :recur)
                                              (a/close! close-signal-chan))))

                              _ (ua/vfuture
                                 (let [wal-start-result @wal-started-promise]
                                   (case wal-start-result
                                     :recur (a/put! signal-chan :recur)
                                     true (a/put! signal-chan :slot-claimed))))

                              [next-v _next-ch] (a/alts! [signal-chan shutdown-chan])]
                          (case next-v
                            nil ;; shutdown
                            (do (stop wal-opts)
                                wal-worker)

                            :recur ;; Didn't get the slot, wait and try again
                            (recur (a/timeout acquire-slot-interval-ms))

                            :slot-claimed ;; got the slot, start the worker
                            (let [{worker-exit-chan :completed-chan}
                                  (start-singleton-worker {:wal-chan worker-chan
                                                           :close-signal-chan close-signal-chan
                                                           :flush-lsn-chan flush-lsn-chan
                                                           :process-id process-id
                                                           :get-remote-observers get-remote-observers
                                                           :previous-isn-atom previous-isn-atom
                                                           :queue queue
                                                           :on-error (fn [e]
                                                                       (tracer/record-exception-span! e {:name "invalidator/singleton-worker-error"})
                                                                       (a/close! close-signal-chan))
                                                           :stop-lsn stop-lsn
                                                           :check-disabled check-disabled})
                                  [_exit-v exit-ch] (a/alts! [shutdown-chan close-signal-chan worker-exit-chan])]
                              (tracer/with-span! {:name "invalidator/wait-for-singleton-worker-to-finish"
                                                  :attributes {:pid process-id
                                                               :slot-name (:slot-name wal-opts)}}
                                (stop wal-opts))
                              ;; serves as a signal to the other instances that they should
                              ;; grab the topic
                              (broadcast-slot-disconnect {:get-remote-observers get-remote-observers})
                              (when (= exit-ch close-signal-chan)
                                (tracer/record-info! {:name "invalidator-singleton/retry"
                                                      :attributes {:wait-ms acquire-slot-interval-ms
                                                                   :attributes {:pid process-id
                                                                                :slot-name (:slot-name wal-opts)}}})
                                (recur (a/timeout acquire-slot-interval-ms)))))))))
                  (tracer/record-info! {:name "invalidator/singleton-slot-listener-exit"
                                        :attributes {:pid process-id}}))]
    {:shutdown (fn []
                 (a/close! shutdown-chan)
                 (when-let [wal-worker-finished (a/<!! process)]
                   @wal-worker-finished))
     :completed-chan process}))

(defonce next-process-id (atom (int 0)))
(defn gen-process-id []
  (swap! next-process-id unchecked-inc-int))

(defonce grpc-registry (atom {:local-processes {}
                              :remote-observers {}}))

(defn handle-grpc-subscribe
  "This is called when a remote machine subscribes to our invalidator stream.
   The remote machine will create the connection when it starts up the
   singleton invalidator, indicating that it wants to subscribe to wal records
   on this machine."
  [^InvalidatorSubscribe req ^ServerCallStreamObserver observer]
  (tracer/with-span! {:name "handle-grpc-subscribe"
                      :attributes {:remote-machine-id (:machine-id req)
                                   :remote-process-id (:process-id req)}}
    (let [new-state (swap! grpc-registry
                           (fn [state]
                             (if (empty? (:local-processes state))
                               state
                               (assoc-in state [:remote-observers req] observer))))
          new-observer (get-in new-state [:remote-observers req])]
      (if (or (not new-observer) ; We don't have any processes running, so tell them to go away
              (not= new-observer observer)) ; Someone else won the race, close this one
        (.onCompleted observer)
        (let [cleanup (reify Runnable
                        (run [_]
                          (swap! grpc-registry
                                 (fn [state]
                                   (if (= observer (get-in state [:remote-observers req]))
                                     (ucoll/dissoc-in state [:remote-observers req])
                                     state)))))]
          (.setOnCloseHandler observer cleanup)
          (.setOnCancelHandler observer cleanup)
          (doseq [{:keys [subscribe]} (vals (:local-processes new-state))]
            (subscribe (:machine-id req))))))))

;; Used to indicate to grpc that we meant to cancel
(def shutdown-reason "s")

(defn make-subscription-observer
  "This observer receives the wal records from the remote machine."
  [{:keys [queue
           previous-isn-atom
           acquire-slot-interrupt-chan]}
   remote-machine-id
   on-cancel]
  (let [cleanup (fn []
                  (on-cancel)
                  (tracer/record-info! {:name "invalidator/subscription-ended"
                                        :attributes {:remote-machine-id remote-machine-id}}))]
    (reify StreamObserver
      (onNext [_ msg]
        (condp instance? msg
          WalRecord (handle-singleton-wal-record {:queue queue
                                                  :previous-isn-atom previous-isn-atom}
                                                 msg)
          PackedWalRecord (handle-singleton-wal-record {:queue queue
                                                        :previous-isn-atom previous-isn-atom}
                                                       (history-model/unpack-wal-record (:ba msg)))
          SlotDisconnect (a/put! acquire-slot-interrupt-chan true)
          (tracer/record-info! {:name "invalidator/unknown-message"
                                :attributes {:msg msg}})))
      (onError [_ t]
        (cleanup)
        (let [status (Status/fromThrowable t)]
          (if (= (.getCode status) Status$Code/CANCELLED)
            (tracer/record-info! {:name "invalidator/singleton-grpc-subscription-cancelled"
                                  :attributes {:description (.getDescription status)
                                               :remote-machine-id remote-machine-id}})
            (tracer/record-exception-span! t {:name "invalidator/singleton-grpc-subscription-stream-error"}))))
      (onCompleted [_]
        (cleanup)))))

;; How the singleton subscriber works
;; # Connecting
;; 1. On startup, we connect via grpc to all of the existing instances to register
;;    our interest in receiving wal records
;; 2. When new machines are added to hazelcast, we automatically connect via grpc
;; 3. Remote instances connect to us when we join hazelcast
;;
;; # If someone else holds the invalidator slot
;; 1. The machine that holds the slot will send us wal records through the grpc connection
;;    and we will apply them
;; 2. When the remote machine gives up the slot, they'll broadcast a message through the
;;    grpc connection and we'll race to pick it up.
;;    a. We'll also periodically try to grab the slot in case the disconnect message is lost
;;
;; # If we hold the invalidator slot
;; 1. We distribute each wal record to all subscribers over the grpc connection
;; 2. We push the wal record into an s3 directory bucket (or directly into the db if there
;;    is no bucket defined for self-hosted) and write an entry into the history table.
;; 3. We mark the lsn as flushed once we've finished writing to the history table.
;;    a. If any of the subscribers miss a transaction, they can read it from the history table
;;    b. By waiting until we write to the history table, we can ensure that we never miss a
;;       transaction

(defn subscribe-to-machine [{:keys [grpc-cancels
                                    previous-isn-atom
                                    acquire-slot-interrupt-chan
                                    process-id
                                    queue
                                    outbound-subscriptions]}
                            machine-id]
  (tracer/with-span! {:name "invalidator/subscribe-to-machine"
                      :attributes {:remote-machine-id machine-id
                                   :process-id process-id}}
    (let [sentinel (Object.)
          after (swap! outbound-subscriptions (fn [subs]
                                                (if (get subs machine-id)
                                                  subs
                                                  (assoc subs machine-id sentinel))))]
      (if-not (= sentinel (get after machine-id))
        (tracer/add-data! {:attributes {:already-subscribed? true}})
        (let [cancel-id (random-uuid)
              on-close (fn []
                         (swap! outbound-subscriptions (fn [state]
                                                         (if (= sentinel (get state machine-id))
                                                           (dissoc state machine-id)
                                                           state)))
                         (swap! grpc-cancels dissoc cancel-id))]
          (try
            (let [client (grpc-client/grpc-client-for-machine-id machine-id)
                  observer (make-subscription-observer {:queue queue
                                                        :previous-isn-atom previous-isn-atom
                                                        :acquire-slot-interrupt-chan acquire-slot-interrupt-chan}
                                                       machine-id
                                                       on-close)
                  {:keys [cancel]} (grpc-client/subscribe-to-invalidator client process-id observer)]
              (swap! grpc-cancels assoc cancel-id cancel))
            (catch Throwable t
              ;; Setup failed before the observer could drive its own cleanup,
              ;; so release the sentinel to unblock future reconnect attempts.
              (swap! outbound-subscriptions (fn [state]
                                              (if (= sentinel (get state machine-id))
                                                (dissoc state machine-id)
                                                state)))
              (tracer/record-exception-span! t {:name "invalidator/subscribe-to-machine-failed"
                                                :escaping? false
                                                :attributes {:remote-machine-id machine-id}}))))))))

(defn cleanup-local-process
  "Removes the process from the grpc-registry and closes any
   remote-observers if we're the last process."
  [process-id]
  (let [[old new] (swap-vals! grpc-registry (fn [state]
                                              (let [processes-after (dissoc (:local-processes state) process-id)]
                                                (cond-> state
                                                  true (assoc :local-processes processes-after)

                                                  (empty? processes-after)
                                                  (assoc :remote-observers {})))))]
    (when (empty? (:remote-observers new))
      (doseq [^StreamObserver observer (vals (:remote-observers old))]
        (try
          (.onCompleted observer)
          (catch Throwable _ nil))))))

(defn start-singleton []
  (let [process-id (gen-process-id)
        conn-config (config/get-aurora-config)
        get-conn-config (with-meta (fn []
                                     conn-config)
                          ;; When we're not transitioning to a new cluster,
                          ;; this lets us check if the slot is active without
                          ;; creating a new connection
                          {:same-as-read-conn true})
        _ (wal/ensure-slot (get-conn-config) "invalidator")
        acquire-slot-interrupt-chan (a/chan (a/sliding-buffer 1))

        queue (grouped-queue/start
               {:group-key-fn :app-id
                :combine-fn combine-wal-records
                :process-fn (fn [_key wal-record]
                              ;; Just testing what kind of latency we'll see with this setup
                              (tracer/with-span! {:name "singleton-topic-latency"
                                                  :attributes {:tx-id (:tx-id wal-record)
                                                               :latency-ms (wal-latency-ms wal-record)}}))
                :metrics-path "instant.reactive.invalidator.singleton-q"
                :max-workers 8})

        previous-isn-atom (atom nil)

        ;; Holds a map of unique-id to cancel function
        ;; used to close the outbound grpc connections
        grpc-cancels (atom {})

        outbound-subscriptions (atom {})

        subscribe (partial subscribe-to-machine {:grpc-cancels grpc-cancels
                                                 :previous-isn-atom previous-isn-atom
                                                 :acquire-slot-interrupt-chan acquire-slot-interrupt-chan
                                                 :process-id process-id
                                                 :queue queue
                                                 :outbound-subscriptions outbound-subscriptions})

        _ (swap! grpc-registry (fn [state]
                                 (assoc-in state [:local-processes process-id] {:subscribe subscribe})))

        ;; Add listener so that we can subscribe to machines as they arrive
        remove-hz-cb (eph/add-hz-member-change-callback
                      (fn [member-id action]
                        (when (and (= action :added)
                                   (not= member-id config/machine-id))
                          (subscribe member-id))))

        ;; Start the grpc subscribers to remote machines that arrive before we added the listener
        ;; If we race and connect to the same machine twice, the remote machine will error on one
        ;; of the connections
        _ (doseq [member-id (keys eph/hz-member-by-machine-id-cache)]
            (when (not= member-id config/machine-id)
              (subscribe member-id)))

        {shutdown-listener :shutdown}
        (start-singleton-listener
         {:acquire-slot-interval-ms 10000
          :process-id @config/process-id
          :check-disabled (fn []
                            (flags/toggled? :disable-singleton-invalidator))
          :acquire-slot-interrupt-chan acquire-slot-interrupt-chan
          :get-conn-config get-conn-config
          :slot-num config/invalidator-slot-num
          :previous-isn-atom previous-isn-atom
          :get-remote-observers (fn []
                                  (-> @grpc-registry
                                      :remote-observers
                                      vals))
          :queue queue})]
    {:shutdown (fn []
                 (remove-hz-cb)
                 (shutdown-listener)
                 ;; Shutdown outbound subscribers
                 (doseq [cancel (vals @grpc-cancels)]
                   (try
                     (tracer/with-span! {:name "invalidator/cancel-outbound-sub"}
                       (cancel shutdown-reason))
                     (catch Throwable _ nil)))
                 ;; Shutdown inbound subscribers if we're the last
                 (cleanup-local-process process-id))}))

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
                                                         (config/get-aurora-config))
                                      :slot-suffix process-id
                                      :slot-type :invalidator
                                      :slot-num config/invalidator-slot-num})]
     (ua/fut-bg
      (wal/start-worker wal-opts))

     @(:started-promise wal-opts)

     (def invalidator-q
       (start-worker process-id rs/store worker-chan))

     (when byop-chan
       (ua/fut-bg
        (start-byop-worker rs/store byop-chan)))

     wal-opts)))

(defn singleton-startup-disabled?
  "Reads the `prevent-singleton-invalidator-startup` row from the config table.
   The flags subscription isn't initialised until after the invalidator starts,
   so we can't use `flags/toggled?` here."
  []
  (-> (sql/select-one
       ::singleton-startup-disabled?
       (aurora/conn-pool :read)
       ["select v from config where k = 'prevent-singleton-invalidator-startup'"])
      :v
      boolean))

(defn start-global []
  (def wal-opts (start))
  (def singleton-process
    (if (singleton-startup-disabled?)
      (do
        (tracer/record-info! {:name "invalidator/singleton-startup-prevented-by-config"})
        nil)
      (start-singleton))))

(defn stop-global []
  (when (bound? #'wal-opts)
    (stop wal-opts))
  (when (and (bound? #'singleton-process)
             singleton-process)
    ((:shutdown singleton-process))))

(defn restart []
  (stop-global)
  (start-global))
