(ns instant.model.app-user
  (:require
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.model.app :as app-model]
   [instant.model.instant-user :as instant-user-model]
   [instant.model.app-user-refresh-token :refer [hash-token]]
   [instant.system-catalog-ops :refer [update-op query-op]]
   [instant.util.exception :as ex])
  (:import
   (java.util UUID)))

(def etype "$users")

(defn create!
  ([params] (create! aurora/conn-pool params))
  ([conn {:keys [id app-id email]}]
   (update-op
    conn
    {:app-id app-id
     :etype etype
     :legacy-op (fn [conn]
                  (sql/execute-one! conn
                                    ["INSERT INTO app_users (id, app_id, email) VALUES (?::uuid, ?::uuid, ?)"
                                     id app-id email]))
     :triples-op (fn [{:keys [transact! resolve-id get-entity]}]
                  (transact! [[:add-triple id (resolve-id :id) id]
                              [:add-triple id (resolve-id :email) email]])
                  (get-entity id))})))

(defn get-by-id
  ([params] (get-by-id aurora/conn-pool params))
  ([conn {:keys [app-id id]}]
   (query-op
    conn
    {:app-id app-id
     :etype etype
     :legacy-op (fn []
                  (sql/select-one
                   conn
                   ["SELECT * FROM app_users
                      WHERE app_id = ?::uuid AND id = ?::uuid"
                    app-id id]))
     :triples-op (fn [{:keys [get-entity]}]
                  (get-entity id))})))

(defn get-by-refresh-token
  ([params] (get-by-refresh-token aurora/conn-pool params))
  ([conn {:keys [app-id refresh-token]}]
   (query-op
    conn
    {:app-id app-id
     :etype etype
     :legacy-op
     (fn []
       (sql/select-one
        conn
        ["SELECT app_users.*
           FROM app_users
           JOIN app_user_refresh_tokens ON app_users.id = app_user_refresh_tokens.user_id
           WHERE app_user_refresh_tokens.id = ?::uuid AND app_users.app_id = ?::uuid"
         refresh-token app-id]))
     :triples-op (fn [{:keys [get-entity-where]}]
                  (get-entity-where {:$userRefreshTokens.hashedToken (hash-token refresh-token)}))})))

(defn get-by-refresh-token! [params]
  (ex/assert-record! (get-by-refresh-token params) :app-user {:args [params]}))

(defn get-by-email
  ([params] (get-by-email aurora/conn-pool params))
  ([conn {:keys [app-id email]}]
   (query-op
    conn
    {:app-id app-id
     :etype etype
     :legacy-op
     (fn []
       (sql/select-one conn
                       ["SELECT * FROM app_users WHERE app_id = ?::uuid AND email = ?"
                        app-id email]))
     :triples-op (fn [{:keys [get-entity-where]}]
                  (get-entity-where {:email email}))})))

(defn get-by-email! [params]
  (ex/assert-record! (get-by-email params) :app-user {:args [params]}))

(defn update-email!
  ([params] (update-email! aurora/conn-pool params))
  ([conn {:keys [id app-id email]}]
   (update-op
    conn
    {:app-id app-id
     :etype etype
     :legacy-op
     (fn []
       (sql/execute-one! conn
                         ["UPDATE app_users set email = ? where id = ?::uuid"
                          email id]))
     :triples-op (fn [{:keys [transact! resolve-id get-entity]}]
                  (transact! [[:add-triple id (resolve-id :email) email]])
                  (get-entity id))})))

(defn delete-by-email!
  ([params] (delete-by-email! aurora/conn-pool params))
  ([conn {:keys [app-id email]}]
   (update-op
    conn
    {:app-id app-id
     :etype etype
     :legacy-op
     (fn []
       (sql/execute-one! conn
                         ["DELETE FROM app_users WHERE app_id = ?::uuid AND email = ?" app-id email]))
     :triples-op (fn [{:keys [delete-entity! resolve-id]}]
                   (delete-entity! [(resolve-id :email) email]))})))

(defn delete-by-id!
  ([params] (delete-by-id! aurora/conn-pool params))
  ([conn {:keys [app-id id]}]
   (update-op
    conn
    {:app-id app-id
     :etype etype
     :legacy-op
     (fn [conn]
       (sql/execute-one! conn
                         ["DELETE FROM app_users WHERE app_id = ?::uuid AND id = ?::uuid" app-id id]))
     :triples-op (fn [{:keys [delete-entity!]}]
                   (delete-entity! id))})))


(defn get-by-email-or-oauth-link-qualified
  ([params] (get-by-email-or-oauth-link-qualified aurora/conn-pool params))
  ([conn {:keys [app-id email sub provider-id]}]
   (query-op
    conn
    {:app-id app-id
     :etype etype
     :legacy-op
     (fn []
       (sql/select-qualified
        conn
        ["SELECT * FROM app_users as u
           left join app_user_oauth_links as l on u.id = l.user_id
           where u.app_id = ?::uuid and (u.email = ? or (l.sub = ? and l.provider_id = ?))"
         app-id email sub provider-id]))
     :triples-op (fn [{:keys [admin-query]}]
                  (let [sub+provider (format "%s+%s" sub provider-id)
                        q {etype
                           {:$ {:where {:or [{:email email}
                                             {:$oauthUserLinks.sub+$oauthProvider
                                              sub+provider}]}}
                            :$oauthUserLinks {:$ {:where {:sub+$oauthProvider
                                                            sub+provider}}}}}
                        res (admin-query q)]
                    (map (fn [user]
                           (merge {:app_users/id (parse-uuid (get user "id"))
                                   :app_users/email (get user "email")
                                   :app_users/app_id app-id}
                                  (when-let [links (seq (get user "$oauthUserLinks"))]
                                    ;; Adding this assert just for extra protection,
                                    ;; but we should never have multiple because the
                                    ;; link is unique by sub+provider-id
                                    (assert (= 1 (count links)))
                                    (let [link (first links)]
                                      {:app_user_oauth_links/id (parse-uuid (get link "id"))
                                       :app_user_oauth_links/app_id app-id
                                       :app_user_oauth_links/sub (get link "sub")
                                       :app_user_oauth_links/provider_id (get link "$oauthProvider")
                                       :app_user_oauth_links/user_id (parse-uuid (get user "id"))}))))
                         (get res etype))))})))

(defn get-or-create-by-email! [{:keys [email app-id]}]
  (or (get-by-email {:email email :app-id app-id})
      (create! {:id (UUID/randomUUID) :email email :app-id app-id})))

(comment
  (def u (instant-user-model/get-by-email {:email "stopa@instantdb.com"}))
  (def a (first (app-model/get-all-for-user {:user-id (:id u)})))
  (create! {:id (UUID/randomUUID) :email "testinguser@gmail.com" :app-id (:id a)})
  (delete-by-email! {:email "testinguser@gmail.com"
                     :app-id (:id a)})

  (get-by-email-or-oauth-link-qualified {:app-id (:id a)
                                         :email "testinguser@gmail.com"
                                         :sub "123"
                                         :provider-id (UUID/randomUUID)}))
