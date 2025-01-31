(ns instant.model.app-oauth-service-provider
  "A provider is an issuer of unique issuer of subject ids (sub).
  An app might have a provider named google that has multiple OAuth
  clients, e.g. one for web and one for native."
  (:require [instant.jdbc.aurora :as aurora]
            [instant.system-catalog-ops :refer [query-op update-op]])
  (:import
   (java.util UUID)))

(def etype "$oauthProviders")

(defn create!
  ([params] (create! (aurora/conn-pool :write) params))
  ([conn {:keys [app-id provider-name]}]
   (update-op
    conn
    {:app-id app-id
     :etype etype}
    (fn [{:keys [transact! get-entity resolve-id]}]
      (let [entity-id (random-uuid)]
        (transact! [[:add-triple entity-id (resolve-id :id) entity-id]
                    [:add-triple entity-id (resolve-id :name) provider-name]])
        (get-entity entity-id))))))

(defn get-by-provider-name
  ([params] (get-by-provider-name (aurora/conn-pool :read) params))
  ([conn {:keys [app-id provider-name]}]
   (query-op conn
             {:app-id app-id
              :etype etype}
             (fn [{:keys [resolve-id get-entity]}]
               (get-entity [(resolve-id :name) provider-name])))))

(comment
  (create! {:app-id (UUID/fromString "3cc5c5c8-07df-42b2-afdc-6a04cbf0c40a")
            :provider-name "google"})

  (get-by-provider-name {:app-id (UUID/fromString "3cc5c5c8-07df-42b2-afdc-6a04cbf0c40a")
                         :provider-name "google"}))
