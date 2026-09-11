(ns instant.db.numeric-range-plan-test
  (:require [clojure.test :refer [deftest is testing]]
            [instant.db.attr-sketch :as cms]
            [instant.db.datalog :as d]
            [instant.db.instaql :as iq]
            [instant.db.model.attr :as attr-model]
            [instant.db.scoped-query-plans :as plans]
            [instant.flags :as flags]
            [instant.util.instaql :as instaql-util]
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
