(ns instant.reactive.query-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [datascript.core :as ds]
   [instant.db.instaql :as iq]
   [instant.db.model.attr :as attr-model]
   [instant.fixtures :refer [with-empty-app]]
   [instant.flags :as flags]
   [instant.model.app-user :as app-user-model]
   [instant.model.app-user-refresh-token :as refresh-token-model]
   [instant.reactive.query :as rq]
   [instant.reactive.store :as rs]
   [instant.util.instaql :as instaql-util]
   [instant.util.json :as json]))

(def scoped-app-id #uuid "19bde4a4-559c-4274-9bba-5e4bff9fcffe")

(def scoped-query
  {:sections {:$ {:where {:or [{:and [{:date {:$gte "2026-09-01"}}
                                    {:date {:$lte "2026-09-30"}}]}
                              {:and [{:recurrenceRule {:$isNull false}}
                                     {:date {:$lte "2026-09-30"}}]}
                              {:and [{:exceptionDate {:$gte "2026-09-01"}}
                                     {:exceptionDate {:$lte "2026-09-30"}}]}]}}
              :area {} :activityType {} :parent {} :eventLinks {}}})

(def enabled-flags
  {:scoped-refresh-results {(str scoped-app-id) {"sections-calendar" true}}})

(use-fixtures :each
  (fn [f]
    (binding [flags/*flag-overrides* enabled-flags
              flags/*toggle-overrides* {:disable-scoped-refresh-results false
                                       :instaql-topic-compiler false}]
      (f))))

(defn- query-fixture []
  (let [eid (random-uuid)
        aid (random-uuid)]
    {:ctx {:app-id scoped-app-id
           :session-id (random-uuid)
           :attrs (attr-model/wrap-attrs
                   [{:id aid
                     :forward-identity [(random-uuid) "items" "id"]
                     :value-type :blob
                     :cardinality :one
                     :unique? true}])}
     :query scoped-query
     :nodes [{:data {:k "items"
                    :datalog-result {:join-rows #{}
                                     :page-info {:has-next-page? false}
                                     :aggregate {:count 1}}}
              :child-nodes [{:data {:datalog-result {:join-rows #{[[eid aid eid 0]]}}}
                             :child-nodes []}]}]}))

(deftest unchanged-results-are-only-skipped-when-requested
  (doseq [return-type [:tree :join-rows]
          inference? [true false]]
    (testing (str return-type ", inference " inference?)
      (let [{:keys [ctx query nodes]} (query-fixture)
            store (rs/init)
            query-calls (atom 0)
            skip-ctx (assoc ctx :skip-unchanged-result? true)]
        (with-redefs [flags/toggled? (constantly false)
                      iq/permissioned-query (fn [_ctx _query]
                                              (swap! query-calls inc)
                                              nodes)]
          (let [initial (rq/instaql-query-reactive! store skip-ctx query return-type inference?)
                unchanged (rq/instaql-query-reactive! store ctx query return-type inference?)]
            (is (true? (:result-changed? initial)))
            (is (false? (:result-changed? unchanged)))
            (is (some? (:instaql-result initial)))
            (is (= (dissoc initial :result-changed?)
                   (dissoc unchanged :result-changed?)))
            (let [unexpected (fn [& _] (throw (ex-info "Unexpected materialization" {})))]
              (with-redefs [rq/collect-instaql-results-for-client unexpected
                            instaql-util/instaql-nodes->object-tree unexpected
                            instaql-util/instaql-nodes->object-meta unexpected]
                (is (= {:instaql-result nil
                        :result-meta nil
                        :result-changed? false
                        :instaql-topic? false}
                       (rq/instaql-query-reactive! store skip-ctx query return-type inference?)))))
            (is (= 3 @query-calls) "Unchanged refreshes still evaluate permissions and the query")
            (is (= 3 (:instaql-query/version
                      (ds/entity @(rs/app-conn store (:app-id ctx))
                                 [:instaql-query/session-id+query [(:session-id ctx) query]]))))))))))

(deftest metadata-and-attribute-changes-are-materialized
  (doseq [return-type [:tree :join-rows]]
    (let [{:keys [ctx query nodes]} (query-fixture)
          ctx (assoc ctx :skip-unchanged-result? true)
          nodes (atom nodes)
          store (rs/init)]
      (with-redefs [flags/toggled? (constantly false)
                    iq/permissioned-query (fn [_ctx _query] @nodes)]
        (rq/instaql-query-reactive! store ctx query return-type true)
        (testing "Changes to page-info or aggregates cannot be dropped"
          (doseq [[k value] [[:page-info {:has-next-page? true}]
                            [:aggregate {:count 2}]]]
            (swap! nodes assoc-in [0 :data :datalog-result k] value)
            (let [result (rq/instaql-query-reactive! store ctx query return-type true)
                  metadata (if (= :tree return-type)
                             (:result-meta result)
                             (-> result :instaql-result first :data))]
              (is (true? (:result-changed? result)))
              (is (some? (:instaql-result result)))
              (is (= value (get-in metadata [k "items"]))))))
        (testing "Schema changes still change the result hash"
          (let [ctx (update ctx :attrs #(attr-model/wrap-attrs
                                         (mapv (fn [attr] (assoc attr :index? true)) %)))
                result (rq/instaql-query-reactive! store ctx query return-type true)]
            (is (true? (:result-changed? result)))
            (is (some? (:instaql-result result)))))))))

(deftest unscoped-refreshes-still-materialize
  (doseq [return-type [:tree :join-rows]
          {:keys [label app-id query flags toggles] :as scenario}
          [{:label "another app with the same query"
            :app-id (random-uuid)}
           {:label "another app cannot opt itself in"
            :app-id #uuid "00000000-0000-0000-0000-000000000001"
            :flags {"00000000-0000-0000-0000-000000000001" {"sections-calendar" true}}}
           {:label "another query in the scoped app"
            :query (assoc scoped-query :other {})}
           {:label "the opposite null predicate"
            :query (assoc-in scoped-query [:sections :$ :where :or 1 :and 0 :recurrenceRule :$isNull] true)}
           {:label "missing flag" :flags nil}
           {:label "empty flag" :flags {}}
           {:label "false flag" :flags {(str scoped-app-id) {"sections-calendar" false}}}
           {:label "string true is not enabled" :flags {(str scoped-app-id) {"sections-calendar" "true"}}}
           {:label "unknown shape" :flags {(str scoped-app-id) {"unknown" true}}}
           {:label "kill switch" :toggles {:disable-scoped-refresh-results true}}]]
    (testing (str return-type ": " label)
      (let [{base-ctx :ctx nodes :nodes} (query-fixture)
            ctx (assoc base-ctx :app-id (or app-id scoped-app-id) :skip-unchanged-result? true)
            query (or query scoped-query)
            store (rs/init)]
        (binding [flags/*flag-overrides* (if (contains? scenario :flags)
                                          {:scoped-refresh-results flags}
                                          enabled-flags)
                  flags/*toggle-overrides* (merge {:disable-scoped-refresh-results false
                                                   :instaql-topic-compiler false}
                                                  toggles)]
          (with-redefs [iq/permissioned-query (fn [_ctx _query] nodes)]
            (let [initial (rq/instaql-query-reactive! store ctx query return-type true)
                  repeated (rq/instaql-query-reactive! store ctx query return-type true)]
              (is (false? (:result-changed? repeated)))
              (is (some? (:instaql-result repeated)))
              (is (= (dissoc initial :result-changed?)
                     (dissoc repeated :result-changed?))))))))))

(deftest failed-refresh-still-removes-the-query
  (let [{:keys [ctx query nodes]} (query-fixture)
        ctx (assoc ctx :skip-unchanged-result? true)
        store (rs/init)]
    (with-redefs [flags/toggled? (constantly false)
                  iq/permissioned-query (fn [_ctx _query] nodes)]
      (rq/instaql-query-reactive! store ctx query :tree true))
    (with-redefs [flags/toggled? (constantly false)
                  iq/permissioned-query (fn [_ctx _query]
                                          (throw (ex-info "Permission check failed" {})))]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Permission check failed"
                           (rq/instaql-query-reactive! store ctx query :tree true)))
      (is (empty? (rs/session-instaql-queries store (:app-id ctx) (:session-id ctx)))))))

(deftest repeated-refresh-token-lookups-return-the-user
  (with-empty-app
    (fn [{app-id :id}]
      (let [user (app-user-model/create! {:app-id app-id :email "cached-user@example.com"})
            token (refresh-token-model/create! {:app-id app-id :user-id (:id user)})
            query-reactive rq/instaql-query-reactive!
            changes (atom [])]
        (with-redefs [rs/store (rs/init)
                      flags/use-reactive-cache-for-verify-token? (constantly true)
                      rq/instaql-query-reactive!
                      (fn [& args]
                        (let [result (apply query-reactive args)]
                          (swap! changes conj (:result-changed? result))
                          result))]
          (dotimes [_ 2]
            (is (= (str (:id user))
                   (get (app-user-model/get-by-refresh-token {:app-id app-id
                                                             :refresh-token (:id token)})
                        "id"))))
          (is (= [true false] @changes)))))))

(deftest transient-triple-collection-preserves-results
  (let [triples (mapv (fn [n] [(random-uuid) (random-uuid) n n]) (range 6))
        [a b c d e f] triples
        nodes [{:data {:k "items"
                       :datalog-result {:join-rows [[a b] [a c]]
                                        :page-info {:cursor "first"}
                                        :aggregate {:count 3}}}
                :child-nodes [{:data {:k "children"
                                     :datalog-result {:join-rows [[b d]]
                                                      :page-info {:cursor "ignored"}
                                                      :aggregate {:count 99}}}
                               :child-nodes [{:data {:datalog-result {:join-rows [[e a]]}}}]}]}
               {:data {:k "items"
                       :datalog-result {:join-rows [[f]]
                                        :page-info {:cursor "last"}}}}]
        collect #'rq/collect-instaql-results-with-transients]
    (is (= [{:data {:datalog-result {:join-rows [(set triples)]}
                    :page-info {"items" {:cursor "last"}}
                    :aggregate {"items" {:count 3}}}
             :child-nodes []}]
           (collect nodes)))
    (doseq [input [nil [] nodes
                  [{:data {}}]
                  [{:data {:k "items" :datalog-result {:join-rows []}}}]
                  [{:data {:k "items" :datalog-result {:join-rows [[a a] [a]]}}}]
                  [{:data {:k "items" :datalog-result {:aggregate {} :page-info {}}}}]
                  [{:data {:k "items" :datalog-result {:aggregate false :page-info false}}}]
                  [{:data {:datalog-result
                           {:join-rows [[[(first a) (second a) {:nested [nil true {"key" "value"}]} 0]
                                         [(first a) (second a) {:nested [nil true {"key" "value"}]} 1]]]}}}]
                  (list (first nodes) (second nodes))]]
      (let [before (rq/collect-instaql-results-for-client input)
            after (collect input)]
        (is (= before after))
        (is (= (json/->json before) (json/->json after)))))
    (testing "Shared subtrees are deduplicated without modifying inputs"
      (let [shared (first nodes)
            input [{:data {:k "shared"} :child-nodes [shared shared shared]}]
            expected (rq/collect-instaql-results-for-client input)]
        (is (= expected (collect input)))
        (is (= expected (collect input)))
        (is (= (set triples)
               (-> (collect nodes) first :data :datalog-result :join-rows first)))))))

(deftest transient-triple-collection-preserves-wire-order
  (let [a ["e" "a" "5214613302714813508" 100]
        b ["e" "a" "-7704138429563057897" 100]
        fillers (mapv (fn [n] [(str "e" n) "a" n 100]) (range 80))
        node (fn [rows children]
               {:data {:k "items" :datalog-result {:join-rows rows}}
                :child-nodes children})
        collect #'rq/collect-instaql-results-with-transients]
    (is (not= a b))
    (is (= (hash a) (hash b)) "Exercise equal-hash, unequal triples")
    (doseq [[first-triple second-triple] [[a b] [b a]]
            filler-rows [fillers (reverse fillers) (set fillers)]
            input [[(node [[first-triple second-triple] fillers] [])]
                   [(node [[first-triple]]
                          [(node [filler-rows [second-triple first-triple]] [])])]
                   [(node [filler-rows]
                          [(node [[first-triple]] [])
                           (node [[second-triple]] [])])]
                   [(node [[first-triple]] [])
                    (node [filler-rows [second-triple]] [])]
                   [(node [[first-triple]]
                          [(node [filler-rows [second-triple first-triple]]
                                 [(node [[second-triple]] [])])
                           (node [[second-triple first-triple]] [])])
                    (node [filler-rows [second-triple first-triple]] [])]
                   [(node []
                          [(node [filler-rows [first-triple]] [])
                           (node [[second-triple]]
                                 [(node [filler-rows [second-triple first-triple]] [])])])]
                   [(node [[(assoc first-triple 3 101) second-triple first-triple]]
                          [(node [filler-rows [first-triple second-triple]] [])])]]]
      (let [before (rq/collect-instaql-results-for-client input)
            after (collect input)
            before-triples (-> before first :data :datalog-result :join-rows first)
            after-triples (-> after first :data :datalog-result :join-rows first)]
        (is (= before after))
        (is (= (seq before-triples) (seq after-triples)))
        (is (= (json/->json before) (json/->json after)))))))

(deftest transient-triple-collection-is-scoped
  (let [enabled {(str scoped-app-id) {"sections-calendar" true}}
        compact @#'rq/collect-instaql-results-with-transients]
    (doseq [{:keys [label app-id query setting toggles return-type expected?]
             :or {app-id scoped-app-id query scoped-query setting enabled
                  return-type :join-rows expected? false}}
            [{:label "matching join rows" :expected? true}
             {:label "missing flag" :setting nil}
             {:label "empty flag" :setting {}}
             {:label "false flag" :setting {(str scoped-app-id) {"sections-calendar" false}}}
             {:label "string flag" :setting {(str scoped-app-id) {"sections-calendar" "true"}}}
             {:label "kill switch" :toggles {:disable-scoped-triple-collection true}}
             {:label "another app" :app-id #uuid "00000000-0000-0000-0000-000000000001"}
             {:label "another app cannot opt itself in"
              :app-id #uuid "00000000-0000-0000-0000-000000000001"
              :setting {"00000000-0000-0000-0000-000000000001" {"sections-calendar" true}}}
             {:label "another root" :query (assoc scoped-query :other {})}
             {:label "missing child" :query (update scoped-query :sections dissoc :parent)}
             {:label "opposite null predicate"
              :query (assoc-in scoped-query [:sections :$ :where :or 1 :and 0 :recurrenceRule :$isNull] true)}
             {:label "tree output" :return-type :tree}
             {:label "fallback output" :return-type :unknown}]]
      (testing label
        (let [{:keys [ctx nodes]} (query-fixture)
              ctx (assoc ctx :app-id app-id)
              store (rs/init)
              calls (atom 0)]
          (binding [flags/*flag-overrides* {:scoped-triple-collection setting}
                    flags/*toggle-overrides* (merge {:instaql-topic-compiler false
                                                     :disable-scoped-triple-collection false}
                                                    toggles)]
            (with-redefs [iq/permissioned-query (fn [_ _] nodes)]
              (with-redefs-fn {#'rq/collect-instaql-results-with-transients
                              (fn [input] (swap! calls inc) (compact input))}
                #(let [result (rq/instaql-query-reactive! store ctx query return-type true)]
                   (is (some? (:instaql-result result)))
                   (is (= (if expected? 1 0) @calls)))))))))))

(deftest transient-triple-collection-still-delivers-changes
  (doseq [inference? [true false]]
    (let [{:keys [ctx query nodes]} (query-fixture)
          ctx (assoc ctx :skip-unchanged-result? true)
          nodes (atom nodes)
          store (rs/init)
          calls (atom 0)]
      (binding [flags/*flag-overrides* {:scoped-triple-collection
                                       {(str scoped-app-id) {"sections-calendar" true}}}
                flags/*toggle-overrides* {:instaql-topic-compiler false
                                         :disable-scoped-triple-collection false}]
        (with-redefs [iq/permissioned-query (fn [_ _] (swap! calls inc) @nodes)]
          (let [initial (rq/instaql-query-reactive! store ctx query :join-rows inference?)
                repeated (rq/instaql-query-reactive! store ctx query :join-rows inference?)]
            (is (true? (:result-changed? initial)))
            (is (false? (:result-changed? repeated)))
            (is (= (:instaql-result initial) (:instaql-result repeated)))
            (is (some? (:instaql-result repeated)) "The unchanged-refresh flag is independent")
            (doseq [[path value] [[[0 :child-nodes 0 :data :datalog-result :join-rows]
                                  #{[[(random-uuid) (random-uuid) "changed" 1]]}]
                                 [[0 :data :datalog-result :page-info] {:has-next-page? true}]
                                 [[0 :data :datalog-result :aggregate] {:count 2}]]]
              (swap! nodes assoc-in path value)
              (let [result (rq/instaql-query-reactive! store ctx query :join-rows inference?)]
                (is (true? (:result-changed? result)))
                (is (= (rq/collect-instaql-results-for-client @nodes)
                       (:instaql-result result)))))
            (is (= 5 @calls) "Every invocation still evaluates the permissioned query")))))))

(deftest transient-triple-collection-respects-unchanged-refresh-skipping
  (let [{:keys [ctx query nodes]} (query-fixture)
        ctx (assoc ctx :skip-unchanged-result? true)
        nodes (atom nodes)
        store (rs/init)
        compact @#'rq/collect-instaql-results-with-transients
        collections (atom 0)
        query-calls (atom 0)]
    (binding [flags/*flag-overrides* (assoc enabled-flags :scoped-triple-collection
                                          {(str scoped-app-id) {"sections-calendar" true}})
              flags/*toggle-overrides* {:instaql-topic-compiler false
                                       :disable-scoped-refresh-results false
                                       :disable-scoped-triple-collection false}]
      (with-redefs [iq/permissioned-query (fn [_ _] (swap! query-calls inc) @nodes)]
        (with-redefs-fn {#'rq/collect-instaql-results-with-transients
                        (fn [input] (swap! collections inc) (compact input))}
          (fn []
            (let [initial (rq/instaql-query-reactive! store ctx query :join-rows true)
                  repeated (rq/instaql-query-reactive! store ctx query :join-rows true)]
              (is (= (rq/collect-instaql-results-for-client @nodes) (:instaql-result initial)))
              (is (= 1 @collections))
              (is (false? (:result-changed? repeated)))
              (is (nil? (:instaql-result repeated))))
            (swap! nodes assoc-in [0 :data :datalog-result :page-info] {:has-next-page? true})
            (let [changed (rq/instaql-query-reactive! store ctx query :join-rows true)]
              (is (true? (:result-changed? changed)))
              (is (= (rq/collect-instaql-results-for-client @nodes) (:instaql-result changed)))
              (is (= 2 @collections)))
            (is (= 3 @query-calls))))))))
