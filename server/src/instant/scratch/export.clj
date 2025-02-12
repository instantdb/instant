(ns instant.scratch.export
  (:require [honey.sql :as hsql]
            [instant.jdbc.sql :as sql]
            [instant.util.json :as json]
            [next.jdbc :as next-jdbc]
            [instant.model.instant-user :as instant-user-model]
            [instant.jdbc.aurora :as aurora]))

(defn export-app [conn app-id]
  {:app (sql/select-one conn (hsql/format {:select :*
                                           :from :apps
                                           :where [:= :id app-id]}))
   :triples (sql/select conn (hsql/format {:select :*
                                           :from :triples
                                           :where [:= :app_id app-id]}))
   :attrs (sql/select conn (hsql/format {:select :*
                                         :from :attrs
                                         :where [:= :app_id app-id]}))
   :rules (sql/select conn (hsql/format {:select :*
                                         :from :rules
                                         :where [:= :app_id app-id]}))
   :idents (sql/select conn (hsql/format {:select :*
                                          :from :idents
                                          :where [:= :app_id app-id]}))})

(defn import-app [conn-pool creator-id {:keys [app triples attrs rules idents]}]
  (next-jdbc/with-transaction [conn conn-pool]
    (sql/execute! conn (hsql/format {:insert-into :apps
                                     :values [{:id (:id app)
                                               :title (:title app)
                                               :creator_id creator-id}]}))
    (sql/execute! conn (hsql/format {:insert-into :app_admin_tokens
                                     :values [{:app_id (:id app)
                                               :token (random-uuid)}]}))
    (sql/execute! conn (hsql/format {:insert-into :attrs
                                     :values (map (fn [a]
                                                    (-> a
                                                        (dissoc :inferred_types)
                                                        (update :checked_data_type (fn [c]
                                                                                     [:cast c :checked_data_type]))))
                                                  attrs)}))
    (sql/execute! conn (hsql/format {:insert-into :idents
                                     :values idents}))
    (sql/execute! conn (hsql/format {:insert-into :rules
                                     :values (map (fn [rule]
                                                    (update rule :code (fn [code]
                                                                         [:cast (json/->json code) :jsonb])))
                                                  rules)}))
    (doseq [triples (partition-all 5000 triples)]
      (sql/execute! conn (hsql/format {:insert-into :triples
                                       :values (map (fn [t]
                                                      (-> t
                                                          (update :checked_data_type (fn [c]
                                                                                       [:cast c :checked_data_type]))
                                                          (update :value (fn [v]
                                                                           [:cast (json/->json v) :jsonb]))))
                                                    triples)})))))

(defn import!
  [{:keys [local-user-email prod-app-id]}]
  (let [_ (assert local-user-email "local-user-email is required")
        _ (assert prod-app-id "prod-app-id is required")

        _ (println (format  "Export app_id = %s" prod-app-id))
        exported-data (tool/with-prod-conn [pool]
                        (export-app pool prod-app-id))

        _ (println "Exported")

        _ (println (format "Fetch user by email = %s" local-user-email))
        {user-id :id} (instant-user-model/get-by-email (aurora/conn-pool :write)
                                                       {:email local-user-email})
        _ (assert user-id (format "User with email %s not found" local-user-email))
        _ (println (format "Fetched user id = %s" user-id))

        _ (println (format  "Importing app_id = %s to user-email = %s" prod-app-id local-user-email))
        _ (import-app (aurora/conn-pool :write) user-id exported-data)
        _ (println "Done!")]))

(comment
  (binding [sql/*query-timeout-seconds* 300]
    (import! {:local-user-email "stopa@instantdb.com"
              :prod-app-id nil})))


