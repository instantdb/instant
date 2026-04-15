(ns instant.rate-limit-test
  (:require
   [clojure.test :as test :refer [deftest is testing]]
   [instant.rate-limit :as rate-limit])
  (:import
   (java.time Duration)
   (java.util UUID)))

;; ---
;; parse-duration

(deftest parse-duration-basic-units
  (is (= (Duration/ofDays 1) (rate-limit/parse-duration "1 day")))
  (is (= (Duration/ofDays 3) (rate-limit/parse-duration "3 days")))
  (is (= (Duration/ofHours 2) (rate-limit/parse-duration "2 hours")))
  (is (= (Duration/ofMinutes 30) (rate-limit/parse-duration "30 minutes")))
  (is (= (Duration/ofSeconds 10) (rate-limit/parse-duration "10 seconds"))))

(deftest parse-duration-combined
  (is (= (.plus (Duration/ofDays 1) (Duration/ofHours 2))
         (rate-limit/parse-duration "1 day 2 hours"))))

(deftest parse-duration-years-and-months
  (is (= (Duration/ofDays 365) (rate-limit/parse-duration "1 year")))
  (is (= (Duration/ofDays 30) (rate-limit/parse-duration "1 month")))
  (is (= (Duration/ofDays (* 2 365)) (rate-limit/parse-duration "2 years"))))

;; ---
;; rules-rate-limit-config->limit-config

(deftest limit-config-minimal
  (testing "just capacity uses defaults"
    (is (some? (rate-limit/rules-rate-limit-config->limit-config
                {"capacity" 10})))))

(deftest limit-config-full
  (testing "all fields specified"
    (is (some? (rate-limit/rules-rate-limit-config->limit-config
                {"capacity" 5
                 "refill" {"amount" 3
                           "period" "30 minutes"
                           "type" "interval"}})))))

(deftest limit-config-refill-types
  (testing "greedy works"
    (is (some? (rate-limit/rules-rate-limit-config->limit-config
                {"capacity" 10
                 "refill" {"type" "greedy"}}))))
  (testing "interval works"
    (is (some? (rate-limit/rules-rate-limit-config->limit-config
                {"capacity" 10
                 "refill" {"type" "interval"}})))))

(deftest limit-config-rejects-bad-capacity
  (is (thrown? Exception
               (rate-limit/rules-rate-limit-config->limit-config
                {"capacity" 0})))
  (is (thrown? Exception
               (rate-limit/rules-rate-limit-config->limit-config
                {"capacity" -1})))
  (is (thrown? Exception
               (rate-limit/rules-rate-limit-config->limit-config
                {"capacity" "abc"})))
  (is (thrown? Exception
               (rate-limit/rules-rate-limit-config->limit-config
                {}))))

(deftest limit-config-rejects-bad-refill-type
  (is (thrown? Exception
               (rate-limit/rules-rate-limit-config->limit-config
                {"capacity" 10
                 "refill" {"type" "invalid"}}))))

(deftest limit-config-rejects-period-too-short
  (is (thrown? Exception
               (rate-limit/rules-rate-limit-config->limit-config
                {"capacity" 10
                 "refill" {"period" "0 seconds"}}))))

(deftest limit-config-rejects-period-too-long
  (is (thrown? Exception
               (rate-limit/rules-rate-limit-config->limit-config
                {"capacity" 10
                 "refill" {"period" "2 days"}}))))

;; ---
;; rules-rate-limit-config->bucket-config

(deftest bucket-config-single-limit
  (is (some? (rate-limit/rules-rate-limit-config->bucket-config
              {"limits" [{"capacity" 10}]}))))

(deftest bucket-config-multiple-limits
  (is (some? (rate-limit/rules-rate-limit-config->bucket-config
              {"limits" [{"capacity" 10}
                         {"capacity" 5
                          "refill" {"period" "1 minute"
                                    "type" "interval"}}]}))))

(deftest bucket-config-rejects-missing-limits
  (is (thrown? Exception
               (rate-limit/rules-rate-limit-config->bucket-config {})))
  (is (thrown? Exception
               (rate-limit/rules-rate-limit-config->bucket-config
                {"limits" []}))))

;; ---
;; user-key-hash

(deftest user-key-hash-deterministic
  (let [app-id (UUID/randomUUID)
        config {"limits" [{"capacity" 10}]}]
    (is (= (rate-limit/user-key-hash app-id "action" config "user-1")
           (rate-limit/user-key-hash app-id "action" config "user-1")))))

(deftest user-key-hash-varies-by-input
  (let [app-id (UUID/randomUUID)
        config {"limits" [{"capacity" 10}]}
        base (rate-limit/user-key-hash app-id "action" config "user-1")]
    (testing "different bucket name"
      (is (not= base (rate-limit/user-key-hash app-id "other-action" config "user-1"))))
    (testing "different config resets the limit"
      (is (not= base (rate-limit/user-key-hash app-id "action"
                                               {"limits" [{"capacity" 20}]}
                                               "user-1"))))
    (testing "different bucket key"
      (is (not= base (rate-limit/user-key-hash app-id "action" config "user-2"))))
    (testing "different app"
      (is (not= base (rate-limit/user-key-hash (UUID/randomUUID) "action" config "user-1"))))))

(comment
  (test/run-tests *ns*))
