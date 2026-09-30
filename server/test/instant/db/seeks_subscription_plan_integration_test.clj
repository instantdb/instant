(ns instant.db.seeks-subscription-plan-integration-test
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
(defn- eid [n] (java.util.UUID. 81 n))
(defn- aid [n] (java.util.UUID. 82 n))

(def ^:private attrs
  (attr-model/wrap-attrs
   (mapv (fn [[n etype label options]]
           (merge {:id (aid n)
                   :forward-identity [(java.util.UUID. 83 n) etype label]
                   :value-type :blob :cardinality :one
                   :unique? false :index? false}
                  options))
         [[1 "seeks" "id" {:unique? true}]
          [2 "seeks" "resultsCount" {:index? true :checked-data-type :number}]
          [3 "seeks" "indexable" {:index? true :checked-data-type :boolean}]
          [4 "seeks" "title" {}]
          [5 "seeks" "body" {}]
          [6 "seeks" "owner" {:value-type :ref
                               :reverse-identity [(java.util.UUID. 84 6) "other" "seeks"]}]
          [7 "seeks" "tags" {:cardinality :many}]
          [8 "other" "id" {:unique? true}]
          [9 "other" "payload" {}]])))

(def ^:private states
  (mapv (fn [n [results-count indexable]]
          {:n n :results-count results-count :indexable indexable})
        (range 1 21)
        (for [results-count [1 0 -1 nil :missing]
              indexable [true false nil :missing]]
          [results-count indexable])))

(defn- insert-fixture! [conn]
  (jdbc/execute! conn
                 ["CREATE TEMP TABLE triples (
                     app_id uuid NOT NULL, entity_id uuid NOT NULL, attr_id uuid NOT NULL,
                     value jsonb, created_at bigint, ea boolean, av boolean,
                     ave boolean, eav boolean, vae boolean, checked_data_type checked_data_type)
                   ON COMMIT DROP"])
  (doseq [ddl ["CREATE UNIQUE INDEX ea_index ON triples
                (app_id, entity_id, attr_id) WHERE ea"
               "CREATE UNIQUE INDEX av_index ON triples
                (app_id, attr_id, json_null_to_null(value)) WHERE av"
               "CREATE INDEX triples_pkey ON triples (app_id, entity_id, attr_id)"
               "CREATE INDEX triples_created_at_idx ON triples (app_id, attr_id, created_at)"
               "CREATE INDEX ave_with_e_index ON triples
                (app_id, attr_id, value, entity_id) WHERE ave"
               "CREATE INDEX triples_number_type_idx ON triples
                (app_id, attr_id, triples_extract_number_value(value) NULLS FIRST)
                WHERE ave AND checked_data_type = 'number'"
               "CREATE INDEX triples_boolean_type_idx ON triples
                (app_id, attr_id, triples_extract_boolean_value(value) NULLS FIRST)
                WHERE ave AND checked_data_type = 'boolean'"]]
    (jdbc/execute! conn [ddl]))
  (let [other-app (java.util.UUID. 85 1)
        row (fn [app n a value]
              (let [attr (attr-model/seek-by-id (aid a) attrs)
                    ref? (= :ref (:value-type attr))]
                [app (eid n) (aid a) [:cast (json/->json value) :jsonb]
                 n (= :one (:cardinality attr)) (:unique? attr) (:index? attr)
                 ref? ref? (when-let [t (:checked-data-type attr)]
                             [:cast (name t) :checked_data_type])]))
        rows (concat
              (mapcat (fn [{:keys [n results-count indexable]}]
                        ;; Indexed optional fields have a typed JSON null triple
                        ;; even when omitted by the client.
                        (cond-> [(row app-id n 1 (str (eid n)))
                                 (row app-id n 2 (when-not (= :missing results-count) results-count))
                                 (row app-id n 3 (when-not (= :missing indexable) indexable))]
                          (not= n 3) (conj (row app-id n 4 (when (not= n 2) (str "seek " n))))))
                      states)
              [(row app-id 1 5 [nil {"nested" ["quotes: \" and newline\n" 42]}])
               (row app-id 1 6 (str (eid 9000)))
               (row app-id 1 7 "first")
               (row app-id 1 7 "second")
               (row app-id 1 9 "other namespace on the same entity")
               ;; Unfiltered seeks still requires a seeks.id triple.
               (row app-id 7777 4 "orphan without an id")
               (row app-id 8888 1 (str (eid 8888)))
               (row app-id 8888 2 nil)
               (row app-id 8888 3 nil)
               (row app-id 9000 8 (str (eid 9000)))
               (row app-id 9000 9 "linked owner")
               ;; Check both filter and result-fetch tenant isolation.
               (row other-app 1 1 (str (eid 1)))
               (row other-app 1 2 1)
               (row other-app 1 3 true)
               (row other-app 1 4 "other tenant")
               (row other-app 9999 1 (str (eid 9999)))
               (row other-app 9999 2 1)
               (row other-app 9999 3 true)
               (row other-app 9999 4 "other tenant only")])]
    (jdbc/execute! conn
                   (hsql/format {:insert-into :triples
                                 :columns [:app-id :entity-id :attr-id :value :created-at
                                           :ea :av :ave :eav :vae :checked-data-type]
                                 :values rows})))
  (jdbc/execute! conn ["ANALYZE triples"]))

(def ^:private queries
  [{:flag "seeks-all" :query {:seeks {}} :fetch-table :t2}
   {:flag "seeks-filtered"
    :query {:seeks {:$ {:where {:resultsCount {:$gt 0} :indexable {:$ne false}}}}}
    :fetch-table :t3}])

(defn- run-query [conn {:keys [query flag]} enabled?]
  (let [normalized (instaql-util/normalized-forms query)
        ctx {:app-id app-id :attrs attrs :query-normalized normalized
             :query-hash (hash normalized)
             ;; Match the measured dense query's planner choices without
             ;; requiring thousands of entities in this correctness fixture.
             :sketches (into {} (map (fn [attr]
                                      [{:app-id app-id :attr-id (:id attr)}
                                       {:sketch (assoc (if (= (aid 3) (:id attr))
                                                        (cms/add (cms/make-sketch) :boolean false 500)
                                                        (cms/make-sketch))
                                                      :total 6000)}])
                                    attrs))}
        {:keys [patterns forms]} (iq/instaql-query->patterns ctx query)
        named (d/annotate-with-hints-impl ctx {} (d/nested->named-patterns patterns))
        raw (atom nil)
        select-arrays sql/select-arrays]
    (binding [d/*enable-pg-hints* true
              flags/*flag-overrides* {:scoped-query-plans {(str app-id) {flag enabled?}}}]
      (let [compiled (d/nested-match-query ctx :m- app-id named)
            result (with-redefs [sql/select-arrays
                                (fn [& args]
                                  (let [res (apply select-arrays args)]
                                    (reset! raw (apply merge (-> res second first)))
                                    res))]
                     (d/send-query-nested ctx conn app-id named))
            nodes (iq/collect-query-results ctx (:data result) forms)
            checks (assoc (into {} (for [n (concat (range 1 21) [8888])]
                                    [["seeks" (eid n)] {:result (not= n 3)}]))
                          ["seeks" (eid 1) "title"] {:result false})
            permissioned (mapv (partial iq/permissioned-node ctx checks) nodes)]
        {:compiled compiled
         :rows (update-vals @raw frequencies)
         :parsed (:data result)
         :objects (instaql-util/instaql-nodes->object-tree ctx nodes)
         :node-data (set (mapcat iq/data-seq nodes))
         :topics (:topics result)
         :permissioned-node-data (set (mapcat iq/data-seq permissioned))
         :permissioned-objects (instaql-util/instaql-nodes->object-tree ctx permissioned)}))))

(deftest seeks-subscription-plans-preserve-results-and-topics
  (jdbc/with-transaction [conn (aurora/conn-pool :write) {:rollback-only true}]
    (insert-fixture! conn)
    (doseq [scenario [:crossed-values :one-match :empty]]
      (case scenario
        :one-match (jdbc/execute! conn ["DELETE FROM triples WHERE app_id = ? AND entity_id <> ?"
                                        app-id (eid 1)])
        :empty (jdbc/execute! conn ["DELETE FROM triples WHERE app_id = ?" app-id])
        nil)
      (doseq [{:keys [flag fetch-table] :as query} queries]
        (testing (str flag " " (name scenario))
          (let [before (run-query conn query false)
                after (run-query conn query true)
                objects (get-in after [:objects "seeks"])
                by-id (into {} (map (juxt #(get % "id") identity) objects))
                permitted (into {} (map (juxt #(get % "id") identity)
                                        (get-in after [:permissioned-objects "seeks"])))
                expected (case scenario
                           :empty #{}
                           :one-match #{1}
                           :crossed-values (if (= flag "seeks-all")
                                             (conj (set (range 1 21)) 8888)
                                             #{1 3 4}))]
            (is (not= (get-in before [:compiled :query])
                      (get-in after [:compiled :query])))
            (is (= (get-in before [:compiled :children])
                   (get-in after [:compiled :children])))
            (is (some #{[:'BitmapScan fetch-table :triples_created_at_idx]}
                      (get-in after [:compiled :query :pg-hints])))
            (is (= (dissoc before :compiled) (dissoc after :compiled)))
            (is (= (set (map (comp str eid) expected)) (set (keys by-id))))
            (is (not-any? #(or (contains? % "tags") (contains? % "payload")) objects))
            (is (not (contains? permitted (str (eid 3)))))
            (when (contains? expected 1)
              (is (= [nil {"nested" ["quotes: \" and newline\n" 42]}]
                     (get-in by-id [(str (eid 1)) "body"])))
              (is (not (contains? (get permitted (str (eid 1))) "title"))))
            (when (contains? expected 2)
              (is (nil? (get-in by-id [(str (eid 2)) "title"]))))
            (when (contains? expected 3)
              (is (not (contains? (get by-id (str (eid 3))) "title"))))))))))
