(ns instant.model.org-members
  (:require
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]))

(defn create!
  ([params] (create! (aurora/conn-pool :write) params))
  ([conn {:keys [org-id user-id role]}]
   (sql/execute-one!
    ::create!
    conn
    ["INSERT INTO org_members
       (id, org_id, user_id, role)
       VALUES
       (?::uuid, ?::uuid, ?, ?)"
     (random-uuid) org-id user-id role])))

(defn update-role
  ([params] (update-role (aurora/conn-pool :write) params))
  ([conn {:keys [role id]}]
   (sql/execute-one! ::update-role
                     conn
                     ["UPDATE org_members
                       SET role = ?
                       WHERE id = ?::uuid"
                      role
                      id])))

(defn get-by-org-and-user
  ([params] (get-by-org-and-user (aurora/conn-pool :read) params))
  ([conn {:keys [org-id user-id]}]
   (sql/select-one ::get-by-org-and-user
                   conn
                   ["SELECT * FROM org_members WHERE org_id = ?::uuid AND user_id = ?::uuid"
                    org-id user-id])))

(defn delete-by-id!
  ([params] (delete-by-id! (aurora/conn-pool :write) params))
  ([conn {:keys [id]}]
   (sql/execute-one! ::delete-by-id!
                     conn
                     ["DELETE FROM org_members WHERE id = ?::uuid"
                      id])))
