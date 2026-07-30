(ns instant.config-app)

(defn- attr
  ([value-type]
   (attr value-type {}))
  ([value-type {:keys [indexed optional unique]}]
   (cond-> {:valueType value-type
            :config {:indexed (boolean indexed)
                     :unique (boolean unique)}}
     (not optional) (assoc :required true))))

(def schema
  {:entities
   {:app-deletion-sweeper
    {:attrs {"disabled?" (attr "boolean")}}

    :e2e-logging
    {:attrs {"invalidator-rate" (attr "number")}}

    :flags
    {:attrs {"description" (attr "string" {:optional true})
             "setting" (attr "string" {:indexed true :unique true})
             "value" (attr "any")}}

    :friend-emails
    {:attrs {"email" (attr "string" {:unique true})}}

    :handle-receive-timeout
    {:attrs {"appId" (attr "string" {:unique true})
             "timeoutMs" (attr "number")}}

    :log-sampled-apps
    {:attrs {"appId" (attr "string" {:unique true})
             "sampleRate" (attr "number")}}

    :power-user-emails
    {:attrs {"email" (attr "string" {:unique true})}}

    :promo-emails
    {:attrs {"email" (attr "string")}}

    :query-flags
    {:attrs {"description" (attr "string")
             "query-hash" (attr "number")
             "setting" (attr "string")
             "value" (attr "string")}}

    :query-modifiers
    {:attrs {"app-id" (attr "string")
             "dollar-params" (attr "json")
             "etype" (attr "string")
             "query-hash" (attr "number")}}

    :rate-limited-apps
    {:attrs {"appId" (attr "string" {:unique true})}}

    :rule-where-testing
    {:attrs {"enabled" (attr "boolean")}}

    :rule-wheres
    {:attrs {"app-ids" (attr "json")
             "query-hash-blacklist" (attr "any")
             "query-hashes" (attr "any")}}

    :storage-block-list
    {:attrs {"appId" (attr "string" {:indexed true :unique true})
             "isDisabled" (attr "boolean")}}

    :storage-migration
    {:attrs {"disableLegacy?" (attr "boolean")
             "dualWrite?" (attr "boolean" {:optional true})
             "useLocationId?" (attr "boolean")}}

    :storage-whitelist
    {:attrs {"appId" (attr "string" {:indexed true :unique true})
             "email" (attr "string" {:optional true})
             "isEnabled" (attr "boolean")}}

    :team-emails
    {:attrs {"email" (attr "string")}}

    :test-emails
    {:attrs {"email" (attr "string")}}

    :toggles
    {:attrs {"setting" (attr "string" {:indexed true :unique true})
             "toggled" (attr "boolean")}}

    :welcome-email-config
    {:attrs {"enabled?" (attr "boolean")
             "limit" (attr "number")}}}
   :links {}})

(def rules
  {"attrs" {"allow" {"create" "false"}}
   "$default" {"allow" {"$default" "false"}}})
