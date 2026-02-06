(ns instant.nippy-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [instant.grpc :as grpc]
   [instant.isn]
   [instant.nippy]
   [taoensso.nippy :as nippy])
  (:import
   (instant.isn ISN)
   (java.util Arrays)
   (org.postgresql.replication LogSequenceNumber)))

(deftest all-of-the-custom-readers-are-tested
  ;; Only update this number if you also added a freeze/thaw test for the type
  (is (= 8 (count nippy/*custom-readers*))))

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
