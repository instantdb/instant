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

(defn get-all-by-verification-id
  ([params] (get-all-by-verification-id (aurora/conn-pool :read) params))
  ([conn {:keys [verification-id]}]
   (sql/select conn ["SELECT * FROM app_email_verification_codes
          WHERE verification_id = ?::uuid"
                     verification-id])))

(defn consume!
  ([params] (consume! (aurora/conn-pool :write) params))
  ([conn {:keys [code verification-id]}]
   (sql/execute-one! conn ["DELETE FROM app_email_verification_codes
          WHERE code = ? AND verification_id = ?
          RETURNING *"
                           code verification-id])))
