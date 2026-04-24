(ns instant.model.history-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer [deftest is]]
   [instant.grpc :as grpc]
   [instant.model.history :as history])
  (:import
   (instant.isn ISN)
   (instant.jdbc WalColumn WalEntry)
   (java.time Instant)
   (org.postgresql.replication LogSequenceNumber)))

(defn- rand-lsn []
  (LogSequenceNumber/valueOf (long (rand-int Integer/MAX_VALUE))))

(defn- sample-wal-record []
  (let [app-id (random-uuid)
        attr-insert (WalEntry. :insert
                               128
                               "attrs"
                               [(WalColumn. "id" (str (random-uuid)))
                                (WalColumn. "app_id" (str app-id))]
                               nil nil nil nil nil)
        ident-insert (WalEntry. :insert
                                96
                                "idents"
                                [(WalColumn. "id" (str (random-uuid)))
                                 (WalColumn. "app_id" (str app-id))]
                                nil nil nil nil nil)
        triple-insert (WalEntry. :insert
                                 160
                                 "triples"
                                 [(WalColumn. "app_id" (str app-id))
                                  (WalColumn. "entity_id" (str (random-uuid)))
                                  (WalColumn. "attr_id" (str (random-uuid)))
                                  (WalColumn. "value" "\"hello\"")]
                                 nil nil nil nil nil)]
    (grpc/->WalRecord app-id
                      (rand-int Integer/MAX_VALUE)
                      (ISN. (rand-int 1000) (rand-lsn))
                      (ISN. (rand-int 1000) (rand-lsn))
                      (Instant/now)
                      536
                      (rand-lsn)
                      [attr-insert]
                      [ident-insert]
                      [triple-insert]
                      []
                      [])))

(deftest pack-unpack-wal-record
  (let [wal-record (sample-wal-record)
        packed (history/pack-wal-record wal-record)
        unpacked (history/unpack-wal-record packed)]
    (is (bytes? packed))
    (is (= wal-record unpacked))))

(deftest pack-wal-record-reuses-packed-meta
  ;; When a wal-record already carries its packed form in metadata, pack-wal-record
  ;; should return that bytes instance directly rather than re-freezing.
  (let [wal-record (sample-wal-record)
        pre-packed (history/pack-wal-record wal-record)
        tagged (with-meta wal-record {:packed pre-packed})]
    (is (identical? pre-packed (history/pack-wal-record tagged)))
    (is (= wal-record (history/unpack-wal-record (history/pack-wal-record tagged))))))

(defn- instant-for-bucket
  "Returns an Instant whose bucket (days-since-epoch / 30 mod 13) equals b."
  ^Instant [b]
  (Instant/ofEpochSecond (* b 30 86400)))

(deftest partitions-to-truncate-specific-buckets
  ;; current=0: keep {0,12,11,10}, truncate {1..9}
  (is (= #{1 2 3 4 5 6 7 8 9}
         (set (history/partitions-to-truncate (instant-for-bucket 0)))))

  ;; current=5: keep {5,4,3,2}, truncate the rest modulo 13
  (is (= #{6 7 8 9 10 11 12 0 1}
         (set (history/partitions-to-truncate (instant-for-bucket 5)))))

  ;; current=12: keep {12,11,10,9}, truncate {0..8}
  (is (= #{0 1 2 3 4 5 6 7 8}
         (set (history/partitions-to-truncate (instant-for-bucket 12))))))

(deftest partitions-to-truncate-keeps-90-days-for-all-buckets
  ;; For every possible current bucket, we always truncate 9 partitions and
  ;; never touch the current bucket or the 3 previous (90-day retention floor).
  (doseq [current (range 13)]
    (let [truncate (set (history/partitions-to-truncate (instant-for-bucket current)))
          keep (into #{} (map #(mod (+ current %) 13)) [0 -1 -2 -3])]
      (is (= 9 (count truncate))
          (str "truncate count must be 9 for current=" current))
      (is (empty? (set/intersection keep truncate))
          (str "keep and truncate must be disjoint for current=" current
               " (keep=" keep " truncate=" truncate ")"))
      (is (= (set (range 13)) (set/union keep truncate))
          (str "keep ∪ truncate must cover all 13 buckets for current=" current)))))
