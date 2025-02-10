(ns instant.reactive.receive-queue
  (:require
   [instant.grouped-queue-2 :as grouped-queue])
  (:import
   (java.time Duration Instant)))

(def receive-q)

(defn put!
  ([item]
   (grouped-queue/put! receive-q item))
  ([q item]
   (grouped-queue/put! q item)))

(defn start [q]
  (.bindRoot #'receive-q q))

(defn stop []
  (when (bound? #'receive-q)
    (grouped-queue/stop receive-q)
    (.unbindRoot #'receive-q)))
