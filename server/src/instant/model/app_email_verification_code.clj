(ns instant.model.app-email-verification-code
  (:require
   [instant.config :as config]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [hiccup2.core :as h]
   [instant.util.exception :as ex])
  (:import
   (java.time Instant)
   (java.time.temporal ChronoUnit)
   (java.util Date)))

(defn put!
  ([params] (put! (aurora/conn-pool :write) params))
  ([conn {:keys [code app-id verification-id]}]
   (sql/do-execute!
    conn
    ["DELETE FROM app_email_verification_codes
         WHERE verification_id = ?::uuid AND app_id = ?"
     verification-id app-id])
   (sql/execute-one!
    conn ["INSERT INTO app_email_verification_codes
          (id, code, app_id, verification_id)
          VALUES (?::uuid, ?, ?, ?)
          RETURNING *"
          (random-uuid) code app-id verification-id])))

(defn expired?
  ([expiry-minutes verification-code]
   (expired? (Instant/now) expiry-minutes verification-code))
  ([now expiry-minutes {created-at :created_at}]
   (> (.between ChronoUnit/MINUTES (Date/.toInstant created-at) now) expiry-minutes)))

(defn consume!
  ([params] (consume! (aurora/conn-pool :write) params))
  ([conn {:keys [code verification-id expiry-minutes app-id] :as params}]
   (let [verification-code (sql/execute-one!
                            conn
                            ["DELETE FROM app_email_verification_codes
                              WHERE code = ?
                              AND verification_id = ?::uuid
                              AND app_id = ?
                              RETURNING *"
                             code verification-id app-id])]
     (when (and verification-code
                (expired? expiry-minutes verification-code))
       (ex/throw-expiration-err! :app-email-verification-code {:args [params]}))
     verification-code)))

(defn format-email [{:keys [code sender-email app-title]}]
  (let [{sender-name :name from-email :email} (config/dashboard-email-sender)]
    {:from {:name sender-name
            :email from-email}
     :to [{:email sender-email}]
     :subject (str code " is your Instant sender verification code for app: " app-title)
     :reply-to from-email

     :html (str (h/html [:p "Use this code to verify your custom sender email address on Instant for the app: "
                         [:strong app-title]]
                        [:h2 {:style "text-align: center"} code] [:p "This code can only be used once."]))}))
