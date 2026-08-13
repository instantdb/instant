(ns instant.postmark
  (:require
   [instant.config :as config]
   [clj-http.client :as clj-http]
   [instant.util.json :refer [->json]]
   [instant.util.tracer :as tracer]
   [instant.util.exception :as ex]
   [instant.util.email :as email]
   [medley.core :as medley]
   [clojure.string :as string]))

;; ------------
;; Error codes
;; C.F https://postmarkapp.com/developer/api/overview#error-codes

(defn inactive-recipient? [e]
  (= 406 (-> e ex-data :body :ErrorCode)))

(defn signature-not-found? [e]
  (= 501
     (-> e ex-data :body :ErrorCode)))

(defn public-domain-email? [e]
  (= 503
     (-> e ex-data :body :ErrorCode)))

(defn signature-exists? [e]
  (= 504
     (-> e ex-data :body :ErrorCode)))

;; Sender-signature problems. We deliberately re-throw these raw (rather than
;; translating them) so callers like magic-code-auth can catch them and retry
;; with the default sender. See `instant.runtime.magic-code-auth/invalid-sender?`.
(def unconfirmed-sender-error-code 400)
(def sender-not-found-error-code 401)

(defn sender-signature-problem? [e]
  (contains? #{unconfirmed-sender-error-code sender-not-found-error-code}
             (-> e ex-data :body :ErrorCode)))

(defn throw-send-error!
  "Translates a failed Postmark send into a typed instant-exception with a
   human-readable message, so the client gets a real error instead of a generic
   500. Sender-signature errors are re-thrown raw so callers can fall back to
   the default sender. The provider's own error code/message are recorded to the
   trace for debugging, not surfaced to the client."
  [e to]
  (if (sender-signature-problem? e)
    (throw e)
    (do
      (tracer/add-data! {:attributes {:postmark-error-code (-> e ex-data :body :ErrorCode)
                                      :postmark-error-message (-> e ex-data :body :Message)}})
      (if (inactive-recipient? e)
        (ex/throw-email-send-failed!
         (format "We couldn't deliver the email to %s. The address has been marked as inactive and can't receive mail." to)
         {:recipient to
          :recipient-problem? true}
         e)
        (ex/throw-email-send-failed!
         "We weren't able to send the email."
         {:recipient to}
         e)))))

;; --------
;; API

(defn send! [{:keys [from to cc bcc subject html text
                     reply-to]
              :or {reply-to (config/email-reply-to)}}]
  (let [body (cond-> {:From from
                      :To to
                      :Cc cc
                      :Bcc bcc
                      :ReplyTo reply-to
                      :Subject subject
                      :MessageStream "outbound"
                      :HTMLBody
                      html}
               text (assoc :TextBody text))]
    (if-not (config/postmark-send-enabled?)
      (tracer/with-span! {:name "postmark/send-disabled"
                          :attributes body}
        (tracer/record-info!
         {:name "postmark-disabled"
          :attributes
          {:msg
           "Postmark is disabled, add postmark-token to config to enable"}}))
      (tracer/with-span! {:name "postmark/send"
                          :attributes body}
        (try
          (clj-http/post
           "https://api.postmarkapp.com/email"
           {:coerce :always
            :as :json
            :headers {"X-Postmark-Server-Token" (config/postmark-token)
                      "Content-Type" "application/json"}
            :body (->json body)})
          (catch Exception e
            (throw-send-error! e to)))))))

(comment
  (send! {:from "verify@dash-pm.instantdb.com"
          :to "stopa@instantdb.com"
          :subject "Sending a message from the REPL"
          :html (standard-body "<h1>Hello. This message is from the REPL")})
  ;; inactive recipient
  (send! {:from "verify@dash-pm.instantdb.com"
          :to "hello@hello.com"
          :subject "Sending a message from the REPL"
          :html (standard-body "<h1>Hello. This message is from the REPL")}))

(defn structured->email-str [{:keys [name email]}]
  (str name " <" email ">"))

(defn structured-emails->str [emails]
  (->> emails
       (map structured->email-str)
       (string/join ", ")))

(defn structured->postmark-req [req]
  (-> req
      (medley/update-existing :from structured->email-str)
      (medley/update-existing :to structured-emails->str)
      (medley/update-existing :cc structured-emails->str)
      (medley/update-existing :bcc structured-emails->str)))

;; XXX: Eventually we should make all callers use
;; this entry point. It will be easier to switch
;; providers
(defn send-structured! [req]
  (send! (structured->postmark-req req)))

;; XXX: We may want to extract this out if we end up having
(def standard-body email/standard-body)

(def postmark-user-note "Instant partners with Postmark to send emails.  Please verify your custom sender address.")

;; Note, Postmark has TWO tokens - "Account" for admin, and "Server" for sending
(defn postmark-admin-request-headers []
  {"X-Postmark-Account-Token" (config/postmark-account-token)
   "Content-Type" "application/json"
   "Accept" "application/json"})

;; https://postmarkapp.com/developer/api/signatures-api#create-signature
(defn add-sender! [{:keys [email name]}]
  (clj-http/post
   "https://api.postmarkapp.com/senders"
   {:coerce :always
    :as :json
    :headers (postmark-admin-request-headers)
    :body (->json {:FromEmail email
                   :ReplyToEmail email
                   :Name name
                   :ConfirmationPersonalNote postmark-user-note})}))

;; https://postmarkapp.com/developer/api/signatures-api#edit-signature
(defn edit-sender! [{:keys [id name]}]
  (clj-http/put
   (str "https://api.postmarkapp.com/senders/" id)
   {:coerce :always
    :as :json
    :headers (postmark-admin-request-headers)
    :body (->json {:Name name
                   :ConfirmationPersonalNote postmark-user-note})}))

;; https://postmarkapp.com/developer/api/signatures-api#delete-signature
(defn delete-sender! [{:keys [id]}]
  (clj-http/delete
   (str "https://api.postmarkapp.com/senders/" id)
   {:coerce :always
    :as :json
    :headers (postmark-admin-request-headers)}))

;; https://postmarkapp.com/developer/api/signatures-api#sender-signature
(defn get-sender! [{:keys [id]}]
  (clj-http/get
   (str "https://api.postmarkapp.com/senders/" id)
   {:coerce :always
    :as :json
    :headers (postmark-admin-request-headers)}))

;; https://postmarkapp.com/developer/api/signatures-api#list-sender-signatures
(defn list-senders! [count offset]
  (clj-http/get
   "https://api.postmarkapp.com/senders/"
   {:coerce :always
    :as :json
    :query-params {:count count
                   :offset offset}
    :headers (postmark-admin-request-headers)}))

(comment
  (def r (list-senders! 50 0))
  (def s (get-in r [:body :SenderSignatures])))
