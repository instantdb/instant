(ns instant.discord
  (:require
   [instant.config :as config]
   [clj-http.client :as clj-http]
   [instant.util.json :refer [->json]]
   [instant.util.tracer :as tracer]))

;; # Setting up a bot on discord:
;; Go to https://discord.com/developers/applications
;; Create a team if you haven't already
;; Create an app
;; Nav to [App] > Installation - add scopes: "application.commands", "bot", add perms: "Send Messages"
;; Nav to [App] > Bot - copy/reset the token (this is `config/discord-token`)
;; Nav to [App] > Installation - Copy the Discord-Provided Install Link
;; Nav to the install link, add it to your server
;; You'll need to manually add the bot to private channels, too

(defn send! [channel-id message]
  (if-not (config/discord-enabled?)
    (tracer/with-span! {:name "discord/send-disabled"
                        :attributes {:message message}}
      (tracer/record-info!
       {:name "discord-send-disabled"
        :attributes
        {:msg
         "Discord is disabled, add secret-discord-token to config to enable."}}))
    (tracer/with-span! {:name "discord/send"
                        :attributes {:message message}}
      (clj-http/post
       (str
        "https://discordapp.com/api/channels/"
        channel-id
        "/messages")
       {:coerce :always
        :as :json
        :headers {"Authorization" (str "Bot" " " (config/secret-discord-token))
                  "Content-Type" "application/json"}
        :body (->json {:content message})}))))

(defn send-with-files!
  [channel-id files message]
  (if-not (config/discord-enabled?)
    (tracer/with-span! {:name "discord/send-disabled"
                        :attributes {:message message}}
      (tracer/record-info!
       {:name "discord-send-disabled"
        :attributes
        {:msg
         "Discord is disabled, add secret-discord-token to config to enable."}}))
    (tracer/with-span! {:name "discord/send-with-files"
                        :attributes {:message message}}
      (clj-http/post
       (str
        "https://discordapp.com/api/channels/"
        channel-id
        "/messages")
       {:coerce :always
        :multipart (concat [{:name "payload_json"
                             :content (->json {:content message})
                             :mime-type "application/json"
                             :encoding "UTF-8"}]
                           (for [{:keys [name content-type content]} files]
                             {:name name
                              :content content
                              :content-type content-type
                              :encoding "utf-8"}))
        :accept :json
        :headers {"Authorization" (str "Bot" " " (config/secret-discord-token))}}))))

;; Instructions for finding a user id and formatting it for a mention:
;; https://chatgpt.com/share/67081219-2e0c-8007-9fe0-4c0f6bacf26c
(def mention-constants
  {:dww "<@235826349607092224>"
   :nezaj "<@149718000281452545>"
   :stopa "<@150691007019614218>"
   :instateam "<@&1031959593066172477>"})

(def send-agent (agent nil))

(defn send-async! [channel-id message]
  (send-off send-agent (fn [_]
                         (send! channel-id message))))

(defn send-error-async! [message]
  (send-async! (if (= :prod (config/get-env))
                 config/discord-errors-channel-id
                 config/discord-debug-channel-id)
               message))

(comment
  (send! config/discord-debug-channel-id "test")
  (send-async! config/discord-debug-channel-id (format "%s testing user mention"
                                                       (:dww mention-constants))))
