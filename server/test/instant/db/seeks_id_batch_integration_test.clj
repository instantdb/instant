(ns instant.db.seeks-id-batch-integration-test
  (:require [clojure.test :refer [deftest is testing]]
            [honey.sql :as hsql]
            [instant.db.attr-sketch :as cms]
            [instant.db.datalog :as d]
            [instant.db.instaql :as iq]
            [instant.db.model.attr :as attr-model]
            [instant.flags :as flags]
            [instant.jdbc.aurora :as aurora]
            [instant.jdbc.sql :as sql]
            [instant.util.instaql :as instaql-util]
            [instant.util.json :as json]
            [next.jdbc :as jdbc]))

(def ^:private app-id #uuid "8ad982d7-09bc-45bd-83c4-8d56ebf32286")
(defn- eid [n] (java.util.UUID. 71 n))
(defn- aid [n] (java.util.UUID. 72 n))

(def ^:private attrs
  (attr-model/wrap-attrs
   (mapv (fn [[n etype label options]]
           (merge {:id (aid n)
                   :forward-identity [(java.util.UUID. 73 n) etype label]
                   :value-type :blob :cardinality :one
                   :unique? false :index? false}
                  options))
         [[1 "seeks" "id" {:unique? true}]
          [2 "seeks" "title" {}]
          [3 "seeks" "body" {}]
          [4 "seeks" "owner" {:value-type :ref
                               :reverse-identity [(java.util.UUID. 74 4) "other" "seeks"]}]
          [5 "seeks" "tags" {:cardinality :many}]
          [6 "other" "id" {:unique? true}]
          [7 "other" "payload" {}]])))

(defn- insert-fixture! [conn]
  (jdbc/execute! conn
                 ["CREATE TEMP TABLE triples (
                     app_id uuid NOT NULL, entity_id uuid NOT NULL, attr_id uuid NOT NULL,
                     value jsonb, created_at bigint, ea boolean, av boolean, eav boolean)
                   ON COMMIT DROP"])
  (jdbc/execute! conn ["CREATE UNIQUE INDEX ea_index ON triples
                        (app_id, entity_id, attr_id) WHERE ea"])
  (jdbc/execute! conn ["CREATE UNIQUE INDEX av_index ON triples
                        (app_id, attr_id, json_null_to_null(value)) WHERE av"])
  (let [other-app (java.util.UUID. 75 1)
        row (fn [app n attr value ea av eav]
              [app (eid n) (aid attr) [:cast (json/->json value) :jsonb]
               n ea av eav])
        rows (concat
              (for [n (range 1 1201)]
                (row app-id n 1 (str (eid n)) true true false))
              (for [n (range 1 1201) :when (not= n 3)]
                (row app-id n 2 (when (not= n 2) (str "seek " n)) true false false))
              [(row app-id 1 3 {"nested" [nil "quotes: \" and newline\n" 42]} true false false)
               (row app-id 1 4 (str (eid 9000)) true false true)
               ;; Many-valued and other-namespace triples share the entity but
               ;; must not enter its requested scalar attribute result.
               (row app-id 1 5 "first" false false false)
               (row app-id 1 5 "second" false false false)
               (row app-id 1 7 "unrelated namespace" true false false)
               (row app-id 9000 6 (str (eid 9000)) true true false)
               (row app-id 9000 7 "linked owner" true false false)
               ;; Check both filter and result-fetch tenant isolation.
               (row other-app 1 1 (str (eid 1)) true true false)
               (row other-app 1 2 "other tenant" true false false)
               (row other-app 9999 1 (str (eid 9999)) true true false)
               (row other-app 9999 2 "other tenant only" true false false)])]
    (doseq [batch (partition-all 1000 rows)]
      (jdbc/execute! conn
                     (hsql/format {:insert-into :triples
                                   :columns [:app-id :entity-id :attr-id :value :created-at :ea :av :eav]
                                   :values batch}))))
  (jdbc/execute! conn ["ANALYZE triples"]))

(defn- run-query [conn ids enabled?]
  (let [q {:seeks {:$ {:where {:id {:$in ids}}}}}
        normalized (instaql-util/normalized-forms q)
        id-sketch (reduce #(cms/add %1 nil %2 1) (cms/make-sketch) (distinct ids))
        ctx {:app-id app-id :attrs attrs :query-normalized normalized
             :query-hash (hash normalized)
             :sketches (into {} (map (fn [attr]
                                      [{:app-id app-id :attr-id (:id attr)}
                                       {:sketch (assoc (if (= (aid 1) (:id attr))
                                                        id-sketch
                                                        (cms/make-sketch))
                                                      :total 1000000)}])
                                    attrs))}
        {:keys [patterns forms]} (iq/instaql-query->patterns ctx q)
        named (d/annotate-with-hints-impl ctx {} (d/nested->named-patterns patterns))
        raw (atom nil)
        select-arrays sql/select-arrays]
    (binding [d/*enable-pg-hints* true
              flags/*flag-overrides* {:scoped-query-plans
                                     {(str app-id) {"seeks-id-batch" enabled?}}}]
      (let [compiled (d/nested-match-query ctx :m- app-id named)
            result (with-redefs [sql/select-arrays
                                (fn [& args]
                                  (let [res (apply select-arrays args)]
                                    (reset! raw (apply merge (-> res second first)))
                                    res))]
                     (d/send-query-nested ctx conn app-id named))
            nodes (iq/collect-query-results ctx (:data result) forms)]
        {:compiled compiled
         :rows (update-vals @raw frequencies)
         :objects (instaql-util/instaql-nodes->object-tree ctx nodes)
         :node-data (set (mapcat iq/data-seq nodes))
         :topics (:topics result)}))))

(deftest batched-id-fetch-preserves-results-and-topics
  (jdbc/with-transaction [conn (aurora/conn-pool :write) {:rollback-only true}]
    (insert-fixture! conn)
    (doseq [[label ids expected-ids]
            [["large selection with duplicate, missing, other-namespace and other-tenant IDs"
              (mapv (comp str eid) (concat (range 1 1201) [1 7777 9000 9999]))
              (set (map (comp str eid) (range 1 1201)))]
             ["sparse selection"
              (mapv (comp str eid) (cons 1 (range 10000 11200)))
              #{(str (eid 1))}]
             ["no matches"
              (mapv (comp str eid) (range 20000 21200))
              #{}]]]
      (testing label
        (let [before (run-query conn ids false)
              after (run-query conn ids true)
              objects (get-in after [:objects "seeks"])
              by-id (into {} (map (juxt #(get % "id") identity) objects))]
          (is (not= (get-in before [:compiled :query])
                    (get-in after [:compiled :query])))
          (is (= (get-in before [:compiled :children])
                 (get-in after [:compiled :children])))
          (is (some #{[:'BitmapScan :t2 :ea_index]}
                    (get-in after [:compiled :query :pg-hints])))
          (is (= (:rows before) (:rows after)))
          (is (= (:objects before) (:objects after)))
          (is (= (:node-data before) (:node-data after)))
          (is (= (:topics before) (:topics after)))
          (is (= expected-ids (set (keys by-id))))
          (when (contains? expected-ids (str (eid 1)))
            (is (= {"nested" [nil "quotes: \" and newline\n" 42]}
                   (get-in by-id [(str (eid 1)) "body"])))
            (is (not-any? #(contains? % "tags") objects))
            (is (not-any? #(contains? % "payload") objects)))
          (when (contains? expected-ids (str (eid 2)))
            (is (nil? (get-in by-id [(str (eid 2)) "title"])))
          (when (contains? expected-ids (str (eid 3)))
            (is (not (contains? (get by-id (str (eid 3))) "title"))))))))))
