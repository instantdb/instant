(ns instant.webhook-routes
  (:require
   [clojure.string]
   [compojure.core :as compojure :refer [GET defroutes]]
   [instant.config :as config]
   [instant.dash.routes :as dash-routes]
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
   2. Platform/personal access token with :data/read scope
   3. Dashboard refresh token (collaborator role on the app)
   4. Payload JWT that we send with the webhook"
  [req]
  (let [webhook-id-untrusted (ex/get-param! req [:params :webhook_id] uuid-util/coerce)
        isn-untrusted (ex/get-param! req [:params :*] (fn [x]
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

      (let [{{app-id :id} :app}
            (dash-routes/req->app-accepting-superadmin-or-ref-token!
             :collaborator :data/read req)]
        {:app-id app-id
         :isn isn-untrusted
         :webhook (webhook-model/get-by-app-id-and-webhook-id! {:app-id app-id
                                                                :webhook-id webhook-id-untrusted})}))))

(defn get-payload [req]
  (let [{:keys [app-id webhook isn]} (req->app-id-and-webhook-authed! req)
        data (webhook-model/webhook-data-for-isn {:app-id app-id
                                                  :isn isn
                                                  :webhook webhook})]
    (-> (response/ok {:data data
                      :idempotencyKey (webhook-model/payload-idempotency-key
                                        {:webhook-id (:id webhook)
                                         :isn isn})})
        (assoc :headers {"Cache-Control" "no-store, private"
                         "Pragma" "no-cache"
                         "Expires" "0"
                         "Vary" "Authorization"}))))

(defroutes routes
  (GET "/.well-known/webhooks/jwks.json" [] get-signing-keys)
  ;; The * matches the isn, which will look something like 0/328/48953748
  (GET "/webhooks/payload/:app_id/:webhook_id/*" [] get-payload))
