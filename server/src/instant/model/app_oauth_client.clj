(ns instant.model.app-oauth-client
  (:require
   [instant.auth.oauth :as oauth]
   [instant.flags :as flags]
   [instant.jdbc.aurora :as aurora]
   [instant.model.app-user :as app-user-model]
   [instant.system-catalog-ops :refer [query-op update-op]]
   [instant.util.crypt :as crypt-util]
   [instant.util.exception :as ex]
   [instant.util.uuid :as uuid-util])
  (:import
   (instant.util.crypt Secret)
   (java.util UUID)))

(def etype "$oauthClients")

(def shared-credentials-user-limit 100)

(defn use-shared-credentials? [oauth-client]
  (boolean (get (:meta oauth-client) "useSharedCredentials")))

(defn encrypt-client-secret [id client-secret]
  (crypt-util/aead-encrypt {:plaintext (String/.getBytes client-secret)
                            :associated-data (uuid-util/->bytes id)}))

(defn assert-shared-credentials-allowed! [{:keys [app-id]}]
  (when (app-user-model/users-at-least? {:app-id app-id
                                         :n shared-credentials-user-limit})
    (ex/throw-validation-err!
     :shared-credentials
     app-id
     [{:message (str "Shared dev credentials are limited to "
                     shared-credentials-user-limit
                     " users. Please add your own client_id and client_secret in the dashboard.")}])))

(defn create!
  ([params] (create! (aurora/conn-pool :write) params))
  ([conn {:keys [app-id
                 provider-id
                 client-name
                 client-id
                 client-secret
                 discovery-endpoint
                 meta
                 redirect-to]}]
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

         enc-client-secret
         (when client-secret
           (encrypt-client-secret id client-secret))]
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
                    [:add-triple id (resolve-id :meta) meta]
                    [:add-triple id (resolve-id :redirectTo) redirect-to]])
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
                         (when (contains? params :encrypted-client-secret)
                           [[:add-triple id (resolve-id :encryptedClientSecret)
                             (:encrypted-client-secret params)]])))
      (get-entity id)))))

(defn get-by-id
  ([params] (get-by-id (aurora/conn-pool :read) params))
  ([conn {:keys [app-id id]}]
   (query-op conn
             {:app-id app-id
              :etype etype}
             (fn [{:keys [get-entity]}]
               (get-entity id)))))

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

(defn get-shared-credential! [provider-name]
  (let [cred (-> (flags/shared-oauth-clients)
                 (get provider-name)
                 first)]
    (ex/assert-record! cred
                       :shared-oauth-client
                       {:provider-name provider-name})))

(defn ->OAuthClient [oauth-client]
  (let [provider-name (get (:meta oauth-client) "providerName")
        oauth-client (if-not (use-shared-credentials? oauth-client)
                       oauth-client
                       (let [shared-cred (get-shared-credential! provider-name)]
                         (assoc oauth-client
                                :id (:id shared-cred)
                                :client_id (:clientId shared-cred)
                                :client_secret (:encryptedClientSecret shared-cred))))]
    (cond
      (:discovery_endpoint oauth-client)
      (oauth/generic-oauth-client-from-discovery-url
       {:app-id (:app_id oauth-client)
        :provider-id (:provider_id oauth-client)
        :client-id (:client_id oauth-client)
        :client-secret (when (:client_secret oauth-client)
                         (decrypted-client-secret oauth-client))
        :discovery-endpoint (:discovery_endpoint oauth-client)
        :meta (:meta oauth-client)})

      (= "github" (get (:meta oauth-client) "providerName"))
      (oauth/map->GitHubOAuthClient
       {:app-id (:app_id oauth-client)
        :provider-id (:provider_id oauth-client)
        :client-id (:client_id oauth-client)
        :client-secret (when (:client_secret oauth-client)
                         (decrypted-client-secret oauth-client))
        :meta (:meta oauth-client)})

      :else
      (throw (ex-info "Unsupported OAuth client" {:oauth-client oauth-client})))))

(comment
  ;; Want to create a shared oauth client? Here's what you do: 

  ;; 1. Create a new oauth client in shared-oauth-clients.
  ;; 2. Copy the id from the modal
  ;; 3. Encrypt your client secret with (1) id + (2) your client secret. 
  ;; 4. Paste it in `encryptedClientSecret`, and you are done!
  (tool/copy
   (crypt-util/bytes->hex-string
    (encrypt-client-secret
     "<your-uuid>"
     "<your-client-secret>"))))
