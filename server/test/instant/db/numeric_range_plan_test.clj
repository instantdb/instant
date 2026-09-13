(ns instant.db.numeric-range-plan-test
  (:require [clojure.test :refer [deftest is testing]]
            [instant.db.attr-sketch :as cms]
            [instant.db.datalog :as d]
            [instant.db.instaql :as iq]
            [instant.db.model.attr :as attr-model]
            [instant.db.scoped-query-plans :as plans]
            [instant.fixtures :refer [with-empty-app]]
            [instant.flags :as flags]
            [instant.jdbc.sql :as sql]
            [instant.util.instaql :as instaql-util]
            [instant.util.test :as test-util]
            [instant.util.tracer :as tracer]))

(def app-id #uuid "1c436238-c543-44d0-9a6b-51f7e5b840e3")
(def timestamp-attr (java.util.UUID. 0 2))
(def attrs
  (attr-model/wrap-attrs
   (mapv (fn [n field]
           (cond-> {:id (java.util.UUID. 0 n)
                    :forward-identity [(java.util.UUID. 1 n) "Prices" field]
                    :value-type :blob :cardinality :one
                    :index? (= field "timestamp") :unique? (= field "id")}
             (= field "timestamp") (assoc :checked-data-type :number)))
         [1 2 3] ["id" "timestamp" "value"])))

(def query
  {:Prices {:$ {:where {:and [{:timestamp {:$gt 100}} {:timestamp {:$lt 200}}]}
                :order {:timestamp "asc"} :limit 1000}}})

(defn compile-query [q]
  (let [ctx {:app-id app-id :attrs attrs
             :query-normalized (instaql-util/normalized-forms q)
             :sketches (into {} (map (fn [a]
                                      [{:app-id app-id :attr-id (:id a)}
                                       {:sketch (assoc (cms/make-sketch) :total 240000)}])
                                    attrs))}
        patterns (:patterns (iq/instaql-query->patterns ctx q))
        named (d/annotate-with-hints-impl ctx {} (d/nested->named-patterns patterns))]
    (:query (d/nested-match-query ctx :m- app-id named))))

(defn baseline [q]
  (with-redefs [plans/apply-plan (fn [_ _ ctes hints _ _]
                                  {:ctes ctes :pg-hints hints})]
    (compile-query q)))

(deftest range-bound-is-added-before-entity-lookups
  (binding [d/*enable-pg-hints* true]
    (let [before (baseline query)
          after (compile-query query)
          upper (nth (get-in (vec (:with before)) [1 1 :where]) 4)]
      (is (= [[:'IndexScan :t0 :triples_number_type_idx]
               [:'IndexScan :t1 :triples_pkey]
               [:'BitmapScan :t2 :triples_pkey]]
             (take 3 (:pg-hints before))))
      (is (not= before after))
      (is (= (update before :with
                       #(update-in (vec %) [0 1 :where] (fn [where] (conj (vec where) upper))))
             after))
      (is (= after (assoc after :with
                          (:ctes (plans/apply-plan app-id (instaql-util/normalized-forms query)
                                                  (:with after) (:pg-hints after) #{:m-2 :m-4} attrs))))))))

(deftest range-rewrite-requires-the-measured-schema-and-layout
  (binding [d/*enable-pg-hints* true]
    (let [before (baseline query)
          input {:app app-id :normalized (instaql-util/normalized-forms query)
                 :ctes (vec (:with before)) :hints (:pg-hints before)
                 :tables #{:m-2 :m-4} :attrs attrs}
          apply-plan (fn [{:keys [app normalized ctes hints tables attrs]}]
                       (plans/apply-plan app normalized ctes hints tables attrs))]
      (doseq [[label changed]
              [[:app (assoc input :app (random-uuid))]
               [:missing-schema (assoc input :attrs nil)]
               [:many (update input :attrs #(mapv (fn [a] (assoc a :cardinality :many)) %))]
               [:unchecked (update input :attrs #(mapv (fn [a] (dissoc a :checked-data-type)) %))]
               [:wrong-type (update input :attrs #(mapv (fn [a] (assoc a :checked-data-type :string)) %))]
               [:other-attribute (assoc-in input [:ctes 1 1 :where]
                                           (assoc (vec (get-in input [:ctes 1 1 :where]))
                                                  3 [:= :attr-id (random-uuid)]))]
               [:other-join (update-in input [:ctes 1 1 :where]
                                       #(conj (vec (butlast %)) [:= :entity-id :other-id]))]
               [:materialized (assoc-in input [:ctes 0 2] :materialized)]
               [:lower-limit (assoc-in input [:ctes 0 1 :limit] 1)]
               [:upper-limit (assoc-in input [:ctes 1 1 :limit] 1)]
               [:other-scan (assoc-in input [:hints 0] [:'IndexScan :t0 :triples_pkey])]
               [:join-hint (update input :hints conj [:'Leading :t0 :t1 :t2])]
               [:result (update input :tables conj :m-0)]
               [:other-consumer (update input :ctes conj [:extra {:select :* :from :m-0} :materialized])]]]
        (testing (name label)
          (is (= {:ctes (:ctes changed) :pg-hints (:hints changed)} (apply-plan changed))))))
    (doseq [q [(assoc-in query [:Prices :$ :limit] 10)
                (assoc-in query [:Prices :$ :order :timestamp] "desc")
                (assoc-in query [:Prices :$ :fields] ["timestamp"])
                (assoc-in query [:Prices :$ :where :and 1 :timestamp] {:$lte 200})]]
      (is (= (baseline q) (compile-query q))))))

(deftest range-rewrite-respects-hint-switches
  (binding [d/*enable-pg-hints* false]
    (is (= (baseline query) (compile-query query))))
  (binding [d/*enable-pg-hints* true]
    (with-redefs [flags/toggled? (fn [flag & [default]]
                                  (if (= flag :disable-pg-hints) true default))]
      (is (= (baseline query) (compile-query query))))))

(deftest query-hash-switch-disables-the-range-rewrite
  (with-redefs [flags/flag (fn [flag & [default]]
                            (if (= flag :disable-hint-query-hashes) #{42} default))
                flags/toggled? (fn [_ & [default]] default)
                tracer/add-data! (fn [& _])
                d/send-query-nested (fn [& _] (compile-query query))]
    (let [compiled (d/query-nested {:app-id app-id :query-hash 42}
                                    '{:children {:pattern-groups
                                                 [{:patterns [[:ea ?e #uuid "00000000-0000-0000-0000-000000000001" _]]}]}})]
      (binding [d/*enable-pg-hints* false]
        (is (= (baseline query) compiled))))))

(def upper-bound-query
  {:Prices {:$ {:where {:timestamp {:$lt 200}}
                :order {:timestamp "asc"} :limit 200}}})

(deftest upper-bound-checks-for-matches-before-the-ordering-scan
  (binding [d/*enable-pg-hints* true]
    (let [before (baseline upper-bound-query)
          after (compile-query upper-bound-query)
          bound-query (second (first (:with before)))]
      (is (not= before after))
      (is (= (-> before
                 (update :with
                         #(into [[:upper-bound-match
                                  (assoc bound-query :select [[[:inline 1] :matched]]
                                         :from [[:triples :t-upper-bound-match]] :limit 1)
                                  :materialized]]
                                (update-in (vec %) [1 1 :where]
                                           (fn [where]
                                             [:and where [:exists {:select :* :from :upper-bound-match}]]))))
                 (update :pg-hints conj [:'IndexScan :t-upper-bound-match :triples_number_type_idx]))
             after))
      (is (= {:ctes (:with after) :pg-hints (:pg-hints after)}
             (plans/apply-plan app-id (instaql-util/normalized-forms upper-bound-query)
                               (:with after) (:pg-hints after) #{:m-1 :m-3} attrs))))))

(deftest upper-bound-rewrite-requires-the-measured-scope-and-layout
  (binding [d/*enable-pg-hints* true]
    (let [before (baseline upper-bound-query)
          input {:app app-id :normalized (instaql-util/normalized-forms upper-bound-query)
                 :ctes (vec (:with before)) :hints (:pg-hints before)
                 :tables #{:m-1 :m-3} :attrs attrs}
          apply-plan (fn [{:keys [app normalized ctes hints tables attrs]}]
                       (plans/apply-plan app normalized ctes hints tables attrs))]
      (doseq [[label changed]
              [[:app (assoc input :app (random-uuid))]
               [:missing-form (assoc input :normalized nil)]
               [:limit (assoc-in input [:normalized :Prices :$ :limit] 201)]
               [:order (assoc-in input [:normalized :Prices :$ :order :timestamp] "desc")]
               [:fields (assoc-in input [:normalized :Prices :$ :fields] ["timestamp"])]
               [:offset (assoc-in input [:normalized :Prices :$ :offset] 1)]
               [:cursor (assoc-in input [:normalized :Prices :$ :after] :cursor)]
               [:operator (assoc-in input [:normalized :Prices :$ :where :timestamp] {:$lte :number})]
               [:missing-schema (assoc input :attrs nil)]
               [:many (update input :attrs #(mapv (fn [a] (assoc a :cardinality :many)) %))]
               [:ref (update input :attrs #(mapv (fn [a] (assoc a :value-type :ref)) %))]
               [:unchecked (update input :attrs #(mapv (fn [a] (dissoc a :checked-data-type)) %))]
               [:string (update input :attrs #(mapv (fn [a] (assoc a :checked-data-type :string)) %))]
               [:unindexed (update input :attrs #(mapv (fn [a] (assoc a :index? false)) %))]
               [:extra-seed-filter (update-in input [:ctes 0 1 :where] #(conj (vec %) [:= :eav :false]))]
               [:extra-order-filter (update-in input [:ctes 1 1 :where] #(conj (vec %) [:= :eav :false]))]
               [:other-join (assoc-in input [:ctes 1 1 :where] [:and])]
               [:unprefixed-value (update-in input [:ctes 0 1 :select]
                                             #(assoc (vec %) 2 [:value :value]))]
               [:order-expression (update-in input [:ctes 1 1 :select-distinct-on]
                                              #(assoc (vec %) 1 [[:length :value] :order-val]))]
               [:order-entity (update-in input [:ctes 1 1 :select-distinct-on]
                                          #(assoc (vec %) 2 [:attr-id :order-eid]))]
               [:raw-value (update-in input [:ctes 1 1 :select-distinct-on]
                                       #(assoc (vec %) 6 [[:triples_extract_number_value :value] :m-1-value]))]
               [:distinct (update-in input [:ctes 1 1 :select-distinct-on]
                                      #(assoc (vec %) 0 [:order-val]))]
               [:seed-limit (assoc-in input [:ctes 0 1 :limit] 201)]
               [:page-limit (assoc-in input [:ctes 1 1 :limit] 200)]
               [:materialized (assoc-in input [:ctes 0 2] :materialized)]
               [:cte-position (update input :ctes #(into [[:extra {:select 1} :materialized]] %))]
               [:other-scan (assoc-in input [:hints 1] [:'BitmapScan :t1 :triples_pkey])]
               [:join-hint (update input :hints conj [:'Leading :t1 :t0])]
               [:probe-cte-collision (update input :ctes conj [:upper-bound-match {:select :* :from :m-1} :materialized])]
               [:probe-hint-collision (update input :hints conj [:'IndexScan :t-upper-bound-match :triples_pkey])]
               [:other-t1-hint (update input :hints conj [:'Rows :m-2 :t1 "#200"])]
               [:result (update input :tables conj :m-0)]
               [:other-consumer (update input :ctes conj [:extra {:select :* :from :m-0} :materialized])]]]
        (testing (name label)
          (is (= {:ctes (:ctes changed) :pg-hints (:hints changed)} (apply-plan changed))))))))

(deftest upper-bound-rewrite-respects-hint-switches
  (binding [d/*enable-pg-hints* false]
    (is (= (baseline upper-bound-query) (compile-query upper-bound-query))))
  (binding [d/*enable-pg-hints* true]
    (with-redefs [flags/toggled? (fn [flag & [default]]
                                  (if (= flag :disable-pg-hints) true default))]
      (is (= (baseline upper-bound-query) (compile-query upper-bound-query)))))
  (with-redefs [flags/flag (fn [flag & [default]]
                            (if (= flag :disable-hint-query-hashes) #{42} default))
                flags/toggled? (fn [_ & [default]] default)
                tracer/add-data! (fn [& _])
                d/send-query-nested (fn [& _] (compile-query upper-bound-query))]
    (let [compiled (d/query-nested {:app-id app-id :query-hash 42}
                                    '{:children {:pattern-groups
                                                 [{:patterns [[:ea ?e #uuid "00000000-0000-0000-0000-000000000001" _]]}]}})]
      (binding [d/*enable-pg-hints* false]
        (is (= (baseline upper-bound-query) compiled))))))

(deftest upper-bound-preserves-complete-paged-results
  (with-empty-app
    (fn [{local-app-id :id :keys [make-ctx]}]
      (let [local-attrs (test-util/make-attrs local-app-id [[:Prices/id :unique?]
                                                           [:Prices/timestamp :index? :number]
                                                           [:Prices/value]])
            eid #(java.util.UUID. 99 %)
            _ (test-util/insert-entities
               local-app-id local-attrs
               (concat (for [n (range 250)]
                         {:db/id (eid n) :Prices/id (eid n) :Prices/timestamp n :Prices/value n})
                       [{:db/id (eid 250) :Prices/id (eid 250) :Prices/timestamp nil}
                        {:db/id (eid 251) :Prices/id (eid 251)}]))
            ctx (assoc (make-ctx) :app-id app-id)
            select-arrays sql/select-arrays
            compiled-sql (atom {})
            run-query (fn [q before?]
                        (let [run #(with-redefs [cms/lookup
                                                (fn [_ keys]
                                                  (into {} (map (fn [key]
                                                                  [key {:sketch (assoc (cms/make-sketch) :total 240000)}])
                                                                keys)))
                                                sql/select-arrays
                                                (fn [& args]
                                                  (if (= :instant.db.datalog/send-query-nested (first args))
                                                    (do
                                                      (swap! compiled-sql assoc before? (first (nth args 2)))
                                                      (apply select-arrays
                                                             (update (vec args) 2
                                                                     (fn [query]
                                                                       (mapv (fn [x] (if (= app-id x) local-app-id x)) query)))))
                                                    (apply select-arrays args)))]
                                    (binding [d/*enable-pg-hints* true] (iq/query ctx q)))]
                          (if before?
                            (with-redefs [plans/apply-plan (fn [_ _ ctes hints _ _]
                                                            {:ctes ctes :pg-hints hints})]
                              (run))
                            (run))))]
        (doseq [upper [0 199 200 201 202 300]]
          (testing (str "upper bound " upper)
            (let [q (assoc-in upper-bound-query [:Prices :$ :where :timestamp :$lt] upper)
                  before (run-query q true)
                  after (run-query q false)]
              (is (= before after))
              (is (not= (get @compiled-sql true) (get @compiled-sql false)))
              (is (= (min upper 200)
                     (count (get (instaql-util/instaql-nodes->object-tree ctx after) "Prices")))))))
        (testing "ties crossing the page boundary"
          (test-util/insert-entities local-app-id local-attrs
                                    (for [n (range 180 231)] {:db/id (eid n) :Prices/timestamp 198}))
          (let [q (assoc-in upper-bound-query [:Prices :$ :where :timestamp :$lt] 199)]
            (is (= (run-query q true) (run-query q false)))))
        (testing "an off-page entity moves into the result"
          (test-util/insert-entities local-app-id local-attrs [{:db/id (eid 241) :Prices/timestamp -1}])
          (is (= (run-query upper-bound-query true) (run-query upper-bound-query false))))
        (testing "schema changes after the query context was created"
          (let [timestamp-id (:Prices/timestamp local-attrs)
                q (assoc-in upper-bound-query [:Prices :$ :where :timestamp :$lt] 0)]
            (attr-model/update-multi! (get-in ctx [:db :conn-pool]) local-app-id
                                      [{:id timestamp-id :cardinality :many}])
            (test-util/insert-entities local-app-id local-attrs [{:db/id (eid 241) :Prices/timestamp 300}])
            (is (= (run-query q true) (run-query q false)))
            (is (not= (get @compiled-sql true) (get @compiled-sql false)))))))))
