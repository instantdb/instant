(ns instant.db.seeks-permission-helpers-test
  (:require [clojure.test :refer [deftest is]]
            [instant.db.cel :as cel]
            [instant.db.hint-testing :as hint-testing]
            [instant.db.instaql :as iq]
            [instant.db.model.attr :as attr-model]
            [instant.db.query-circuit-breaker :as circuit-breaker]
            [instant.flags :as flags]
            [instant.model.rule :as rule-model]
            [instant.util.instaql :as instaql-util]))

(def app-id #uuid "8ad982d7-09bc-45bd-83c4-8d56ebf32286")
(def broad-query {:seeks {}})
(def filtered-query
  {:seeks {:$ {:where {:resultsCount {:$gt 0} :indexable {:$ne false}}}}})

(defn enabled [app-id]
  {:seeks-query-cpu {(str app-id) {"permission-helpers" true}}})

(deftest only-the-measured-app-queries-and-feature-opt-in
  (with-redefs [flags/query-result (constantly {})]
    (doseq [query [broad-query filtered-query]]
      (doseq [overrides [nil {} (enabled (random-uuid))
                        {:seeks-query-cpu {(str app-id) {"permission-helpers" false}}}
                        {:seeks-query-cpu {(str app-id) {"permission-helpers" "true"}}}
                        {:seeks-query-cpu {(str app-id) {"permission-helpers" 1}}}
                        {:seeks-query-cpu {(str app-id) {"other-feature" true}}}]]
        (binding [flags/*flag-overrides* overrides]
          (is (not (iq/seeks-query-cpu-enabled? app-id query :permission-helpers)))))
      (binding [flags/*flag-overrides* (enabled app-id)]
        (is (iq/seeks-query-cpu-enabled? app-id query :permission-helpers))
        (is (not (iq/seeks-query-cpu-enabled? app-id query :other-feature)))
        (binding [flags/*toggle-overrides* {:disable-seeks-query-cpu true}]
          (is (not (iq/seeks-query-cpu-enabled? app-id query :permission-helpers)))))
      (let [other-app (random-uuid)]
        (binding [flags/*flag-overrides* (enabled other-app)]
          (is (not (iq/seeks-query-cpu-enabled? other-app query :permission-helpers))))))
    (binding [flags/*flag-overrides* (enabled app-id)]
      (doseq [query [nil {} {:other {}} {:seeks {:$ {}}}
                    {:seeks {:$ {:where {}}}}
                    (assoc broad-query :other {})
                    (assoc broad-query :$$ruleParams {})
                    (assoc-in broad-query [:seeks :children] {})
                    (assoc-in broad-query [:seeks :$ :limit] 1000)
                    (assoc-in broad-query [:seeks :$ :fields] ["id"])
                    (assoc-in broad-query [:seeks :$ :order] {:id "asc"})
                    (assoc-in filtered-query [:seeks :$ :where :resultsCount :$gt] 1)
                    (assoc-in filtered-query [:seeks :$ :where :resultsCount] {:$gte 0})
                    (assoc-in filtered-query [:seeks :$ :where :indexable] {:$ne true})
                    (assoc-in filtered-query [:seeks :$ :where :indexable] {:$not false})
                    (assoc-in filtered-query [:seeks :$ :where :extra] true)
                    (assoc-in filtered-query [:seeks :$ :limit] 10)
                    (assoc-in filtered-query [:seeks :owner] {})]]
        (is (not (iq/seeks-query-cpu-enabled? app-id query :permission-helpers))
            (pr-str query))))))

(defn aid [n] (java.util.UUID. 1 n))
(defn eid [n] (java.util.UUID. 2 n))

(def attrs
  (attr-model/wrap-attrs
   (mapv (fn [[n etype label]]
           {:id (aid n)
            :forward-identity [(java.util.UUID. 3 n) etype label]
            :value-type :blob :cardinality :one})
         [[1 "seeks" "id"] [2 "seeks" "title"]
          [3 "other" "id"] [4 "other" "title"]])))

(defn node [query etype rows children]
  {:data {:etype etype :datalog-query query
          :datalog-result {:join-rows rows :topics #{[query etype]}}}
   :child-nodes children})

(def nodes
  [(node :root "seeks"
         #{[[(eid 1) (aid 1) "id"] [(eid 1) (aid 2) "title"]]
           [[(eid 2) (aid 1) "id"] [(eid 1) (aid 3) "other id"]]}
         [(node :shared "other"
                #{[[(eid 1) (aid 3) "other id"] [(eid 1) (aid 4) "other title"]]
                  [[(eid 3) (aid 3) "other id"]]}
                [(node :empty "other" #{} [])])])
   (node :shared "seeks" #{[[(eid 1) (aid 2) "title"]]} [])])

(def empty-acc {:etype->eids+program {} :query-cache {}})

(defn with-programs [f]
  (with-redefs [rule-model/get-program! (fn [rules etype action]
                                        (get-in rules [:programs [etype action]]))
                rule-model/get-field-program! (fn [rules etype label]
                                              (get-in rules [:fields [etype label]]))]
    (f)))

(deftest cached-helper-preserves-trees-rules-and-existing-accumulators
  (with-programs
    (fn []
      (doseq [rules [{}
                     {:programs {["seeks" "view"] :seeks-view
                                 ["other" "view"] :other-view}}
                     {:fields {["seeks" "title"] :title-field}}
                     {:programs {["seeks" "view"] :seeks-view}
                      :fields {["seeks" "title"] :title-field
                               ["other" "title"] :other-title-field}}]
              rule-wheres [nil {}
                           {"seeks" {}}
                           {"seeks" {:short-circuit? false} "other" {:short-circuit? true}}
                           {"seeks" {:short-circuit? true} "other" {}}]
              acc [empty-acc {}
                   {:etype->eids+program {"seeks" {:eids #{(eid 9)}
                                                  :checked-eids #{(eid 9)}
                                                  :program :existing-program
                                                  :field-programs {"title" :existing-field}}
                                         "untouched" {:eids #{(eid 10)}}}
                    :query-cache {:before {:join-rows #{}}}
                    :extra :preserved}]
              tree [nil [] nodes [(node :empty "seeks" #{} [])]
                    [(node :empty-row "seeks" #{[]} [])]]]
        (let [ctx {:attrs attrs :rules rules :rule-wheres rule-wheres}]
          (is (= (iq/extract-permission-helpers* acc ctx tree)
                 (iq/extract-permission-helpers-cached acc ctx tree))
              (pr-str {:rules rules :rule-wheres rule-wheres :acc acc :tree tree})))))))

(deftest cached-helper-preserves-namespace-and-query-cache-boundaries
  (with-programs
    (fn []
      (let [ctx {:attrs attrs :rules {}
                 :rule-wheres {"seeks" {} "other" {:short-circuit? true}}}
            helpers (iq/extract-permission-helpers-cached empty-acc ctx nodes)]
        (is (= #{(eid 1) (eid 2)} (get-in helpers [:etype->eids+program "seeks" :eids])))
        (is (= #{(eid 1) (eid 3)} (get-in helpers [:etype->eids+program "other" :eids])))
        (is (= #{(eid 1) (eid 2)} (get-in helpers [:etype->eids+program "seeks" :checked-eids])))
        (is (not (contains? (get-in helpers [:etype->eids+program "other"]) :checked-eids)))
        (is (= (:datalog-result (:data (last nodes))) (get-in helpers [:query-cache :shared])))
        (is (= #{:root :shared :empty} (set (keys (:query-cache helpers)))))
        (is (nil? (get-in helpers [:etype->eids+program "seeks" :field-programs])))))))

(deftest metadata-is-cached-within-one-extraction
  (let [calls (atom [])
        tree [(node :root "seeks"
                    (mapv (fn [n] [[(eid n) (aid 1) "id"] [(eid n) (aid 2) "title"]])
                          (range 100))
                    [(node :child "seeks" #{[[(eid 1) (aid 2) "title"]]} [])])]
        ctx {:attrs attrs :rules {}}]
    (with-redefs [rule-model/get-program! (fn [& _] :view-program)
                  rule-model/get-field-program! (fn [rules etype label]
                                                (swap! calls conj [rules etype label])
                                                nil)]
      (iq/extract-permission-helpers-cached empty-acc ctx tree)
      (is (= {[{} "seeks" "id"] 1 [{} "seeks" "title"] 1} (frequencies @calls)))
      (reset! calls [])
      (iq/extract-permission-helpers-cached empty-acc (assoc ctx :rules {:changed true}) tree)
      (is (= {[{:changed true} "seeks" "id"] 1 [{:changed true} "seeks" "title"] 1}
             (frequencies @calls))))))

(deftest existing-field-programs-are-not-recompiled
  (let [acc (assoc-in empty-acc [:etype->eids+program "seeks"]
                      {:eids #{} :program :existing
                       :field-programs {"id" nil "title" :existing-field}})
        tree [(node :root "seeks"
                    #{[[(eid 1) (aid 1) "id"] [(eid 1) (aid 2) "title"]]} [])]]
    (with-redefs [rule-model/get-program! (fn [& _] (throw (ex-info "Unexpected view compilation" {})))
                  rule-model/get-field-program! (fn [& _] (throw (ex-info "Unexpected field compilation" {})))]
      (is (= (iq/extract-permission-helpers* acc {:attrs attrs} tree)
             (iq/extract-permission-helpers-cached acc {:attrs attrs} tree))))))

(deftest real-programs-match-the-original-helper
  (let [ctx {:attrs attrs
             :rules {:code {"seeks" {"allow" {"view" "true"}
                                     "fields" {"title" "false"}}
                            "other" {"allow" {"view" "false"}}}}}
        before (iq/extract-permission-helpers* empty-acc ctx nodes)
        after (iq/extract-permission-helpers-cached empty-acc ctx nodes)]
    (is (= before after))
    (is (= "false" (get-in after [:etype->eids+program "seeks" :field-programs "title" :code])))))

(deftest dispatcher-preserves-rate-limit-checks
  (doseq [enabled? [false true]]
    (let [calls (atom [])
          ctx {::iq/seeks-permission-helpers? enabled?}
          helpers {:etype->eids+program {"seeks" {:checked-eids #{(eid 1)}}}
                   :query-cache {}}]
      (with-redefs [iq/extract-permission-helpers* (fn [acc actual-ctx tree]
                                                   (swap! calls conj [:original acc actual-ctx tree])
                                                   helpers)
                    iq/extract-permission-helpers-cached (fn [acc actual-ctx tree]
                                                         (swap! calls conj [:cached acc actual-ctx tree])
                                                         helpers)
                    iq/check-rate-limits-for-rule-wheres (fn [actual-ctx result]
                                                          (swap! calls conj [:rate-limits actual-ctx result]))]
        (is (= helpers (iq/extract-permission-helpers empty-acc ctx nodes)))
        (is (= [[(if enabled? :cached :original) empty-acc ctx nodes]
                [:rate-limits ctx helpers]]
               @calls))))))

(defn capture-permissioned-query [query {:keys [ctx rule-wheres effective-query modifiers]
                                      :as options}]
  (let [observed (atom {})
        ctx (merge {:app-id app-id :attrs attrs :db {}} ctx)]
    (with-redefs [flags/query-result (constantly {})
                  flags/query-modifiers (fn [app-id query-hash]
                                          (swap! observed assoc :modifiers-args [app-id query-hash])
                                          modifiers)
                  hint-testing/queue-for-testing (fn [& _])
                  rule-model/get-by-app-id (fn [& _] {:code {}})
                  iq/get-rule-wheres (fn [& _] rule-wheres)
                  iq/add-rule-wheres-to-query (fn [_ _ q] (or effective-query q))
                  iq/query (fn [ctx q]
                             (swap! observed assoc :query q :query-ctx ctx)
                             [])
                  iq/extract-permission-helpers (fn [ctx res]
                                                  (swap! observed assoc :extraction-ctx ctx :res res)
                                                  empty-acc)
                  iq/get-etype+eid-check-result! (fn [& _] {})]
      (binding [flags/*flag-overrides* (get options :flag-overrides (enabled app-id))
                flags/*toggle-overrides* (:toggle-overrides options)]
        (is (= [] (iq/permissioned-query ctx query)))
        @observed))))

(deftest permissioned-query-gates-the-extraction-dispatcher
  (doseq [query [broad-query filtered-query]
          rule-wheres [nil {} {"seeks" {:short-circuit? true}}]]
    (let [observed (capture-permissioned-query query {:rule-wheres rule-wheres})]
      (is (true? (get-in observed [:extraction-ctx ::iq/seeks-permission-helpers?])))
      (is (= query (:query observed)))
      (is (= rule-wheres (get-in observed [:extraction-ctx :rule-wheres])))
      (is (= [app-id (instaql-util/forms-hash query)] (:modifiers-args observed)))))
  (doseq [[query options]
          [[broad-query {:flag-overrides {}}]
           [broad-query {:toggle-overrides {:disable-seeks-query-cpu true}}]
           [broad-query {:ctx {:app-id (random-uuid)}}]
           [broad-query {:ctx {:table-info {}}}]
           [broad-query {:modifiers [{:etype :seeks :params {:limit 10}}]}]
           [filtered-query {:modifiers [{:etype :unrelated :params {:limit 10}}]}]
           [broad-query {:rule-wheres {"seeks" {}}
                         :effective-query filtered-query}]
           [filtered-query {:rule-wheres {"seeks" {}}
                            :effective-query broad-query}]
           [{:other {}} {:rule-wheres {"other" {}}
                        :effective-query broad-query}]
           [(assoc broad-query :$$ruleParams {}) {}]
           [(assoc-in broad-query [:seeks :$ :limit] 10) {}]]]
    (let [observed (capture-permissioned-query query options)]
      (is (not (get-in observed [:extraction-ctx ::iq/seeks-permission-helpers?]))
          (pr-str [query options]))
      (is (contains? observed :extraction-ctx)))))

(deftest admin-queries-bypass-permission-extraction
  (doseq [query [broad-query filtered-query (assoc broad-query :$$ruleParams {:value 1})]]
    (let [ctx {:app-id app-id :attrs attrs :db {} :admin? true}
          observed (capture-permissioned-query query {:ctx ctx})]
      (is (= (dissoc query :$$ruleParams) (:query observed)))
      (is (= ctx (:query-ctx observed)))
      (is (not (contains? observed :extraction-ctx)))
      (is (not (contains? observed :modifiers-args))))))

(deftest cached-helpers-preserve-final-permissioned-results
  (let [ctx {:app-id app-id :attrs attrs
             :preloaded-refs (cel/create-preloaded-refs-cache)
             :rules {:code {"seeks" {"allow" {"view" (str "data.id == '" (eid 1) "'")}
                                     "fields" {"title" "false"}}
                            "other" {"allow" {"view" "false"}}}}}
        allowed [(eid 1) (aid 1) "id"]
        denied [(eid 2) (aid 1) "id"]
        tree (-> nodes
                 (update-in [0 :data :datalog-result :join-rows] conj [allowed] [denied])
                 (assoc-in [0 :data :datalog-result :page-info]
                           {:has-next-page? true :has-previous-page? false})
                 (assoc-in [0 :data :datalog-result :page-info-rows] [denied allowed]))
        before (iq/extract-permission-helpers* empty-acc ctx tree)
        after (iq/extract-permission-helpers-cached empty-acc ctx tree)]
    (with-redefs [iq/preload-entity-maps (fn [& _] {})
                  iq/entity-map (fn [_ _ _ id] {"id" (str id)})]
      (let [before-checks (iq/get-etype+eid-check-result! ctx before nil)
            after-checks (iq/get-etype+eid-check-result! ctx after nil)
            before-result (mapv #(iq/permissioned-node ctx before-checks %) tree)
            after-result (mapv #(iq/permissioned-node ctx after-checks %) tree)]
        (is (= before-checks after-checks))
        (is (= before-result after-result))
        (is (= #{[allowed]} (get-in after-result [0 :data :datalog-result :join-rows])))
        (is (= [] (get-in after-result [0 :child-nodes])))
        (is (= {:start-cursor allowed :end-cursor allowed
                :has-next-page? true :has-previous-page? false}
               (get-in after-result [0 :data :datalog-result :page-info])))
        (is (not (contains? (get-in after-result [0 :data :datalog-result]) :page-info-rows)))
        (is (= (get-in tree [0 :data :datalog-result :topics])
               (get-in after-result [0 :data :datalog-result :topics])))))))

(defn capture-query-normal [query {:keys [ctx modifiers where-order] :as options}]
  (let [observed (atom {})
        ctx (assoc (merge {:app-id app-id :attrs attrs} ctx)
                   :datalog-query-fn (fn [ctx patterns]
                                       (swap! observed assoc :datalog-ctx ctx :patterns patterns)
                                       {:data ::data}))]
    (with-redefs [flags/query-result (constantly {})
                  flags/query-modifiers (fn [& _] modifiers)
                  flags/where-order (fn [_] where-order)
                  circuit-breaker/with-query-breaker (fn [_ _ f] (f))
                  iq/instaql-query->patterns (fn [_ q]
                                               (swap! observed assoc :effective-query q)
                                               {:patterns ::patterns :forms ::forms})
                  iq/collect-query-results (fn [_ data forms]
                                             (swap! observed assoc :collected [data forms])
                                             ::collected)]
      (binding [flags/*flag-overrides* (get options :flag-overrides
                                          {:seeks-query-cpu {(str app-id) {"leaf-results" true}}})
                flags/*toggle-overrides* (:toggle-overrides options)]
        (is (= ::collected (iq/query-normal ctx query)))
        (is (= ::patterns (:patterns @observed)))
        (is (= [::data ::forms] (:collected @observed)))
        @observed))))

(deftest leaf-results-use-only-the-exact-original-and-effective-query
  (doseq [query [broad-query filtered-query]]
    (let [observed (capture-query-normal query {})]
      (is (true? (get-in observed [:datalog-ctx :seeks-leaf-result?])))
      (is (= query (:effective-query observed)))
      (is (= (instaql-util/forms-hash query) (get-in observed [:datalog-ctx :query-hash])))))
  (let [other-app (random-uuid)]
    (doseq [[query options]
            [[broad-query {:flag-overrides {}}]
             [broad-query {:flag-overrides (enabled app-id)}]
             [broad-query {:flag-overrides {:seeks-query-cpu {(str app-id) {"leaf-results" false}}}}]
             [broad-query {:flag-overrides {:seeks-query-cpu {(str app-id) {"leaf-results" "true"}}}}]
             [broad-query {:toggle-overrides {:disable-seeks-query-cpu true}}]
             [broad-query {:ctx {:app-id other-app}
                           :flag-overrides {:seeks-query-cpu {(str other-app) {"leaf-results" true}}}}]
             [broad-query {:modifiers [{:etype :seeks :params {:limit 10}}]}]
             [broad-query {:modifiers [{:etype :seeks :params (:$ (:seeks filtered-query))}]}]
             [{:seeks {:$ {:where {:indexable {:$ne false}}}}}
              {:modifiers [{:etype :seeks :params (:$ (:seeks filtered-query))}]}]
             [filtered-query {:modifiers [{:etype :seeks :params {:fields ["id"]}}]}]
             [broad-query {:ctx {:seeks-leaf-result? true} :flag-overrides {}}]
             [{:other {}} {:ctx {:seeks-leaf-result? true}}]]]
      (let [observed (capture-query-normal query options)]
        (is (not (get-in observed [:datalog-ctx :seeks-leaf-result?])) (pr-str [query options]))
        (is (= (instaql-util/forms-hash query) (get-in observed [:datalog-ctx :query-hash])))
        (is (= (instaql-util/normalized-forms (:effective-query observed))
               (get-in observed [:datalog-ctx :query-normalized])))))))
