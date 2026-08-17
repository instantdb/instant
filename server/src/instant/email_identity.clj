(ns instant.email-identity
  (:require
   [instant.config :as config]
   [instant.postmark :as postmark]
   [instant.ses :as ses]
   [instant.util.exception :as ex]))

(def postmark-out-of-sync-error-message
  "Failed to add Postmark Sender Signature because it already exists on Postmark's side but not in our DB. Need to manually fix.")

(def postmark-public-domain-error-message
  "Cannot use public domain email address (e.g. gmail.com) as sender email.")

(defn provider []
  (cond
    (= :ses (config/email-provider)) :ses
    ;; Self-hosted SES-only deployments should manage custom senders in SES
    ;; even when INSTANT_EMAIL_PROVIDER is left unset.
    (and (nil? (config/email-provider))
         (config/aws-ses-enabled?)
         (not (config/postmark-send-enabled?))
         (not (config/sendgrid-send-enabled?)))
    :ses
    ;; SendGrid does not expose sender identity management through Instant yet.
    ;; Preserve the existing Postmark-backed custom-sender flow.
    :else :postmark))

(defn- sync-postmark! [{:keys [email name sender]}]
  (let [postmark-id (:postmark_id sender)
        postmark-sender (when postmark-id
                          (try
                            (postmark/get-sender! {:id postmark-id})
                            (catch clojure.lang.ExceptionInfo e
                              (if (postmark/signature-not-found?
                                   (-> e ex-data :body :ErrorCode))
                                nil
                                (throw e)))))
        response (if postmark-sender
                   (postmark/edit-sender! {:id postmark-id :name name})
                   (try
                     (postmark/add-sender! {:email email :name name})
                     (catch clojure.lang.ExceptionInfo e
                       (cond
                         (postmark/signature-exists? e)
                         (throw (ex-info postmark-out-of-sync-error-message
                                         {:type :postmark-sync-error
                                          :message postmark-out-of-sync-error-message
                                          :e e}))

                         (postmark/public-domain-email? e)
                         (ex/throw-validation-err!
                          :sender-email email
                          [{:message postmark-public-domain-error-message}])

                         :else (throw e)))))]
    {:email-provider "postmark"
     :postmark-id (-> response :body :ID)
     :provider-id (str (-> response :body :ID))}))

(defn- sync-ses! [{:keys [email identity-type]}]
  (when-not (config/aws-ses-enabled?)
    (throw (ex-info
            "AWS SES is selected, but AWS_SES_ACCESS_KEY_ID and AWS_SES_SECRET_ACCESS_KEY are not configured."
            {:type :ses-configuration-error})))
  (let [{:keys [identity]} (ses/ensure-identity!
                            {:email email
                             :identity-type identity-type})]
    {:email-provider "ses"
     :postmark-id nil
     :provider-id identity}))

(defn sync-sender! [{:keys [identity-type] :as params}]
  (case (provider)
    :ses (sync-ses! (assoc params :identity-type (or identity-type :domain)))
    :postmark (sync-postmark! params)))

(defn get-sender! [{:keys [email email_provider provider_id postmark_id]}]
  (case (keyword (or email_provider "postmark"))
    :ses (some-> (ses/get-formatted-identity provider_id)
                 (assoc :EmailAddress email))
    :postmark (when postmark_id
                (-> (postmark/get-sender! {:id postmark_id}) :body))))
