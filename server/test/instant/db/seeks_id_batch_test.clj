(ns instant.db.seeks-id-batch-test
  (:require [clojure.test :refer [deftest is testing]]
            [honey.sql :as hsql]
            [instant.db.attr-sketch :as cms]
            [instant.db.datalog :as d]
            [instant.db.instaql :as iq]
            [instant.db.model.attr :as attr-model]
            [instant.db.scoped-query-plans :as plans]
            [instant.flags :as flags]
            [instant.util.instaql :as instaql-util]))

(def app-id #uuid "8ad982d7-09bc-45bd-83c4-8d56ebf32286")

(def attrs
  (attr-model/wrap-attrs
   (mapv (fn [n field]
           {:id (java.util.UUID. 0 n)
            :forward-identity [(java.util.UUID. 1 n) "seeks" field]
            :value-type :blob :cardinality :one
            :index? false :unique? (= field "id")})
         [1 2 3] ["id" "title" "body"])))

(defn make-query [ids]
  {:seeks {:$ {:where {:id {:$in ids}}}}})

(defn ids [n]
  (mapv #(str (java.util.UUID. 2 %)) (range n)))

(def query (make-query (ids 2261)))

(defn enabled [app-id]
  {:scoped-query-plans {(str app-id) {"seeks-id-batch" true}}})

(defn compile-query
  ([q] (compile-query attrs q))
  ([attrs q]
   (let [ctx {:app-id app-id :attrs attrs
              :query-normalized (instaql-util/normalized-forms q)
              :sketches (into {} (map (fn [a]
                                       [{:app-id app-id :attr-id (:id a)}
                                        {:sketch (assoc (cms/make-sketch) :total 1000000)}])
                                     attrs))}
         patterns (:patterns (iq/instaql-query->patterns ctx q))
         named (d/annotate-with-hints-impl ctx {} (d/nested->named-patterns patterns))]
     (d/nested-match-query ctx :m- app-id named))))

(defn apply-plan [{:keys [app-id query ctes pg-hints]}]
  (plans/apply-plan app-id (instaql-util/normalized-forms query)
                    ctes pg-hints #{:m-0 :m-2} attrs))

(defn unchanged? [case]
  (= (select-keys case [:ctes :pg-hints]) (apply-plan case)))

(defn compiled-case []
  (let [compiled (binding [d/*enable-pg-hints* true
                          flags/*flag-overrides* {:scoped-query-plans {}}]
                   (:query (compile-query query)))]
    {:app-id app-id :query query
     :ctes (mapv (fn [[table q materialized]]
                   [table (cond-> q
                            (:where q) (update :where vec)) materialized])
                 (:with compiled))
     :pg-hints (:pg-hints compiled)}))

(deftest batches-only-the-final-entity-fetch
  (binding [d/*enable-pg-hints* true]
    (doseq [n [1000 2261 3000]]
      (let [q (make-query (ids n))
            before (compile-query q)
            after (binding [flags/*flag-overrides* (enabled app-id)] (compile-query q))
            before-ctes (vec (get-in before [:query :with]))
            after-ctes (vec (get-in after [:query :with]))]
        (is (= [:'IndexScan :t0 :av_index] (first (get-in before [:query :pg-hints]))))
        (is (= [:'BitmapScan :t2 :ea_index] (last (get-in after [:query :pg-hints]))))
        (is (= (subvec before-ctes 0 2) (subvec after-ctes 0 2)))
        (is (= [[:triples :t2]] (get-in after-ctes [2 1 :from])))
        (is (= (get-in before-ctes [2 1 :select]) (get-in after-ctes [2 1 :select])))
        (is (= [:= :entity-id [:any [:array {:select [:m-1-entity-id] :from :m-1}]]]
               (last (get-in after-ctes [2 1 :where]))))
        (is (= (butlast (get-in before-ctes [2 1 :where]))
               (butlast (get-in after-ctes [2 1 :where]))))
        (is (= (update before :query dissoc :with :pg-hints)
               (update after :query dissoc :with :pg-hints)))
        (is (re-find #"entity_id = ANY\(ARRAY\(SELECT m_1_entity_id FROM m_1\)\)"
                     (first (hsql/format (:query after)))))))))

(deftest scoped-to-the-app-flag-and-id-list-shape
  (binding [d/*enable-pg-hints* true]
    (let [before (compile-query query)]
      (doseq [overrides [nil
                        (enabled (random-uuid))
                        {:scoped-query-plans {(str app-id) {"seeks-id-batch" false}}}]]
        (is (= before (binding [flags/*flag-overrides* overrides] (compile-query query))))))
    (binding [flags/*flag-overrides* (enabled app-id)]
      (doseq [kill-switch [:disable-scoped-query-plans :disable-pg-hints]]
        (binding [flags/*toggle-overrides* {kill-switch true}]
          (is (= (binding [flags/*flag-overrides* nil] (compile-query query))
                 (compile-query query)))))
      (binding [d/*enable-pg-hints* false]
        (is (= (binding [flags/*flag-overrides* nil] (compile-query query))
               (compile-query query))))))
  (binding [flags/*flag-overrides* (enabled app-id)]
    (let [case (compiled-case)]
      (is (unchanged? (assoc case :app-id (random-uuid))))
      (let [other-app (random-uuid)]
        (binding [flags/*flag-overrides* (enabled other-app)]
          (is (unchanged? (assoc case :app-id other-app)))))
      (doseq [q [(make-query (ids 999))
                 (make-query (ids 3001))
                 (make-query (conj (ids 1000) (random-uuid)))
                 (assoc-in query [:seeks :$ :fields] ["id"])
                 (assoc-in query [:seeks :$ :order] {:id "asc"})
                 (assoc-in query [:seeks :$ :limit] 100)
                 (assoc-in query [:seeks :$ :where :title] "title")
                 (assoc-in query [:seeks :children] {})
                 (assoc query :other {})
                 nil]]
        (is (unchanged? (assoc case :query q)))))))

(deftest requires-the-measured-ctes-predicates-and-hints
  (let [case (compiled-case)]
    (binding [flags/*flag-overrides* (enabled app-id)]
      (doseq [change [#(assoc-in % [:ctes 0 0] :renamed)
                      #(assoc-in % [:ctes 0 1 :from] [[:triples :renamed]])
                      #(assoc-in % [:ctes 0 2] :not-materialized)
                      #(assoc-in % [:ctes 1 1 :select] [[:m-0-entity-id :m-1-entity-id]])
                      #(assoc-in % [:ctes 1 1 :where] [:= :m-0-entity-id (random-uuid)])
                      #(assoc-in % [:ctes 2 1 :from] [[:triples :t2] :other])
                      #(update-in % [:ctes 2 1 :select] conj :m-1.*)
                      #(assoc-in % [:ctes 2 1 :limit] 10)
                      #(assoc-in % [:ctes 2 1 :where 1] [:= :app-id (random-uuid)])
                      #(assoc-in % [:ctes 2 1 :where 2] [:= :eav :true])
                      #(assoc-in % [:ctes 2 1 :where 3] [:= :attr-id (java.util.UUID. 0 1)])
                      #(assoc-in % [:ctes 2 1 :where 4] [:= :entity-id :other-entity-id])
                      #(update-in % [:ctes 2 1 :where] conj [:= :value "other"])
                      #(update % :ctes conj [:extra {:select :* :from :m-1} :materialized])
                      #(assoc-in % [:pg-hints 0] [:'IndexScan :t0 :ave_with_e_index])
                      #(update % :pg-hints conj [:'IndexScan :t2 :triples_pkey])
                      #(update % :pg-hints conj [:'NoBitmapScan :t2])
                      #(update % :pg-hints (fn [hints] (vec (remove (fn [h] (= :'IndexScan (first h))) hints))))]]
        (is (unchanged? (change case))))
      (doseq [hint [:'Leading :'HashJoin :'NestLoop :'MergeJoin
                    :'NoHashJoin :'NoNestLoop :'NoMergeJoin :'Memoize :'NoMemoize]]
        (is (unchanged? (update case :pg-hints conj [hint :m-1 :t2]))))
      (testing "the rewrite removes only its obsolete join row estimate"
        (let [extra [[:'Rows :m-1 :t2 2261] [:'Rows :other :table 1]
                     [:'Rows :m-1 :t2 :other 1]]
              result (apply-plan (update case :pg-hints into extra))]
          (is (= [[:'IndexScan :t0 :av_index] [:'BitmapScan :t2 :ea_index]
                  [:'Rows :other :table 1] [:'Rows :m-1 :t2 :other 1]]
                 (:pg-hints result)))
          (is (= result (plans/apply-plan app-id (instaql-util/normalized-forms query)
                                         (:ctes result) (:pg-hints result) #{:m-0 :m-2} attrs))))))))
