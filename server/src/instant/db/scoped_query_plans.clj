(ns instant.db.scoped-query-plans
  (:require [clojure.set :as set]
            [instant.flags :as flags]
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

(defn reuse-bound-child-entities? [app-id normalized]
  (and (= app-id #uuid "ff386052-f839-4d6e-8a62-4c1a6c7a6a01")
       (= normalized {:plays {:$ {:where {:themes :string, :finished :boolean}}}})))

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

(defn- numeric-range [app-id normalized ctes pg-hints result-tables attrs]
  (let [[[_ lower-query] [_ upper-query]] ctes
        lower-predicate (last (:where lower-query))
        upper-predicate (nth (:where upper-query) 4 nil)
        lower (get-in lower-predicate [1 2])
        upper (get-in upper-predicate [1 2])
        attr-id (some (fn [[op column value]]
                        (when (and (= op :=) (= column :attr-id)) value))
                      (filter vector? (conjuncts lower-query)))
        attr (some #(when (= attr-id (:id %)) %) attrs)
        numeric-type [:= :checked_data_type [:cast [:inline "number"] :checked_data_type]]
        base #{[:= :app-id app-id] [:= :ave :true] [:= :attr-id attr-id]}]
    (when (and (= normalized
                  {:Prices {:$ {:where {:and [{:timestamp {:$gt :number}}
                                             {:timestamp {:$lt :number}}]}
                                :order {:timestamp "asc"} :limit 1000}}})
               (scans? pg-hints [(pg-hint/index-scan :t0 :triples_number_type_idx)
                                 (pg-hint/index-scan :t1 :triples_pkey)
                                 (pg-hint/bitmap-scan :t2 :triples_pkey)])
               (layout? ctes [[:m-0 [[:triples :t0]] :not-materialized]
                              [:m-1 [[:triples :t1] :m-0] :not-materialized]
                              [:m-2-with-next [[:triples :t2] :m-1] :materialized]])
               (not (contains? result-tables :m-0))
               (= 2 (count (filter #{:m-0} (tree-seq coll? seq ctes))))
               (= #{:select :from :where} (set (keys lower-query)) (set (keys upper-query)))
               (uuid? attr-id)
               (= :one (:cardinality attr))
               (= :blob (:value-type attr))
               (= :number (:checked-data-type attr))
               (number? lower) (number? upper) (< lower upper)
               (= lower-predicate [:and [:> [:triples_extract_number_value :value] lower]
                                    numeric-type])
               (= upper-predicate [:and [:< [:triples_extract_number_value :value] upper]
                                    numeric-type])
               (= (conj base lower-predicate) (conjuncts lower-query))
               (= (conj base upper-predicate [:= :entity-id :m-0-entity-id])
                  (conjuncts upper-query)))
      ;; Both filters read the same single-valued attribute. Its upper bound
      ;; can also constrain the first index scan, before the entity lookups.
      ;; Retain the second filter and all result/pagination CTEs.
      {:ctes (update-in (vec ctes) [0 1 :where] #(conj (vec %) upper-predicate))
       :pg-hints pg-hints})))

(defn- numeric-upper-bound [app-id normalized ctes pg-hints result-tables attrs]
  (let [[[_ bound-query] [_ order-query]] ctes
        predicate (last (:where bound-query))
        upper (get-in predicate [1 2])
        attr-id (some (fn [[op column value]]
                        (when (and (= op :=) (= column :attr-id)) value))
                      (filter vector? (conjuncts bound-query)))
        attr (some #(when (= attr-id (:id %)) %) attrs)
        numeric-type [:= :checked_data_type [:cast [:inline "number"] :checked_data_type]]
        base #{[:= :app-id app-id] [:= :ave :true] [:= :attr-id attr-id]}]
    (when (and (= normalized
                  {:Prices {:$ {:where {:timestamp {:$lt :number}}
                                :order {:timestamp "asc"} :limit 200}}})
               (scans? pg-hints [(pg-hint/index-scan :t0 :triples_pkey)
                                 (pg-hint/index-scan :t1 :triples_number_type_idx)])
               (= 1 (count (filter #{:t1} (tree-seq coll? seq pg-hints))))
               (not-any? #{:upper-bound-match :t-upper-bound-match}
                         (tree-seq coll? seq [ctes pg-hints]))
               (= [:m-0 :m-1-with-next] (mapv first (take 2 ctes)))
               (layout? ctes [[:m-0 [[:triples :t0]] :not-materialized]
                              [:m-1-with-next [[:triples :t1] :m-0] :materialized]])
               (not (contains? result-tables :m-0))
               (= 2 (count (filter #{:m-0} (tree-seq coll? seq ctes))))
               (= #{:select :from :where} (set (keys bound-query)))
               (= #{:from :where :select-distinct-on :order-by :limit}
                  (set (keys order-query)))
               (= [[:entity-id :m-0-entity-id] [:attr-id :m-0-attr-id]
                   [:value :m-0-value] [:eav :m-0-is-ref-val]
                   [:created-at :m-0-created-at]]
                  (:select bound-query))
               (= [[:order-val :order-eid]
                   [[:triples_extract_number_value :value] :order-val]
                   [:entity-id :order-eid] :m-0.*
                   [:entity-id :m-1-entity-id] [:attr-id :m-1-attr-id]
                   [:value :m-1-value] [:eav :m-1-is-ref-val]
                   [:created-at :m-1-created-at]]
                  (:select-distinct-on order-query))
               (uuid? attr-id)
               (= :one (:cardinality attr))
               (= :blob (:value-type attr))
               (= :number (:checked-data-type attr))
               (:index? attr)
               (number? upper)
               (= predicate [:and [:< [:triples_extract_number_value :value] upper]
                             numeric-type])
               (= (conj base predicate) (conjuncts bound-query))
               (= (:where order-query)
                  (list :and numeric-type
                        (list :and [:= :app-id app-id] [:= :ave :true]
                              [:= :attr-id attr-id] [:= :entity-id :m-0-entity-id])))
               (= [[:order-val :asc-nulls-first :asc] [:order-eid :asc]]
                  (:order-by order-query))
               (= 201 (:limit order-query)))
      ;; The join can only produce rows if its filter matches something.
      ;; Check that range once so an empty query skips the full ordering scan.
      {:ctes (into [[:upper-bound-match
                     (assoc bound-query :select [[[:inline 1] :matched]]
                            :from [[:triples :t-upper-bound-match]] :limit 1)
                     :materialized]]
                   (update-in (vec ctes) [1 1 :where]
                              #(vector :and % [:exists {:select :* :from :upper-bound-match}])))
       :pg-hints (conj (vec pg-hints)
                       (pg-hint/index-scan :t-upper-bound-match :triples_number_type_idx))})))

(defn- reassign-calendar-child-ids [app-id normalized ctes pg-hints result-tables]
  (when (and (not (flags/toggled? :disable-scoped-query-plans))
             (true? (get-in (flags/flag :scoped-query-plans)
                            [(str app-id) "reassign-calendar-child-ids"]))
             (= normalized
                {:sections
                 {:$ {:where {:or [{:and [{:date {:$gte :string}} {:date {:$lte :string}}]}
                                   {:and [{:recurrenceRule {:$isNull :boolean}} {:date {:$lte :string}}]}
                                   {:and [{:exceptionDate {:$gte :string}} {:exceptionDate {:$lte :string}}]}]}}
                  :area {} :activityType {} :parent {} :eventLinks {}}}))
    (let [ctes (vec ctes)
          [[_ q0] [_ q1] [_ q2] [_ q3] [_ q4] [_ q5]] ctes
          where-vec (fn [query] (when (sequential? (:where query)) (vec (:where query))))
          [w0 w1 w2 w3 w4 w5] (mapv where-vec [q0 q1 q2 q3 q4 q5])
          date-id (get-in w0 [3 2])
          id-attr (get-in w2 [3 2])
          recurrence-id (get-in (where-vec (get-in w2 [4 2])) [3 2])
          exception-id (get-in w4 [3 2])
          child-attrs (get-in (where-vec (get-in ctes [8 1])) [3 2 1])
          bounds (mapv #(get-in % [4 2 1]) [w0 w1 w3 w4 w5])
          [date-lower date-upper recurrence-upper exception-lower exception-upper] bounds
          base (fn [index attr-id]
                 [[:= :app-id app-id] [:= index :true] [:= :attr-id attr-id]])
          scan (fn [idx previous where]
                 (let [table (str "m-" idx)]
                   {:select (concat (when previous [(keyword (str (name previous) ".*"))])
                                    (mapv (fn [[column suffix]]
                                            [column (keyword (str table suffix))])
                                          [[:entity-id "-entity-id"] [:attr-id "-attr-id"]
                                           [:value "-value"] [:eav "-is-ref-val"]
                                           [:created-at "-created-at"]]))
                    :from (cond-> [[:triples (keyword (str "t" idx))]] previous (conj previous))
                    :where (into [:and] where)}))
          range-scan (fn [idx previous attr-id op bound]
                       (scan idx previous
                             (cond-> (conj (base :ave attr-id) [op :value [:cast bound :jsonb]])
                               previous (conj [:= :entity-id (keyword (str (name previous) "-entity-id"))]))))
          expected
          [(range-scan 0 nil date-id :>= date-lower)
           (range-scan 1 :m-0 date-id :<= date-upper)
           (scan 2 nil
                 (conj (base :ea id-attr)
                       [:in :entity-id
                        {:select :t2-subquery.entity-id
                         :from [[:triples :t2-subquery]]
                         :where [:and [:= :t2-subquery.app-id app-id]
                                 [:= :t2-subquery.entity-id :t2.entity-id]
                                 [:= :t2-subquery.attr-id recurrence-id]
                                 nil [:not= :t2-subquery.value [:cast "null" :jsonb]]]}]))
           (range-scan 3 :m-2 date-id :<= recurrence-upper)
           (range-scan 4 nil exception-id :>= exception-lower)
           (range-scan 5 :m-4 exception-id :<= exception-upper)
           {:select [:m-1.* :m-3.* :m-5.*
                     [[:coalesce :m-1.m-1-entity-id :m-3.m-3-entity-id :m-5.m-5-entity-id]
                      :m-6-entity-id]]
            :from :m-1
            :full-join [:m-3 [:= :0 :1] :m-5 [:= :0 :1]]}
           {:select [[[:distinct :entity-id] :m-7-entity-id]]
            :from [:triples :m-6]
            :where [:and [:= :app-id app-id]
                    [:or [:and [:= :entity-id :m-4-entity-id] [:= :entity-id :m-5-entity-id]]
                     [:and [:or [:and [:= :entity-id :m-0-entity-id] [:= :entity-id :m-1-entity-id]]
                            [:and [:= :entity-id :m-2-entity-id] [:= :entity-id :m-3-entity-id]]]]]]}
           (assoc (scan 8 nil
                        (conj (base :ea [:any child-attrs]) [:= :entity-id :m-7-entity-id]))
                  :from [[:triples :t8] :m-7])]]
      (when (and (every? uuid? [date-id id-attr recurrence-id exception-id])
                 (set? child-attrs) (seq child-attrs) (every? uuid? child-attrs)
                 (every? string? bounds)
                 (scans? pg-hints [(pg-hint/index-scan :t8 :ea_index)])
                 (= (mapv #(keyword (str "m-" %)) (range 22)) (mapv first ctes))
                 (= (mapv #(vector (keyword (str "m-" %1)) %2 :materialized)
                          (range 9) expected)
                    (subvec ctes 0 (min 9 (count ctes))))
                 (= #{:m-6 :m-8 :m-10 :m-12 :m-13 :m-15 :m-16 :m-18 :m-19 :m-21}
                    result-tables)
                 (= 2 (count (filter #{:m-7} (tree-seq coll? seq ctes)))))
        ;; Each false full join row contains one branch's same-app entity.
        ;; Its two bindings are equal and already came from triples, so the
        ;; collector's extra existence scan only multiplies rows before DISTINCT.
        {:ctes (seq (assoc-in ctes [7 1]
                              {:select [[[:distinct :m-6-entity-id] :m-7-entity-id]]
                               :from :m-6}))
         ;; Keep the selected entities outside the parameterized ea_index lookup.
         :pg-hints (into (vec pg-hints) [(pg-hint/leading [:m-7 :t8])
                                       (pg-hint/nest-loop :m-7 :t8)])}))))

(defn apply-plan [app-id normalized ctes pg-hints result-tables attrs]
  (or (when (not-any? #(contains? #{:'Leading :'HashJoin :'NestLoop :'MergeJoin
                                   :'NoHashJoin :'NoNestLoop :'NoMergeJoin}
                                 (first %))
                     pg-hints)
        (case app-id
          #uuid "19bde4a4-559c-4274-9bba-5e4bff9fcffe"
          (reassign-calendar-child-ids app-id normalized ctes pg-hints result-tables)

          #uuid "299e756d-b3e6-41d3-a0ba-d097bfe7e04d"
          (status-filter app-id normalized ctes pg-hints)

          #uuid "ff386052-f839-4d6e-8a62-4c1a6c7a6a01"
          (filtered-child app-id normalized ctes pg-hints result-tables)

          #uuid "52d525f5-afb4-4a7a-9efd-e6791c0bdd6a"
          (nullable-filter app-id normalized ctes pg-hints)

          #uuid "1c436238-c543-44d0-9a6b-51f7e5b840e3"
          (or (numeric-range app-id normalized ctes pg-hints result-tables attrs)
              (numeric-upper-bound app-id normalized ctes pg-hints result-tables attrs))

          nil))
      {:ctes ctes :pg-hints pg-hints}))
