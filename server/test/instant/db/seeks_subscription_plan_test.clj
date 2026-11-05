(ns instant.db.seeks-subscription-plan-test
  (:require [clojure.test :refer [deftest is testing]]
            [clojure.walk :as walk]
            [instant.db.attr-sketch :as cms]
            [instant.db.datalog :as d]
            [instant.db.instaql :as iq]
            [instant.db.model.attr :as attr-model]
            [instant.db.scoped-query-plans :as plans]
            [instant.flags :as flags]
            [instant.util.instaql :as instaql-util]))

(def app-id #uuid "8ad982d7-09bc-45bd-83c4-8d56ebf32286")
(def queries
  {:seeks-all {:seeks {}}
   :seeks-filtered {:seeks {:$ {:where {:resultsCount {:$gt 0}
                                       :indexable {:$ne false}}}}}})

(def attrs
  (attr-model/wrap-attrs
   (mapv (fn [[n field data-type]]
           {:id (java.util.UUID. 81 n)
            :forward-identity [(java.util.UUID. 82 n) "seeks" field]
            :value-type :blob :cardinality :one
            :unique? (= field "id") :index? (some? data-type)
            :checked-data-type data-type})
         [[1 "id" nil] [2 "resultsCount" :number] [3 "indexable" :boolean]
          [4 "title" nil] [5 "body" nil]])))

(defn enabled [app-id plan]
  {:scoped-query-plans {(str app-id) {(name plan) true}}})

(defn compile-query [query]
  (let [ctx {:app-id app-id :attrs attrs
             :query-normalized (instaql-util/normalized-forms query)
             :sketches (into {} (map (fn [a]
                                      [{:app-id app-id :attr-id (:id a)}
                                       {:sketch (assoc (cms/make-sketch) :total 6000)}])
                                    attrs))}
        patterns (:patterns (iq/instaql-query->patterns ctx query))
        named (d/annotate-with-hints-impl ctx {} (d/nested->named-patterns patterns))]
    (d/nested-match-query ctx :m- app-id named)))

(defn compiled-case [plan]
  (let [query (queries plan)
        compiled (binding [d/*enable-pg-hints* true
                           flags/*flag-overrides* {:scoped-query-plans {}}]
                   (:query (compile-query query)))]
    {:app-id app-id :query query :attrs attrs
     :result-tables (if (= plan :seeks-all) #{:m-0 :m-2} #{:m-1 :m-3})
     :ctes (mapv (fn [[table query materialized]]
                   [table (cond-> query
                            (:where query) (update :where vec)
                            (:select query) (update :select vec)) materialized])
                 (:with compiled))
     :pg-hints (:pg-hints compiled)}))

(defn apply-plan [{:keys [app-id query ctes pg-hints result-tables attrs]}]
  (plans/apply-plan app-id (instaql-util/normalized-forms query)
                    ctes pg-hints result-tables attrs))

(defn unchanged? [case]
  (= (select-keys case [:ctes :pg-hints]) (apply-plan case)))

(deftest changes-only-the-measured-scans-and-redundant-entity-fetch
  (binding [d/*enable-pg-hints* true]
    (doseq [[plan query] queries]
      (let [before (binding [flags/*flag-overrides* {:scoped-query-plans {}}]
                     (compile-query query))
            after (binding [flags/*flag-overrides* (enabled app-id plan)]
                    (compile-query query))
            all? (= plan :seeks-all)
            expected-ctes (cond-> (vec (get-in before [:query :with]))
                            (not all?) (assoc-in [2 1]
                                                {:select [[[:distinct :m-0-entity-id] :m-2-entity-id]]
                                                 :from :m-1
                                                 :where [:= :m-0-entity-id :m-1-entity-id]}))]
        (is (not= before after))
        (is (= expected-ctes (get-in after [:query :with])))
        (is (= (update before :query dissoc :with :pg-hints)
               (update after :query dissoc :with :pg-hints)))
        (is (= (if all?
                 [[:'IndexScan :t0 :triples_created_at_idx]
                  [:'BitmapScan :t2 :triples_created_at_idx] [:'HashJoin :m-1 :t2]]
                 [[:'IndexScan :t0 :triples_number_type_idx]
                  [:'BitmapScan :t1 :triples_boolean_type_idx]
                  [:'BitmapScan :t3 :triples_created_at_idx]
                  [:'HashJoin :m-2 :t3] [:'HashJoin :m-0 :t1]])
               (filterv #(not= :'Rows (first %)) (get-in after [:query :pg-hints]))))
        (is (= (filterv #(= :'Rows (first %)) (get-in before [:query :pg-hints]))
               (filterv #(= :'Rows (first %)) (get-in after [:query :pg-hints]))))))))

(deftest requires-the-app-and-independent-plan-flag
  (binding [d/*enable-pg-hints* true]
    (doseq [[plan query] queries]
      (let [before (binding [flags/*flag-overrides* {:scoped-query-plans {}}]
                     (compile-query query))]
        (doseq [overrides [nil (enabled (random-uuid) plan)
                          (enabled app-id (if (= plan :seeks-all) :seeks-filtered :seeks-all))
                          {:scoped-query-plans {(str app-id) {(name plan) false}}}]]
          (is (= before (binding [flags/*flag-overrides* overrides] (compile-query query)))))
        (binding [flags/*flag-overrides* (enabled app-id plan)]
          (doseq [kill-switch [:disable-scoped-query-plans :disable-pg-hints]]
            (binding [flags/*toggle-overrides* {kill-switch true}]
              (is (= (binding [flags/*flag-overrides* nil] (compile-query query))
                     (compile-query query)))))
          (binding [d/*enable-pg-hints* false]
            (is (= (binding [flags/*flag-overrides* nil] (compile-query query))
                   (compile-query query)))))))))

(deftest requires-the-entire-query-and-measured-literal-values
  (doseq [[plan query] queries]
    (let [case (compiled-case plan)]
      (binding [flags/*flag-overrides* (enabled app-id plan)]
        (doseq [q [(assoc-in query [:seeks :$ :fields] ["id"])
                   (assoc-in query [:seeks :$ :limit] 100)
                   (assoc-in query [:seeks :$ :order] {:createdAt "desc"})
                   (assoc-in query [:seeks :$ :where :title] "title")
                   (assoc-in query [:seeks :children] {})
                   (assoc query :other {}) nil]]
          (is (unchanged? (assoc case :query q))))
        (let [other-app (random-uuid)]
          (binding [flags/*flag-overrides* (enabled other-app plan)]
            (is (unchanged? (walk/postwalk #(if (= app-id %) other-app %) case))))))))
  (binding [d/*enable-pg-hints* true]
    (doseq [query [(assoc-in (:seeks-filtered queries) [:seeks :$ :where :resultsCount :$gt] 1)
                   (assoc-in (:seeks-filtered queries) [:seeks :$ :where :indexable :$ne] true)]]
      (is (= (binding [flags/*flag-overrides* nil] (compile-query query))
             (binding [flags/*flag-overrides* (enabled app-id :seeks-filtered)]
               (compile-query query)))))))

(deftest requires-the-measured-layout-predicates-and-hints
  (doseq [[plan _] queries]
    (let [case (compiled-case plan)
          fetch-idx (if (= plan :seeks-all) 2 3)]
      (binding [flags/*flag-overrides* (enabled app-id plan)]
        (doseq [change [#(assoc % :attrs nil)
                        #(assoc % :result-tables #{:m-0})
                        #(assoc-in % [:ctes 0 0] :renamed)
                        #(assoc-in % [:ctes 0 1 :from] [[:triples :renamed]])
                        #(assoc-in % [:ctes 0 2] :not-materialized)
                        #(assoc-in % [:ctes fetch-idx 2] :not-materialized)
                        #(update-in % [:ctes 0 1 :select] conj :value)
                        #(assoc-in % [:ctes 0 1 :where 1] [:= :app-id (random-uuid)])
                        #(assoc-in % [:ctes fetch-idx 1 :limit] 10)
                        #(update-in % [:ctes fetch-idx 1 :select] conj :value)
                        #(assoc-in % [:ctes fetch-idx 1 :where 2] [:= :eav :true])
                        #(assoc-in % [:ctes fetch-idx 1 :where 3] [:= :attr-id (java.util.UUID. 81 1)])
                        #(assoc-in % [:ctes fetch-idx 1 :where 4] [:= :entity-id :other-entity-id])
                        #(update-in % [:ctes fetch-idx 1 :where] conj [:= :value "extra"])
                        #(update % :ctes conj [:extra {:select :* :from :m-1} :materialized])
                        #(assoc-in % [:pg-hints 0] [:'IndexScan :t0 :ea_index])
                        #(update % :pg-hints conj [:'NoBitmapScan :t0])]]
          (is (unchanged? (change case))))
        (doseq [hint [:'Leading :'HashJoin :'NestLoop :'MergeJoin
                      :'NoHashJoin :'NoNestLoop :'NoMergeJoin :'Memoize :'NoMemoize]]
          (is (unchanged? (update case :pg-hints conj [hint :m-1 :t2]))))
        (testing "row estimates remain attached to the same joins"
          (let [row-hints (if (= plan :seeks-all)
                            [[:'Rows :m-1 :t2 6000]]
                            [[:'Rows :m-0 :t1 3000] [:'Rows :m-2 :t3 3000]])
                after (apply-plan (assoc case :pg-hints
                                        (into (filterv #(not= :'Rows (first %)) (:pg-hints case))
                                              row-hints)))]
            (is (= row-hints (filterv #(= :'Rows (first %)) (:pg-hints after))))))))))

(deftest filtered-plan-requires-typed-indexes-and-both-entity-bindings
  (let [case (compiled-case :seeks-filtered)]
    (binding [flags/*flag-overrides* (enabled app-id :seeks-filtered)]
      (doseq [change [#(assoc-in % [:ctes 1 1 :select] [:m-0.*])
                      #(assoc-in % [:ctes 1 1 :where 4] [:not= :value false])
                      #(assoc-in % [:ctes 1 1 :where 5] [:= :entity-id :other-entity-id])
                      #(assoc-in % [:ctes 2 1 :where 2] [:= :entity-id :other-entity-id])
                      #(update-in % [:ctes 2 1 :where] conj [:= :attr-id (random-uuid)])
                      #(assoc-in % [:ctes 2 1 :select] [[:entity-id :m-2-entity-id]])]]
        (is (unchanged? (change case))))
      (doseq [field ["resultsCount" "indexable"]
              [k v] [[:index? false] [:cardinality :many] [:value-type :ref]
                     [:checked-data-type :string] [:indexing? true]
                     [:checking-data-type? true] [:deletion-marked-at 1]]]
        (is (unchanged? (update case :attrs
                                #(attr-model/wrap-attrs
                                  (mapv (fn [attr]
                                          (if (= field (last (:forward-identity attr)))
                                            (assoc attr k v) attr)) %)))))))))
