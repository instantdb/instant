(ns instant.app-email-verification
  (:require
   [instant.config :as config]
   [instant.postmark :as postmark]
   [instant.util.email :as email]))

(defn send-code-email! [{:keys [code sender-email]}]
  (let [{sender-name :name from-email :email} (config/dashboard-email-sender)]
    (postmark/send-structured!
     {:from {:name sender-name
             :email from-email}
      :to [{:email sender-email}]
      :subject (str code " is your Instant sender verification code")
      :reply-to from-email
      :html
      (email/standard-body
       "<p>Use this code to verify your Instant sender email address:</p>
        <h2 style=\"text-align: center\"><strong>" code "</strong></h2>
        <p>This code can only be used once.</p>")})))
