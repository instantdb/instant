(ns instant.config-app
  (:require
   [instant.db.model.attr :as attr-model]
   [instant.db.transaction :as tx]
   [instant.model.app :as app-model]
   [instant.model.rule :as rule-model]
   [instant.model.schema :as schema-model]))

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

(defn create! [conn {:keys [id creator-id]}]
  (let [app (app-model/create!
             conn
             {:id id
              :title "Instant Config"
              :creator-id creator-id
              :admin-token (random-uuid)})
        attrs (attr-model/get-by-app-id conn id)
        steps (schema-model/schemas->ops
               {:check-types? true
                :background-updates? false}
               (schema-model/attrs->schema attrs)
               (schema-model/defs->schema schema))]
    (tx/transact-without-tx-conn!
     conn
     attrs
     id
     steps
     {:skip-app-status-write-check? true})
    (rule-model/put! conn {:app-id id
                           :code rules})
    app))
