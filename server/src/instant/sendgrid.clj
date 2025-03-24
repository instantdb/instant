(ns instant.sendgrid
  (:require
   [clj-http.client :as clj-http]
   [clojure.data.json :as json]
   [instant.config :as config]
   [instant.util.tracer :as tracer]
   [instant.postmark :as postmark]))

(defn send! [{:keys [from to cc bcc subject html reply-to]}]
  (let [body {:personalizations [{:to

                                  to :cc cc :bcc bcc}]
              :from from
              :reply_to {:email (or reply-to "hello@instantdb.com")}
              :subject subject
              :content
              [{:type "text/html" :value html}]}]

    (if-not (config/sendgrid-send-disabled?)
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
        (clj-http/post
         "https://api.sendgrid.com/v3/mail/send"
         {:headers {"Authorization" (str "Bearer " (config/sendgrid-token))
                    "Content-Type" "application/json"}
          :body (json/write-str body)})))))

(comment
  (send! {:from {:email "verify@auth-sg.instantdb.com"}
          :to [{:email "stopa@instantdb.com"}]
          :subject "Sending a message from the REPL"
          :html (postmark/standard-body "<h1>Hello. This message is from the REPL")}))
