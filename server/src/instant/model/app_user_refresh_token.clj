(ns instant.model.app-user-refresh-token
  (:require [instant.jdbc.aurora :as aurora]
            [instant.jdbc.sql :as sql]
            [instant.model.instant-user :as instant-user-model]
            [instant.model.app :as app-model]
            [instant.model.app-user :as app-user-model])
  (:import
   (java.util UUID)))

(defn get-by-id
  ([params] (get-by-id aurora/conn-pool params))
  ([conn {:keys [id]}]
   (sql/select-one conn
                   ["SELECT * FROM app_user_refresh_tokens WHERE id = ?::uuid"
                    id])))

(defn create!
  ([params] (create! aurora/conn-pool params))
  ([conn {:keys [id user-id]}]
   (sql/execute-one! conn
                     ["INSERT INTO app_user_refresh_tokens (id, user_id) VALUES (?::uuid, ?::uuid)"
                      id user-id])))

(defn delete-by-user-id!
  ([params] (delete-by-user-id! aurora/conn-pool params))
  ([conn {:keys [user-id]}]
   (sql/execute! conn
                 ["DELETE FROM app_user_refresh_tokens WHERE user_id = ?::uuid"
                  user-id])))

(defn delete-by-id!
  ([params] (delete-by-id! aurora/conn-pool params))
  ([conn {:keys [id]}]
   (sql/execute-one! conn
                     ["DELETE FROM app_user_refresh_tokens WHERE id = ?::uuid"
                      id])))

(comment
  (def instant-user (instant-user-model/get-by-email
                     {:email "stopa@instantdb.com"}))
  (def app (first (app-model/get-all-for-user {:user-id (:id instant-user)})))
  (def runtime-user (app-user-model/get-by-email {:app-id (:id app)
                                                  :email "stopa@instantdb.com"}))
  (def runtime-user (app-user-model/get-by-email {:app-id "b502cabc-11ed-4534-b340-349d46548642"
                                                  :email "stopa@instantdb.com"}))

  (def r (create! {:id (UUID/randomUUID) :user-id (:id runtime-user)}))
  (delete-by-id! {:id (:id r)})
  (delete-by-user-id! {:user-id (:id runtime-user)}))

