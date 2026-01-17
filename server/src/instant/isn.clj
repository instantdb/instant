(ns instant.isn
  "The ISN gives us a way to check if a query includes a transaction. If the
   last invalidator ISN is greater than a transaction's ISN, then any query
   will be guaranteed to include the changes from that transaction.

   If transactions are processed in order of ISN, they're also guaranteed to be
   in the same order that the database applied them in.

   When we upgrade the database across major versions, we create a logical
   subscription on a new postgres database and then swap the connection to the
   new database (see failover.clj). The postgres LSN on the new database will be
   different than the LSN on the old database.

   We need a sequence number that consistently increases, so we put an extra
   slot_num in front of the LSN. Any time we migrate to a new db, we increment
   the slot_num."
  (:require
   [instant.config :as config]
   [instant.util.json :as json])
  (:import
   (java.lang Comparable)
   (java.util Objects)
   (java.util.concurrent.atomic AtomicReference)
   (org.postgresql.replication LogSequenceNumber)))

(deftype ISN [^Integer slot-num ^LogSequenceNumber lsn]
  Comparable
  (compareTo [_ other]
    (let [other ^ISN other]
      (case (compare slot-num (.slot_num other))
        -1 -1
        1 1
        0 (compare lsn (.lsn other)))))

  Object
  (equals [this other]
    (and (instance? ISN other)
         (= (.slot_num this) (.slot_num ^ISN other))
         (= (.lsn this) (.lsn ^ISN other))))
  (hashCode [_]
    (Objects/hash (to-array [slot-num lsn])))
  (toString [_]
    (format "%X/%s" slot-num (.asString lsn)))

  clojure.lang.IHashEq
  (hasheq [_]
    (hash [slot-num lsn])))

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

(defn test-isn
  "Generates an isn. (test-isn i) will be less than (test-isn (inc i))"
  [^long i]
  (->ISN config/invalidator-slot-num
         (LogSequenceNumber/valueOf i)))
