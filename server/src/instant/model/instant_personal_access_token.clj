(ns instant.model.instant-personal-access-token
  (:require [instant.jdbc.aurora :as aurora]
            [instant.jdbc.sql :as sql]
            [instant.model.instant-user :as instant-user-model])
  (:import
   (java.util UUID)))

(defn create!
  ([params] (create! aurora/conn-pool params))
  ([conn {:keys [id user-id]}]
   (sql/execute-one! conn
                     ["INSERT INTO instant_personal_access_tokens (id, user_id) VALUES (?::uuid, ?::uuid)"
                      id user-id])))

(defn delete-by-id!
  ([params] (delete-by-id! aurora/conn-pool params))
  ([conn {:keys [id]}]
   (sql/execute-one! conn
                     ["DELETE FROM instant_personal_access_tokens WHERE id = ?::uuid"
                      id])))

(comment
  (def user (instant-user-model/get-by-email {:email "alex@instantdb.com"}))
  (def record (create! {:id (UUID/randomUUID) :user-id (:id user)}))
  (delete-by-id! {:id (:id record)}))

