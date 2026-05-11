(ns instant.model.app-email-verification
  (:require
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]))

(defn put!
  ([params] (put! (aurora/conn-pool :write) params))
  ([conn {:keys [app-id sender-id verified]}]
   (sql/execute-one! conn ["INSERT INTO
     app_email_verifications
     (id, app_id, sender_id, verified)
     VALUES (?::uuid, ?, ?, ?) ON CONFLICT DO NOTHING" (random-uuid) app-id sender-id verified])))
