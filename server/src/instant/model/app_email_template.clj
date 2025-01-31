(ns instant.model.app-email-template
  (:require
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql])
  (:import
   (java.util UUID)))

(defn put!
  ([params] (put! (aurora/conn-pool :write) params))
  ([conn {:keys [app-id sender-id email-type subject name body]}]
   (sql/execute-one!
    conn
    ["INSERT INTO
        app_email_templates
        (id, app_id, sender_id, email_type, subject, name, body)
      VALUES
        (?::uuid, ?::uuid, ?::uuid, ?, ?, ?, ?)
      ON CONFLICT (app_id, email_type)
      DO UPDATE SET
        sender_id = EXCLUDED.sender_id,
        subject = EXCLUDED.subject,
        name = EXCLUDED.name,
        body = EXCLUDED.body
      RETURNING id"
     (UUID/randomUUID) app-id sender-id email-type subject name body])))

(defn get-by-app-id-and-email-type
  ([params] (get-by-app-id-and-email-type (aurora/conn-pool :read) params))
  ([conn {:keys [app-id email-type]}]
   (sql/select-one conn
                   ["SELECT
                     t.id,
                     t.app_id,
                     t.email_type,
                     t.body,
                     t.name,
                     t.subject,
                     s.email,
                     s.postmark_id
                    FROM app_email_templates t
                    LEFT JOIN app_email_senders s
                     ON t.sender_id = s.id
                    WHERE t.app_id = ?::uuid
                    AND t.email_type = ?"
                    app-id email-type])))

(defn delete-by-id!
  ([params] (delete-by-id! (aurora/conn-pool :write) params))
  ([conn {:keys [id app-id]}]
   (sql/execute-one! conn ["DELETE FROM app_email_templates WHERE id = ?::uuid AND app_id = ?::uuid" id app-id])))
