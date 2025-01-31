(ns instant.model.app-members
  (:require
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql])
  (:import
   (java.util UUID)))

(defn create!
  ([params] (create! (aurora/conn-pool :write) params))
  ([conn {:keys [app-id user-id role]}]
   (sql/execute-one!
    conn
    ["INSERT INTO app_members
       (id, app_id, user_id, member_role)
       VALUES
       (?::uuid, ?::uuid, ?, ?)"
     (UUID/randomUUID) app-id user-id role])))

(defn get-all-for-app
  ([params] (get-all-for-app (aurora/conn-pool :read) params))
  ([conn {:keys [app-id]}]
   (sql/select conn
               ["SELECT * FROM app_members WHERE app_id = ?"
                app-id])))

(defn get-by-app-and-user
  ([params] (get-by-app-and-user (aurora/conn-pool :read) params))
  ([conn {:keys [app-id user-id]}]
   (sql/select-one conn
                   ["SELECT * FROM app_members WHERE app_id = ?::uuid AND user_id = ?::uuid"
                    app-id user-id])))

(defn update-role
  ([params] (update-role (aurora/conn-pool :write) params))
  ([conn {:keys [role id]}]
   (sql/execute-one! conn
                     ["UPDATE app_members
                       SET member_role = ?
                       WHERE id = ?::uuid"
                      role
                      id])))

(defn delete-by-id!
  ([params] (delete-by-id! (aurora/conn-pool :write) params))
  ([conn {:keys [id]}]
   (sql/execute-one! conn
                     ["DELETE FROM app_members WHERE id = ?::uuid"
                      id])))
