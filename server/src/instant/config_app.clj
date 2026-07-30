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
   {:flags
    {:attrs {"description" (attr "string" {:optional true})
             "setting" (attr "string" {:indexed true :unique true})
             "value" (attr "any")}}

    :toggles
    {:attrs {"setting" (attr "string" {:indexed true :unique true})
             "toggled" (attr "boolean")}}}
   :links {}})

(def rules
  {"attrs" {"allow" {"create" "false"}}
   "$default" {"allow" {"$default" "false"}}})
