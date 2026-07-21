(ns instant.model.app-auth-data
  (:require
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.system-catalog-ops :refer [query-op]]))

(defn get-dash-auth-data [{:keys [app-id]}]
  (query-op
   (aurora/conn-pool :read)
   {:app-id app-id}
   (fn [{:keys [admin-query]}]
     (let [redirect-origins
           (-> (sql/select-one
                ::get-dash-auth-data
                (aurora/conn-pool :read)
                ["SELECT json_build_object(
                     'authorized_redirect_origins', (
                       SELECT json_agg(json_build_object(
                         'id', ro.id,
                         'service', ro.service,
                         'params', ro.params,
                         'created_at', ro.created_at
                       ))
                       FROM (SELECT * from app_authorized_redirect_origins ro
                              WHERE ro.app_id = a.id
                              ORDER BY ro.created_at desc)
                       AS ro
                     )
                   ) AS data
                   FROM apps a
                   WHERE a.id = ?::uuid AND a.deletion_marked_at IS NULL"
                 app-id])
               (get-in [:data "authorized_redirect_origins"]))

           {:strs [$oauthProviders
                   $oauthClients]}
           (admin-query {:$oauthProviders {}
                         :$oauthClients {}})

           providers (map (fn [provider]
                            {"id" (get provider "id")
                             "provider_name" (get provider "name")
                             "created_at" (get provider "$serverCreatedAt")})
                          $oauthProviders)

           clients (map (fn [client]
                          {"id" (get client "id")
                           "client_name" (get client "name")
                           "client_id" (get client "clientId")
                           "provider_id" (get client "$oauthProvider")
                           "meta" (get client "meta")
                           "discovery_endpoint" (get client "discoveryEndpoint")
                           "created_at" (get client "$serverCreatedAt")
                           "redirect_to" (get client "redirectTo")
                           "use_shared_credentials" (boolean (get client "useSharedCredentials"))})
                        $oauthClients)]
       {:data {"oauth_service_providers" providers
               "oauth_clients" clients
               "authorized_redirect_origins" redirect-origins}}))))
