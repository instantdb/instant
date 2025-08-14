(ns instant.reactive.store-test
  (:require
   [clojure.test :as test :refer [deftest is testing]]
   [instant.reactive.store :as rs]
   [instant.util.async :as ua])
  (:import
   (java.time Instant)))

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
  (let [store  (rs/init)
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

    (dotimes [_ 100]
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

(defmacro is-match-topic-part [iv-part dq-part expected]
  `(is (= ~expected (#'rs/match-topic-part? ~iv-part ~dq-part))
       (str "datalog query part: " ~dq-part ", invalidator part: " ~iv-part)))

(deftest match-topic-part?
  (is-match-topic-part '_ '_ true)
  (is-match-topic-part :av :av true)
  (is-match-topic-part :av :ave false)
  (is-match-topic-part #{1} #{1} true)
  (is-match-topic-part #{1} #{0} false)

  (is-match-topic-part #{1} {:$comparator {:op :$gte
                                           :value 1
                                           :data-type :number}} true)
  (is-match-topic-part #{1} {:$comparator {:op :$gt
                                           :value 1
                                           :data-type :number}} false)
  (is-match-topic-part #{-1} {:$comparator {:op :$lt
                                            :value 1
                                            :data-type :number}} true)
  (is-match-topic-part #{-1} {:$comparator {:op :$lte
                                            :value -1
                                            :data-type :number}} true)
  (is-match-topic-part #{-1} {:$comparator {:op :$lte
                                            :value -2
                                            :data-type :number}} false)

  (is-match-topic-part #{"b"} {:$comparator {:op :$gte
                                             :value "b"
                                             :data-type :string}} true)
  (is-match-topic-part #{"a"} {:$comparator {:op :$gte
                                             :value "b"
                                             :data-type :string}} false)
  (is-match-topic-part #{"b"} {:$comparator {:op :$gt
                                             :value "b"
                                             :data-type :string}} false)
  (is-match-topic-part #{"b"} {:$comparator {:op :$gt
                                             :value "a"
                                             :data-type :string}} true)
  (is-match-topic-part #{"a"} {:$comparator {:op :$lt
                                             :value "b"
                                             :data-type :string}} true)
  (is-match-topic-part #{"b"} {:$comparator {:op :$lte
                                             :value "b"
                                             :data-type :string}} true)
  (is-match-topic-part #{"b"} {:$comparator {:op :$lte
                                             :value "a"
                                             :data-type :string}} false)

  (is-match-topic-part #{"hello"} {:$comparator {:op :$like
                                                 :value "he%"
                                                 :data-type :string}} true)

  (is-match-topic-part #{"hello"} {:$comparator {:op :$like
                                                 :value "wor%"
                                                 :data-type :string}} false)

  (is-match-topic-part #{true} {:$comparator {:op :$gte
                                              :value true
                                              :data-type :boolean}} true)
  (is-match-topic-part #{false} {:$comparator {:op :$gte
                                               :value true
                                               :data-type :boolean}} false)
  (is-match-topic-part #{true} {:$comparator {:op :$gt
                                              :value true
                                              :data-type :boolean}} false)
  (is-match-topic-part #{true} {:$comparator {:op :$gt
                                              :value false
                                              :data-type :boolean}} true)
  (is-match-topic-part #{false} {:$comparator {:op :$lt
                                               :value true
                                               :data-type :boolean}} true)
  (is-match-topic-part #{true} {:$comparator {:op :$lte
                                              :value true
                                              :data-type :boolean}} true)
  (is-match-topic-part #{true} {:$comparator {:op :$lte
                                              :value false
                                              :data-type :boolean}} false)

  (is-match-topic-part #{(Instant/parse "2025-02-17T03:00:00Z")}
                       {:$comparator {:op :$gte
                                      :value (Instant/parse "2025-02-17T03:00:00Z")
                                      :data-type :date}}
                       true)
  (is-match-topic-part #{(Instant/parse "2025-02-17T02:00:00Z")}
                       {:$comparator {:op :$gte
                                      :value (Instant/parse "2025-02-17T03:00:00Z")
                                      :data-type :date}}
                       false)
  (is-match-topic-part #{(Instant/parse "2025-02-17T03:00:00Z")}
                       {:$comparator {:op :$gt
                                      :value (Instant/parse "2025-02-17T03:00:00Z")
                                      :data-type :date}}
                       false)
  (is-match-topic-part #{(Instant/parse "2025-02-17T03:00:00Z")}
                       {:$comparator {:op :$gt
                                      :value (Instant/parse "2025-02-17T02:00:00Z")
                                      :data-type :date}}
                       true)
  (is-match-topic-part #{(Instant/parse "2025-02-17T02:00:00Z")}
                       {:$comparator {:op :$lt
                                      :value (Instant/parse "2025-02-17T03:00:00Z")
                                      :data-type :date}}
                       true)
  (is-match-topic-part #{(Instant/parse "2025-02-17T03:00:00Z")}
                       {:$comparator {:op :$lte
                                      :value (Instant/parse "2025-02-17T03:00:00Z")
                                      :data-type :date}}
                       true)
  (is-match-topic-part #{(Instant/parse "2025-02-17T03:00:00Z")}
                       {:$comparator {:op :$lte
                                      :value (Instant/parse "2025-02-17T02:00:00Z")
                                      :data-type :date}}
                       false)

  (testing "nils"
    (is-match-topic-part #{nil} {:$comparator {:op :$lte
                                               :value 1
                                               :data-type :number}} true)

    (is-match-topic-part #{nil} {:$comparator {:op :$lt
                                               :value 1
                                               :data-type :number}} true)

    (is-match-topic-part #{nil} {:$comparator {:op :$gte
                                               :value 1
                                               :data-type :number}} false)

    (is-match-topic-part #{nil} {:$comparator {:op :$gt
                                               :value 1
                                               :data-type :number}} false)

    (is-match-topic-part #{nil} {:$comparator {:op :$like
                                               :value "hi%"
                                               :data-type :string}} false)

    (is-match-topic-part #{nil} {:$comparator {:op :$ilike
                                               :value "hi%"
                                               :data-type :string}} false))

  (testing "$not"
    (is-match-topic-part #{1} {:$not 2} true)
    (is-match-topic-part #{1} {:$not 1} false)))

(comment
  (test/run-tests *ns*))
