(ns instant.honeycomb-api
  (:require
   [clojure.string :as string]
   [instant.config :as config]
   [instant.discord :as discord]
   [ring.util.http-response :as response]))

(def honeycomb-status-triggered "TRIGGERED")

(defn- format-result-group [{:keys [Group Result]}]
  (let [message (:exception.message Group)
        name (:name Group)]
    (format "- **%s** | `%s` \n ```%s```" name Result message)))

(defn req->discord-message [{:keys [body]}]
  (let [{result-url :result_url status :status result-groups :result_groups_triggered} body]
    ;; Honeycomb Triggers send 2 requests - TRIGGERED and OK
    (if (= honeycomb-status-triggered status)
      (str "**‼️  Exceptions Triggered**  \n \n"
           (->> result-groups
                (sort-by :Result)
                reverse
                (map format-result-group)
                (string/join "\n"))
           (format "\n [See in Honeycomb](%s)" result-url))
      (format "🆗 Trigger resolved. \n [See in Honeycomb](%s)" result-url))))

(defn webhook [req]
  (discord/send! config/discord-errors-channel-id
                 (req->discord-message req))
  (response/ok))

(comment
  (def ex-trigger
    {:body {:status "TRIGGERED"
            :result_url "https://instantdb.com/"
            :result_groups_triggered
            [{:Group
              {:exception.message
               "[instant-exception] Record not found: app-user-magic-code"
               :name "instant-ex/bad-request"}
              :Result 2}
             {:Group
              {:exception.message
               "[instant-exception] Socket error for session: d5521f04-0969-4b74-9d8c-b5987bed2a0b"
               :name "rs/try-send-event-err"}
              :Result 720}
             {:Group
              {:exception.message
               "[instant-exception] Socket error for session: d5521f04-0969-4b74-9d8c-b5987bed2a0b"
               :name "exception"}
              :Result 720}]}})
  (tool/copy (req->discord-message ex-trigger))
  (webhook ex-trigger))

(comment
  (webhook {:body {:status "OK" :result_url "https://instantdb.com/"}}))
