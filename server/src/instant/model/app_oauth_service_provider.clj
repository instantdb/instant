(ns instant.model.app-oauth-service-provider
  "A provider is an issuer of unique issuer of subject ids (sub).
  An app might have a provider named google that has multiple OAuth
  clients, e.g. one for web and one for native."
  (:require [instant.jdbc.aurora :as aurora]
            [instant.jdbc.sql :as sql])
  (:import
   (java.util UUID)))

(defn create!
  ([params] (create! aurora/conn-pool params))
  ([conn {:keys [app-id provider-name]}]
   (let [id (UUID/randomUUID)]
     (sql/execute-one!
      conn
      ["INSERT INTO app_oauth_service_providers
         (id, app_id, provider_name) VALUES (?::uuid, ?::uuid, ?)"
       id app-id provider-name]))))

(defn get-by-provider-name
  ([params] (get-by-provider-name aurora/conn-pool params))
  ([conn {:keys [app-id provider-name]}]
   (sql/select-one
    conn
    ["SELECT * from app_oauth_service_providers
       where app_id = ?::uuid and provider_name = ?"
     app-id provider-name])))

(comment
  (create! {:app-id (UUID/fromString "3cc5c5c8-07df-42b2-afdc-6a04cbf0c40a")
            :provider-name "google"})

  (get-by-provider-name {:app-id (UUID/fromString "3cc5c5c8-07df-42b2-afdc-6a04cbf0c40a")
                         :provider-name "google"}))
