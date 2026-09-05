(ns instant.resend
  (:require
   [clj-http.client :as clj-http]
   [instant.config :as config]
   [instant.util.exception :as ex]
   [instant.util.json :refer [->json <-json]]
   [instant.util.tracer :as tracer]))

(defn format-sender [from]
  (cond
    (string? from) from
    (map? from) (if (:name from)
                  (str (:name from) " <" (:email from) ">")
                  (:email from))
    :else (str from)))

(defn format-recipients [to]
  (cond
    (nil? to) []
    (string? to) [to]
    (sequential? to) (mapv (fn [r] (if (map? r) (:email r) (str r))) to)
    (map? to) [(:email to)]
    :else [(str to)]))

(defn error-detail
  [e]
  (try
    (or (-> e ex-data :body (<-json true) :message)
        (-> e ex-data :body (<-json true) :error :message))
    (catch Exception _ nil)))

(defn throw-send-error!
  [e to]
  (tracer/add-data! {:attributes {:resend-status (-> e ex-data :status)
                                  :resend-error (error-detail e)}})
  (ex/throw-email-send-failed!
   "We weren't able to send the email."
   {:recipient (first (format-recipients to))}
   e))

(defn send! [{:keys [from to cc bcc subject html text reply-to]}]
  (let [to-emails (format-recipients to)
        from-str (format-sender from)
        reply-to-email (when-let [rt (or reply-to (config/email-reply-to))]
                         (format-sender rt))
        body (cond-> {:from from-str
                      :to to-emails
                      :subject subject
                      :html html}
               text (assoc :text text)
               reply-to-email (assoc :reply_to reply-to-email)
               cc (assoc :cc (format-recipients cc))
               bcc (assoc :bcc (format-recipients bcc)))]

    (if-not (config/resend-send-enabled?)
      (tracer/with-span! {:name "resend/send-disabled"
                          :attributes {:to-count (count to-emails)}}
        (tracer/record-info!
         {:name "resend-disabled"
          :attributes
          {:msg
           "Resend is disabled, add resend-token to config to enable"}}))
      (tracer/with-span!
        {:name "resend/send"
         :attributes {:to-count (count to-emails)}}
        (try
          (clj-http/post
           "https://api.resend.com/emails"
           {:headers {"Authorization" (str "Bearer " (config/resend-token))
                      "Content-Type" "application/json"}
            :redirect-strategy :none
            :unexceptional-status #(<= 200 % 299)
            :conn-timeout 10000
            :socket-timeout 10000
            :connection-request-timeout 10000
            :body (->json body)})
          (catch Exception e
            (throw-send-error! e to)))))))
