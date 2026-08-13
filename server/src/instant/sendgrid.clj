(ns instant.sendgrid
  (:require
   [clj-http.client :as clj-http]
   [instant.config :as config]

   [instant.util.exception :as ex]
   [instant.util.json :refer [->json <-json]]
   [instant.util.tracer :as tracer]
   [instant.postmark :as postmark]))

(defn error-detail
  "Best-effort extraction of SendGrid's first error message. Unlike Postmark, the
   SendGrid request isn't sent with `:as :json`, so the error body is a raw JSON
   string like {\"errors\":[{\"message\":\"...\"}]}."
  [e]
  (try
    (-> e ex-data :body (<-json true) :errors first :message)
    (catch Exception _ nil)))

(defn throw-send-error!
  "Translates a failed SendGrid send into a typed instant-exception with a
   human-readable message, so the client gets a real error instead of a generic
   500. The provider's status/error text are recorded to the trace for
   debugging, not surfaced to the client."
  [e to]
  (tracer/add-data! {:attributes {:sendgrid-status (-> e ex-data :status)
                                  :sendgrid-error (error-detail e)}})
  (ex/throw-email-send-failed!
   "We weren't able to send the email."
   {:recipient (-> to first :email)}
   e))

(defn send! [{:keys [from to cc bcc subject html reply-to]}]
  (let [personalization (cond-> {:to to}
                          cc (assoc :cc cc)
                          bcc (assoc :bcc bcc))
        body {:personalizations [personalization]
              :from from
              :reply_to {:email (or reply-to (config/email-reply-to))}
              :subject subject
              :content
              [{:type "text/html" :value html}]}]

    (if-not (config/sendgrid-send-enabled?)
      (tracer/with-span! {:name "sendgrid/send-disabled"
                          :attributes body}
        (tracer/record-info!
         {:name "sendgrid-disabled"
          :attributes
          {:msg
           "Sendgrid is disabled, add sendgrid-token to config to enable"}}))
      (tracer/with-span!
        {:name "sendgrid/send"
         :attributes {:body body}}
        (try
          (clj-http/post
           "https://api.sendgrid.com/v3/mail/send"
           {:headers {"Authorization" (str "Bearer " (config/sendgrid-token))
                      "Content-Type" "application/json"}
            :body (->json body)})
          (catch Exception e
            (throw-send-error! e to)))))))

(comment
  (send! {:from {:email "verify@auth-sg.instantdb.com"}
          :to [{:email "stopa@instantdb.com"}]
          :subject "Sending a message from the REPL"
          :html (postmark/standard-body "<h1>Hello. This message is from the REPL")}))
