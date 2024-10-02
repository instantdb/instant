(ns instant.model.app-user
  (:require [instant.jdbc.aurora :as aurora]
            [instant.jdbc.sql :as sql]
            [instant.model.instant-user :as instant-user-model]
            [instant.model.app :as app-model]
            [instant.util.exception :as ex])
  (:import
   (java.util UUID)))

(defn create!
  ([params] (create! aurora/conn-pool params))
  ([conn {:keys [id app-id email]}]
   (sql/execute-one! conn
                     ["INSERT INTO app_users (id, app_id, email) VALUES (?::uuid, ?::uuid, ?)"
                      id app-id email])))

(defn get-by-id
  ([params] (get-by-id aurora/conn-pool params))
  ([conn {:keys [app-id id]}]
   (sql/select-one conn
                   ["SELECT * FROM app_users
                    WHERE app_id = ?::uuid AND id = ?::uuid"
                    app-id id])))

(defn get-by-refresh-token
  ([params] (get-by-refresh-token aurora/conn-pool params))
  ([conn {:keys [app-id refresh-token]}]
   (sql/select-one
    conn
    ["SELECT app_users.*
     FROM app_users
     JOIN app_user_refresh_tokens ON app_users.id = app_user_refresh_tokens.user_id
     WHERE app_user_refresh_tokens.id = ?::uuid AND app_users.app_id = ?::uuid"
     refresh-token app-id])))

(defn get-by-refresh-token! [params]
  (ex/assert-record! (get-by-refresh-token params) :app-user {:args [params]}))

(defn get-by-email
  ([params] (get-by-email aurora/conn-pool params))
  ([conn {:keys [app-id email]}]
   (sql/select-one conn
                   ["SELECT * FROM app_users WHERE app_id = ?::uuid AND email = ?"
                    app-id email])))

(defn get-by-email! [params]
  (ex/assert-record! (get-by-email params) :app-user {:args [params]}))

(defn update-email!
  ([params] (update-email! aurora/conn-pool params))
  ([conn {:keys [id email]}]
   (sql/execute-one! conn
                     ["UPDATE app_users set email = ? where id = ?::uuid"
                      email id])))

(defn delete-by-email!
  ([params] (delete-by-email! aurora/conn-pool params))
  ([conn {:keys [app-id email]}]
   (sql/execute-one! conn
                     ["DELETE FROM app_users WHERE app_id = ?::uuid AND email = ?" app-id email])))

(defn delete-by-id!
  ([params] (delete-by-id! aurora/conn-pool params))
  ([conn {:keys [app-id id]}]
   (sql/execute-one! conn
                     ["DELETE FROM app_users WHERE app_id = ?::uuid AND id = ?::uuid" app-id id])))


(defn get-by-email-or-oauth-link-qualified
  ([params] (get-by-email-or-oauth-link-qualified aurora/conn-pool params))
  ([conn {:keys [app-id email sub provider-id]}]
   (sql/select-qualified
    conn
    ["SELECT * FROM app_users as u
       left join app_user_oauth_links as l on u.id = l.user_id
       where u.app_id = ?::uuid and (u.email = ? or (l.sub = ? and l.provider_id = ?))"
     app-id email sub provider-id])))

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
