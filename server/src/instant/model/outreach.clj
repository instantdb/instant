(ns instant.model.outreach
  (:require
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.model.instant-user :as instant-user-model]))

(defn create!
  ([params] (create! (aurora/conn-pool :write) params))
  ([conn {:keys [user-id]}]
   (sql/execute-one! conn
                    ["INSERT INTO instant_user_outreaches (user_id) VALUES (?::uuid)"
                     user-id])))
(defn get-by-user-id
  ([params] (get-by-user-id (aurora/conn-pool :read) params))
  ([conn {:keys [user-id]}]
   (sql/select-one conn ["SELECT * FROM instant_user_outreaches WHERE user_id = ?" user-id])))

(defn delete-by-user-id!
  ([params] (delete-by-user-id! (aurora/conn-pool :write) params))
  ([conn {:keys [user-id]}]
   (sql/execute-one! conn
                    ["DELETE FROM instant_user_outreaches WHERE user_id = ?::uuid"
                     user-id])))
(comment
  (def u (instant-user-model/get-by-email {:email "stopa@instantdb.com"}))
  (delete-by-user-id! {:user-id (:id u)})
  (create! {:user-id (:id u)})
  (get-by-user-id {:user-id (:id u)}))
