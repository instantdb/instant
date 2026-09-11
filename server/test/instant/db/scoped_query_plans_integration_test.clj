(ns instant.db.scoped-query-plans-integration-test
  (:require [clojure.test :refer [deftest is]]
            [honey.sql :as hsql]
            [instant.db.datalog :as d]
            [instant.db.numeric-range-plan-test :as numeric]
            [instant.db.scoped-query-plans :as plans]
            [instant.db.scoped-query-plans-test :as fixtures]
            [instant.jdbc.aurora :as aurora]
            [instant.jdbc.sql :as sql]
            [instant.util.instaql :as instaql-util]
            [next.jdbc :as jdbc]))

;; Exercise the SQL rewrite with reference triples, including multiple parents,
;; another user, an unlinked child, a null reference, and another tenant.
(deftest filtered-child-preserves-reference-results
  (jdbc/with-transaction [conn (aurora/conn-pool :write) {:rollback-only true}]
    (jdbc/execute! conn
                   ["CREATE TEMP TABLE triples (
                       app_id uuid, entity_id uuid, attr_id uuid, value jsonb,
                       eav boolean, vae boolean) ON COMMIT DROP"])
    (jdbc/execute! conn ["CREATE INDEX vae_uuid_index ON triples
                         (app_id, attr_id, json_uuid_to_uuid(value)) WHERE vae"])
    (jdbc/execute! conn ["CREATE INDEX triples_pkey ON triples (app_id, entity_id, attr_id)"])
    (let [app fixtures/child-app
          other-app (random-uuid)
          user fixtures/user-id
          other-user (java.util.UUID. 0 10)
          parent-a (java.util.UUID. 0 100)
          parent-b (java.util.UUID. 0 101)
          child-a (java.util.UUID. 0 200)
          child-b (java.util.UUID. 0 201)
          child-c (java.util.UUID. 0 202)
          link-attr fixtures/attr-id
          user-attr (java.util.UUID. 0 3)
          triples [[app child-a link-attr parent-a]
                   [app child-a link-attr parent-b]
                   [app child-a user-attr user]
                   [app child-a user-attr other-user]
                   [app child-b link-attr parent-a]
                   [app child-b user-attr other-user]
                   [app child-c user-attr user]
                   [app child-c link-attr nil]
                   [other-app child-b link-attr parent-a]
                   [other-app child-b user-attr user]]
          ctes (into [[:m-3 {:union-all
                             [{:select [[[:cast parent-a :uuid] :m-3-entity-id]]}
                              {:select [[[:cast parent-b :uuid] :m-3-entity-id]]}]}
                       :materialized]]
                     (assoc-in fixtures/child-ctes [2 1 :where 3] [:= :attr-id user-attr]))
          hints (:pg-hints (second fixtures/cases))
          normalized (instaql-util/normalized-forms fixtures/child-query)
          optimized (plans/apply-plan app normalized ctes hints #{:m-6} nil)
          execute (fn [ctes hints]
                    (jdbc/execute! conn (hsql/format
                                         {:with ctes :pg-hints hints
                                          :select :* :from :m-6})))]
      (doseq [[app entity attr value] triples]
        (jdbc/execute! conn
                       ["INSERT INTO triples VALUES (?, ?, ?, ?::jsonb, true, true)"
                        app entity attr (if value (str "\"" value "\"") "null")]))
      (is (not= ctes (:ctes optimized)))
      (let [baseline (execute ctes hints)
            candidate (execute (:ctes optimized) (:pg-hints optimized))]
        (is (= 2 (count baseline)))
        (is (= (frequencies baseline) (frequencies candidate)))))))

(deftest numeric-range-preserves-boundaries-and-pagination
  (jdbc/with-transaction [conn (aurora/conn-pool :write) {:rollback-only true}]
    (jdbc/execute! conn
                   ["CREATE TEMP TABLE triples (
                       app_id uuid, entity_id uuid, attr_id uuid, value jsonb,
                       checked_data_type checked_data_type, created_at bigint,
                       ea boolean, eav boolean, ave boolean) ON COMMIT DROP"])
    (jdbc/execute! conn ["CREATE INDEX triples_pkey ON triples (app_id, entity_id, attr_id)"])
    (jdbc/execute! conn ["CREATE UNIQUE INDEX ea_index ON triples (app_id, entity_id, attr_id) WHERE ea"])
    (jdbc/execute! conn ["CREATE INDEX triples_number_type_idx ON triples
                         (app_id, attr_id, triples_extract_number_value(value))
                         WHERE ave AND checked_data_type = 'number'"])
    ;; More than one page of equal timestamps, plus exact bounds, null, a
    ;; missing timestamp, out-of-range values, and the same IDs in another app.
    (doseq [app [numeric/app-id (random-uuid)]]
      (jdbc/execute! conn
                     ["INSERT INTO triples
                       SELECT ?::uuid, ('00000000-0000-0000-0000-' || lpad(to_hex(n), 12, '0'))::uuid,
                              ?::uuid, to_jsonb(('00000000-0000-0000-0000-' || lpad(to_hex(n), 12, '0'))::uuid),
                              null, n, true, false, false
                       FROM generate_series(1, 1010) AS n"
                      app (java.util.UUID. 0 1)])
      (jdbc/execute! conn
                     ["INSERT INTO triples
                       SELECT ?::uuid, ('00000000-0000-0000-0000-' || lpad(to_hex(n), 12, '0'))::uuid,
                              ?::uuid, coalesce(to_jsonb(CASE n WHEN 1 THEN 100 WHEN 2 THEN 200
                                                       WHEN 3 THEN null WHEN 5 THEN 50
                                                       WHEN 6 THEN 300 ELSE 150 END), 'null'::jsonb),
                              'number', n, true, false, true
                       FROM generate_series(1, 1010) AS n WHERE n <> 4"
                      app numeric/timestamp-attr]))
    (binding [d/*enable-pg-hints* true]
      (doseq [[lower upper expected-count has-next]
              [[100 200 1000 true] [149 151 1000 true] [50 100 0 false]
               [99 101 1 false] [199 201 1 false] [200 100 0 false]
               [150 150 0 false] [500 600 0 false]]]
        (let [q (assoc-in numeric/query [:Prices :$ :where :and]
                          [{:timestamp {:$gt lower}} {:timestamp {:$lt upper}}])
              before (numeric/baseline q)
              after (numeric/compile-query q)
              run (fn [query]
                    (-> (jdbc/execute! conn (hsql/format query) {:builder-fn sql/as-string-maps})
                        first (get "json_build_array") first))
              a (run before)
              b (run after)
              ids (mapv #(get % "order_eid") (get b "m-2"))]
          (is (= (get a "m-2") (get b "m-2")))
          (is (= expected-count (count ids)))
          (is (= has-next (get-in b ["m-2-has-next" 0 "exists"])))
          (is (= false (get-in b ["m-2-has-prev" 0 "exists"])))
          (is (= (frequencies (get a "m-4")) (frequencies (get b "m-4"))))
          (when (= expected-count 1000)
            (is (= (mapv #(str (java.util.UUID. 0 %)) (range 7 1007)) ids)))
          (when (= expected-count 1)
            (is (= [(str (java.util.UUID. 0 (if (= lower 99) 1 2)))] ids))))))))
