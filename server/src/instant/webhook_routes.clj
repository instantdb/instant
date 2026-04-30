(ns instant.webhook-routes
  (:require
   [clojure.string]
   [compojure.core :as compojure :refer [GET defroutes]]
   [instant.admin.routes :as admin-routes]
   [instant.config :as config]
   [instant.isn :as isn]
   [instant.model.webhook :as webhook-model]
   [instant.util.crypt :as crypt]
   [instant.util.exception :as ex]
   [instant.util.http :as http-util]
   [instant.util.token :as token-util]
   [instant.util.uuid :as uuid-util]
   [instant.webhook-jwt :as webhook-jwt]
   [ring.util.http-response :as response]))

(defn get-signing-keys [_req]
  (-> (response/ok (crypt/ed25519-public-jwks (config/webhook-public-key)))))

(defn req->app-id-and-webhook-authed!
  "Returns app-id, webhook, and isn if the request is authed with one of:
   1. Admin token
   2. Platform token with :data/read scope
   3. Payload JWT that we send with the webhook"
  [req]
  (let [webhook-id-untrusted (ex/get-param! req [:params :webhook_id] uuid-util/coerce)
        isn-untrusted (ex/get-param! req [:params :isn] (fn [x]
                                                          (isn/of-string x)))
        app-id-untrusted (ex/get-param! req [:params :app_id] uuid-util/coerce)
        token (http-util/req->bearer-token! req)]
    (if (token-util/is-jwt? token)
      (let [jwt (token-util/jwt-token-value token)
            {:keys [app-id webhook-id isn]} (webhook-jwt/verify-webhook-payload-jwt
                                             jwt
                                             {:app-id app-id-untrusted
                                              :webhook-id webhook-id-untrusted
                                              :isn isn-untrusted})]
        {:app-id app-id
         :isn isn
         :webhook (webhook-model/get-by-app-id-and-webhook-id! {:app-id app-id
                                                                :webhook-id webhook-id})})

      (let [{:keys [app-id]} (admin-routes/req->app-id-authed! req :data/read)]
        {:app-id app-id
         :isn isn-untrusted
         :webhook (webhook-model/get-by-app-id-and-webhook-id! {:app-id app-id
                                                                :webhook-id webhook-id-untrusted})}))))

(defn get-payload [req]
  (let [{:keys [app-id webhook isn]} (req->app-id-and-webhook-authed! req)
        data (webhook-model/webhook-data-for-isn {:app-id app-id
                                                  :isn isn
                                                  :webhook webhook})]
    (response/ok {:data data
                  :idempotency-key (webhook-model/payload-idempotency-key {:webhook-id (:id webhook)
                                                                           :isn isn})})))

(defroutes routes
  (GET "/.well-known/webhooks/jwks.json" [] get-signing-keys)
  (GET "/webhooks/payload/:app_id/:webhook_id/:isn{[0-9a-f]+/[0-9A-F]+/[0-9A-F]+}" [] get-payload))
