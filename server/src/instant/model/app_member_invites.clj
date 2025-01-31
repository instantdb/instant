(ns instant.model.app-member-invites
  (:require
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.util.exception :as ex])
  (:import
   (java.util UUID)))

(defn create!
  ([params] (create! (aurora/conn-pool :write) params))
  ([conn {:keys [app-id inviter-id email role]}]
   (sql/execute-one!
    conn
    ["INSERT INTO app_member_invites
      (id, app_id, inviter_id, invitee_email, invitee_role, status, sent_at)
      VALUES
      (?::uuid, ?::uuid, ?::uuid, ?, ?, 'pending', NOW())
      ON CONFLICT (app_id, invitee_email)
      DO UPDATE SET status = 'pending', sent_at = NOW(), invitee_role = ?"
     (UUID/randomUUID) app-id inviter-id email role role])))

(defn get-by-id
  ([params] (get-by-id (aurora/conn-pool :read) params))
  ([conn {:keys [id]}]
   (sql/select-one conn
                   ["SELECT * 
                     FROM app_member_invites
                     WHERE id = ?::uuid"
                    id])))

(defn get-by-id!
  ([params] (get-by-id! (aurora/conn-pool :read) params))
  ([conn params]
   (ex/assert-record!
    (get-by-id conn params)
    :app-member-invite
    {:args [params]})))

(defn get-pending-for-invitee
  ([params] (get-pending-for-invitee (aurora/conn-pool :read) params))
  ([conn {:keys [email]}]
   (sql/select conn
               ["SELECT
                  i.id,
                  i.invitee_role,
                  a.id AS app_id,
                  a.title AS app_title,
                  u.email AS inviter_email
                 FROM app_member_invites as i
                 LEFT JOIN apps AS a ON a.id = i.app_id
                 LEFT JOIN instant_users u ON i.inviter_id = u.id
                 WHERE i.invitee_email = ?
                 AND i.status = 'pending'
                 AND i.sent_at >= NOW() - INTERVAL '3 days'"
                email])))

(defn accept-by-id!
  ([params] (accept-by-id! (aurora/conn-pool :write) params))
  ([conn {:keys [id] :as params}]
   (ex/assert-record!
    (sql/execute-one! conn
                      ["UPDATE app_member_invites
                       SET status = 'accepted'
                       WHERE id = ?::uuid
                       AND status = 'pending'
                       AND sent_at >= NOW() - INTERVAL '3 days'"
                       id])
    :app-member-invite
    {:args [params]})))

(defn reject-by-id
  ([params] (reject-by-id (aurora/conn-pool :write) params))
  ([conn {:keys [id]}]
   (sql/execute-one! conn
                     ["UPDATE app_member_invites
                       SET status='revoked'
                       WHERE id = ?::uuid
                       AND status = 'pending'"
                      id])))

(defn reject-by-email-and-role
  ([params] (reject-by-email-and-role (aurora/conn-pool :write) params))
  ([conn {:keys [inviter-id app-id invitee-email role]}]
   (sql/execute! conn
                 ["UPDATE app_member_invites
                  SET status = 'revoked'
                  WHERE inviter_id = ?::uuid 
                  AND app_id = ?::uuid
                  AND invitee_email = ? 
                  AND invitee_role = ?
                  AND status = 'pending'"
                  inviter-id app-id invitee-email role])))

(defn delete-by-id!
  ([params] (delete-by-id! (aurora/conn-pool :write) params))
  ([conn {:keys [id]}]
   (sql/execute-one! conn
                     ["DELETE FROM app_member_invites WHERE id = ?::uuid" id])))
