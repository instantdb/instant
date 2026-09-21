(ns instant.db.reassign-calendar-child-ids-test
  (:require [clojure.test :refer [deftest is testing]]
            [honey.sql :as hsql]
            [instant.db.attr-sketch :as cms]
            [instant.db.datalog :as d]
            [instant.db.instaql :as iq]
            [instant.db.model.attr :as attr-model]
            [instant.db.scoped-query-plans :as plans]
            [instant.flags :as flags]
            [instant.util.instaql :as instaql-util]
            [instant.util.pg-hint-plan :as pg-hint]
            [instant.util.tracer :as tracer]))

(def measured-app #uuid "19bde4a4-559c-4274-9bba-5e4bff9fcffe")
(def measured-query
  {:sections
   {:$ {:where {:or [{:and [{:date {:$gte "2026-09-01"}}
                           {:date {:$lte "2026-09-30"}}]}
                     {:and [{:recurrenceRule {:$isNull false}}
                            {:date {:$lte "2026-09-30"}}]}
                     {:and [{:exceptionDate {:$gte "2026-09-01"}}
                            {:exceptionDate {:$lte "2026-09-30"}}]}]}}
    :area {} :activityType {} :parent {} :eventLinks {}}})
(def measured-normalized (instaql-util/normalized-forms measured-query))

(def measured-attrs
  (attr-model/wrap-attrs
   (mapv (fn [[n etype label opts]]
           (merge {:id (java.util.UUID. 0 n)
                   :forward-identity [(java.util.UUID. 1 n) etype label]
                   :value-type :blob :cardinality :one
                   :unique? (= label "id") :index? false}
                  opts))
         [[1 "sections" "id" {}]
          [2 "sections" "date" {:index? true :checked-data-type :string}]
          [3 "sections" "recurrenceRule" {:checked-data-type :string}]
          [4 "sections" "exceptionDate" {:index? true :checked-data-type :string}]
          [5 "sections" "area" {:value-type :ref
                                 :reverse-identity [(java.util.UUID. 2 5) "areas" "sections"]}]
          [6 "sections" "activityType" {:value-type :ref
                                         :reverse-identity [(java.util.UUID. 2 6) "activityTypes" "sections"]}]
          [7 "sections" "parent" {:value-type :ref
                                   :reverse-identity [(java.util.UUID. 2 7) "sections" "children"]}]
          [8 "sourceLinks" "section" {:value-type :ref
                                      :reverse-identity [(java.util.UUID. 2 8) "sections" "eventLinks"]}]
          [9 "areas" "id" {}]
          [10 "areas" "name" {}]
          [11 "activityTypes" "id" {}]
          [12 "activityTypes" "name" {}]
          [13 "sourceLinks" "id" {}]
          [14 "sourceLinks" "name" {}]])))

(defn compile-query
  ([app-id q] (compile-query app-id q measured-attrs))
  ([app-id q attrs]
   (let [ctx {:app-id app-id :attrs attrs
              :query-normalized (instaql-util/normalized-forms q)
              :sketches (into {} (map (fn [a]
                                       [{:app-id app-id :attr-id (:id a)}
                                        {:sketch (assoc (cms/make-sketch) :total 2000)}])
                                     attrs))}
         patterns (:patterns (iq/instaql-query->patterns ctx q))
         named (d/annotate-with-hints-impl ctx {} (d/nested->named-patterns patterns))]
     (:query (d/nested-match-query ctx :m- app-id named)))))

(defn baseline [app-id q]
  (with-redefs [plans/apply-plan (fn [_ _ ctes pg-hints _ _]
                                  {:ctes ctes :pg-hints pg-hints})]
    (compile-query app-id q)))

(def result-tables #{:m-6 :m-8 :m-10 :m-12 :m-13 :m-15 :m-16 :m-18 :m-19 :m-21})
(def projected-collector
  {:select [[[:distinct :m-6-entity-id] :m-7-entity-id]] :from :m-6})
(def child-lookup-hints [(pg-hint/leading [:m-7 :t8]) (pg-hint/nest-loop :m-7 :t8)])

(defn with-plan [f]
  (with-redefs [flags/flag (fn [flag & [default]]
                            (if (= flag :scoped-query-plans)
                              {(str measured-app) {"reassign-calendar-child-ids" true}}
                              default))
                flags/toggled? (fn [_ & [default]] default)]
    (binding [d/*enable-pg-hints* true] (f))))

(deftest calendar-projection-changes-only-the-intermediate-collector
  (with-plan
    (fn []
      (let [original (baseline measured-app measured-query)
            before (update original :with vec)
            after (compile-query measured-app measured-query)
            qid [:qid {:select [[[:inline measured-app]] [[:inline -843103532]]]}]]
        (is (= projected-collector (get-in (vec (:with after)) [7 1])))
        (is (= (-> before
                   (assoc-in [:with 7 1] projected-collector)
                   (update :pg-hints into child-lookup-hints))
               after))
        (is (= :materialized (get-in (vec (:with after)) [7 2])))
        (is (= (into (:pg-hints before) child-lookup-hints) (:pg-hints after)))
        (is (= [[:'Leading [:m-7 :t8]] [:'NestLoop :m-7 :t8]] child-lookup-hints))
        (is (re-find #"Leading\(\(m_7 t8\)\)\nNestLoop\(m_7 t8\)"
                     (first (hsql/format after))))
        (is (some #{(pg-hint/index-scan :t8 :ea_index)} (:pg-hints after)))
        ;; send-query-nested adds qid with conj. Keep its position unchanged.
        (is (= :qid (ffirst (:with (update after :with conj qid)))))
        (is (= (hsql/format (update original :with conj qid))
               (hsql/format (-> after
                                (update :with #(vec (conj % qid)))
                                (assoc :pg-hints (:pg-hints before))
                                (assoc-in [:with 8 1] (get-in before [:with 7 1]))))))))))

(deftest calendar-projection-requires-exact-opt-in
  (binding [d/*enable-pg-hints* true]
    (let [before (baseline measured-app measured-query)]
      (doseq [setting [nil {} {(str measured-app) {}}
                       {(str measured-app) {"reassign-calendar-child-ids" false}}
                       {(str measured-app) {"reassign-calendar-child-ids" "true"}}
                       {measured-app {"reassign-calendar-child-ids" true}}]]
        (with-redefs [flags/flag (fn [flag & [default]]
                                  (if (= flag :scoped-query-plans) setting default))
                      flags/toggled? (fn [_ & [default]] default)]
          (is (= before (compile-query measured-app measured-query)))))))
  (with-plan
    (fn []
      (with-redefs [flags/toggled? (fn [flag & [default]]
                                    (if (= flag :disable-scoped-query-plans) true default))]
        (is (= (baseline measured-app measured-query) (compile-query measured-app measured-query)))))))

(deftest calendar-projection-respects-existing-hint-switches
  (with-plan
    (fn []
      (binding [d/*enable-pg-hints* false]
        (is (= (baseline measured-app measured-query) (compile-query measured-app measured-query))))
      (with-redefs [flags/toggled? (fn [flag & [default]]
                                    (if (= flag :disable-pg-hints) true default))]
        (is (= (baseline measured-app measured-query) (compile-query measured-app measured-query))))
      (let [original-flag flags/flag]
        (with-redefs [flags/flag (fn [flag & [default]]
                                  (if (= flag :disable-hint-query-hashes)
                                    #{-843103532}
                                    (original-flag flag default)))
                      tracer/add-data! (fn [& _])
                      d/send-query-nested (fn [& _] (compile-query measured-app measured-query))]
          (is (= (binding [d/*enable-pg-hints* false] (baseline measured-app measured-query))
                 (d/query-nested {:app-id measured-app :query-hash -843103532}
                                 '{:children {:pattern-groups
                                              [{:patterns [[:ea ?e #uuid "00000000-0000-0000-0000-000000000001" _]]}]}}))))))))

(deftest calendar-projection-requires-the-whole-query-and-app
  (with-plan
    (fn []
      (doseq [[label app-id q]
              [[:other-app (random-uuid) measured-query]
               [:missing-child measured-app (update measured-query :sections dissoc :area)]
               [:limit measured-app (assoc-in measured-query [:sections :$ :limit] 10)]
               [:order measured-app (assoc-in measured-query [:sections :$ :order] {:date "asc"})]
               [:fields measured-app (assoc-in measured-query [:sections :$ :fields] ["id"])]
               [:extra-filter measured-app (assoc-in measured-query [:sections :$ :where :date] "2026-09-10")]
               [:is-null measured-app (assoc-in measured-query [:sections :$ :where :or 1 :and 0 :recurrenceRule :$isNull] true)]]]
        (testing (name label)
          (is (= (baseline app-id q) (compile-query app-id q)))))
      (let [q (-> measured-query
                  (assoc-in [:sections :$ :where :or 0 :and 0 :date :$gte] "2030-01-01")
                  (assoc-in [:sections :$ :where :or 1 :and 1 :date :$lte] "2020-01-01"))]
        (is (= projected-collector (get-in (vec (:with (compile-query measured-app q))) [7 1])))))))

(deftest calendar-projection-falls-back-on-compiler-drift
  (with-plan
    (fn []
      (let [{:keys [with pg-hints]} (baseline measured-app measured-query)
            ctes (vec with)
            apply-plan (fn [ctes hints tables]
                         (plans/apply-plan measured-app measured-normalized ctes hints tables measured-attrs))
            where-change (fn [ctes idx f]
                           (update-in ctes [idx 1 :where] #(f (vec %))))]
        (doseq [[label changed]
                (concat
                 [[:missing-cte (pop ctes)]
                  [:duplicate-cte (conj ctes (first ctes))]
                  [:reordered-ctes (assoc ctes 0 (ctes 1) 1 (ctes 0))]
                  [:materialization (assoc-in ctes [0 2] :not-materialized)]
                  [:foreign-app (where-change ctes 0 #(assoc % 1 [:= :app-id (random-uuid)]))]
                  [:foreign-subquery-app (where-change ctes 2 #(assoc-in % [4 2 :where] [:and [:= :app-id (random-uuid)]]))]
                  [:attribute-drift (where-change ctes 1 #(assoc-in % [3 2] (random-uuid)))]
                  [:subquery-null-value (where-change ctes 2 #(update-in % [4 2 :where] (fn [w] (assoc (vec w) 5 [:not= :t2-subquery.value [:cast "false" :jsonb]]))))]
                  [:malformed-where (assoc-in ctes [0 1 :where] true)]
                  [:full-join-not-false (update-in ctes [6 1 :full-join] #(assoc (vec %) 1 [:= :0 :0]))]
                  [:left-join (update-in ctes [6 1] #(-> % (assoc :left-join (:full-join %)) (dissoc :full-join)))]
                  [:gather-filter (assoc-in ctes [6 1 :where] [:= :m-1-entity-id :m-3-entity-id])]
                  [:coalesce-binding (update-in ctes [6 1 :select] #(assoc (vec %) 3 [[:coalesce :m-0-value] :m-6-entity-id]))]
                  [:collector-app (where-change ctes 7 #(assoc % 1 [:= :app-id (random-uuid)]))]
                  [:collector-extra-filter (where-change ctes 7 #(conj % [:= :entity-id (random-uuid)]))]
                  [:collector-limit (assoc-in ctes [7 1 :limit] 10)]
                  [:collector-distinct (assoc-in ctes [7 1 :select] [[:entity-id :m-7-entity-id]])]
                  [:different-consumer (assoc-in ctes [8 1 :from] [[:triples :t8] :m-6])]
                  [:child-select (assoc-in ctes [8 1 :select] [[:entity-id :m-8-entity-id]])]
                  [:child-app (where-change ctes 8 #(assoc-in % [1 2] (random-uuid)))]
                  [:child-index (where-change ctes 8 #(assoc-in % [2 1] :eav))]
                  [:child-attribute-op (where-change ctes 8 #(assoc-in % [3 2 0] :all))]
                  [:child-attribute-vector (where-change ctes 8 #(update-in % [3 2 1] vec))]
                  [:child-attribute-empty (where-change ctes 8 #(assoc-in % [3 2 1] #{}))]
                  [:child-attribute-non-uuid (where-change ctes 8 #(update-in % [3 2 1] conj "invalid"))]
                  [:child-attribute-missing (where-change ctes 8 #(assoc-in % [3 2 1] nil))]
                  [:child-entity-binding (where-change ctes 8 #(assoc-in % [4 2] :m-6-entity-id))]
                  [:child-extra-filter (where-change ctes 8 #(conj % [:= :value [:cast "null" :jsonb]]))]
                  [:child-limit (assoc-in ctes [8 1 :limit] 10)]
                  [:child-order (assoc-in ctes [8 1 :order-by] [:entity-id])]
                  [:child-materialization (assoc-in ctes [8 2] :not-materialized)]
                  [:extra-consumer (assoc-in ctes [9 1 :from] :m-7)]]
                 (for [idx (range 6)]
                   [(keyword (str "branch-select-" idx))
                    (assoc-in ctes [idx 1 :select] [[:value (keyword (str "m-" idx "-entity-id"))]])])
                 (for [idx [1 3 5]]
                   [(keyword (str "branch-join-" idx))
                    (where-change ctes idx #(assoc % 5 [:= :value :m-0-value]))]))]
          (testing (name label)
            (is (= {:ctes changed :pg-hints pg-hints}
                   (apply-plan changed pg-hints result-tables)))))
        (doseq [tables [(conj result-tables :m-7) (disj result-tables :m-6)]]
          (is (= {:ctes ctes :pg-hints pg-hints} (apply-plan ctes pg-hints tables))))
        (let [hints (conj (vec pg-hints) [:'HashJoin :t0 :t1])]
          (is (= {:ctes ctes :pg-hints hints} (apply-plan ctes hints result-tables))))
        (doseq [hints [(vec (remove #{(pg-hint/index-scan :t8 :ea_index)} pg-hints))
                       (conj (vec pg-hints) (pg-hint/index-scan :t8 :ea_index))
                       (mapv #(if (= % (pg-hint/index-scan :t8 :ea_index))
                                (pg-hint/index-scan :t8 :triples_pkey) %) pg-hints)]]
          (is (= {:ctes ctes :pg-hints hints} (apply-plan ctes hints result-tables))))))))

(deftest calendar-projection-preserves-current-child-attributes
  (with-plan
    (fn []
      (let [{:keys [with pg-hints]} (baseline measured-app measured-query)
            attrs (with-meta (set [(random-uuid) (random-uuid)]) {:pgtype "uuid[]"})
            ctes (update-in (vec with) [8 1 :where]
                            #(assoc-in (vec %) [3 2 1] attrs))
            after (plans/apply-plan measured-app measured-normalized ctes pg-hints result-tables measured-attrs)
            after-ctes (vec (:ctes after))]
        (is (= projected-collector (get-in after-ctes [7 1])))
        (is (= (ctes 8) (after-ctes 8)))
        (is (identical? attrs (get-in (vec (get-in after-ctes [8 1 :where])) [3 2 1])))
        (is (= (into pg-hints child-lookup-hints) (:pg-hints after)))))))

(deftest calendar-projection-preserves-schema-dependent-compilation
  (with-plan
    (fn []
      (let [compile (fn [attrs enabled?]
                      (if enabled?
                        (compile-query measured-app measured-query attrs)
                        (with-redefs [plans/apply-plan (fn [_ _ ctes pg-hints _ _]
                                                        {:ctes ctes :pg-hints pg-hints})]
                          (compile-query measured-app measured-query attrs))))]
        (doseq [[label attrs]
                [[:typed-date (attr-model/wrap-attrs
                              (mapv #(if (= "date" (nth (:forward-identity %) 2))
                                       (assoc % :checked-data-type :date) %)
                                    measured-attrs))]
                 [:indexed-recurrence (attr-model/wrap-attrs
                                      (mapv #(if (= "recurrenceRule" (nth (:forward-identity %) 2))
                                               (assoc % :index? true) %)
                                            measured-attrs))]]]
          (testing (name label)
            (is (= (compile attrs false) (compile attrs true)))))
        (let [attrs (attr-model/wrap-attrs
                     (mapv #(if (= "date" (nth (:forward-identity %) 2))
                              (assoc % :cardinality :many) %)
                           measured-attrs))
              before (update (compile attrs false) :with vec)
              after (compile attrs true)]
          (is (= projected-collector (get-in (vec (:with after)) [7 1])))
          (is (= (-> before
                     (assoc-in [:with 7 1] projected-collector)
                     (update :pg-hints into child-lookup-hints))
                 after)))))))
