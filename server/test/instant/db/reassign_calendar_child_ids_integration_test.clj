(ns instant.db.reassign-calendar-child-ids-integration-test
  (:require [clojure.test :refer [deftest is testing]]
            [instant.db.attr-sketch :as cms]
            [instant.db.instaql :as iq]
            [instant.db.model.attr :as attr-model]
            [instant.db.reassign-calendar-child-ids-test :as fixtures]
            [instant.flags :as flags]
            [instant.jdbc.aurora :as aurora]
            [instant.jdbc.sql :as sql]
            [instant.model.rule :as rule-model]
            [instant.util.instaql :as instaql-util]
            [instant.util.json :as json]
            [next.jdbc :as jdbc]))

(defn entity [n] (java.util.UUID. 10 n))

(defn attr [etype label]
  (attr-model/seek-by-fwd-ident-name [etype label] fixtures/measured-attrs))

(defn create-triples! [conn]
  (jdbc/execute! conn
                 ["CREATE TEMP TABLE triples (
                     app_id uuid, entity_id uuid, attr_id uuid, value jsonb,
                     checked_data_type checked_data_type, created_at bigint,
                     ea boolean, eav boolean, av boolean, ave boolean, vae boolean)
                   ON COMMIT DROP"])
  (doseq [query ["CREATE INDEX triples_pkey ON triples (app_id, entity_id, attr_id)"
                 "CREATE INDEX ea_index ON triples (app_id, entity_id, attr_id) WHERE ea"
                 "CREATE INDEX av_index ON triples (app_id, attr_id, value) WHERE av"
                 "CREATE INDEX ave_with_e_index ON triples (app_id, attr_id, value, entity_id) WHERE ave"
                 "CREATE INDEX triples_created_at_idx ON triples (app_id, attr_id, created_at, entity_id)"
                 "CREATE INDEX triples_string_type_idx ON triples
                    (app_id, attr_id, (value #>> '{}'), entity_id)
                    WHERE ave AND checked_data_type = 'string'"
                 "CREATE INDEX vae_uuid_index ON triples
                    (app_id, attr_id, json_uuid_to_uuid(value), entity_id) WHERE vae"
                 "CREATE INDEX eav_uuid_index ON triples
                    (app_id, entity_id, attr_id, json_uuid_to_uuid(value)) WHERE eav"]]
    (jdbc/execute! conn [query])))

(defn insert-fields! [conn app-id etype eid fields]
  (doseq [[label value] (assoc fields "id" eid)]
    (let [{aid :id :keys [value-type cardinality unique? index? checked-data-type]}
          (attr etype label)
          ref? (= :ref value-type)]
      (jdbc/execute! conn
                     ["INSERT INTO triples VALUES (?, ?, ?, ?::jsonb, ?::checked_data_type,
                                                   100, ?, ?, ?, ?, ?)"
                      app-id eid aid
                      (json/->json value) (some-> checked-data-type name)
                      (= :one cardinality) ref? (boolean unique?) (boolean index?) ref?]))))

(defn- seed! [conn]
  (let [app fixtures/measured-app]
    (doseq [[n fields]
            [[1 {"date" "2026-09-01" "recurrenceRule" "daily" "exceptionDate" "2026-09-15"
                 "area" (entity 101) "activityType" (entity 201) "parent" (entity 3)}]
             [2 {"date" "2026-09-30" "recurrenceRule" nil "exceptionDate" "2026-09-30"
                 "area" (entity 101) "activityType" (entity 999) "parent" (entity 998)}]
             [3 {"date" "2026-08-15" "recurrenceRule" "daily"
                 "area" (entity 102) "parent" (entity 5)}]
             [4 {"date" "2026-10-01" "exceptionDate" "2026-09-01" "area" nil}]
             [5 {"date" "2026-08-31" "recurrenceRule" nil}]
             [6 {"date" "2026-10-01" "recurrenceRule" "daily" "exceptionDate" "2026-10-01"}]
             [7 {"exceptionDate" "2026-09-15"}]
             [8 {"recurrenceRule" "daily"}]
             [9 {"date" "2026-09-15"}]
             [10 {"date" nil "recurrenceRule" nil "exceptionDate" nil}]]]
      (insert-fields! conn app "sections" (entity n) fields))
    (insert-fields! conn app "areas" (entity 101) {"name" "shared area"})
    (insert-fields! conn app "areas" (entity 102) {"name" "private area"})
    (insert-fields! conn app "activityTypes" (entity 201) {"name" "activity"})
    (doseq [[n parent] [[301 1] [302 1] [303 2] [304 7] [305 5] [306 997]]]
      (insert-fields! conn app "sourceLinks" (entity n)
                       {"name" (str "link " n) "section" (entity parent)}))
    ;; Same entity IDs and relationships in a second tenant cannot enter results.
    (let [other-app (random-uuid)]
      (insert-fields! conn other-app "sections" (entity 1) {"date" "2026-09-01" "area" (entity 103)})
      (insert-fields! conn other-app "areas" (entity 103) {"name" "other tenant"}))
    (jdbc/execute! conn ["ANALYZE triples"])))

(defn range-query [lower upper]
  (-> fixtures/measured-query
      (assoc-in [:sections :$ :where :or 0 :and 0 :date :$gte] lower)
      (assoc-in [:sections :$ :where :or 0 :and 1 :date :$lte] upper)
      (assoc-in [:sections :$ :where :or 1 :and 1 :date :$lte] upper)
      (assoc-in [:sections :$ :where :or 2 :and 0 :exceptionDate :$gte] lower)
      (assoc-in [:sections :$ :where :or 2 :and 1 :exceptionDate :$lte] upper)))

(defn- query-flags [enabled?]
  {:scoped-query-plans {(str fixtures/measured-app) {"reassign-calendar-child-ids" enabled?}}})

(defn- synthetic-sketches [_conn keys]
  (into {} (map (fn [k] [k {:sketch (assoc (cms/make-sketch) :total 2000)}])) keys))

(defn- query-result
  ([conn query enabled? rules]
   (query-result conn query enabled? rules fixtures/measured-attrs))
  ([conn query enabled? rules attrs]
  (binding [flags/*flag-overrides* (query-flags enabled?)
            flags/*toggle-overrides* {:disable-scoped-query-plans false
                                      :disable-pg-hints false :pg-hints-by-default true}]
    (let [ctx {:app-id fixtures/measured-app :attrs attrs
               :db {:conn-pool conn} :skip-app-status-read-check? true
               :use-rule-wheres? false :testing-rule-wheres true}
          statements (atom [])
          raw-results (atom [])
          select-arrays sql/select-arrays
          nodes (with-redefs [cms/lookup synthetic-sketches
                              rule-model/get-by-app-id (constantly {:code rules})
                              sql/select-arrays
                              (fn [op conn q & args]
                                (let [result (apply select-arrays op conn q args)]
                                  (when (= :instant.db.datalog/send-query-nested op)
                                    (swap! statements conj q)
                                    (swap! raw-results conj (apply merge (-> result second first))))
                                  result))]
                  (if rules
                    (iq/permissioned-query ctx query)
                    (iq/query-normal ctx query)))]
      {:nodes nodes
       :objects (instaql-util/instaql-nodes->object-tree ctx nodes)
       :datalog (mapv #(select-keys (:datalog-result %) [:join-rows :topics :page-info :aggregate])
                      (mapcat iq/data-seq nodes))
       :raw (into {} (map (fn [[table rows]] [table (frequencies rows)])) (first @raw-results))
       :sql (first @statements)}))))

(defn- projected? [result]
  (boolean (re-find #"SELECT DISTINCT m_6_entity_id AS m_7_entity_id FROM m_6" (first (:sql result)))))

(defn plan-nodes [plan]
  (tree-seq #(seq (get % "Plans")) #(get % "Plans") (get plan "Plan")))

(defn m8-plan [plan]
  (some #(when (= "CTE m_8" (get % "Subplan Name")) %) (plan-nodes plan)))

(defn bound-m8-lookup? [plan]
  (let [join (m8-plan plan)
        [outer inner] (get join "Plans")
        index-cond (get inner "Index Cond" "")]
    (and (= "Nested Loop" (get join "Node Type"))
         (= "CTE Scan" (get outer "Node Type"))
         (= "m_7" (get outer "CTE Name"))
         (= "Outer" (get outer "Parent Relationship"))
         (= "Index Scan" (get inner "Node Type"))
         (= "ea_index" (get inner "Index Name"))
         (= "t8" (get inner "Alias"))
         (= "Inner" (get inner "Parent Relationship"))
         (boolean (re-find #"app_id = '[0-9a-f-]+'::uuid" index-cond))
         (boolean (re-find #"entity_id = m_7.m_7_entity_id" index-cond))
         (boolean (re-find #"attr_id = ANY \('[{][0-9a-f,-]+[}]'::uuid\[\]\)" index-cond)))))

(deftest calendar-projection-keeps-child-lookups-bound-to-matched-ids
  (jdbc/with-transaction [conn (aurora/conn-pool :write) {:rollback-only true}]
    (create-triples! conn)
    (seed! conn)
    (doseq [[label lower upper]
            [[:sparse "2026-09-30" "2026-09-30"]
             [:empty "2025-01-01" "2025-01-02"]
             [:broad "2020-01-01" "2030-01-01"]]]
      (testing (name label)
        (let [query (range-query lower upper)
              baseline (query-result conn query false nil)
              candidate (query-result conn query true nil)
              explain (update (:sql candidate) 0 #(str "EXPLAIN (FORMAT JSON) " %))
              plan (-> (jdbc/execute! conn explain {:builder-fn sql/as-string-maps})
                       first (get "QUERY PLAN") first)]
          (is (projected? candidate))
          (is (= (dissoc baseline :sql) (dissoc candidate :sql)))
          (is (bound-m8-lookup? plan) (pr-str (m8-plan plan))))))))

(deftest calendar-projection-preserves-full-results-and-topics
  (jdbc/with-transaction [conn (aurora/conn-pool :write) {:rollback-only true}]
    (create-triples! conn)
    (seed! conn)
    (doseq [[lower upper expected]
            [["2026-09-01" "2026-09-30" #{1 2 3 4 7 9}]
             ["2026-09-01" "2026-09-01" #{1 3 4}]
             ["2026-09-30" "2026-09-30" #{1 2 3}]
             ["2026-09-30" "2026-09-01" #{1 3}]
             ["2027-01-01" "2027-01-01" #{1 3 6}]
             ["2025-01-01" "2025-01-02" #{}]]]
      (testing (str lower " to " upper)
        (let [query (range-query lower upper)
              baseline (query-result conn query false nil)
              candidate (query-result conn query true nil)
              objects (get-in candidate [:objects "sections"])]
          (is (not (projected? baseline)))
          (is (projected? candidate))
          (is (= (dissoc baseline :sql) (dissoc candidate :sql)))
          (is (= (set (map #(str (entity %)) expected)) (set (map #(get % "id") objects)))))))
    (let [result (query-result conn fixtures/measured-query true nil)
          objects (into {} (map (juxt #(get % "id") identity)) (get-in result [:objects "sections"]))]
      (is (= #{(str (entity 301)) (str (entity 302))}
             (set (map #(get % "id") (get-in objects [(str (entity 1)) "eventLinks"])))))
      (is (= [(str (entity 101))] (map #(get % "id") (get-in objects [(str (entity 1)) "area"]))))
      (is (= [(str (entity 5))] (map #(get % "id") (get-in objects [(str (entity 3)) "parent"]))))
      (is (= [{}] (get-in objects [(str (entity 2)) "parent"])))
      (is (= [{}] (get-in objects [(str (entity 2)) "activityType"])))
      (is (empty? (get-in objects [(str (entity 4)) "area"])))
      (is (empty? (get-in objects [(str (entity 9)) "eventLinks"]))))
    (doseq [[label removed expected]
            [[:range-only ["recurrenceRule" "exceptionDate"] #{1 2 9}]
             [:exception-only ["date"] #{1 2 4 7}]]]
      (testing (name label)
        (jdbc/execute! conn ["SAVEPOINT empty_branches"])
        (doseq [field removed]
          (jdbc/execute! conn ["DELETE FROM triples WHERE app_id = ? AND attr_id = ?"
                               fixtures/measured-app (:id (attr "sections" field))]))
        (let [baseline (query-result conn fixtures/measured-query false nil)
              candidate (query-result conn fixtures/measured-query true nil)]
          (is (projected? candidate))
          (is (= (dissoc baseline :sql) (dissoc candidate :sql)))
          (is (= (set (map #(str (entity %)) expected))
                 (set (map #(get % "id") (get-in candidate [:objects "sections"]))))))
        (jdbc/execute! conn ["ROLLBACK TO SAVEPOINT empty_branches"])))))

(deftest calendar-projection-retains-permission-filtering
  (jdbc/with-transaction [conn (aurora/conn-pool :write) {:rollback-only true}]
    (create-triples! conn)
    (seed! conn)
    (let [rules {"$default" {"allow" {"view" "true"}}
                 "sections" {"allow" {"view" (str "data.id != '" (entity 2) "'")}}
                 "areas" {"allow" {"view" (str "data.id != '" (entity 102) "'")}}
                 "sourceLinks" {"allow" {"view" (str "data.id != '" (entity 302) "'")}}}
          baseline (query-result conn fixtures/measured-query false rules)
          candidate (query-result conn fixtures/measured-query true rules)
          objects (into {} (map (juxt #(get % "id") identity)) (get-in candidate [:objects "sections"]))]
      (is (projected? candidate))
      (is (= (dissoc baseline :sql) (dissoc candidate :sql)))
      (is (= (set (map #(str (entity %)) [1 3 4 7 9])) (set (keys objects))))
      (is (empty? (get-in objects [(str (entity 3)) "area"])))
      (is (= [(str (entity 301))] (map #(get % "id") (get-in objects [(str (entity 1)) "eventLinks"])))))))

(deftest many-valued-date-joins-retain-all-combinations
  (jdbc/with-transaction [conn (aurora/conn-pool :write) {:rollback-only true}]
    (create-triples! conn)
    (seed! conn)
    (let [date-ids #{(:id (attr "sections" "date")) (:id (attr "sections" "exceptionDate"))}
          attrs (attr-model/wrap-attrs (mapv #(if (date-ids (:id %)) (assoc % :cardinality :many) %)
                                            fixtures/measured-attrs))
          rules {"$default" {"allow" {"view" "true"}}
                 "sections" {"allow" {"view" (str "data.id != '" (entity 2) "'")}}
                 "sourceLinks" {"allow" {"view" (str "data.id != '" (entity 302) "'")}}}]
      (doseq [aid date-ids]
        (jdbc/execute! conn ["UPDATE triples SET ea = false WHERE app_id = ? AND attr_id = ?"
                             fixtures/measured-app aid]))
      (doseq [[label value] [["date" "2026-08-10"] ["date" "2026-09-15"]
                             ["date" "2026-09-30"] ["date" "2026-10-15"]
                             ["exceptionDate" "2026-09-01"] ["exceptionDate" "2026-09-30"]]]
        (jdbc/execute! conn
                       ["INSERT INTO triples
                         SELECT app_id, entity_id, attr_id, ?::jsonb, checked_data_type,
                                created_at, false, eav, av, ave, vae
                         FROM triples WHERE app_id = ? AND entity_id = ? AND attr_id = ? LIMIT 1"
                        (json/->json value) fixtures/measured-app (entity 1) (:id (attr "sections" label))]))
      (doseq [policy [nil rules]]
        (let [baseline (query-result conn fixtures/measured-query false policy attrs)
              candidate (query-result conn fixtures/measured-query true policy attrs)
              objects (into {} (map (juxt #(get % "id") identity)) (get-in candidate [:objects "sections"]))
              root-rows (get-in candidate [:raw "m-6"])]
          (is (projected? candidate))
          (is (= (dissoc baseline :sql) (dissoc candidate :sql)))
          ;; Four lower-bound values pair with four upper-bound values, while
          ;; the recurring branch has four matches and the exception branch 3x3.
          (is (= 29 (reduce + 0 (for [[row n] root-rows
                                     :when (= (str (entity 1)) (get row "m_6_entity_id"))]
                                 n))))
          (is (= (set (map #(str (entity %)) (if policy [1 3 4 7 9] [1 2 3 4 7 9])))
                 (set (keys objects))))
          (is (= (set (map #(str (entity %)) (if policy [301] [301 302])))
                 (set (map #(get % "id") (get-in objects [(str (entity 1)) "eventLinks"]))))))))))
