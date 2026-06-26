(ns instant.reactive.store-test
  (:require
   [clojure.test :as test :refer [deftest is testing]]
   [datascript.core :as d]
   [instant.data.resolvers :as resolvers]
   [instant.db.model.attr :as attr-model]
   [instant.fixtures :refer [with-zeneca-app]]
   [instant.jdbc.aurora :as aurora]
   [instant.reactive.query :as rq]
   [instant.reactive.store :as rs]
   [instant.util.async :as ua]
   [instant.util.cache :as c]
   [instant.util.test :refer [wait-for]])
  (:import
   (java.nio.channels Channel)
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
        app-id (random-uuid)
        make-res (fn [v]
                   (with-meta v {:sql-byte-len 10}))
        record-start (fn [store app-id dq]
                       (rs/record-datalog-query-start! store
                                                       {:app-id app-id
                                                        :session-id (random-uuid)
                                                        :instaql-query {:q {:$ {:where {:v (str (random-uuid))}}}}
                                                        :v 0}
                                                       dq
                                                       #{}))]
    (testing "store returns cached data"
      (let [q [[:ea (random-uuid)]]]
        (record-start store app-id q)
        (is (= {:a :a} (rs/swap-datalog-cache! store
                                               app-id
                                               (fn [_ctx _query]
                                                 (make-res {:a :a}))
                                               nil
                                               q)))
        (is (= {:a :a} (rs/swap-datalog-cache! store
                                               app-id
                                               (fn [_ctx _query]
                                                 (make-res {:b :b}))
                                               nil
                                               q)))))

    (testing "store returns cached data with delay"
      (let [q [[:ea (random-uuid)]]]
        (record-start store app-id q)
        (is (= {:a :a} (rs/swap-datalog-cache! store
                                               app-id
                                               (fn [_ctx _query]
                                                 (Thread/sleep 100)
                                                 (make-res {:a :a}))
                                               nil
                                               q)))
        (is (= {:a :a} (rs/swap-datalog-cache! store
                                               app-id
                                               (fn [_ctx _query]
                                                 (make-res {:b :b}))
                                               nil
                                               q)))))

    (testing "work is canceled with no listeners"
      (let [q [[:ea (random-uuid)]]
            _ (record-start store app-id q)
            err (promise)
            started (promise)
            canceled (promise)
            f1 (ua/vfuture (try (rs/swap-datalog-cache! store
                                                        app-id
                                                        (fn [_ctx _query]
                                                          (try
                                                            (deliver started true)
                                                            @(promise)
                                                            (catch Throwable t
                                                              (deliver err t)
                                                              (make-res {:a :d}))))
                                                        nil
                                                        q)
                                (finally
                                  (deliver canceled true))))]
        @started
        (future-cancel f1)
        ;; Wait for future to complete
        @canceled

        (is (instance? java.lang.InterruptedException (deref err 100 :timeout)))))

    (dotimes [_ 100]
      (testing "work isn't canceled if there are still listeners"
        (let [q [[:ea (random-uuid)]]
              _ (record-start store app-id q)
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

              f2 (ua/vfuture
                   (rs/swap-datalog-cache! store
                                           app-id
                                           (fn [_ctx _query]
                                             (throw (Exception. "shouldn't run")))
                                           nil
                                           q))]

          ;; Give the query a chance to register
          (wait-for (fn []
                      (let [conn (rs/app-conn store app-id)
                            ent  (d/entity @conn [:datalog-query/app-id+query [app-id q]])
                            watchers (:datalog-query/watchers ent)]
                        (= 2 (count (:watchers @watchers)))))
                    1000
                    1)

          (future-cancel f1)
          (is (or (instance? java.lang.InterruptedException (deref err 100 :timeout))
                  (instance? java.util.concurrent.CancellationException (deref err 100 :timeout))))
          (deliver wait (make-res {:a :a}))
          (is (= (deref f2 100 :timeout) {:a :a})))))

    (testing "doesn't store failures"
      (let [q [[:ea (random-uuid)]]
            _ (record-start store app-id q)
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

        ;; Give the cache a chance to evict the error (it happens in the background
        ;; for some reason)
        (let [conn (rs/app-conn store app-id)
              cache (:datalog-query-cache (meta conn))
              q-id (:db/id (d/entity @conn [:datalog-query/app-id+query [app-id q]]))]
          (wait-for (fn []
                      (not (c/get-if-present-async cache q-id)))
                    1000))

        (is (= {:ok :ok} (rs/swap-datalog-cache! store
                                                 app-id
                                                 (fn [_ctx _query]
                                                   (make-res {:ok :ok}))
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

  (is-match-topic-part #{"hello world"} {:$comparator {:op :$like
                                                       :value "%w%r_d"
                                                       :data-type :string}} true)

  (is-match-topic-part #{"hello world"} {:$comparator {:op :$like
                                                       :value "_w%r_d"
                                                       :data-type :string}} false)

  (is-match-topic-part #{"[[Daily/2025-08-15]]"} {:$comparator {:op :$like
                                                                :value "%[[Daily/2025-08-15]]%"
                                                                :data-type :string}} true)

  (is-match-topic-part #{"HELLO"} {:$comparator {:op :$ilike
                                                 :value "he%"
                                                 :data-type :string}} true)

  (is-match-topic-part #{"HELLO"} {:$comparator {:op :$like
                                                 :value "he%"
                                                 :data-type :string}} false)

  ;; Wildcards must match newlines to agree with Postgres LIKE/ILIKE
  (is-match-topic-part #{"a\nb"} {:$comparator {:op :$like
                                                :value "a%b"
                                                :data-type :string}} true)

  (is-match-topic-part #{"a\nb"} {:$comparator {:op :$like
                                                :value "a_b"
                                                :data-type :string}} true)

  (is-match-topic-part #{"x\ny"} {:$comparator {:op :$like
                                                :value "%"
                                                :data-type :string}} true)

  (is-match-topic-part #{"A\nB"} {:$comparator {:op :$ilike
                                                :value "a%b"
                                                :data-type :string}} true)

  ;; `_` still matches exactly one char, so \r\n (two chars) should not match
  (is-match-topic-part #{"a\r\nb"} {:$comparator {:op :$like
                                                  :value "a_b"
                                                  :data-type :string}} false)

  (is-match-topic-part #{"a\r\nb"} {:$comparator {:op :$like
                                                  :value "a__b"
                                                  :data-type :string}} true)

  ;; A trailing newline should not match a pattern with no trailing wildcard
  (is-match-topic-part #{"abc\n"} {:$comparator {:op :$like
                                                 :value "abc"
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

(deftest topic-program-stored-on-datalog-query
  (with-zeneca-app
    (fn [app r]
      (let [store (rs/init)
            app-id (:id app)
            session-id (random-uuid)
            attrs (attr-model/get-by-app-id app-id)
            instaql-query {:users {:$ {:where {:handle "stopa"}}}}
            ctx {:db {:conn-pool (aurora/conn-pool :read)}
                 :app-id app-id
                 :session-id session-id
                 :attrs attrs
                 :current-user nil}]
        (rq/instaql-query-reactive! store ctx instaql-query :join-rows false)

        (let [conn (rs/app-conn store app-id)
              db @conn
              dq-ent (->> (d/datoms db :avet :datalog-query/app-id app-id)
                          first
                          :e
                          (d/entity db))
              sub-ent (->> (d/datoms db :avet :subscription/datalog-query (:db/id dq-ent))
                           first
                           :e
                           (d/entity db))
              iq-ent (:subscription/instaql-query sub-ent)
              program (get-in iq-ent [:instaql-query/topic :program])]
          (is (some? program))

          (is (true? (program {:etype "users"
                               :attrs {(str (resolvers/->uuid r :users/handle)) "stopa"}})))
          (is (false? (program {:etype "users"
                                :attrs {(str (resolvers/->uuid r :users/handle)) "joe"}})))
          (is (false? (program {:etype "posts"
                                :attrs {(str (resolvers/->uuid r :users/handle)) "stopa"}}))))))))

;; ----
;; close-connections

(defn tracking-channel
  "A Channel that conj's `id` onto the `closed` atom when closed."
  [closed id]
  (reify Channel
    (close [_] (swap! closed conj id))
    (isOpen [_] true)))

(defn add-sse-session! [store closed id]
  (d/transact! (:sessions store)
               [{:session/id (random-uuid)
                 :session/socket {:sse-conn (tracking-channel closed id)}}]))

(deftest close-connections-closes-all
  (let [store (rs/init)
        closed (atom [])
        n 5]
    (doseq [i (range n)]
      (add-sse-session! store closed i))
    (rs/close-connections store {:total-ms 50 :max-gap-ms 10})
    (is (= n (count @closed)))
    (is (= (set (range n)) (set @closed)))))

(deftest close-connections-handles-mixed-conn-types
  (let [store (rs/init)
        closed (atom [])]
    (d/transact! (:sessions store)
                 [{:session/id (random-uuid)
                   :session/socket {:sse-conn (tracking-channel closed :sse)}}
                  {:session/id (random-uuid)
                   :session/socket {:ws-conn {:undertow-websocket (tracking-channel closed :ws)}}}])
    (rs/close-connections store {:total-ms 50 :max-gap-ms 10})
    (is (= #{:sse :ws} (set @closed)))))

(deftest close-connections-handles-empty-store
  (is (nil? (rs/close-connections nil {:total-ms 100 :max-gap-ms 50})))
  (is (nil? (rs/close-connections {} {:total-ms 100 :max-gap-ms 50})))
  (let [store (rs/init)]
    (rs/close-connections store {:total-ms 100 :max-gap-ms 50})
    ;; no assertion needed beyond "didn't throw"
    (is true)))

(deftest close-connections-respects-max-gap-ms
  ;; With few connections and a large total-ms, gap-ms is clamped to max-gap-ms,
  ;; so total wall time is bounded by (n-1) * max-gap-ms — not by total-ms.
  (let [store (rs/init)
        closed (atom [])
        n 3
        max-gap-ms 20]
    (doseq [i (range n)]
      (add-sse-session! store closed i))
    (let [t0 (System/currentTimeMillis)
          _ (rs/close-connections store {:total-ms 10000 :max-gap-ms max-gap-ms})
          elapsed (- (System/currentTimeMillis) t0)]
      (is (= n (count @closed)))
      ;; (n-1)*max-gap-ms = 40ms; allow generous slack for scheduling.
      (is (< elapsed 500)
          (str "expected wall time clamped by max-gap-ms, got " elapsed "ms")))))

(deftest close-connections-respects-total-ms
  ;; With many connections and a large max-gap-ms, gap-ms = total-ms / count,
  ;; and total wall time approximates total-ms.
  (let [store (rs/init)
        closed (atom [])
        n 20
        total-ms 200]
    (doseq [i (range n)]
      (add-sse-session! store closed i))
    (let [t0 (System/currentTimeMillis)
          _ (rs/close-connections store {:total-ms total-ms :max-gap-ms 10000})
          elapsed (- (System/currentTimeMillis) t0)]
      (is (= n (count @closed)))
      ;; expected ~ (n-1)/n * total-ms ≈ 190ms. Allow [0.5x, 3x] for CI slack.
      (is (<= (* 0.5 total-ms) elapsed (* 3 total-ms))
          (str "expected wall time near " total-ms "ms, got " elapsed "ms")))))

(deftest reset-conn-tx!
  (let [store  (rs/init)
        app-id (random-uuid)
        conn   (rs/app-conn store app-id)]
    ;; Advance the tx counter past tx0 and create a few entities.
    (rs/transact! "test" conn [{:db/id -1
                                :datalog-query/app-id app-id
                                :datalog-query/query [[:ea 1]]}])
    (rs/transact! "test" conn [{:db/id -2
                                :datalog-query/app-id app-id
                                :datalog-query/query [[:ea 2]]}])
    (let [db-before     @conn
          datoms-before (set (map (juxt :e :a :v) (d/datoms db-before :eavt)))]
      (is (> (:max-tx db-before) rs/ds-tx0))

      (rs/reset-conn-tx! conn)

      (let [db-after @conn]
        (testing "tx counter is reset to tx0"
          (is (= rs/ds-tx0 (:max-tx db-after))))
        (testing "datoms (eids, attrs, values) are preserved"
          (is (= datoms-before
                 (set (map (juxt :e :a :v) (d/datoms db-after :eavt))))))
        (testing "max-eid is preserved so new entities don't collide"
          (is (= (:max-eid db-before) (:max-eid db-after))))
        (testing "lookups still resolve after reset"
          (is (some? (d/entity db-after [:tx-meta/app-id app-id])))
          (is (some? (d/entity db-after [:datalog-query/app-id+query
                                         [app-id [[:ea 1]]]]))))))))

(comment
  (test/run-tests *ns*))
