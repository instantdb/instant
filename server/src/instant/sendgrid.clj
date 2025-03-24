(ns instant.sendgrid
  (:require
   [clj-http.client :as clj-http]
   [clojure.data.json :as json]
   [instant.config :as config]
   [instant.util.tracer :as tracer]))

(defn send! [{:keys [from to cc bcc subject html]}]
  (let [body {:personalizations [{:to to :cc cc :bcc bcc}]
              :from from
              :reply_to {:email "hello@js.ventures"}
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

(comment)
