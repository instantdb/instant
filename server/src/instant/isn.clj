(ns instant.isn
  (:require
   [instant.util.json :as json])
  (:import
   (java.lang Comparable)
   (java.util.concurrent.atomic AtomicReference)
   (org.postgresql.replication LogSequenceNumber)))

(defprotocol ISNProto
  (asString [this]))

(deftype ISN [^Integer slot-num ^LogSequenceNumber lsn]
  ISNProto
  (asString [_]
    (format "%X/%s" slot-num (.asString lsn)))

  Comparable
  (compareTo [this other]
    (let [other ^ISN other]
      (case (compare slot-num (.slot_num other))
        -1 -1
        1 1
        0 (compare lsn (.lsn other)))))

  Object
  (toString [_]
    (format "%X/%s" slot-num (.asString lsn))))

(json/add-encoder ISN json/encode-str)

(defn of-string ^ISN [^String s]
  (let [[slot-num-str lsn-str] (.split s "/" 2)]
    (ISN. (Integer/parseInt slot-num-str 16)
          (LogSequenceNumber/valueOf ^String lsn-str))))

;; Tracks isn so that we can send an initial isn for add-query
(defonce -max-seen-isn (AtomicReference. (->ISN 0 (LogSequenceNumber/valueOf 0))))

(defn set-max-seen-isn [^ISN isn]
  (.set ^AtomicReference -max-seen-isn isn))

(defn get-max-seen-isn ^ISN []
  (.get ^AtomicReference -max-seen-isn))

(defn isn-max [^ISN a ^ISN b]
  (case (compare a b)
    0 a
    -1 b
    1 a))
