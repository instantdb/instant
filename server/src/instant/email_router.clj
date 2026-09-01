(ns instant.email-router
  (:require
   [instant.config :as config]
   [instant.flags :as flags]
   [instant.postmark :as postmark]
   [instant.resend :as resend]
   [instant.sendgrid :as sendgrid]))

(def sendgrid-froms
  {"verify@auth-pm.instantdb.com" "verify@auth-sg.instantdb.com"
   "verify@dash-pm.instantdb.com" "verify@auth-sg.instantdb.com"})

(defn send-structured! [req]
  (cond
    ;; Explicit provider override (self-hosted)
    (= :resend (config/email-provider))
    (resend/send! req)

    (= :sendgrid (config/email-provider))
    (sendgrid/send! req)

    (= :postmark (config/email-provider))
    (postmark/send-structured! req)

    ;; Auto-detect: Resend configured and others not
    (and (config/resend-send-enabled?)
         (not (config/postmark-send-enabled?))
         (not (config/sendgrid-send-enabled?)))
    (resend/send! req)

    ;; Auto-detect: SendGrid configured and Postmark not — route through
    ;; SendGrid using the operator's own from-address.
    (and (config/sendgrid-send-enabled?)
         (not (config/postmark-send-enabled?)))
    (sendgrid/send! req)

    ;; Hosted: gated by the feature flag, and only for the known Instant
    ;; from-addresses that have a SendGrid equivalent.
    (and (flags/send-with-sendgrid?)
         (contains? sendgrid-froms (-> req :from :email)))
    (sendgrid/send! (update-in req [:from :email] sendgrid-froms))

    :else
    (postmark/send-structured! req)))
