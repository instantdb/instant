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

(defn get-from-app-and-sender
  "gets the email verification for the given app and sender"
  [app-id sender-id]
  (sql/execute-one! (aurora/conn-pool :read) ["SELECT * FROM app_email_verifications WHERE app_id = ? AND sender_id = ?" app-id sender-id]))
