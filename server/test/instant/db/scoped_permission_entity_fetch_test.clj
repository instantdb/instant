(ns instant.db.scoped-permission-entity-fetch-test
  (:require [clojure.test :refer [deftest is]]
            [honey.sql :as hsql]
            [instant.db.attr-sketch :as cms]
            [instant.db.datalog :as d]
            [instant.db.model.attr :as attr-model]
            [instant.db.permissioned-transaction :as permissioned-tx]
            [instant.flags :as flags]))

(def app-id #uuid "28970aa3-b5e3-4c1a-822d-192f5e9140cb")
(def eid #uuid "00000000-0000-0000-0000-000000000002")
(def attr-id #uuid "00000000-0000-0000-0000-000000000003")
(def query {:children {:pattern-groups [{:patterns [[:ea eid #{attr-id}]]}]}})
(def ctx {:app-id app-id :db {} ::d/permission-entity-fetch? true})

(defn capture-query [ctx query sketches]
  (let [lookups (atom [])]
    (with-redefs [cms/lookup (fn [_ keys] (swap! lookups conj keys) sketches)
                  d/send-query-nested
                  (fn [ctx _ app-id named]
                    (hsql/format (:query (d/nested-match-query ctx :m- app-id named))))]
      {:sql (d/query ctx query) :lookups @lookups})))

(defn with-opt-in [f]
  (with-redefs [d/permission-entity-fetch-app-ids #{app-id}
                flags/query-result (constantly {})]
    (binding [flags/*flag-overrides* {:scoped-permission-entity-fetch {(str app-id) true}}]
      (f))))

(deftest only-the-measured-app-can-opt-in
  (with-redefs [flags/query-result (constantly {})]
    (is (not (d/scoped-permission-entity-fetch-enabled? app-id)))
    (let [other-app (random-uuid)]
      (binding [flags/*flag-overrides* {:scoped-permission-entity-fetch
                                       {(str app-id) true (str other-app) true}}]
        (is (d/scoped-permission-entity-fetch-enabled? app-id))
        (is (not (d/scoped-permission-entity-fetch-enabled? other-app)))))))

(deftest standalone-entity-lookups-preserve-complete-sql
  (with-opt-in
    (fn []
      (doseq [new-cost? [false true]
              n [1 2 12 100]
              total [nil -1 0 1 10000000]]
        (binding [flags/*toggle-overrides* {:new-index-cost new-cost?}]
          (let [attr-ids (set (map #(java.util.UUID. 1 %) (range n)))
                query {:children
                       {:pattern-groups
                        [{:patterns [[:ea eid attr-ids]]}
                         {:patterns [[:ea (java.util.UUID. 2 0) attr-ids]]}]}}
                sketches (when total
                           (into {} (map (fn [id]
                                          [{:app-id app-id :attr-id id}
                                           {:sketch (assoc cms/default-empty :total total)}])
                                        attr-ids)))
                before (capture-query (dissoc ctx ::d/permission-entity-fetch?) query sketches)
                after (capture-query ctx query sketches)]
            (is (= (:sql before) (:sql after)) (str [new-cost? n total]))
            (is (= 1 (count (:lookups before))))
            (is (empty? (:lookups after)))
            (is (= 2 (count (re-seq #"IndexScan\(t\d+ ea_index\)" (first (:sql after))))))
            (is (not (re-find #"Rows\(" (first (:sql after)))))))))))

(deftest other-apps-callers-and-disabled-flags-use-original-planning
  (with-opt-in
    (fn []
      (let [baseline (capture-query (dissoc ctx ::d/permission-entity-fetch?) query {})]
        (doseq [changed [(dissoc ctx ::d/permission-entity-fetch?)
                         (assoc ctx ::d/permission-entity-fetch? false)]]
          (is (= baseline (capture-query changed query {}))))
        (is (= 1 (count (:lookups (capture-query (assoc ctx :app-id (random-uuid)) query {})))))
        (doseq [overrides [nil {} {:scoped-permission-entity-fetch {(str app-id) false}}
                           {:scoped-permission-entity-fetch {(str app-id) "true"}}]]
          (binding [flags/*flag-overrides* overrides]
            (is (= baseline (capture-query ctx query {})))))
        (binding [flags/*toggle-overrides* {:disable-scoped-permission-entity-fetch true}]
          (is (= baseline (capture-query ctx query {}))))
        (with-redefs [d/permission-entity-fetch-app-ids #{}]
          (is (= baseline (capture-query ctx query {}))))))))

(deftest global-and-query-hint-switches-take-precedence
  (with-opt-in
    (fn []
      (doseq [[toggles flags] [[{:disable-pg-hints true} {}]
                              [{:pg-hints-by-default false} {}]
                              [{} {:disable-hint-query-hashes #{42}}]]]
        (binding [flags/*toggle-overrides* toggles
                  flags/*flag-overrides* (merge flags/*flag-overrides* flags)]
          (let [ctx (assoc ctx :query-hash 42)
                before (capture-query (dissoc ctx ::d/permission-entity-fetch?) query {})
                after (capture-query ctx query {})]
            (is (= before after))
            (is (empty? (:lookups after)))
            (is (not (re-find #"IndexScan" (first (:sql after)))))))))))

(deftest only-the-complete-permission-fetch-shape-is-eligible
  (is (#'d/permission-entity-fetch-patterns? query))
  (doseq [changed [(assoc query :patterns [])
                   (assoc-in query [:children :join-sym] '?e)
                   (assoc-in query [:children :pattern-groups] [])
                   (assoc-in query [:children :pattern-groups 0 :children] {})
                   (assoc-in query [:children :pattern-groups 0 :page-info] {})
                   (assoc-in query [:children :pattern-groups 0 :missing-attr?] true)
                   (assoc-in query [:children :pattern-groups 0 :patterns] [])
                   (update-in query [:children :pattern-groups 0 :patterns] conj [:ea eid #{attr-id}])
                   (assoc-in query [:children :pattern-groups 0 :patterns 0] [:ea eid #{attr-id} '_])
                   (assoc-in query [:children :pattern-groups 0 :patterns 0] [:eav eid #{attr-id}])
                   (assoc-in query [:children :pattern-groups 0 :patterns 0] [:ea [attr-id "lookup"] #{attr-id}])
                   (assoc-in query [:children :pattern-groups 0 :patterns 0] [:ea #{eid} #{attr-id}])
                   (assoc-in query [:children :pattern-groups 0 :patterns 0] [:ea '?e #{attr-id}])
                   (assoc-in query [:children :pattern-groups 0 :patterns 0] [:ea {:$not eid} #{attr-id}])
                   (assoc-in query [:children :pattern-groups 0 :patterns 0] [:ea eid #{}])
                   (assoc-in query [:children :pattern-groups 0 :patterns 0] [:ea eid #{"attr"}])
                   (assoc-in query [:children :pattern-groups 0 :patterns 0] [:ea eid attr-id])
                   (update-in query [:children :pattern-groups] conj
                              {:patterns [[:ea [attr-id "lookup"] #{attr-id}]]})]]
    (is (not (#'d/permission-entity-fetch-patterns? changed)) (pr-str changed))))

(deftest index-changes-and-debug-output-fall-back
  (with-opt-in
    (fn []
      (with-redefs [d/best-index (fn [_ _ _] {:name :triples_pkey})]
        (let [before (capture-query (dissoc ctx ::d/permission-entity-fetch?) query {})
              after (capture-query ctx query {})]
          (is (= before after))
          (is (= 1 (count (:lookups after))))))
      (binding [d/*debug* true]
        (is (= (capture-query (dissoc ctx ::d/permission-entity-fetch?) query {})
               (capture-query ctx query {})))))))

(deftest marker-stays-in-the-gated-standard-entity-fetch
  (with-opt-in
    (fn []
      (let [attrs (attr-model/wrap-attrs
                   [{:id attr-id :forward-identity [(random-uuid) "items" "id"]
                     :value-type :blob :cardinality :one :unique? true}])
            observed (atom nil)
            custom-query (fn [ctx _] (reset! observed ctx) {:data []})
            ctx (assoc (dissoc ctx ::d/permission-entity-fetch?)
                       :attrs attrs :datalog-query-fn custom-query)
            tx-steps [{:eid eid :etype "items"}]]
        (permissioned-tx/load-entities-map ctx tx-steps)
        (is (identical? ctx @observed))
        (with-redefs [d/query custom-query]
          (permissioned-tx/load-entities-map ctx tx-steps)
          (is (= (assoc ctx ::d/permission-entity-fetch? true) @observed))
          (binding [flags/*flag-overrides* {}]
            (permissioned-tx/load-entities-map ctx tx-steps)
            (is (identical? ctx @observed))))))))
