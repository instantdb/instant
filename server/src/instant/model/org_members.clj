(ns instant.model.org-members
  (:require
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]))

(defn create!
  ([params] (create! (aurora/conn-pool :write) params))
  ([conn {:keys [org-id user-id role]}]
   (sql/execute-one!
    conn
    ["INSERT INTO org_members
       (id, org_id, user_id, member_role)
       VALUES
       (?::uuid, ?::uuid, ?, ?)"
     (random-uuid) org-id user-id role])))

(defn update-role
  ([params] (update-role (aurora/conn-pool :write) params))
  ([conn {:keys [role id]}]
   (sql/execute-one! conn
                     ["UPDATE org_members
                       SET member_role = ?
                       WHERE id = ?::uuid"
                      role
                      id])))
