(ns instant.model.app-oauth-client
  (:require
   [instant.auth.oauth :as oauth]
   [instant.jdbc.aurora :as aurora]
   [instant.model.app-oauth-service-provider :as app-oauth-service-provider-model]
   [instant.model.shared-oauth-client :refer [get-shared-credential!]]
   [instant.system-catalog-ops :refer [query-op update-op]]
   [instant.util.crypt :as crypt-util]
   [instant.util.exception :as ex]
   [instant.util.uuid :as uuid-util])
  (:import
   (instant.util.crypt Secret)
   (java.util UUID)))

(def etype "$oauthClients")

(defn use-shared-credentials? [oauth-client]
  (boolean (:use_shared_credentials oauth-client)))

(defn create!
  ([params] (create! (aurora/conn-pool :write) params))
  ([conn {:keys [app-id
                 provider-id
                 client-name
                 client-id
                 client-secret
                 discovery-endpoint
                 meta
                 redirect-to
                 use-shared-credentials?]}]
   ;; Only validate discovery endpoint if provided (OIDC providers)
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
         enc-client-secret-hex
         (when client-secret
           (crypt-util/aead-encrypt-hex client-secret (uuid-util/->bytes id)))]
     (update-op
      conn
      {:app-id app-id
       :etype etype}
      (fn [{:keys [transact! resolve-id get-entity]}]
        (transact! [[:add-triple id (resolve-id :id) id]
                    [:add-triple id (resolve-id :$oauthProvider) provider-id]
                    [:add-triple id (resolve-id :name) client-name]
                    [:add-triple id (resolve-id :clientId) client-id]
                    [:add-triple id (resolve-id :encryptedClientSecret) enc-client-secret-hex]
                    [:add-triple id (resolve-id :discoveryEndpoint) discovery-endpoint]
                    [:add-triple id (resolve-id :meta) meta]
                    [:add-triple id (resolve-id :redirectTo) redirect-to]
                    [:add-triple id (resolve-id :useSharedCredentials)
                     (boolean use-shared-credentials?)]])
        (get-entity id))))))

(defn update!
  ([params] (update! (aurora/conn-pool :write) params))
  ([conn {:keys [id app-id] :as params}]
   (update-op
    conn
    {:app-id app-id
     :etype etype}
    (fn [{:keys [transact! resolve-id get-entity]}]
      (transact! (concat [[:add-triple id (resolve-id :id) id]]
                         (when (contains? params :meta)
                           [[:deep-merge-triple id (resolve-id :meta) (:meta params)]])
                         (when (contains? params :redirect-to)
                           [[:add-triple id (resolve-id :redirectTo) (:redirect-to params)]])
                         (when (contains? params :client-id)
                           [[:add-triple id (resolve-id :clientId) (:client-id params)]])
                         (when (contains? params :client-secret)
                           [[:add-triple id (resolve-id :encryptedClientSecret)
                             (crypt-util/aead-encrypt-hex (:client-secret params)
                                                          (uuid-util/->bytes id))]])
                         (when (contains? params :use-shared-credentials?)
                           [[:add-triple id (resolve-id :useSharedCredentials)
                             (boolean (:use-shared-credentials? params))]])))
      (get-entity id)))))

(defn get-by-id
  ([params] (get-by-id (aurora/conn-pool :read) params))
  ([conn {:keys [app-id id]}]
   (query-op conn
             {:app-id app-id
              :etype etype}
             (fn [{:keys [get-entity]}]
               (get-entity id)))))

(defn get-by-id! [{:keys [app-id id] :as params}]
  (ex/assert-record! (get-by-id params)
                     :app-oauth-client
                     {:app-id app-id :id id}))

(defn get-by-client-name
  ([params] (get-by-client-name (aurora/conn-pool :read) params))
  ([conn {:keys [app-id client-name]}]
   (query-op conn
             {:app-id app-id
              :etype etype}
             (fn [{:keys [get-entity resolve-id]}]
               (get-entity [(resolve-id :name) client-name])))))

(defn get-by-client-name! [params]
  (ex/assert-record! (get-by-client-name params) :app-oauth-client {:args [params]}))

(defn delete-by-id!
  ([params] (delete-by-id! (aurora/conn-pool :write) params))
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
  (let [{provider-name :provider_name}
        (app-oauth-service-provider-model/get-by-id!
         {:app-id (:app_id oauth-client)
          :id (:provider_id oauth-client)})
        shared? (use-shared-credentials? oauth-client)
        shared-cred (when shared? (get-shared-credential! provider-name))
        client-id (if shared?
                    (:client-id shared-cred)
                    (:client_id oauth-client))
        client-secret (cond
                        shared?
                        (:client-secret shared-cred)

                        (:client_secret oauth-client)
                        (decrypted-client-secret oauth-client))]
    (cond
      (:discovery_endpoint oauth-client)
      (oauth/generic-oauth-client-from-discovery-url
       {:app-id (:app_id oauth-client)
        :provider-id (:provider_id oauth-client)
        :client-id client-id
        :client-secret client-secret
        :discovery-endpoint (:discovery_endpoint oauth-client)
        :meta (:meta oauth-client)})

      (= "github" provider-name)
      (oauth/map->GitHubOAuthClient
       {:app-id (:app_id oauth-client)
        :provider-id (:provider_id oauth-client)
        :client-id client-id
        :client-secret client-secret
        :meta (:meta oauth-client)})

      :else
      (throw (ex-info "Unsupported OAuth client" {:oauth-client oauth-client})))))
