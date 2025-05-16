(ns instant.model.instant-personal-access-token
  (:require [instant.jdbc.aurora :as aurora]
            [instant.jdbc.sql :as sql]
            [instant.model.instant-user :as instant-user-model]
            [instant.util.crypt :as crypt-util]
            [instant.util.token :as token-util]))

(defn format-token-for-api [token]
  (select-keys token [:token :id :user_id :name :created_at]))

(defn create!
  ([params] (create! (aurora/conn-pool :write) params))
  ([conn {:keys [user-id name]}]
   (let [id (random-uuid)
         token (token-util/generate-personal-access-token)
         res (sql/execute-one!
              conn
              ["INSERT INTO instant_personal_access_tokens (id, user_id, name, lookup_key)
                     VALUES (?::uuid, ?::uuid, ?::text, ?::bytea)"
               id
               user-id
               name
               (crypt-util/str->sha256 token)])]
     (assoc res :token token))))

(defn list-by-user-id!
  ([params] (list-by-user-id! (aurora/conn-pool :read) params))
  ([conn {:keys [user-id]}]
   (sql/select conn
               ["select *
                 from instant_personal_access_tokens
                 where user_id = ?::uuid"
                user-id])))

(defn delete-by-id!
  ([params] (delete-by-id! (aurora/conn-pool :write) params))
  ([conn {:keys [id user-id]}]
   (sql/execute-one! conn
                     ["DELETE FROM instant_personal_access_tokens
                       WHERE id = ?::uuid AND user_id = ?::uuid"
                      id user-id])))

(comment
  (def user (instant-user-model/get-by-email {:email "alex@instantdb.com"}))
  (def record (create! {:user-id (:id user) :name "Default Token"}))
  (list-by-user-id! {:user-id (:id user)})
  (delete-by-id! {:id (:id record) :user-id (:id user)}))
