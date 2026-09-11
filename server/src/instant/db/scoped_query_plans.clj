(ns instant.db.scoped-query-plans
  (:require [clojure.set :as set]
            [instant.util.pg-hint-plan :as pg-hint]))

;; These overrides are scoped to measured query shapes. A different layout or
;; scan choice falls back to the normal planner, including sparse lookups.
(defn- scans? [pg-hints expected]
  (let [tables (set (map second expected))]
    (= (frequencies expected)
       (frequencies (filter (fn [[_ table]] (contains? tables table))
                            pg-hints)))))

(defn- layout? [ctes expected]
  (= expected
     (mapv (fn [[table query materialized]]
             [table (:from query) materialized])
           (filter (comp (set (map first expected)) first) ctes))))

(defn- conjuncts [query]
  (when (= :and (first (:where query)))
    (set (rest (:where query)))))

(defn- anti-join? [query app-id outer inner]
  (some (fn [[op column subquery]]
          (and (= op :not-in)
               (= column :entity-id)
               (= (keyword (str (name inner) ".entity-id")) (:select subquery))
               (= [[:triples inner]] (:from subquery))
               (set/subset?
                #{[:= (keyword (str (name inner) ".app-id")) app-id]
                  [:= (keyword (str (name inner) ".entity-id"))
                   (keyword (str (name outer) ".entity-id"))]}
                (conjuncts subquery))))
        (filter vector? (conjuncts query))))

(defn- status-filter [app-id normalized ctes pg-hints]
  (when (and (= normalized
                {:projectTasks
                 {:project {}
                  :$ {:where {:assignee.id :string, :status {:$not :string}}
                      :order {:updatedAt "desc"}
                      :limit 200}}
                 :notifications
                 {:$ {:where {:recipient.id :string, :isRead :boolean}}}})
             (scans? pg-hints [(pg-hint/index-scan :t2 :triples_created_at_idx)
                               (pg-hint/index-scan :t3 :triples_created_at_idx)])
             (layout? ctes [[:m-2 [[:triples :t2]] :not-materialized]
                            [:m-3 [[:triples :t3]] :materialized]])
             (let [{filter-query :m-2 null-query :m-3}
                   (into {} (map (fn [[table query]] [table query]) ctes))]
               (and (set/subset? #{[:= :app-id app-id] [:= :ea :true]}
                                 (conjuncts filter-query))
                    (some #(and (= :not= (first %)) (= :value (second %)))
                          (filter vector? (conjuncts filter-query)))
                    (anti-join? null-query app-id :t3 :t3-subquery))))
    {:ctes ctes
     :pg-hints (conj (mapv #(if (= % (pg-hint/index-scan :t2 :triples_created_at_idx))
                             (pg-hint/index-scan :t2 :ea_index)
                             %)
                          pg-hints)
                     (pg-hint/hash-join :t3 :t3-subquery))}))

(defn- filtered-child [app-id normalized ctes pg-hints result-tables]
  (when (and (contains? #{nil 20} (get-in normalized [:themes :$ :limit]))
             (= (assoc-in normalized [:themes :$ :limit] nil)
                {:themes
                 {:$ {:where {:activeDate {:$lte :string}}
                      :order {:day "desc"}
                      :limit nil}
                  :plays {:$ {:where {:$users :string}}}
                  :titles {:$ {}}}})
             (or (scans? pg-hints [(pg-hint/index-scan :t5 :vae_uuid_index)
                                   (pg-hint/index-scan :t6 :triples_pkey)])
                 (scans? pg-hints [(pg-hint/index-scan :t5 :vae_uuid_index)
                                   (pg-hint/index-scan :t6 :eav_uuid_index)]))
             (layout? ctes [[:m-4 :m-3 :materialized]
                            [:m-5 [[:triples :t5] :m-4] :materialized]
                            [:m-6 [[:triples :t6] :m-5] :materialized]])
             (not (contains? result-tables :m-5))
             ;; Only m-6 consumes this intermediate CTE. Keep result CTEs
             ;; materialized so pagination and result collection run once.
             (= 2 (count (filter #{:m-5} (tree-seq coll? seq ctes))))
             (let [{parent :m-4 link :m-5 child :m-6}
                   (into {} (map (fn [[table query]] [table query]) ctes))]
               (and (= parent {:select [[[:distinct :m-3-entity-id] :m-4-entity-id]]
                               :from :m-3})
                    (= #{:select :from :where} (set (keys link)) (set (keys child)))
                    (set/subset? #{[:= :app-id app-id] [:= :vae :true]
                                   [:= [:json_uuid_to_uuid :value] :m-4-entity-id]}
                                 (conjuncts link))
                    (set/subset? #{[:= :app-id app-id] [:= :eav :true]
                                   [:= :entity-id :m-5-entity-id]}
                                 (conjuncts child))
                    (some (fn [[op column [cast value type]]]
                            (and (= op :=) (= column [:json_uuid_to_uuid :value])
                                 (= cast :cast) (uuid? value) (= type :uuid)))
                          (filter #(and (vector? %) (vector? (nth % 2 nil)))
                                  (conjuncts child))))))
    {:ctes (mapv (fn [[table :as cte]]
                   (case table
                     :m-5 (assoc cte 2 :not-materialized)
                     ;; Reference triples set both eav and vae. Making vae
                     ;; explicit lets Postgres use the partial value index.
                     :m-6 (update-in cte [1 :where]
                                      #(conj (vec %) [:= :t6.vae :true]))
                     cte))
                 ctes)
     :pg-hints (into (mapv (fn [hint]
                            (cond
                              (= hint (pg-hint/index-scan :t5 :vae_uuid_index))
                              (pg-hint/index-scan :t5 :triples_pkey)

                              (contains? #{(pg-hint/index-scan :t6 :triples_pkey)
                                           (pg-hint/index-scan :t6 :eav_uuid_index)}
                                         hint)
                              (pg-hint/index-scan :t6 :vae_uuid_index)

                              :else hint))
                          pg-hints)
                     [(pg-hint/leading :t6 :t5 :m-4)
                      (pg-hint/nest-loop :t6 :t5)
                      (pg-hint/hash-join :t6 :t5 :m-4)])}))

(defn- nullable-filter [app-id normalized ctes pg-hints]
  (when (and (= normalized
                {:sales
                 {:$ {:after :cursor :afterInclusive false
                      :before :cursor :beforeInclusive true
                      :where {:sellerEmail :string
                              :deletedAt {:$isNull :boolean}
                              :and [{:fecha {:$gte :string}}
                                    {:fecha {:$lte :string}}]}
                      :fields ["clientName" "clientCode" "sellerEmail" "fecha"
                               "timestamp" "products" "total" "periodCode"]
                      :order {:timestamp "desc"}}}})
             (scans? pg-hints [(pg-hint/index-scan :t0 :ave_with_e_index)
                               (pg-hint/index-scan :t1 :ea_index)])
             (layout? ctes [[:m-0 [[:triples :t0]] :not-materialized]
                            [:m-1 [[:triples :t1] :m-0] :materialized]])
             (let [[[_ first-query] [_ null-query]] ctes]
               (and (contains? (conjuncts first-query) [:= :ave :true])
                    (contains? (conjuncts null-query) [:= :entity-id :m-0-entity-id])
                    ;; Normalization erases the boolean value of $isNull.
                    ;; Only its missing/null branch has this anti join.
                    (anti-join? null-query app-id :t1 :t1-subquery))))
    {:ctes ctes
     :pg-hints (conj (vec pg-hints) (pg-hint/hash-join :t0 :t1 :t1-subquery))}))

(defn apply-plan [app-id normalized ctes pg-hints result-tables]
  (or (when (not-any? #(contains? #{:'Leading :'HashJoin :'NestLoop :'MergeJoin
                                   :'NoHashJoin :'NoNestLoop :'NoMergeJoin}
                                 (first %))
                     pg-hints)
        (case app-id
          #uuid "299e756d-b3e6-41d3-a0ba-d097bfe7e04d"
          (status-filter app-id normalized ctes pg-hints)

          #uuid "ff386052-f839-4d6e-8a62-4c1a6c7a6a01"
          (filtered-child app-id normalized ctes pg-hints result-tables)

          #uuid "52d525f5-afb4-4a7a-9efd-e6791c0bdd6a"
          (nullable-filter app-id normalized ctes pg-hints)

          nil))
      {:ctes ctes :pg-hints pg-hints}))
