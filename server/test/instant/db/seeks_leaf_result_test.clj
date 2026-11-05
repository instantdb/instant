(ns instant.db.seeks-leaf-result-test
  (:require [clojure.test :refer [deftest is testing]]
            [instant.db.attr-sketch :as cms]
            [instant.db.datalog :as d]
            [instant.db.instaql :as iq]
            [instant.db.model.attr :as attr-model]
            [instant.util.instaql :as instaql-util]
            [instant.util.json :as json]))

(def app-id #uuid "8ad982d7-09bc-45bd-83c4-8d56ebf32286")
(def entity-ids [(java.util.UUID. 3 1) (java.util.UUID. 3 2)])
(def attrs
  (attr-model/wrap-attrs
   (mapv (fn [n field]
           (cond-> {:id (java.util.UUID. 1 n)
                    :forward-identity [(java.util.UUID. 2 n) "seeks" field]
                    :value-type :blob :cardinality :one :unique? (= field "id")}
             (= field "resultsCount") (assoc :index? true :checked-data-type :number)
             (= field "indexable") (assoc :index? true :checked-data-type :boolean)))
         (range 19)
         (into ["id" "resultsCount" "indexable"] (map #(str "field" %) (range 16))))))

(def queries [{:seeks {}}
              {:seeks {:$ {:where {:resultsCount {:$gt 0} :indexable {:$ne false}}}}}])

(defn compile-query [query]
  (let [ctx {:app-id app-id :attrs attrs
             :query-normalized (instaql-util/normalized-forms query)
             :sketches (into {} (map (fn [attr]
                                      [{:app-id app-id :attr-id (:id attr)}
                                       {:sketch (assoc (cms/make-sketch) :total 1000000)}])
                                    attrs))}
        patterns (:patterns (iq/instaql-query->patterns ctx query))
        named (d/annotate-with-hints-impl ctx {} (d/nested->named-patterns patterns))]
    (:children (d/nested-match-query ctx :m- app-id named))))

(defn leaf-rows [cte-cols eid]
  (mapv (fn [i attr]
          (zipmap cte-cols
                  [(str eid) (str (:id attr))
                   (case i
                     0 (str eid)
                     1 3
                     2 false
                     3 nil
                     4 {"nested" [true false nil 0 ""]}
                     5 (str (java.util.UUID. 4 1))
                     6 0
                     7 ""
                     (str "value-" i))
                   (contains? #{0 5} i)
                   1700000000000]))
        (range) attrs))

(defn fixture [query]
  (let [children (compile-query query)
        root (first (:pattern-groups children))
        leaf (first (get-in root [:children :pattern-groups]))
        root-rows (mapv (fn [eid]
                          (into {}
                                (mapcat (fn [{:keys [cte-cols pattern]}]
                                          (zipmap cte-cols
                                                  [(str eid)
                                                   (str (first (second (:a pattern))))
                                                   (str eid) true 1700000000000])))
                                (:pattern-metas root)))
                        entity-ids)
        rows (mapcat #(leaf-rows (:cte-cols (first (:pattern-metas leaf))) %) entity-ids)
        sql-res {(name (:table root)) root-rows
                 (name (:table leaf)) (vec (concat rows (take 2 rows)))}]
    {:children children :leaf leaf :sql-res sql-res
     :grouped (d/group-rows-by-join-sym sql-res children)}))

(defn assert-equivalent [expected actual]
  (is (= expected actual))
  (is (= (hash expected) (hash actual)))
  (is (= (json/->json expected) (json/->json actual))))

(deftest actual-compiled-queries-preserve-complete-nested-results
  (doseq [query queries
          coarse? [false true]]
    (let [{:keys [children sql-res grouped]} (fixture query)
          expected (d/nested-sql-result->result sql-res grouped children coarse?)
          original @#'d/seeks-leaf-result
          decoded (atom [])]
      (with-redefs [d/seeks-leaf-result
                    (fn [rows group pattern-metas]
                      (let [result (original rows group pattern-metas)]
                        (swap! decoded conj result)
                        result))]
        (assert-equivalent expected
                           (d/nested-sql-result->result nil grouped sql-res children coarse?
                                                       {:seeks-leaf-result? true}))
        (is (= 2 (count @decoded)))
        (is (every? some? @decoded))
        (doseq [opts [{} {:seeks-leaf-result? false} {:seeks-leaf-result? "true"}]]
          (reset! decoded [])
          (assert-equivalent expected
                             (d/nested-sql-result->result nil grouped sql-res children coarse? opts))
          (is (empty? @decoded)))))))

(deftest direct-leaf-results-preserve-empty-null-and-reference-semantics
  (let [{:keys [leaf]} (fixture (first queries))
        join-sym (get-in leaf [:pattern-metas 0 :symbol-fields 0 :sym])
        pattern-metas (#'d/update-symbol-value (:pattern-metas leaf) join-sym (first entity-ids))
        cte-cols (:cte-cols (first pattern-metas))
        [e-col _ v-col] cte-cols
        rows (leaf-rows cte-cols (first entity-ids))]
    (doseq [input [nil [] rows (into rows rows) [{}]
                  [(assoc (first rows) e-col nil)]
                  (conj rows {} (assoc (first rows) e-col nil))
                  [(assoc (nth rows 5) v-col nil)]]]
      (let [expected (#'d/sql-result->result input pattern-metas true)
            actual (#'d/seeks-leaf-result input leaf pattern-metas)]
        (is (some? actual))
        (assert-equivalent expected actual)))))

(deftest other-leaf-shapes-use-the-general-decoder
  (let [{:keys [leaf]} (fixture (first queries))
        join-sym (get-in leaf [:pattern-metas 0 :symbol-fields 0 :sym])
        metas (#'d/update-symbol-value (:pattern-metas leaf) join-sym (first entity-ids))
        m (first metas)]
    (is (some? (#'d/seeks-leaf-result [] leaf metas)))
    (doseq [[label changed] [["children" (assoc leaf :children {})]
                            ["pagination" (assoc leaf :page-info {})]
                            ["aggregate" (assoc leaf :aggregate :count)]]]
      (testing label (is (nil? (#'d/seeks-leaf-result [] changed metas)))))
    (doseq [changed [[] [m m]
                     [(assoc m :or [])]
                     [(assoc m :page-info {})]
                     [(assoc m :symbol-fields {0 {:sym '?entity}})]
                     [(assoc m :symbol-fields nil)]
                     [(assoc-in m [:pattern :idx] [:keyword :eav])]
                     [(assoc-in m [:pattern :e] [:variable '?entity])]
                     [(assoc-in m [:pattern :e] [:constant #{}])]
                     [(assoc-in m [:pattern :e] [:constant (set entity-ids)])]
                     [(assoc-in m [:pattern :e] [:constant #{(str (first entity-ids))}])]
                     [(assoc-in m [:pattern :a] [:any '_])]
                     [(assoc-in m [:pattern :a] [:constant #{}])]
                     [(assoc-in m [:pattern :a] [:constant #{"not-a-uuid"}])]
                     [(assoc-in m [:pattern :v] [:constant #{false}])]
                     [(assoc-in m [:pattern :created-at] [:constant #{1700000000000}])]]]
      (is (nil? (#'d/seeks-leaf-result [] leaf changed))))))
