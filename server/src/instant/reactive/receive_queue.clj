(ns instant.reactive.receive-queue
  (:require
   [instant.grouped-queue-2 :as grouped-queue])
  (:import
   (java.time Duration Instant)))

(declare receive-q)

(defn enqueue->receive-q
  ([item]
   (enqueue->receive-q receive-q item))
  ([q item]
   (grouped-queue/put! q {:item item
                          :put-at (Instant/now)})))

(defn start [{:keys [group-key-fn combine-fn process-fn max-workers]}]
  (def receive-q
    (grouped-queue/start
     {:group-key-fn group-key-fn
      :combine-fn   combine-fn
      :process-fn   process-fn
      :max-workers  max-workers
      :metrics-path "instant.reactive.session.receive-q"})))

(defn stop []
  (when (bound? #'receive-q)
    ((:shutdown-fn receive-q))))
