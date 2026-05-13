(ns instant.model.app-email-verification-code
  (:require
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]))

(defn put!
  ([params] (put! (aurora/conn-pool :write) params))
  ([conn {:keys [code verification-id]}]
   (sql/execute-one! conn ["INSERT INTO app_email_verification_codes
          (id, code, verification_id)
          VALUES (?::uuid, ?, ?)
          RETURNING *"
                           (random-uuid) code verification-id])))
