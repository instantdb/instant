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

(defn- numeric-range-page-query?
  "{etype {:$ {:where {:and [{attr {:$gt :number}} {attr {:$lte :number}}]}
               :order {attr \"asc\"} :first n :after :cursor}}}
   The first page has no :after. Either bound can be inclusive."
  [normalized]
  (when (and (map? normalized) (= 1 (count normalized)))
    (let [form (val (first normalized))
          {:keys [where order after] limit :first :as opts} (:$ form)
          [lower upper] (:and where)]
      (and (= #{:$} (set (keys form)))
           (contains? #{#{:where :order :first} #{:where :order :first :after}}
                      (set (keys opts)))
           (contains? #{nil :cursor} after)
           (pos-int? limit)
           (= #{:and} (set (keys where)))
           (= 2 (count (:and where)))
           (map? lower) (= 1 (count lower))
           (map? upper) (= 1 (count upper))
           (= (ffirst lower) (ffirst upper))
           (contains? #{{:$gt :number} {:$gte :number}} (val (first lower)))
           (contains? #{{:$lt :number} {:$lte :number}} (val (first upper)))
           (= order {(ffirst lower) "asc"})))))

(defn- numeric-range-page? [app-id normalized]
  (and (flags/scoped-query-plan-enabled? app-id :numeric-range-page)
       (numeric-range-page-query? normalized)))

(defn reuse-bound-child-entities? [app-id normalized]
  (or (and (= app-id #uuid "ff386052-f839-4d6e-8a62-4c1a6c7a6a01")
           (= normalized {:plays {:$ {:where {:themes :string, :finished :boolean}}}}))
      (boolean (numeric-range-page? app-id normalized))))

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

(defn- order-by-first-scan
  "Both page queries order by the value and entity of t2. For a single-valued
   attribute that is the same triple as t0, and ordering by t0's columns lets
   the limit stop the index scan early instead of sorting every match."
  [query]
  (let [number-value [:triples_extract_number_value :value]
        selects (:select-distinct-on query)]
    (when (and (some #{[number-value :order-val]} selects)
               (some #{[:entity-id :order-eid]} selects))
      (assoc query :select-distinct-on
             (map (fn [select]
                    (condp = select
                      [number-value :order-val] [[:triples_extract_number_value :m-0-value] :order-val]
                      [:entity-id :order-eid] [:m-0-entity-id :order-eid]
                      select))
                  selects)))))

(defn- numeric-range-page [app-id normalized ctes pg-hints result-tables attrs]
  (when (numeric-range-page? app-id normalized)
    (let [ctes (vec ctes)
          [[_ lower-query] [_ upper-query] [_ page-query]] ctes
          number-value [:triples_extract_number_value :value]
          numeric-type [:= :checked_data_type [:cast [:inline "number"] :checked_data_type]]
          bound? (fn [ops predicate]
                   (and (vector? predicate)
                        (= 3 (count predicate))
                        (= :and (first predicate))
                        (= numeric-type (nth predicate 2))
                        (let [[op column n] (second predicate)]
                          (and (contains? ops op) (= number-value column) (number? n)))))
          lower-predicate (last (:where lower-query))
          upper-predicate (nth (:where upper-query) 4 nil)
          attr-id (some (fn [[op column value]]
                          (when (and (= op :=) (= column :attr-id)) value))
                        (filter vector? (conjuncts lower-query)))
          attr (some #(when (= attr-id (:id %)) %) attrs)
          base #{[:= :app-id app-id] [:= :ave :true] [:= :attr-id attr-id]}
          has-prev-idx (first (keep-indexed (fn [i [table]] (when (= :m-2-has-prev table) i)) ctes))
          has-prev-query (get-in ctes [has-prev-idx 1 :select 0 0 1])
          page-query' (order-by-first-scan page-query)
          has-prev-query' (if (:select-distinct-on has-prev-query)
                            (order-by-first-scan has-prev-query)
                            has-prev-query)
          ;; [:and where [:and [:>= value cursor] [:or ...]]] for a required attribute
          [_ _ [_ cursor-bound]] (:where page-query)
          cursor-bound (when (and (vector? cursor-bound)
                                  (= [:>= number-value] (take 2 cursor-bound)))
                         (assoc cursor-bound 1 [:triples_extract_number_value :m-0-value]))]
      (when (and (scans? pg-hints [(pg-hint/index-scan :t0 :triples_number_type_idx)
                                   (pg-hint/index-scan :t1 :triples_pkey)
                                   (pg-hint/bitmap-scan :t2 :triples_pkey)])
                 (layout? ctes [[:m-0 [[:triples :t0]] :not-materialized]
                                [:m-1 [[:triples :t1] :m-0] :not-materialized]
                                [:m-2-with-next [[:triples :t2] :m-1] :materialized]])
                 (not (contains? result-tables :m-0))
                 (uuid? attr-id)
                 (= :one (:cardinality attr))
                 (= :blob (:value-type attr))
                 (= :number (:checked-data-type attr))
                 (bound? #{:> :>=} lower-predicate)
                 (bound? #{:< :<=} upper-predicate)
                 (= (conj base lower-predicate) (conjuncts lower-query))
                 (= (conj base upper-predicate [:= :entity-id :m-0-entity-id])
                    (conjuncts upper-query))
                 has-prev-idx
                 page-query'
                 has-prev-query')
        ;; Every filter, the order, and the cursor read the same single-valued
        ;; attribute, so t0, t1 and t2 are the same triple. Bound the first
        ;; scan with the upper bound and the cursor, and order by it.
        {:ctes (-> ctes
                   (update-in [0 1 :where] #(conj (vec %) upper-predicate))
                   (assoc-in [2 1] (cond-> page-query'
                                     cursor-bound (update :where (fn [where] [:and cursor-bound where]))))
                   (assoc-in [has-prev-idx 1 :select 0 0 1] has-prev-query'))
         :pg-hints pg-hints}))))

(defn apply-plan [app-id normalized ctes pg-hints result-tables attrs]
  (or (when (not-any? #(contains? #{:'Leading :'HashJoin :'NestLoop :'MergeJoin
                                   :'NoHashJoin :'NoNestLoop :'NoMergeJoin}
                                 (first %))
                     pg-hints)
        (or (case app-id
              #uuid "299e756d-b3e6-41d3-a0ba-d097bfe7e04d"
              (status-filter app-id normalized ctes pg-hints)

              #uuid "ff386052-f839-4d6e-8a62-4c1a6c7a6a01"
              (filtered-child app-id normalized ctes pg-hints result-tables)

              #uuid "52d525f5-afb4-4a7a-9efd-e6791c0bdd6a"
              (nullable-filter app-id normalized ctes pg-hints)

              #uuid "1c436238-c543-44d0-9a6b-51f7e5b840e3"
              (or (numeric-range app-id normalized ctes pg-hints result-tables attrs)
                  (numeric-upper-bound app-id normalized ctes pg-hints result-tables attrs))

              nil)
            (numeric-range-page app-id normalized ctes pg-hints result-tables attrs)))
      {:ctes ctes :pg-hints pg-hints}))
