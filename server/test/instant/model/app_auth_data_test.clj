(ns instant.model.app-auth-data-test
  (:require
   [clojure.test :refer [deftest is]]
   [instant.config :as config]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.model.app-auth-data :as app-auth-data]
   [instant.system-catalog-ops :as system-catalog-ops]))

(deftest get-dash-auth-data-includes-configured-default-sender-email
  (with-redefs [config/app-email-sender
                (constantly {:email "auth@self-hosted.example"})
                aurora/conn-pool
                (constantly nil)
                sql/select-one
                (constantly {:data {"authorized_redirect_origins" []}})
                system-catalog-ops/query-op
                (fn [_conn _query-params f]
                  (f {:admin-query
                      (constantly {"$oauthProviders" []
                                   "$oauthClients" []})}))]
    (is (= "auth@self-hosted.example"
           (get-in (app-auth-data/get-dash-auth-data {:app-id (random-uuid)})
                   [:data "default_sender_email"])))))
