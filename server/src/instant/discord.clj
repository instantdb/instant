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

(comment
  (send! config/discord-debug-channel-id "test"))
