(ns instant.reactive.store-test
  (:require
   [clojure.test :as test :refer [deftest is testing]]
   [instant.reactive.store :as rs]
   [instant.util.async :as ua]))

(deftest match-topic?
  (is (true?
       (rs/match-topic?
        '[:eav _ _ _]
        '[:eav #{1} #{2} #{3}])))
  (is (true?
       (rs/match-topic?
        '[:eav #{1 2} _ _]
        '[:eav #{1} #{2} #{3}])))
  (is (false?
       (rs/match-topic?
        '[:ea #{1 2} _ _]
        '[:eav #{1} #{2} #{3}])))
  (is (false?
       (rs/match-topic?
        '[:eav #{3} _ _]
        '[:eav #{1} #{2} #{3}]))))

(deftest swap-datalog-cache!
  (let [store (rs/init-store)
        app-id (random-uuid)]
    (testing "store returns cached data"
      (let [q [[:ea (random-uuid)]]]
        (is (= :a (rs/swap-datalog-cache! store
                                          app-id
                                          (fn [_ctx _query]
                                            :a)
                                          nil
                                          q)))
        (is (= :a (rs/swap-datalog-cache! store
                                          app-id
                                          (fn [_ctx _query]
                                            :b)
                                          nil
                                          q)))))

    (testing "store returns cached data with delay"
      (let [q [[:ea (random-uuid)]]]
        (is (= :a (rs/swap-datalog-cache! store
                                          app-id
                                          (fn [_ctx _query]
                                            (Thread/sleep 100)
                                            :a)
                                          nil
                                          q)))
        (is (= :a (rs/swap-datalog-cache! store
                                          app-id
                                          (fn [_ctx _query]
                                            :b)
                                          nil
                                          q)))))

    (testing "work is canceled with no listeners"
      (let [q [[:ea (random-uuid)]]
            err (promise)
            started (promise)
            f1 (ua/vfuture (rs/swap-datalog-cache! store
                                                   app-id
                                                   (fn [_ctx _query]
                                                     (try
                                                       (deliver started true)
                                                       @(promise)
                                                       (catch Throwable t
                                                         (deliver err t))))
                                                   nil
                                                   q))]
        @started
        (future-cancel f1)
        (is (instance? java.lang.InterruptedException (deref err 100 :timeout)))))

    (dotimes [x 100]
      (testing "work isn't canceled if there are still listeners"
        (let [q [[:ea (random-uuid)]]
              err (promise)
              started (promise)
              wait (promise)
              f1 (ua/vfuture (try (rs/swap-datalog-cache! store
                                                          app-id
                                                          (fn [_ctx _query]
                                                            (deliver started true)
                                                            ;; It looks like the promise is getting canceled somehow?
                                                            @wait)
                                                          nil
                                                          q)
                                  (catch Throwable t
                                    (deliver err t))))
              _ @started
              f2 (ua/vfuture (rs/swap-datalog-cache! store
                                                     app-id
                                                     (fn [_ctx _query]
                                                       @wait)
                                                     nil
                                                     q))]
          (future-cancel f1)
          (is (or (instance? java.lang.InterruptedException (deref err 100 :timeout))
                  (instance? java.util.concurrent.CancellationException (deref err 100 :timeout))))
          (Thread/sleep 10)
          (deliver wait :a)
          (is (= (deref f2 100 :timeout) :a)))))

    (testing "propagates failures"
      (let [q [[:ea (random-uuid)]]
            r1 (try (rs/swap-datalog-cache! store
                                            app-id
                                            (fn [_ctx _query]
                                              (throw (Exception. "oops")))
                                            nil
                                            q)
                    (catch Exception e
                      e))]

        (is (instance? Exception
                       r1))

        (is (thrown? Exception
                     (rs/swap-datalog-cache! store
                                             app-id
                                             (fn [_ctx _query]
                                               :shouldn't-be-executed)
                                             nil
                                             q)))))))

(comment
  (test/run-tests *ns*))
