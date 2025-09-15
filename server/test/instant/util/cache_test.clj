(ns instant.util.cache-test
  (:require
   [instant.util.cache :as cache]
   [clojure.test :refer [deftest is]]))

;; Copy of test in core.cached to demonstrate that our version
;; of lookup-or-miss works
;; https://github.com/clojure/core.cache/blob/4a043644a0706b6d834ebf890a64d2fdcc9c388b/src/test/clojure/clojure/core/cache/wrapped_test.clj#L45
(deftest cache-stampede
  (let [thread-count        100
        cache               (cache/make
                             {:ttl 120000
                              :max-size 100})
        latch               (java.util.concurrent.CountDownLatch. thread-count)
        invocations-counter (atom 0)
        values              (atom [])]
    (dotimes [_ thread-count]
      (.start (Thread. (fn []
                         (swap! values conj
                                (cache/get cache "my-key"
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
  (let [thread-count        100
        cache               (cache/make-async
                             {:ttl 120000
                              :max-size 100})
        latch               (java.util.concurrent.CountDownLatch. thread-count)
        invocations-counter (atom 0)
        values              (atom [])]
    (dotimes [_ thread-count]
      (.start (Thread. (fn []
                         (swap! values conj
                                @(cache/get-all-async
                                 cache
                                 ["my-key"]
                                 (fn [keys]
                                   (swap! invocations-counter inc)
                                   (Thread/sleep 1000)
                                   (into {} (for [k keys] [k "some value"])))))
                         (.countDown latch)))))
    (.await latch)
    (is (= 1 (deref invocations-counter)))
    (doseq [v @values]
      (is (= {"my-key" "some value"} v)))))

(deftest lookup-or-miss-rejects-errors
  (let [cache (cache/make {:max-size 2})]
    (is (thrown? Exception
                 (cache/get cache :instant (fn [_]
                                             (throw (Exception. "oops"))))))

    (is (= :instant (cache/get cache :instant (fn [x] x))))))

(deftest lookup-or-miss-batch-rejects-errors
  (let [cache (cache/make-async {:max-size 2})]
    (is (thrown? Exception
                 @(cache/get-all-async cache [:instant] (fn [_]
                                                          (throw (Exception. "oops"))))))

    (is (= {:instant :instant} @(cache/get-all-async cache [:instant] (fn [x] (zipmap x x)))))))

(deftest lookup-or-miss-only-evicts-its-own-errors
  (let [cache (cache/make {:max-size 2})
        wait1 (promise)
        wait2 (promise)
        f1 (future
             (cache/get cache :instant (fn [_]
                                         (deliver wait1 true)
                                         @wait2
                                         (throw (Exception. "oops")))))]

    @wait1

    ;; FIXME this will deadlock because :instant value is currently getting calculated
    (comment
      (cache/invalidate cache :instant)

      (is (= :instant (cache/get cache :instant identity)))

      (is (not (realized? f1)))

      (deliver wait2 true)

      (is (thrown? Exception @f1))

      (is (= :instant (cache/get cache :instant (fn [_]
                                                  :new-value)))))))

(deftest lookup-or-miss-batch-only-evicts-its-own-errors
  (let [cache (cache/make-async {:max-size 5})
        wait1 (promise)
        wait2 (promise)
        f1 (future
             @(cache/get-all-async cache [:instant] (fn [_]
                                                      (deliver wait1 true)
                                                      @wait2
                                                      (throw (Exception. "oops")))))]

    @wait1

    (cache/invalidate-async cache :instant)

    (is (= {:instant :instant} @(cache/get-all-async cache [:instant] (fn [x] (zipmap x x)))))

    (is (not (realized? f1)))

    (deliver wait2 true)

    (is (thrown? Exception @f1))

    (is (= {:instant :instant}
           @(cache/get-all-async cache [:instant] (fn [_]
                                                    {:instant :new-value}))))))

;; Copy of test in core.cached
;; https://github.com/clojure/core.cache/blob/4a043644a0706b6d834ebf890a64d2fdcc9c388b/src/test/clojure/clojure/core/cache/wrapped_test.clj#L30
(deftest wrapped-ttl-test
  (let [cache (cache/make {:ttl 1})
        limit 2000000]
    (loop [n 0]
      (if-not (cache/get-all cache [:a] (constantly {:a 42}))
        (is false (str "Failure on call " n))
        (when (< n limit)
          (recur (+ 1 n)))))
    (is true)))

(deftest lookup-or-miss-batch-works
  (dotimes [x 1000]
    (let [cache (cache/make-async {:max-size 2})]
      (is (= {:a :a
              :b :b}
             @(cache/get-all-async cache [:a :b] (fn [xs] (zipmap xs xs)))))

      (is (= {:a :a
              :e :e}
             @(cache/get-all-async cache [:a :e] (fn [xs] (zipmap xs xs))))))))
