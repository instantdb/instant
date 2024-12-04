(ns instant.reactive.receive-queue
  (:require
   [instant.gauges :as gauges]
   [instant.grouped-queue :as grouped-queue])
  (:import
   (java.time Duration Instant)))

(declare receive-q)

(defn enqueue->receive-q
  ([item]
   (enqueue->receive-q receive-q item))
  ([q item]
   (grouped-queue/put! q
                       {:item item :put-at (Instant/now)})))


(defn receive-q-metrics [receive-q]
  [{:path "instant.reactive.session.receive-q.size"
    :value (grouped-queue/size receive-q)}
   {:path "instant.reactive.session.receive-q.longest-waiting-ms"
    :value (if-let [{:keys [put-at]} (grouped-queue/peek receive-q)]
             (.toMillis (Duration/between put-at (Instant/now)))
             0)}])

(defn start [group-fn]
  (def receive-q (grouped-queue/create {:group-fn group-fn}))
  (def cleanup-gauge (gauges/add-gauge-metrics-fn
                      (fn [_] (receive-q-metrics receive-q)))))

(defn stop []
  (when (bound? #'cleanup-gauge)
    (cleanup-gauge)))
