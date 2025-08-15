(ns instant.util.cache-test
  (:require [instant.util.cache :as ucache]
            [clojure.core.cache.wrapped :as cache]
            [clojure.test :refer [deftest testing is]]))

;; Copy of test in core.cached to demonstrate that our version
;; of lookup-or-miss works
;; https://github.com/clojure/core.cache/blob/4a043644a0706b6d834ebf890a64d2fdcc9c388b/src/test/clojure/clojure/core/cache/wrapped_test.clj#L45
(deftest cache-stampede
  (let [thread-count 100
        cache-atom (-> {}
                       (cache/ttl-cache-factory :ttl 120000)
                       deref
                       (cache/lu-cache-factory :threshold 100))
        latch (java.util.concurrent.CountDownLatch. thread-count)
        invocations-counter (atom 0)
        values (atom [])]
    (dotimes [_ thread-count]
      (.start (Thread. (fn []
                         (swap! values conj
                                (ucache/lookup-or-miss cache-atom "my-key"
                                                      (fn [_]
                                                        (swap! invocations-counter inc)
                                                        (Thread/sleep 1000)
                                                        "some value")))
                         (.countDown latch)))))

    (.await latch)
    (is (= 1 (deref invocations-counter)))
    (doseq [v @values]
      (is (= "some value" v)))))

(deftest cache-stampede-batch
  (let [thread-count 100
        cache-atom (-> {}
                       (cache/ttl-cache-factory :ttl 120000)
                       deref
                       (cache/lu-cache-factory :threshold 100))
        latch (java.util.concurrent.CountDownLatch. thread-count)
        invocations-counter (atom 0)
        values (atom [])]
    (dotimes [_ thread-count]
      (.start (Thread. (fn []
                         (swap! values conj
                                (ucache/lookup-or-miss-batch
                                 cache-atom
                                 ["my-key"]
                                 (fn [_]
                                   (swap! invocations-counter inc)
                                   (Thread/sleep 1000)
                                   {"my-key" "some value"})))
                         (.countDown latch)))))

    (.await latch)
    (is (= 1 (deref invocations-counter)))
    (doseq [v @values]
      (is (= {"my-key" "some value"} v)))))

(deftest lookup-or-miss-rejects-errors
  (let [cache-atom (cache/lru-cache-factory {} :threshold 2)]
    (testing "demonstrate the problem"
      ;; Put an error in the cache with the default lookup-or-miss
      (is (thrown? Exception
                   (cache/lookup-or-miss cache-atom :wrapped (fn [_]
                                                               (throw (Exception. "oops"))))))

      ;; Now we'll never get that error out of the cache
      (is (thrown? Exception
                   (cache/lookup-or-miss cache-atom :wrapped (fn [_] :ok)))))


    (testing "our version evicts errors"
      (is (thrown? Exception
                   (ucache/lookup-or-miss cache-atom :instant (fn [_]
                                                                (throw (Exception. "oops"))))))

      (is (= :instant (ucache/lookup-or-miss cache-atom :instant (fn [x] x)))))))

(deftest lookup-or-miss-batch-rejects-errors
  (let [cache-atom (cache/lru-cache-factory {} :threshold 2)]
    (is (thrown? Exception
                 (ucache/lookup-or-miss-batch cache-atom [:instant] (fn [_]
                                                                      (throw (Exception. "oops"))))))

    (is (= {:instant :instant} (ucache/lookup-or-miss-batch cache-atom [:instant] (fn [x] (zipmap x x)))))))

(deftest lookup-or-miss-only-evicts-its-own-errors
  (let [cache-atom (cache/lru-cache-factory {} :threshold 2)
        wait1 (promise)
        wait2 (promise)
        f1 (future
             (ucache/lookup-or-miss cache-atom :instant (fn [_]
                                                          (deliver wait1 true)
                                                          @wait2
                                                          (throw (Exception. "oops")))))]

    @wait1

    (cache/evict cache-atom :instant)

    (is (= :instant (ucache/lookup-or-miss cache-atom :instant identity)))

    (is (not (realized? f1)))

    (deliver wait2 true)

    (is (thrown? Exception @f1))

    (is (= :instant (ucache/lookup-or-miss cache-atom :instant (fn [_]
                                                                 :new-value))))))

(deftest lookup-or-miss-batch-only-evicts-its-own-errors
  (let [cache-atom (cache/lru-cache-factory {} :threshold 5)
        wait1 (promise)
        wait2 (promise)
        f1 (future
             (ucache/lookup-or-miss-batch cache-atom [:instant] (fn [_]
                                                                  (deliver wait1 true)
                                                                  @wait2
                                                                  (throw (Exception. "oops")))))]

    @wait1

    (cache/evict cache-atom :instant)

    (is (= {:instant :instant} (ucache/lookup-or-miss-batch cache-atom [:instant] (fn [x] (zipmap x x)))))

    (is (not (realized? f1)))

    (deliver wait2 true)

    (is (thrown? Exception @f1))

    (is (= {:instant :instant}
           (ucache/lookup-or-miss-batch cache-atom [:instant] (fn [_]
                                                                {:instant :new-value}))))))

;; Copy of test in core.cached
;; https://github.com/clojure/core.cache/blob/4a043644a0706b6d834ebf890a64d2fdcc9c388b/src/test/clojure/clojure/core/cache/wrapped_test.clj#L30
(deftest wrapped-ttl-test
  (let [cache (cache/ttl-cache-factory {} :ttl 1)
        limit 2000000]
    (loop [n 0]
      (if-not (ucache/lookup-or-miss-batch cache [:a] (constantly {:a 42}))
        (is false (str  "Failure on call " n))
        (when (< n limit)
          (recur (+ 1 n)))))
    (is true)))

(deftest lookup-or-miss-batch-works
  (let [cache-atom (cache/lru-cache-factory {} :threshold 2)]
    (is (= {:a :a
            :b :b}
           (ucache/lookup-or-miss-batch cache-atom [:a :b] (fn [xs] (zipmap xs xs)))))

    (is (= {:a :a
            :e :e}
           (ucache/lookup-or-miss-batch cache-atom [:a :e] (fn [xs] (zipmap xs xs)))))

    (is (cache/has? cache-atom :a))
    (is (not (cache/has? cache-atom :b)))))
