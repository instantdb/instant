(ns instant.db.scoped-query-plans-test
  (:require [clojure.test :refer [deftest is testing]]
            [honey.sql :as hsql]
            [instant.db.datalog :as d]
            [instant.db.scoped-query-plans :as plans]
            [instant.flags :as flags]
            [instant.util.instaql :as instaql-util]
            [instant.util.tracer :as tracer]))

(def status-app #uuid "299e756d-b3e6-41d3-a0ba-d097bfe7e04d")
(def child-app #uuid "ff386052-f839-4d6e-8a62-4c1a6c7a6a01")
(def nullable-app #uuid "52d525f5-afb4-4a7a-9efd-e6791c0bdd6a")
(def user-id (java.util.UUID. 0 1))
(def attr-id (java.util.UUID. 0 2))

(def status-query
  {:projectTasks {:project {}
                  :$ {:where {:assignee.id (str user-id) :status {:$not "complete"}}
                      :order {:updatedAt "desc"} :limit 200}}
   :notifications {:$ {:where {:recipient.id (str user-id) :isRead false}}}})

(def child-query
  {:themes {:$ {:where {:activeDate {:$lte "2026-01-01"}}
                :order {:day "desc"} :limit nil}
            :plays {:$ {:where {:$users (str user-id)}}}
            :titles {:$ {}}}})

(def nullable-query
  {:sales {:$ {:after [(str user-id) (str attr-id) 100 0] :afterInclusive false
               :before [(str user-id) (str attr-id) 200 0] :beforeInclusive true
               :where {:sellerEmail "seller@example.com"
                       :deletedAt {:$isNull true}
                       :and [{:fecha {:$gte "2026-01-01"}}
                             {:fecha {:$lte "2026-02-01"}}]}
               :fields ["clientName" "clientCode" "sellerEmail" "fecha"
                        "timestamp" "products" "total" "periodCode"]
               :order {:timestamp "desc"}}}})

(defn anti-predicate [app-id outer inner]
  [:not-in :entity-id
   {:select (keyword (str (name inner) ".entity-id"))
    :from [[:triples inner]]
    :where [:and
            [:= (keyword (str (name inner) ".app-id")) app-id]
            [:= (keyword (str (name inner) ".entity-id"))
             (keyword (str (name outer) ".entity-id"))]
            [:= (keyword (str (name inner) ".attr-id")) attr-id]
            [:not= (keyword (str (name inner) ".value")) [:cast "null" :jsonb]]]}])

(def status-ctes
  [[:m-2 {:select :entity-id :from [[:triples :t2]]
          :where [:and [:= :app-id status-app] [:= :ea :true]
                  [:= :attr-id attr-id] [:not= :value [:cast "\"complete\"" :jsonb]]]}
    :not-materialized]
   [:m-3 {:select :entity-id :from [[:triples :t3]]
          :where [:and [:= :app-id status-app] [:= :ea :true]
                  (anti-predicate status-app :t3 :t3-subquery)]}
    :materialized]])

(def child-ctes
  [[:m-4 {:select [[[:distinct :m-3-entity-id] :m-4-entity-id]] :from :m-3}
    :materialized]
   [:m-5 {:select [[:entity-id :m-5-entity-id]]
          :from [[:triples :t5] :m-4]
          :where [:and [:= :app-id child-app] [:= :vae :true]
                  [:= :attr-id attr-id]
                  [:= [:json_uuid_to_uuid :value] :m-4-entity-id]]}
    :materialized]
   [:m-6 {:select [:m-5.* [:entity-id :m-6-entity-id]]
          :from [[:triples :t6] :m-5]
          :where [:and [:= :app-id child-app] [:= :eav :true]
                  [:= :attr-id attr-id]
                  [:= [:json_uuid_to_uuid :value] [:cast user-id :uuid]]
                  [:= :entity-id :m-5-entity-id]]}
    :materialized]])

(def nullable-ctes
  [[:m-0 {:select [[:entity-id :m-0-entity-id]] :from [[:triples :t0]]
          :where [:and [:= :app-id nullable-app] [:= :ave :true]]}
    :not-materialized]
   [:m-1 {:select :entity-id :from [[:triples :t1] :m-0]
          :where [:and [:= :app-id nullable-app] [:= :ea :true]
                  [:= :entity-id :m-0-entity-id]
                  (anti-predicate nullable-app :t1 :t1-subquery)]}
    :materialized]])

(def cases
  [{:name :status :app-id status-app :query status-query :ctes status-ctes
    :pg-hints [[:'IndexScan :t2 :triples_created_at_idx]
               [:'IndexScan :t3 :triples_created_at_idx]]
    :expected-hints [[:'IndexScan :t2 :ea_index]
                     [:'IndexScan :t3 :triples_created_at_idx]
                     [:'HashJoin :t3 :t3-subquery]]}
   {:name :child :app-id child-app :query child-query :ctes child-ctes
    :pg-hints [[:'Rows :m-4 :t5 100] [:'IndexScan :t5 :vae_uuid_index]
               [:'Rows :m-5 :t6 10] [:'IndexScan :t6 :triples_pkey]]
    :expected-hints [[:'Rows :m-4 :t5 100] [:'IndexScan :t5 :triples_pkey]
                     [:'Rows :m-5 :t6 10] [:'IndexScan :t6 :vae_uuid_index]
                     [:'Leading :t6 :t5 :m-4] [:'NestLoop :t6 :t5]
                     [:'HashJoin :t6 :t5 :m-4]]}
   {:name :nullable :app-id nullable-app :query nullable-query :ctes nullable-ctes
    :pg-hints [[:'IndexScan :t0 :ave_with_e_index] [:'IndexScan :t1 :ea_index]]
    :expected-hints [[:'IndexScan :t0 :ave_with_e_index] [:'IndexScan :t1 :ea_index]
                     [:'HashJoin :t0 :t1 :t1-subquery]]}])

(defn apply-plan [{:keys [app-id query ctes pg-hints result-tables]}]
  (plans/apply-plan app-id (instaql-util/normalized-forms query)
                    ctes pg-hints (or result-tables #{})))

(defn unchanged? [case]
  (= (select-keys case [:ctes :pg-hints]) (apply-plan case)))

(deftest measured-plans
  (doseq [{:keys [name ctes expected-hints] :as case} cases]
    (testing (str name)
      (let [result (apply-plan case)]
        (is (= expected-hints (:pg-hints result)))
        (if (= name :child)
          (is (= (-> ctes
                     (assoc-in [1 2] :not-materialized)
                     (update-in [2 1 :where] conj [:= :t6.vae :true]))
                 (:ctes result)))
          (is (= ctes (:ctes result))))
        (is (= result (plans/apply-plan (:app-id case)
                                        (instaql-util/normalized-forms (:query case))
                                        (:ctes result) (:pg-hints result) #{})))))))

(deftest scope-and-layout-guards
  (doseq [{:keys [name] :as case} cases]
    (testing (str name)
      (is (unchanged? (assoc case :app-id (random-uuid)))))
    (doseq [change [#(assoc % :query nil)
                    #(update % :query assoc :unexpected {})
                    #(assoc-in % [:ctes 0 2] :other-materialization)
                    #(assoc-in % [:ctes 0 1 :from] [[:triples :renamed]])
                    #(update % :pg-hints conj (first (filter (fn [h] (= :'IndexScan (first h))) (:pg-hints %))))
                    #(update % :pg-hints conj [:'HashJoin :other :tables])
                    #(update % :pg-hints conj [:'Leading :other :tables])
                    #(update % :pg-hints (fn [hints] (vec (remove (fn [h] (= :'IndexScan (first h))) hints))))]]
      (is (unchanged? (change case)) (str name " guard")))))

(deftest child-rewrite-requires-the-measured-reference-join
  (let [case (second cases)]
    (doseq [limit [nil 20]]
      (is (= (:expected-hints case)
             (:pg-hints (apply-plan (assoc-in case [:query :themes :$ :limit] limit))))))
    (is (= (:expected-hints case)
           (:pg-hints (apply-plan (assoc-in case [:pg-hints 3] [:'IndexScan :t6 :eav_uuid_index])))))
    (doseq [changed [(assoc-in case [:query :themes :$ :limit] 1)
                     (assoc-in case [:query :themes :$ :order :day] "asc")
                     (assoc-in case [:query :themes :plays :$ :fields] ["id"])
                     (assoc case :result-tables #{:m-5})
                     (update case :ctes conj [:extra {:select :* :from :m-5} :materialized])
                     (assoc-in case [:ctes 1 1 :limit] 1)
                     (assoc-in case [:ctes 2 1 :where 2] [:= :ea :true])
                     (assoc-in case [:ctes 2 1 :where 4] [:= :value [:cast "\"text\"" :jsonb]])
                     (assoc-in case [:ctes 2 1 :where 5] [:= :entity-id :other-entity-id])]]
      (is (unchanged? changed)))))

(deftest anti-joins-must-still-be-correlated
  (doseq [[case cte-index predicate-index] [[(first cases) 1 3] [(last cases) 1 4]]]
    (doseq [change [#(assoc-in % [:ctes cte-index 1 :where predicate-index 0] :in)
                    #(assoc-in % [:ctes cte-index 1 :where predicate-index 2 :where 2]
                               [:= :unrelated :entity-id])
                    #(assoc-in % [:ctes cte-index 1 :where predicate-index 2 :from]
                               [[:triples :renamed]])]]
      (is (unchanged? (change case))))))

(defn compile-case [{:keys [app-id query ctes pg-hints]}]
  (with-redefs [d/accumulate-nested-match-query
                (fn [& _]
                  {:ctes ctes :pg-hints pg-hints :children {}
                   :result-tables [{:table (ffirst (reverse ctes))}]})]
    (:query (d/nested-match-query
             {:query-normalized (instaql-util/normalized-forms query)}
             :m- app-id {}))))

(deftest switches-disable-both-hints-and-the-child-rewrite
  (doseq [case cases]
    (binding [d/*enable-pg-hints* true]
      (let [compiled (compile-case case)]
        (is (= (:expected-hints case) (:pg-hints compiled)))
        (is (string? (first (hsql/format compiled))))))
    (binding [d/*enable-pg-hints* false]
      (is (= (:ctes case) (:with (compile-case case)))))
    (binding [d/*enable-pg-hints* true]
      (with-redefs [flags/toggled? (fn [flag & [default]]
                                    (if (= :disable-pg-hints flag) true default))]
        (let [compiled (compile-case case)]
          (is (empty? (:pg-hints compiled)))
          (is (= (:ctes case) (:with compiled))))))))

(deftest query-hash-switch-disables-the-child-rewrite
  (let [case (second cases)]
    (with-redefs [flags/flag (fn [flag] (when (= flag :disable-hint-query-hashes) #{42}))
                  flags/toggled? (fn [_ & [default]] default)
                  tracer/add-data! (fn [& _])
                  d/send-query-nested (fn [& _] (compile-case case))]
      (let [compiled (d/query-nested {:app-id child-app :query-hash 42}
                                      '{:children {:pattern-groups
                                                   [{:patterns [[:ea ?e #uuid "00000000-0000-0000-0000-000000000002" _]]}]}})]
        (is (= (:ctes case) (:with compiled)))
        (is (= (:pg-hints case) (:pg-hints compiled)))))))
