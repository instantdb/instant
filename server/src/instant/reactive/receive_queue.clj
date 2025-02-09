(ns instant.reactive.receive-queue
  (:require
   [instant.config :as config]
   [instant.gauges :as gauges]
   [instant.grouped-queue-2 :as grouped-queue])
  (:import
   (java.time Duration Instant)))

(declare receive-q)

(defn enqueue->receive-q
  ([item]
   (enqueue->receive-q receive-q item))
  ([q item]
   (grouped-queue/put! q {:item item :put-at (Instant/now)})))

#_(defn receive-q-metrics [{:keys [grouped-queue get-worker-count]}]
    [{:path "instant.reactive.session.receive-q.size"
      :value (grouped-queue/size grouped-queue)}
     {:path "instant.reactive.session.receive-q.longest-waiting-ms"
      :value (if-let [{:keys [put-at]} (grouped-queue/peek grouped-queue)]
               (.toMillis (Duration/between put-at (Instant/now)))
               0)}
     {:path "instant.reactive.session.receive-q.worker-count"
      :value (get-worker-count)}])

(defn start [{:keys [group-fn combine-fn #_reserve-fn process-fn max-workers]}]
  (let [#_{:keys [grouped-queue] :as queue-with-workers}
        #_(if config/fewer-vfutures?
            (grouped-queue/start-grouped-queue-with-cpu-workers {:group-fn group-fn
                                                                 :reserve-fn reserve-fn
                                                                 :process-fn process-fn
                                                                 :worker-count max-workers})
            (grouped-queue/start-grouped-queue-with-workers {:group-fn group-fn
                                                             :reserve-fn reserve-fn
                                                             :process-fn process-fn
                                                             :max-workers max-workers}))
        grouped-queue
        (grouped-queue/start
         {:group-fn    group-fn
          :combine-fn  combine-fn
          :process-fn  process-fn
          :max-workers max-workers})]
    (def receive-q grouped-queue)
    #_(def cleanup-gauge (gauges/add-gauge-metrics-fn
                          (fn [_] (receive-q-metrics queue-with-workers))))))

(defn stop []
  (when (bound? #'receive-q)
    ((:shutdown-fn receive-q)))
  #_(when (bound? #'cleanup-gauge)
      (cleanup-gauge)))
