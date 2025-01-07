(ns instant.reactive.receive-queue
  (:require
   [instant.gauges :as gauges]
   [instant.grouped-queue :as grouped-queue])
  (:import
   (java.time Duration Instant)
   (java.util.concurrent.atomic AtomicInteger)))

(declare receive-q)

(defn enqueue->receive-q
  ([item]
   (enqueue->receive-q receive-q item))
  ([q item]
   (grouped-queue/put! q
                       {:item item :put-at (Instant/now)})))


(defn receive-q-metrics [{:keys [grouped-queue worker-count]}]
  [{:path "instant.reactive.session.receive-q.size"
    :value (grouped-queue/size grouped-queue)}
   {:path "instant.reactive.session.receive-q.longest-waiting-ms"
    :value (if-let [{:keys [put-at]} (grouped-queue/peek grouped-queue)]
             (.toMillis (Duration/between put-at (Instant/now)))
             0)}
   {:path "instant.reactive.session.receive-q.worker-count"
    :value (AtomicInteger/.get worker-count)}])

(defn start [{:keys [group-fn reserve-fn process-fn max-workers]}]
  (let [{:keys [grouped-queue worker-count] :as queue-with-workers}
        (grouped-queue/start-grouped-queue-with-workers {:group-fn group-fn
                                                         :reserve-fn reserve-fn
                                                         :process-fn process-fn
                                                         :max-workers max-workers})]
    (def -queue-with-workers queue-with-workers)
    (def receive-q grouped-queue)
    (def cleanup-gauge (gauges/add-gauge-metrics-fn
                        (fn [_] (receive-q-metrics queue-with-workers))))))

(defn stop []
  (when (bound? #'cleanup-gauge)
    (cleanup-gauge)))
