
(ns instant.sendgrid
  (:require
   [clj-http.client :as clj-http]
   [clojure.data.json :as json]
   [clojure.tools.logging :as log]
   [instant.config :as config]))

(defn send! [{:keys [from to cc bcc subject html]}]
  (let [sendgrid-body {:personalizations [{:to to :cc cc :bcc bcc}]
                       :from from
                       :reply_to {:email "hello@js.ventures"}
                       :subject subject
                       :content
                       [{:type "text/html" :value html}]}]
    (log/infof "[mail] sending content=%s" sendgrid-body)
    (clj-http/post
     "https://api.sendgrid.com/v3/mail/send"
     {:headers {"Authorization" (str "Bearer " (config/sendgrid-token))
                "Content-Type" "application/json"}
      :body (json/write-str sendgrid-body)})))

(comment)
