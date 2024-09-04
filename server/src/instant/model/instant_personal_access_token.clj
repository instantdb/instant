(ns instant.model.instant-personal-access-token
  (:require [instant.jdbc.aurora :as aurora]
            [instant.jdbc.sql :as sql]
            [instant.model.instant-user :as instant-user-model])
  (:import
   (java.util UUID)))

(defn create!
  ([params] (create! aurora/conn-pool params))
  ([conn {:keys [id user-id name]}]
   (sql/execute-one! conn
                     ["INSERT INTO instant_personal_access_tokens (id, user_id, name)
                       VALUES (?::uuid, ?::uuid, ?::text)"
                      id user-id name])))

(defn list-by-user-id!
  ([params] (list-by-user-id! aurora/conn-pool params))
  ([conn {:keys [user-id]}]
   (sql/select conn
               ["select *
                 from instant_personal_access_tokens
                 where user_id = ?::uuid"
                user-id])))

(defn delete-by-id!
  ([params] (delete-by-id! aurora/conn-pool params))
  ([conn {:keys [id user-id]}]
   (sql/execute-one! conn
                     ["DELETE FROM instant_personal_access_tokens
                       WHERE id = ?::uuid AND user_id = ?::uuid"
                      id user-id])))

(comment
  (def user (instant-user-model/get-by-email {:email "alex@instantdb.com"}))
  (def record (create! {:id (UUID/randomUUID) :user-id (:id user) :name "Default Token"}))
  (list-by-user-id! {:user-id (:id user)})
  (delete-by-id! {:id (:id record) :user-id (:id user)}))

