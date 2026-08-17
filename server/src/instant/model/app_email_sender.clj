(ns instant.model.app-email-sender
  (:require [instant.config :as config]
            [instant.jdbc.aurora :as aurora]
            [instant.jdbc.sql :as sql]
            [instant.model.app-email-verification :as verification]
            [instant.postmark :as postmark]
            [instant.ses :as ses]
            [instant.util.exception :as ex])
  (:import (java.util UUID)))

(defn get-by-email
  ([params] (get-by-email (aurora/conn-pool :read) params))
  ([conn {:keys [email]}]
   (sql/select-one conn
                   ["SELECT *
                     FROM app_email_senders
                     WHERE email = ?"
                    email])))

(defn put!
  ([params] (put! (aurora/conn-pool :write) params))
  ([conn {:keys [email name postmark-id email-provider provider-id]}]
   (sql/execute-one!
    conn
    ["INSERT INTO
        app_email_senders
        (id, email, name, postmark_id, email_provider, provider_id)
      VALUES
        (?::uuid, ?, ?, ?, ?, ?)
      ON CONFLICT (email)
      DO UPDATE SET
        name = EXCLUDED.name,
        postmark_id = EXCLUDED.postmark_id,
        email_provider = EXCLUDED.email_provider,
        provider_id = EXCLUDED.provider_id"
     (UUID/randomUUID) email name postmark-id
     (or email-provider "postmark") provider-id])))

;; https://postmarkapp.com/developer/api/overview#error-codes

(def postmark-out-of-sync-error-message "Failed to add Postmark Sender Signature because it already exists on Postmark's side but not in our DB. Need to manually fix.  Hint: Is the signature in the prod DB?")

(def postmark-public-domain-error-message "Cannot use public domain email address (e.g. gmail.com) as sender email.")

(def sender-claimed-error-message "We can't use this email address; it's already been claimed by a different user.")

(defn- sync-postmark! [{:keys [email name sender]}]
  (let [postmark-id (:postmark_id sender)
        postmark-sender (when sender
                          (try
                            (postmark/get-sender! {:id postmark-id})
                            (catch clojure.lang.ExceptionInfo e
                              (if (postmark/signature-not-found? (-> e ex-data :body :ErrorCode))
                                ;; continue, add the sender
                                nil
                                ;; unexpected error
                                (throw e)))))
        postmark-response (if postmark-sender
                            (postmark/edit-sender! {:id postmark-id :name name})
                            (try
                              (postmark/add-sender! {:email email :name name})
                              (catch clojure.lang.ExceptionInfo e
                                (cond
                                  ;; This is bad - it means a signature exists on Postmark's side
                                  ;; but it's ID isn't in our DB
                                  ;; Postmark doesn't allow us to lookup senders via email, only ID
                                  ;; so we need to manually address this
                                  (postmark/signature-exists? e)
                                  (throw (ex-info postmark-out-of-sync-error-message
                                                  {:type :postmark-sync-error
                                                   :message postmark-out-of-sync-error-message
                                                   :e e}))

                                  (postmark/public-domain-email? e)
                                  (ex/throw-validation-err! :sender-email email [{:message postmark-public-domain-error-message}])

                                  :else
                                  (throw e)))))]
    {:email-provider "postmark"
     :postmark-id (-> postmark-response :body :ID)
     :provider-id (str (-> postmark-response :body :ID))}))

(defn- sync-ses! [{:keys [email]}]
  (when-not (config/aws-ses-enabled?)
    (ex/throw-validation-err!
     :sender-email email
     [{:message "Amazon SES is selected, but AWS_SES_ACCESS_KEY_ID and AWS_SES_SECRET_ACCESS_KEY are not configured."}]))
  {:email-provider "ses"
   :postmark-id nil
   :provider-id (ses/ensure-domain! email)})

(defn sync-sender!
  "Given an email, we do our best to sync to the configured provider.
      1. The sender exists, but belongs to a different user
            a. In this case we throw
      2. The sender exists in our database, but not at the provider
            a. In this case, we try add it
      3. The sender exists at the provider, but not in our database
            a. In this case, we reach an invariant. This can happen when we add a sender in development
      "
  [{:keys [app-id email name]}]
  (let [sender (get-by-email {:email email})
        {:keys [postmark-id email-provider provider-id]}
        ;; SendGrid is still send-only (#2863). Custom senders use SES
        ;; when selected, otherwise the existing Postmark signature flow.
        (if (config/ses-selected?)
          (sync-ses! {:email email})
          (sync-postmark! {:email email :name name :sender sender}))
        sender (put! {:email email
                      :name name
                      :app-id app-id
                      :postmark-id postmark-id
                      :email-provider email-provider
                      :provider-id provider-id})
        _ (verification/put! {:app-id app-id
                              :sender-id (:id sender)
                              :verified false})]
    {:sender sender}))

(defn get-sender-status [sender]
  (case (:email_provider sender)
    "ses" (ses/sender-status sender)
    (when-let [postmark-id (:postmark_id sender)]
      (-> (postmark/get-sender! {:id postmark-id})
          :body
          (select-keys [:ID :EmailAddress :Confirmed
                        :DKIMHost :DKIMPendingHost
                        :DKIMPendingTextValue :DKIMTextValue
                        :ReturnPathDomain :ReturnPathDomainCNAMEValue])))))

(comment
  (postmark/add-sender! {:email "hi@marky.fyi" :name "Marky"})
  (ex-data *e)
  (def r (postmark/list-senders! 50 0))
  (def ss (get-in r [:body :SenderSignatures]))
  (def s (first ss))
  ss
  s
  (postmark/delete-sender! {:id 4718901}))
