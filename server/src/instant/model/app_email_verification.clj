(ns instant.model.app-email-verification
  (:require
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]))

(defn put!
  ([params] (put! (aurora/conn-pool :write) params))
  ([conn {:keys [app-id sender-id verified]}]
   (sql/execute-one! conn ["INSERT INTO app_email_verifications
          (id, app_id, sender_id, verified)
          VALUES (?::uuid, ?, ?, ?)
          ON CONFLICT (app_id, sender_id) DO UPDATE SET sender_id = EXCLUDED.sender_id
          RETURNING id, verified"
                           (random-uuid) app-id sender-id verified])))

(defn get-by-app-and-sender
  "gets the email verification for the given app and sender"
  [app-id sender-id]
  (sql/execute-one! (aurora/conn-pool :read) ["SELECT * FROM app_email_verifications WHERE app_id = ? AND sender_id = ?" app-id sender-id]))

(defn mark-verified!
  ([params] (mark-verified! (aurora/conn-pool :write) params))
  ([conn {:keys [id]}]
   (sql/execute-one! conn ["UPDATE app_email_verifications
          SET verified = true
          WHERE id = ?::uuid
          RETURNING *"
                           id])))

(defn verified-by-app-and-sender?
  "returns true if the given app and sender have verified their email"
  [app-id sender-id]
  (boolean
   (sql/execute-one! (aurora/conn-pool :read) ["SELECT verified FROM app_email_verifications WHERE app_id = ? AND sender_id = ?" app-id sender-id])))

(defn get-by-app-id-and-email-type-with-template
  ([params] (get-by-app-id-and-email-type-with-template
             (aurora/conn-pool :read) params))
  ([conn {:keys [app-id email-type]}]
   (sql/select-one conn
                   ["SELECT
                     t.id,
                     t.app_id,
                     t.email_type,
                     t.body,
                     t.sender_id,
                     t.name,
                     t.subject,
                     s.email,
                     s.postmark_id,
                     v.id AS verification_id,
                     v.verified AS verification_verified
                    FROM app_email_templates t
                    LEFT JOIN app_email_senders s
                     ON t.sender_id = s.id
                    LEFT JOIN app_email_verifications v
                     ON t.sender_id = v.sender_id
                    WHERE t.app_id = ?::uuid
                    AND t.email_type = ?"
                    app-id email-type])))
