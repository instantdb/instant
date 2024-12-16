(ns instant.model.app-oauth-client
  (:require
   [instant.auth.oauth :as oauth]
   [instant.jdbc.aurora :as aurora]
   [instant.system-catalog-ops :refer [query-op update-op]]
   [instant.util.crypt :as crypt-util]
   [instant.util.exception :as ex]
   [instant.util.uuid :as uuid-util])
  (:import
   (instant.util.crypt Secret)
   (java.util UUID)))

(def etype "$oauthClients")

(defn create!
  ([params] (create! (aurora/conn-pool) params))
  ([conn {:keys [app-id
                 provider-id
                 client-name
                 client-id
                 client-secret
                 discovery-endpoint
                 meta]}]
   (when discovery-endpoint
     (try
       (when-not (-> (oauth/fetch-discovery discovery-endpoint)
                     :data
                     :issuer
                     string?)
         (ex/throw-validation-err!
          :discovery-endpoint
          discovery-endpoint
          [{:message "Could not validate discovery endpoint."}]))
       (catch Exception _e
         (ex/throw-validation-err!
          :discovery-endpoint
          discovery-endpoint
          [{:message "Could not validate discovery endpoint."}]))))
   (let [id (UUID/randomUUID)

         enc-client-secret
         (when client-secret
           (crypt-util/aead-encrypt {:plaintext (.getBytes client-secret)
                                     :associated-data (uuid-util/->bytes id)}))]
     (update-op
      conn
      {:app-id app-id
       :etype etype}
      (fn [{:keys [transact! resolve-id get-entity]}]
        (transact! [[:add-triple id (resolve-id :id) id]
                    [:add-triple id (resolve-id :$oauthProvider) provider-id]
                    [:add-triple id (resolve-id :name) client-name]
                    [:add-triple id (resolve-id :clientId) client-id]
                    [:add-triple
                     id
                     (resolve-id :encryptedClientSecret)
                     (when enc-client-secret
                       (crypt-util/bytes->hex-string enc-client-secret))]
                    [:add-triple id (resolve-id :discoveryEndpoint) discovery-endpoint]
                    [:add-triple id (resolve-id :meta) meta]])
        (get-entity id))))))

(defn get-by-id
  ([params] (get-by-id (aurora/conn-pool) params))
  ([conn {:keys [app-id id]}]
   (query-op conn
             {:app-id app-id
              :etype etype}
             (fn [{:keys [get-entity]}]
               (get-entity id)))))

(defn get-by-client-name
  ([params] (get-by-client-name (aurora/conn-pool) params))
  ([conn {:keys [app-id client-name]}]
   (query-op conn
             {:app-id app-id
              :etype etype}
             (fn [{:keys [get-entity resolve-id]}]
               (get-entity [(resolve-id :name) client-name])))))

(defn get-by-client-name! [params]
  (ex/assert-record! (get-by-client-name params) :app-oauth-client {:args [params]}))

(defn delete-by-id!
  ([params] (delete-by-id! (aurora/conn-pool) params))
  ([conn {:keys [id app-id]}]
   (update-op conn
              {:app-id app-id
               :etype etype}
              (fn [{:keys [delete-entity!]}]
                (delete-entity! id)))))

(defn delete-by-id-ensure!
  [& args]
  (let [record (apply delete-by-id! args)]
    (ex/assert-record! record :app-oauth-client {:args args})))

(defn decrypted-client-secret [{:keys [id client_secret]}]
  (-> (crypt-util/aead-decrypt {:ciphertext client_secret
                                :associated-data (uuid-util/->bytes id)})
      (String. "UTF-8")
      (Secret.)))

(defn ->OAuthClient [oauth-client]
  (if-let [discovery-endpoint (:discovery_endpoint oauth-client)]
    (oauth/generic-oauth-client-from-discovery-url
     {:app-id (:app_id oauth-client)
      :provider-id (:provider_id oauth-client)
      :client-id (:client_id oauth-client)
      :client-secret (when (:client_secret oauth-client)
                       (decrypted-client-secret oauth-client))
      :discovery-endpoint discovery-endpoint
      :meta (:meta oauth-client)})
    (oauth/map->GenericOAuthClient
     {:app-id (:app_id oauth-client)
      :provider-id (:provider_id oauth-client)
      :client-id (:client_id oauth-client)
      :client-secret (when (:client_secret oauth-client)
                       (decrypted-client-secret oauth-client))
      :authorization-endpoint (:authorization_endpoint oauth-client)
      :token-endpoint (:token_endpoint oauth-client)
      :meta (:meta oauth-client)})))
