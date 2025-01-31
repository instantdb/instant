(ns instant.postmark
  (:require
   [instant.config :as config]
   [clj-http.client :as clj-http]
   [instant.util.json :refer [->json]]
   [instant.util.tracer :as tracer]
   [instant.util.exception :as ex]))

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
;; -------- 
;; API
(defn send! [{:keys [from to cc bcc subject html
                     reply-to]
              :or {reply-to "hello@instantdb.com"}}]
  (let [body {:From from
              :To to
              :Cc cc
              :Bcc bcc
              :ReplyTo reply-to
              :Subject subject
              :MessageStream "outbound"
              :HTMLBody
              html}]
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
            (if (inactive-recipient? e)
              (ex/throw-validation-err!
               :email
               to
               [{:message "This email address has been marked inactive."}])
              (throw e))))))))

(comment
  (send! {:from "auth@pm.instantdb.com"
          :to "stopa@instantdb.com"
          :subject "Sending a message from the REPL"
          :html (standard-body "<h1>Hello. This message is from the REPL")})
  ;; inactive recipient
  (send! {:from "auth@pm.instantdb.com"
          :to "hello@hello.com"
          :subject "Sending a message from the REPL"
          :html (standard-body "<h1>Hello. This message is from the REPL")}))

(defn standard-body [& body]
  (str
   "<div style='background:#f6f6f6;font-family:Helvetica,Arial,sans-serif;line-height:1.6;font-size:18px'>"
   "<div style='max-width:650px;margin:0 auto;background:white;padding:20px'>"
   (apply str body)
   "</div>"
   "</div>"))

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
