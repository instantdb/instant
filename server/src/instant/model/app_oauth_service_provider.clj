(ns instant.model.app-oauth-service-provider
  "A provider is an issuer of unique issuer of subject ids (sub).
  An app might have a provider named google that has multiple OAuth
  clients, e.g. one for web and one for native."
  (:require [instant.comment :as c]
            [instant.jdbc.aurora :as aurora]
            [instant.system-catalog-ops :refer [query-op update-op]]
            [instant.util.exception :as ex]))

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

(defn get-by-id
  ([params] (get-by-id (aurora/conn-pool :read) params))
  ([conn {:keys [app-id id]}]
   (query-op conn
             {:app-id app-id
              :etype etype}
             (fn [{:keys [get-entity]}]
               (get-entity id)))))

(defn get-by-id! [{:keys [app-id id]}]
  (let [provider (get-by-id {:app-id app-id :id id})]
    (ex/assert-record! provider :oauth-service-provider {:provider-id id})
    provider))

(comment
  (def app (c/empty-app!))
  (create! {:app-id (:id app)
            :provider-name "google"})
  (get-by-provider-name {:app-id (:id app)
                         :provider-name "google"}))
