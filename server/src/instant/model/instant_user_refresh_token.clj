(ns instant.model.instant-user-refresh-token
  (:require [instant.jdbc.aurora :as aurora]
            [instant.jdbc.sql :as sql]
            [instant.model.instant-user :as instant-user-model])
  (:import
   (java.util UUID)))

(defn create!
  ([params] (create! (aurora/conn-pool :write) params))
  ([conn {:keys [id user-id]}]
   (sql/execute-one! conn
                     ["INSERT INTO instant_user_refresh_tokens (id, user_id) VALUES (?::uuid, ?::uuid)"
                      id user-id])))

(defn delete-by-id!
  ([params] (delete-by-id! (aurora/conn-pool :write) params))
  ([conn {:keys [id]}]
   (sql/execute-one! conn
                     ["DELETE FROM instant_user_refresh_tokens WHERE id = ?::uuid"
                      id])))

(comment
  (def u (instant-user-model/get-by-email {:email "stopa@instantdb.com"}))
  (def r (create! {:id (UUID/randomUUID) :user-id (:id u)}))
  (delete-by-id! {:id (:id r)}))

