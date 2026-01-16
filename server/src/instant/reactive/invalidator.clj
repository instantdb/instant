(ns instant.reactive.invalidator
  (:require
   [clojure.core.async :as a]
   [datascript.core :as ds]
   [instant.config :as config]
   [instant.db.pg-introspect :as pg-introspect]
   [instant.flags :as flags]
   [instant.gauges :as gauges]
   [instant.grouped-queue :as grouped-queue]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.wal :as wal]
   [instant.reactive.ephemeral :as eph]
   [instant.reactive.receive-queue :as receive-queue]
   [instant.reactive.store :as rs]
   [instant.reactive.topics :as topics]
   [instant.util.async :as ua]
   [instant.util.e2e-tracer :as e2e-tracer]
   [instant.util.hazelcast :refer [->WalRecord]]
   [instant.util.tracer :as tracer]
   [clojure.set :as set])
  (:import
   (com.hazelcast.core HazelcastInstance)
   (com.hazelcast.ringbuffer Ringbuffer)
   (com.hazelcast.ringbuffer.impl RingbufferService)
   (com.hazelcast.topic Message ITopic ReliableMessageListener TopicOverloadPolicy)
   (instant.util.hazelcast WalRecord)
   (java.sql Timestamp)
   (java.time Instant)
   (java.time.temporal ChronoUnit)
   (java.util Map Queue)
   (java.util.concurrent ConcurrentHashMap Executors)
   (java.util.concurrent.atomic AtomicLong)
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
  [_process-id store {:keys [app-id tx-id] :as wal-record}]
  (let [topics      (topics/topics-for-changes wal-record)
        session-ids (rs/mark-stale-topics! store app-id tx-id topics wal-record)
        sockets     (keep #(:session/socket (rs/session store %)) session-ids)
        sync-subs (rs/get-stale-sync-subs store app-id topics)]
    {:sockets sockets
     :sync-subs sync-subs}))

(defn- invalidate-byop!
  "Given a collection of changes, stales all relevant queries and returns
  sockets to be refreshed."
  [table-info app-id store {:keys [tx-id] :as record}]
  (let [topics      (topics/topics-for-byop-changes table-info record)
        session-ids (rs/mark-stale-topics! store app-id tx-id topics record)
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

(defn transform-wal-record [{:keys [changes messages tx-bytes nextlsn] :as _record}]
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
        {:nextlsn nextlsn
         :attr-changes attrs
         :ident-changes idents
         :triple-changes triples
         :app-id app-id
         :tx-created-at tx-created-at
         :tx-id tx-id
         :tx-bytes tx-bytes
         :messages messages
         :wal-logs (concat wal_logs wal_logs_0 wal_logs_1 wal_logs_2 wal_logs_3
                           wal_logs_4 wal_logs_5 wal_logs_6 wal_logs_7)}))))

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

(defn start-singleton-worker [{:keys [wal-chan
                                      close-signal-chan
                                      flush-lsn-chan
                                      ^ITopic hz-topic
                                      on-error
                                      stop-lsn
                                      check-disabled]}]
  (tracer/record-info! {:name "invalidator/singleton-worker-start"})
  (let [process (a/go
                  (loop []
                    (if (check-disabled)
                      (on-error (ex-info "Invalidator singleton disabled" {}))
                      (when-let [wal-record (a/<! wal-chan)]
                        (when-not (and stop-lsn
                                       (= -1 (compare stop-lsn (:nextlsn wal-record))))
                          (try
                            (.publish hz-topic (->WalRecord wal-record))
                            (ua/>!-close-safe close-signal-chan flush-lsn-chan (:nextlsn wal-record))
                            (catch Exception e
                              (on-error e)))
                          (recur)))))

                  (tracer/record-info! {:name "invalidator/singleton-worker-stop"}))]
    {:completed-chan process}))

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

(defn start-singleton-listener [{:keys [acquire-slot-interval-ms
                                        process-id
                                        check-disabled
                                        stop-lsn
                                        acquire-slot-interrupt-chan
                                        get-conn-config
                                        ^ITopic hz-topic]}]
  (let [shutdown-chan (a/chan)

        process (a/go
                  (loop [timeout-ch (a/timeout 0)]
                    (let [matched-chan (second (a/alts! [shutdown-chan
                                                         timeout-ch
                                                         acquire-slot-interrupt-chan]))]
                      (cond
                        (= matched-chan shutdown-chan) nil
                        (check-disabled) (recur (a/timeout acquire-slot-interval-ms))
                        :else
                        (let [{:keys [wal-chan worker-chan flush-lsn-chan close-signal-chan]}
                              (create-wal-chans)

                              wal-opts (wal/make-wal-opts {:wal-chan wal-chan
                                                           :worker-chan worker-chan
                                                           :close-signal-chan close-signal-chan
                                                           :ex-handler wal-ex-handler
                                                           :get-conn-config get-conn-config
                                                           :flush-lsn-chan flush-lsn-chan
                                                           :slot-type :invalidator})

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
                                                           :hz-topic hz-topic
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
                              (.publish hz-topic process-id)
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

(defn hz-gauges [^ITopic topic]
  (let [stats (.getLocalTopicStats topic)]
    [{:path "hz.invalidator-topic.publishOperationCount"
      :value (.getPublishOperationCount stats)}
     {:path "hz.invalidator-topic.receiveOperationCount"
      :value (.getReceiveOperationCount stats)}]))

(defn hz-topic-listener [^Ringbuffer ring-buffer on-msg]
  (let [seq-id (AtomicLong. -1)]
    (reify ReliableMessageListener
      (onMessage [_ m]
        (on-msg m))
      (isLossTolerant [_]
        true)
      (isTerminal [_ t]
        (tracer/record-exception-span! t {:name "invalidator/singleton-listener-error"})
        false)
      (retrieveInitialSequence [_]
        (inc (.tailSequence ring-buffer)))
      (onCancel [_]
        nil)
      (storeSequence [_ s]
        (let [prev-seq-id (AtomicLong/.getAndSet seq-id s)]
          (when (and (not= prev-seq-id -1)
                     (not= s (inc prev-seq-id)))
            (tracer/record-exception-span! (ex-info "Skipped a message in the reliable topic"
                                                    {:s s
                                                     :prev-seq-id prev-seq-id
                                                     :lost-message-count (inc (- s prev-seq-id))})
                                           {:name "invalidator/singleton-listener-skipped-tx"})))))))

(defn topic-ring-buffer [^HazelcastInstance hz topic-name]
  (.getRingbuffer hz (str RingbufferService/TOPIC_RB_PREFIX topic-name)))

(defn start-singleton-hz-topic [{:keys [acquire-slot-interrupt-chan]}]
  (let [queue
        (grouped-queue/start
         {:group-key-fn :app-id
          :combine-fn combine-wal-records
          :process-fn (fn [_key wal-record]
                        ;; Just testing what kind of latency we'll see with the hazelcast topic
                        (tracer/with-span! {:name "singleton-hz-topic-latency"
                                            :attributes {:tx-id (:tx-id wal-record)
                                                         :latency-ms (wal-latency-ms wal-record)}}))
          :metrics-path "instant.reactive.invalidator.singleton-q"
          :max-workers 8})

        topic-name "invalidator-wal-logs"
        hz (eph/get-hz)
        topic (.getReliableTopic hz topic-name)
        topic-config (.getReliableTopicConfig (.getConfig hz) topic-name)
        _ (.setTopicOverloadPolicy topic-config TopicOverloadPolicy/DISCARD_OLDEST)
        _ (.setExecutor topic-config (Executors/newSingleThreadExecutor))
        _ (.setStatisticsEnabled topic-config true)
        ring-buffer (topic-ring-buffer hz topic-name)
        stop-gauge (gauges/add-gauge-metrics-fn (fn [_]
                                                  (hz-gauges topic)))
        on-msg (fn [^Message m]
                 (let [msg (.getMessageObject m)]
                   (if (instance? WalRecord msg)
                     (grouped-queue/put! queue (:record msg))
                     ;; We should try to reconnect, but only if we weren't
                     ;; the ones that sent the message to reconnect (if there
                     ;; is only one machine it will try again within 10 seconds)
                     (when (not (.localMember (.getPublishingMember m)))
                       (a/put! acquire-slot-interrupt-chan true)))))
        listener (hz-topic-listener ring-buffer on-msg)
        listener-id (.addMessageListener topic listener)]
    {:topic topic
     :shutdown (fn []
                 (.removeMessageListener topic listener-id)
                 (grouped-queue/stop queue)
                 (stop-gauge))}))

(defn start-singleton []
  (let [get-conn-config (fn []
                          (config/get-aurora-config))
        _ (wal/ensure-slot (get-conn-config) "invalidator")
        acquire-slot-interrupt-chan (a/chan (a/sliding-buffer 1))

        {hz-topic :topic
         shutdown-topic :shutdown}
        (start-singleton-hz-topic
         {:acquire-slot-interrupt-chan acquire-slot-interrupt-chan})

        {shutdown-listener :shutdown}
        (start-singleton-listener
         {:acquire-slot-interval-ms 10000
          :process-id @config/process-id
          :check-disabled (fn []
                            (flags/toggled? :disable-singleton-invalidator))
          :acquire-slot-interrupt-chan acquire-slot-interrupt-chan
          :get-conn-config (fn []
                             (config/get-aurora-config))
          :hz-topic hz-topic})]
    {:shutdown (fn []
                 (shutdown-listener)
                 (shutdown-topic))}))

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
  (def wal-opts (start))
  (def shutdown-singleton (:shutdown (start-singleton))))

(defn stop-global []
  (when (bound? #'wal-opts)
    (stop wal-opts))
  (when (bound? #'shutdown-singleton)
    (shutdown-singleton)))

(defn restart []
  (stop-global)
  (start-global))
