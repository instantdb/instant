(ns instant.nippy-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [instant.grpc :as grpc]
   [instant.isn]
   [instant.nippy]
   [taoensso.nippy :as nippy])
  (:import
   (instant.isn ISN)
   (instant.jdbc WalColumn WalEntry)
   (java.time Instant)
   (java.util Arrays)
   (org.postgresql.replication LogSequenceNumber)))

(deftest all-of-the-custom-readers-are-tested
  ;; Only update this number if you also added a freeze/thaw test for the type
  (is (= 15 (count nippy/*custom-readers*))))

(defn roundtrip [x]
  (nippy/fast-thaw (nippy/fast-freeze x)))

(deftest log-sequence-number
  (let [lsn (LogSequenceNumber/valueOf (long (rand-int Integer/MAX_VALUE)))]
    (is (= lsn (roundtrip lsn)))))

(deftest isn
  (let [lsn (LogSequenceNumber/valueOf (long (rand-int Integer/MAX_VALUE)))
        isn (ISN. (rand-int 1000) lsn)]
    (is (= isn (roundtrip isn)))))

(deftest stream-request
  (let [obj (grpc/->StreamRequest (random-uuid) (random-uuid) 0)]
    (is (= obj (roundtrip obj)))))

(deftest stream-file
  (let [obj (grpc/->StreamFile (random-uuid) (str (random-uuid)) (rand-int Integer/MAX_VALUE))]
    (is (= obj (roundtrip obj)))))

(deftest stream-init
  (testing "empty files"
    (let [obj (grpc/->StreamInit 0 [] [])]
      (is (= obj (roundtrip obj)))))

  (testing "multiple files"
    (let [obj (grpc/->StreamInit 0
                                 (vec (repeatedly 10 (fn []
                                                       (grpc/->StreamFile (random-uuid)
                                                                          (str (random-uuid))
                                                                          (rand-int Integer/MAX_VALUE)))))
                                 [])]
      (is (= obj (roundtrip obj)))))

  (testing "files and buffer"
    (let [obj (grpc/->StreamInit 0
                                 (vec (repeatedly 10 (fn []
                                                       (grpc/->StreamFile (random-uuid)
                                                                          (str (random-uuid))
                                                                          (rand-int Integer/MAX_VALUE)))))
                                 [(.getBytes "Hello " "UTF-8")
                                  (.getBytes " " "UTF-8")
                                  (.getBytes "World" "UTF-8")])]
      ;; chunks get squished together into one chunk
      (is (= (dissoc obj :chunks)
             (dissoc (roundtrip obj) :chunks)))
      (is (= 1 (count (:chunks (roundtrip obj)))))
      (is (= (apply concat (:chunks obj))
             (vec (first (:chunks (roundtrip obj)))))))))

(deftest stream-content
  (testing "single chunk"
    (let [obj (grpc/->StreamContent (rand-int 10000) [(.getBytes "Hello World" "UTF-8")])]
      ;; bytes don't compare, so have to update to convert them to a vec
      (is (= (update obj :chunks #(map vec %))
             (update (roundtrip obj) :chunks #(map vec %))))
      ;; double check bytes are the same
      (is (every? (fn [[^bytes a ^bytes b]]
                    (Arrays/equals a b))
                  (map (fn [a b] [a b])
                       (:chunks obj)
                       (:chunks (roundtrip obj)))))))

  (testing "multiple chunks get concatenated"
    (let [obj (grpc/->StreamContent (rand-int 10000) [(.getBytes "Hello World" "UTF-8")
                                                      (.getBytes " " "UTF-8")
                                                      (.getBytes "World" "UTF-8")])]
      (is (= 1 (count (:chunks (roundtrip obj)))))
      (is (= (apply concat (:chunks obj))
             (vec (first (:chunks (roundtrip obj))))))
      (is (= (dissoc obj :chunks)
             (dissoc (roundtrip obj) :chunks))))))

(deftest stream-error
  (let [obj (grpc/->StreamError :rate-limit)]
    (is (= obj (roundtrip obj)))))

(deftest stream-complete
  (let [obj (grpc/->StreamComplete)]
    (is (= obj (roundtrip obj)))))

(deftest stream-aborted
  (let [obj (grpc/->StreamAborted "whoops")]
    (is (= obj (roundtrip obj)))))

(deftest wal-column
  (let [obj (WalColumn. "id" "abc-123")]
    (is (= obj (roundtrip obj)))))

(defn- rand-lsn []
  (LogSequenceNumber/valueOf (long (rand-int Integer/MAX_VALUE))))

(deftest wal-entry
  (testing "begin"
    (let [obj (WalEntry. :begin 48 nil nil nil nil nil nil nil)]
      (is (= obj (roundtrip obj)))))

  (testing "insert"
    (let [obj (WalEntry. :insert
                         256
                         "triples"
                         [(WalColumn. "id" 1)
                          (WalColumn. "app_id" (str (random-uuid)))
                          (WalColumn. "value" "{\"a\":1}")]
                         nil
                         nil
                         nil
                         nil
                         nil)]
      (is (= obj (roundtrip obj)))))

  (testing "update"
    (let [obj (WalEntry. :update
                         320
                         "attrs"
                         [(WalColumn. "id" 2)
                          (WalColumn. "value" "new")]
                         [(WalColumn. "id" 1)
                          (WalColumn. "value" "old")]
                         nil
                         nil
                         nil
                         nil)]
      (is (= obj (roundtrip obj)))))

  (testing "delete"
    (let [obj (WalEntry. :delete
                         96
                         "rules"
                         nil
                         [(WalColumn. "id" (str (random-uuid)))]
                         nil
                         nil
                         nil
                         nil)]
      (is (= obj (roundtrip obj)))))

  (testing "truncate"
    (let [obj (WalEntry. :truncate 40 nil nil nil nil nil nil nil)]
      (is (= obj (roundtrip obj)))))

  (testing "message"
    (let [obj (WalEntry. :message
                         72
                         nil
                         nil
                         nil
                         "update_ents"
                         "{\"etype\":{\"aid\":{\"eid\":{}}}}"
                         nil
                         nil)]
      (is (= obj (roundtrip obj)))))

  (testing "close"
    (let [obj (WalEntry. :close 64 nil nil nil nil nil (rand-lsn) (rand-lsn))]
      (is (= obj (roundtrip obj))))))

(deftest wal-record
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
                                 nil nil nil nil nil)
        message (WalEntry. :message
                           72
                           nil nil nil
                           "update_ents"
                           "{\"etype\":{\"aid\":{\"eid\":{}}}}"
                           nil nil)
        wal-log-insert (WalEntry. :insert
                                  80
                                  "wal_logs"
                                  [(WalColumn. "prefix" "update_ents")
                                   (WalColumn. "content" "{}")]
                                  nil nil nil nil nil)
        obj (grpc/->WalRecord app-id
                              (rand-int Integer/MAX_VALUE)
                              (ISN. (rand-int 1000) (rand-lsn))
                              (ISN. (rand-int 1000) (rand-lsn))
                              (Instant/now)
                              536
                              (rand-lsn)
                              [attr-insert]
                              [ident-insert]
                              [triple-insert]
                              [message]
                              [wal-log-insert])]
    (is (= obj (roundtrip obj)))))

(deftest slot-disconnect
  (let [obj (grpc/->SlotDisconnect)]
    (is (= obj (roundtrip obj)))))

(deftest packed-wal-record
  (let [ba (.getBytes "packed-wal-record-payload" "UTF-8")
        obj (grpc/->PackedWalRecord ba)
        round (roundtrip obj)]
    ;; byte arrays don't compare with =, so roundtrip is checked by value
    (is (Arrays/equals ^bytes (:ba obj) ^bytes (:ba round)))
    (is (= (dissoc obj :ba) (dissoc round :ba)))))

(deftest invalidator-subscribe
  (let [obj (grpc/->InvalidatorSubscribe (random-uuid) (rand-int 1000))]
    (is (= obj (roundtrip obj)))))
