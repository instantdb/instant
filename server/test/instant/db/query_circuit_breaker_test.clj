(ns instant.db.query-circuit-breaker-test
  (:require [clojure.test :refer [deftest is testing use-fixtures]]
            [instant.db.query-circuit-breaker :as breaker]
            [instant.flags :as flags]
            [instant.jdbc.sql :as sql]
            [instant.util.exception :as ex]
            [slingshot.slingshot :refer [throw+]]))

(use-fixtures :each (fn [f]
                      (reset! breaker/breakers {})
                      (f)
                      (reset! breaker/breakers {})))

(def config {:enabled? true
             :failure-threshold 2
             :window-ms 1000
             :open-ms 100
             :apps #{}})

(def key1 [(random-uuid) 42])

(deftest opens-after-threshold-and-lets-a-trial-through
  (is (= :closed (breaker/check! key1 0 config)))
  (breaker/record-timeout! key1 0 config)
  (is (= :closed (breaker/check! key1 1 config)))
  (breaker/record-timeout! key1 10 config)
  (testing "open for open-ms after the second timeout"
    (is (= :open (breaker/check! key1 11 config)))
    (is (= :open (breaker/check! key1 109 config))))
  (testing "one trial runs after open-ms, everyone else stays open"
    (is (= :half-open (breaker/check! key1 110 config)))
    (is (= :open (breaker/check! key1 111 config))))
  (testing "a trial timeout keeps it open, a success closes it"
    (breaker/record-timeout! key1 140 config)
    (is (= :open (breaker/check! key1 141 config)))
    (is (= :half-open (breaker/check! key1 240 config)))
    (breaker/record-success! key1)
    (is (= :closed (breaker/check! key1 241 config)))
    (is (nil? (get @breaker/breakers key1)))))

(deftest failures-outside-the-window-do-not-count
  (breaker/record-timeout! key1 0 config)
  (breaker/record-timeout! key1 1001 config)
  (is (= :closed (breaker/check! key1 1002 config)))
  (breaker/record-timeout! key1 1500 config)
  (is (= :open (breaker/check! key1 1501 config))))

(deftest stale-breakers-are-pruned
  (let [key2 [(random-uuid) 7]]
    (breaker/record-timeout! key1 0 config)
    (breaker/record-timeout! key2 5000 config)
    (is (= #{key2} (set (keys @breaker/breakers))))
    (testing "open breakers survive pruning until they expire"
      (breaker/record-timeout! key2 5001 config)
      (is (= :open (breaker/check! key2 5002 config)))
      (breaker/record-timeout! key1 5900 config)
      (is (= #{key1 key2} (set (keys @breaker/breakers))))
      (breaker/record-timeout! key1 6200 config)
      (is (= #{key1} (set (keys @breaker/breakers)))))))

(defn- run [ctx f]
  (try
    {:ok (breaker/with-query-breaker ctx 1 f)}
    (catch clojure.lang.ExceptionInfo e
      (if (= ::ex/timeout (::ex/type (ex-data e)))
        {:timeout (::ex/message (ex-data e))}
        (throw e)))))

(deftest with-query-breaker-fails-fast-only-when-configured
  (let [app-id (random-uuid)
        ctx {:app-id app-id}
        timeout (fn [] (throw+ {::ex/type ::ex/timeout ::ex/message "slow"}))
        calls (atom 0)
        counted-timeout (fn [] (swap! calls inc) (timeout))]
    (with-redefs [flags/query-result (constantly {})]
      (binding [flags/*flag-overrides* {:query-circuit-breaker (assoc config :open-ms 60000)}
                sql/*query-timeout-seconds* 0]
        (is (= {:timeout "slow"} (run ctx counted-timeout)))
        (is (= {:timeout "slow"} (run ctx counted-timeout)))
        (testing "the third call does not run the query"
          (is (re-find #"paused" (:timeout (run ctx counted-timeout))))
          (is (= 2 @calls)))
        (testing "other queries and apps are unaffected"
          (is (= 1 (breaker/with-query-breaker ctx 2 (constantly 1))))
          (is (= {:ok :fine} (run {:app-id (random-uuid)} (constantly :fine)))))
        (testing "other errors do not trip the breaker"
          (let [key [app-id 3]]
            (is (thrown? clojure.lang.ExceptionInfo
                         (breaker/with-query-breaker ctx 3 #(throw (ex-info "boom" {})))))
            (is (nil? (get @breaker/breakers key))))))
      (testing "fast cancellations are not timeouts"
        (reset! breaker/breakers {})
        (binding [flags/*flag-overrides* {:query-circuit-breaker config}
                  sql/*query-timeout-seconds* 30]
          (dotimes [_ 3]
            (is (= {:timeout "slow"} (run {:app-id (random-uuid)} timeout))))
          (is (empty? @breaker/breakers))))
      (testing "the breaker is off without the flag"
        (reset! breaker/breakers {})
        (dotimes [_ 3]
          (is (= {:timeout "slow"} (run ctx timeout))))
        (is (empty? @breaker/breakers))))))

(deftest with-query-breaker-recovers-after-open-ms
  (let [app-id (random-uuid)
        ctx {:app-id app-id}
        timeout (fn [] (throw+ {::ex/type ::ex/timeout ::ex/message "slow"}))]
    (with-redefs [flags/query-result (constantly {})]
      (binding [flags/*flag-overrides* {:query-circuit-breaker config}
                sql/*query-timeout-seconds* 0]
        (run ctx timeout)
        (run ctx timeout)
        (is (re-find #"paused" (:timeout (run ctx timeout))))
        (Thread/sleep 120)
        (testing "the trial runs and its success closes the breaker"
          (is (= {:ok :recovered} (run ctx (constantly :recovered))))
          (is (empty? @breaker/breakers))
          (is (= {:ok :recovered} (run ctx (constantly :recovered)))))))))
