(ns instant.db.scoped-query-plans-integration-test
  (:require [clojure.test :refer [deftest is]]
            [honey.sql :as hsql]
            [instant.db.scoped-query-plans :as plans]
            [instant.db.scoped-query-plans-test :as fixtures]
            [instant.jdbc.aurora :as aurora]
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
          optimized (plans/apply-plan app normalized ctes hints #{:m-6})
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
