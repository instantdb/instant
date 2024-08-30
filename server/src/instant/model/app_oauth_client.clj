(ns instant.model.app-oauth-client
  (:require [instant.jdbc.aurora :as aurora]
            [instant.jdbc.sql :as sql]
            [instant.util.crypt :as crypt-util]
            [instant.util.uuid :as uuid-util]
            [instant.auth.oauth :as oauth]
            [instant.util.exception :as ex])
  (:import
   (java.util UUID)
   (instant.util.crypt Secret)))

(defn create!
  ([params] (create! aurora/conn-pool params))
  ([conn {:keys [app-id
                 provider-id
                 client-name
                 client-id
                 client-secret
                 authorization-endpoint
                 token-endpoint
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
   (let [id (UUID/randomUUID)]
     (sql/execute-one!
      conn
      ["INSERT INTO app_oauth_clients
       (id,
        app_id,
        provider_id,
        client_name,
        client_id,
        client_secret,
        authorization_endpoint,
        token_endpoint,
        discovery_endpoint,
        meta
       )
       VALUES (?::uuid, ?::uuid, ?::uuid, ?, ?, ?, ?, ?, ?, ?)"
       id
       app-id
       provider-id
       client-name
       client-id
       (when client-secret
         (crypt-util/aead-encrypt {:plaintext (.getBytes client-secret)
                                   :associated-data (uuid-util/->bytes id)}))
       authorization-endpoint
       token-endpoint
       discovery-endpoint
       meta]))))

(defn get-by-id
  ([params] (get-by-id aurora/conn-pool params))
  ([conn {:keys [id]}]
   (sql/select-one
    conn
    ["SELECT * from app_oauth_clients where id = ?::uuid"
     id])))

(defn get-by-client-name
  ([params] (get-by-client-name aurora/conn-pool params))
  ([conn {:keys [app-id client-name]}]
   (sql/select-one
    conn
    ["SELECT * from app_oauth_clients
       where app_id = ?::uuid and client_name = ?"
     app-id client-name])))

(defn get-by-client-name! [params]
  (ex/assert-record! (get-by-client-name params) :app-oauth-client {:args [params]}))

(defn delete-by-id!
  ([params] (delete-by-id! aurora/conn-pool params))
  ([conn {:keys [id app-id]}]
   (sql/execute-one!
    conn
    ["DELETE FROM app_oauth_clients WHERE id = ?::uuid AND app_id = ?::uuid"
     id app-id])))

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
      :discovery-endpoint discovery-endpoint})
    (oauth/map->GenericOAuthClient
     {:app-id (:app_id oauth-client)
      :provider-id (:provider_id oauth-client)
      :client-id (:client_id oauth-client)
      :client-secret (when (:client_secret oauth-client)
                       (decrypted-client-secret oauth-client))
      :authorization-endpoint (:authorization_endpoint oauth-client)
      :token-endpoint (:token_endpoint oauth-client)})))
