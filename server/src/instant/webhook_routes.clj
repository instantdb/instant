(ns instant.webhook-routes
  (:require
   [compojure.core :as compojure :refer [GET defroutes]]
   [instant.config :as config]
   [instant.util.crypt :as crypt]
   [ring.util.http-response :as response]))

(defn get-signing-keys [_req]
  (-> (response/ok (crypt/ed25519-public-jwks (config/webhook-public-key)))))

(defroutes routes
  (GET "/.well-known/webhooks/jwks.json" [] get-signing-keys))
