(ns instant.db.numeric-range-page-plan-test
  (:require [clojure.set :as set]
            [clojure.test :refer [deftest is testing]]
            [instant.db.attr-sketch :as cms]
            [instant.db.datalog :as d]
            [instant.db.instaql :as iq]
            [instant.db.model.attr :as attr-model]
            [instant.fixtures :refer [with-empty-app]]
            [instant.flags :as flags]
            [instant.jdbc.sql :as sql]
            [instant.util.instaql :as instaql-util]
            [instant.util.test :as test-util]))

(def app-id #uuid "0a6b3c1e-52a1-4f56-9d0f-0d6a3a0c7b11")
(def modified-attr (java.util.UUID. 0 2))

(defn make-attrs [required?]
  (attr-model/wrap-attrs
   (mapv (fn [n field]
           (cond-> {:id (java.util.UUID. 0 n)
                    :forward-identity [(java.util.UUID. 1 n) "prices" field]
                    :value-type :blob :cardinality :one
                    :index? (contains? #{"modified" "rank"} field) :unique? (= field "id")}
             (= field "modified") (assoc :checked-data-type :number
                                         :required? required?)
             (= field "rank") (assoc :checked-data-type :number)))
         [1 2 3 4] ["id" "modified" "value" "rank"])))

(def attrs (make-attrs true))

(def first-page
  {:prices {:$ {:where {:and [{:modified {:$gt 100}} {:modified {:$lte 200}}]}
                :order {:modified "asc"} :first 50}}})

(def next-page
  (assoc-in first-page [:prices :$ :after] [(java.util.UUID. 9 9) modified-attr 150 0]))

(defn enabled [app-id]
  {:scoped-query-plans {(str app-id) {"numeric-range-page" true}}})

(defn compile-query
  ([q] (compile-query attrs q))
  ([attrs q]
   (let [ctx {:app-id app-id :attrs attrs
              :query-normalized (instaql-util/normalized-forms q)
              :sketches (into {} (map (fn [a]
                                       [{:app-id app-id :attr-id (:id a)}
                                        {:sketch (assoc (cms/make-sketch) :total 240000)}])
                                     attrs))}
         patterns (:patterns (iq/instaql-query->patterns ctx q))
         named (d/annotate-with-hints-impl ctx {} (d/nested->named-patterns patterns))]
     (binding [d/*enable-pg-hints* true]
       (:query (d/nested-match-query ctx :m- app-id named))))))

(defn cte [query table]
  (some (fn [[name q]] (when (= table name) q)) (:with query)))

(def order-by-first-scan
  [[[:triples_extract_number_value :m-0-value] :order-val]
   [:m-0-entity-id :order-eid]])

(deftest page-queries-bound-and-order-by-the-first-scan
  (doseq [q [first-page next-page]]
    (let [before (compile-query q)
          after (binding [flags/*flag-overrides* (enabled app-id)] (compile-query q))
          upper (nth (:where (cte before :m-1)) 4)]
      (is (= [[:'IndexScan :t0 :triples_number_type_idx]
              [:'IndexScan :t1 :triples_pkey]
              [:'BitmapScan :t2 :triples_pkey]]
             (take 3 (:pg-hints before))))
      (is (= (:pg-hints before) (:pg-hints after)))
      (testing "the first scan gets the upper bound"
        (is (= (conj (vec (:where (cte before :m-0))) upper)
               (:where (cte after :m-0)))))
      (testing "the page orders by the first scan"
        (is (= order-by-first-scan
               (take 2 (rest (:select-distinct-on (cte after :m-2-with-next)))))))
      (testing "the child join reuses the page's entity ids"
        (is (= [:triples :m-2] (:from (cte before :m-3))))
        (is (= {:select [[[:distinct :m-0-entity-id] :m-3-entity-id]]
                :from :m-2
                :where '(:and [:= :m-0-entity-id :m-1-entity-id])}
               (cte after :m-3))))
      (testing "everything else is untouched"
        (is (= (map first (:with before)) (map first (:with after))))
        (is (= (cte before :m-1) (cte after :m-1)))
        (is (= (cte before :m-2) (cte after :m-2)))
        (is (= (:select before) (:select after)))))))

(deftest cursor-bounds-the-first-scan-only-inside-the-page
  (let [before (compile-query next-page)
        after (binding [flags/*flag-overrides* (enabled app-id)] (compile-query next-page))
        has-prev #(get-in (cte % :m-2-has-prev) [:select 0 0 1])]
    (is (= [:and
            [:>= [:triples_extract_number_value :m-0-value] [:cast 150 :double-precision]]
            (:where (cte before :m-2-with-next))]
           (:where (cte after :m-2-with-next))))
    (testing "the previous-page check keeps its own bounds and orders by the first scan"
      (is (= (:where (has-prev before)) (:where (has-prev after))))
      (is (= order-by-first-scan
             (take 2 (rest (:select-distinct-on (has-prev after)))))))
    (testing "an attribute that is not required has a null-aware cursor, so only the order changes"
      (let [optional (make-attrs false)
            before (compile-query optional next-page)
            after (binding [flags/*flag-overrides* (enabled app-id)]
                    (compile-query optional next-page))]
        (is (= (:where (cte before :m-2-with-next)) (:where (cte after :m-2-with-next))))
        (is (= order-by-first-scan
               (take 2 (rest (:select-distinct-on (cte after :m-2-with-next))))))))))

(deftest plan-requires-the-flag-the-shape-and-the-schema
  (testing "off by default, per app, and behind the kill switches"
    (is (= (compile-query next-page)
           (binding [flags/*flag-overrides* (enabled (random-uuid))] (compile-query next-page))))
    (doseq [kill-switch [:disable-scoped-query-plans :disable-pg-hints]]
      (binding [flags/*flag-overrides* (enabled app-id)
                flags/*toggle-overrides* {kill-switch true}]
        (is (= (binding [flags/*flag-overrides* nil] (compile-query next-page))
               (compile-query next-page))
            (str kill-switch)))))
  (testing "other query shapes keep the normal plan"
    (doseq [q [(assoc-in first-page [:prices :$ :order :modified] "desc")
               (assoc-in first-page [:prices :$ :where :and 1] {:rank {:$lte 200}})
               (update-in first-page [:prices :$ :where :and] conj {:value 1})
               (-> first-page (update-in [:prices :$] dissoc :first) (assoc-in [:prices :$ :limit] 50))
               (assoc-in first-page [:prices :$ :fields] ["modified"])]]
      (is (= (compile-query q)
             (binding [flags/*flag-overrides* (enabled app-id)] (compile-query q)))
          (pr-str q)))))

(deftest paging-returns-the-same-pages
  (with-empty-app
    (fn [{app-id :id :keys [make-ctx]}]
      (let [attrs (test-util/make-attrs app-id [[:prices/id :unique?]
                                               [:prices/modified :index? :number :required?]
                                               [:prices/value]
                                               [:other/id :unique?]
                                               [:other/modified :index? :number]])
            eid #(java.util.UUID. 77 %)
            _ (test-util/insert-entities
               app-id attrs
               (concat
                ;; ties at 120 and 160 straddle page boundaries of 7
                (for [n (range 60)]
                  {:db/id (eid n) :prices/id (eid n) :prices/value n
                   :prices/modified (cond (< 10 n 22) 120
                                          (< 30 n 41) 160
                                          :else (+ 95 (* 2 n)))})
                (for [n (range 100 110)]
                  {:db/id (eid n) :other/id (eid n) :other/modified 150})))
            ctx (make-ctx)
            select-arrays sql/select-arrays
            compiled-sql (atom #{})
            run-query (fn [q]
                        (with-redefs [cms/lookup
                                      (fn [_ keys]
                                        (into {} (map (fn [key]
                                                        [key {:sketch (assoc (cms/make-sketch) :total 240000)}])
                                                      keys)))
                                      sql/select-arrays
                                      (fn [& args]
                                        (when (= :instant.db.datalog/send-query-nested (first args))
                                          (swap! compiled-sql conj (first (nth args 2))))
                                        (apply select-arrays args))]
                          (binding [d/*enable-pg-hints* true] (iq/query ctx q))))
            pages (fn [lower upper]
                    (loop [after nil
                           acc []]
                      (let [q {:prices {:$ (cond-> {:where {:and [{:modified {:$gt lower}}
                                                                  {:modified {:$lte upper}}]}
                                                    :order {:modified "asc"}
                                                    :first 7}
                                             after (assoc :after after))}}
                            res (run-query q)
                            page-info (-> res first :data :datalog-result :page-info)
                            page {:entities (get (instaql-util/instaql-nodes->object-tree ctx res) "prices")
                                  :page-info page-info}]
                        (if (and (:has-next-page? page-info) (< (count acc) 20))
                          (recur (:end-cursor page-info) (conj acc page))
                          (conj acc page)))))]
        (doseq [[lower upper] [[100 200] [0 1000] [119 120] [120 160] [500 600] [200 100]]]
          (testing (str "range " lower " to " upper)
            (reset! compiled-sql #{})
            (let [before (pages lower upper)
                  before-sql @compiled-sql
                  _ (reset! compiled-sql #{})
                  after (binding [flags/*flag-overrides* (enabled app-id)] (pages lower upper))]
              (is (= before after))
              (is (= (count before-sql) (count @compiled-sql)))
              (is (empty? (set/intersection before-sql @compiled-sql))))))
        (testing "every entity in range comes back exactly once, in order"
          (let [after (binding [flags/*flag-overrides* (enabled app-id)] (pages 100 200))
                values (mapcat #(map (fn [e] (get e "modified")) (:entities %)) after)]
            (is (= values (sort values)))
            (is (= (count values) (count (distinct (mapcat #(map (fn [e] (get e "id")) (:entities %)) after)))))
            (is (every? #(< 100 % 201) values))))))))
