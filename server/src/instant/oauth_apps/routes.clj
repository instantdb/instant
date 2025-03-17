(ns instant.oauth-apps.routes
  (:require [clojure.string :as string]
            [compojure.core :as compojure :refer [defroutes GET POST]]
            [datascript.core :refer [squuid]]
            [hiccup2.core :as h]
            [instant.auth.oauth :as oauth]
            [instant.config :as config]
            [instant.dash.routes :refer [req->auth-user!
                                         get-member-role]]
            [instant.db.model.transaction :as transaction-model]
            [instant.jdbc.aurora :as aurora]
            [instant.model.app :as app-model]
            [instant.model.app-authorized-redirect-origin :as app-authorized-redirect-origin-model]
            [instant.model.app-email-template :as app-email-template-model]
            [instant.model.app-oauth-client :as app-oauth-client-model]
            [instant.model.app-oauth-code :as app-oauth-code-model]
            [instant.model.app-oauth-redirect :as app-oauth-redirect-model]
            [instant.model.app-user :as app-user-model]
            [instant.model.app-user-magic-code :as app-user-magic-code-model]
            [instant.model.app-user-oauth-link :as app-user-oauth-link-model]
            [instant.model.app-user-refresh-token :as app-user-refresh-token-model]
            [instant.model.instant-user :as instant-user-model]
            [instant.model.oauth-app :as oauth-app-model]
            [instant.postmark :as postmark]
            [instant.reactive.receive-queue :as receive-queue]
            [instant.reactive.session :as session]
            [instant.reactive.store :as rs]
            [instant.util.coll :as ucoll]
            [instant.util.crypt :as crypt-util]
            [instant.util.email :as email]
            [instant.util.exception :as ex]
            [instant.util.string :as string-util]
            [instant.util.tracer :as tracer]
            [instant.util.url :as url]
            [instant.util.uuid :as uuid-util]
            [instant.runtime.routes :refer [format-cookie
                                            parse-cookie]]
            [lambdaisland.uri :as uri]
            [next.jdbc :as next-jdbc]
            [ring.middleware.cookies :refer [wrap-cookies]]
            [ring.util.http-response :as response]))

;; DDD: block CORS
;; DDD: CSRF token
;; DDD: Security headers

;; DDD: Coerce errors into OAuth errors

(def cookie-name "__session")

;; DDD: Apply some of these rules to the redirect uri
;; https://developers.google.com/identity/protocols/oauth2/web-server#uri-validation

(defn oauth-start [req]
  (let [client-id (ex/get-param! req
                                 [:params :client_id]
                                 uuid-util/coerce)
        redirect-uri (ex/get-param! req
                                    [:params :redirect_uri]
                                    url/coerce-web-url)
        response-type (ex/get-param! req
                                     [:params :response_type]
                                     string-util/coerce-non-blank-str)

        scope (ex/get-param! req
                             [:params :scope]
                             string-util/coerce-non-blank-str)

        ;; DDD: Validate scopes
        ;;;     Have to do extra to validate that the scopes are
        ;;      included in the app's granted_scopes

        state (ex/get-param! req
                             [:params :state]
                             string-util/coerce-non-blank-str)

        code-challenge (ex/get-optional-param! req
                                               [:params :code_challenge]
                                               string-util/coerce-non-blank-str)

        code-challenge-method (ex/get-optional-param! req
                                                      [:params :code_challenge_method]
                                                      (fn [s]
                                                        (when (contains? #{"S256" "plain"} s)
                                                          s)))

        _ (ex/assert-valid! :code-challenge
                            code-challenge
                            (when (and code-challenge-method
                                       (not code-challenge))
                              ["code_challenge must be provided when code_challenge_method is provided"]))

        _ (ex/assert-valid! :code-challenge-method
                            code-challenge-method
                            (when (and code-challenge
                                       (not code-challenge-method))
                              ["code_challenge_method must be provided when code_challenge is provided"]))

        {oauth-app :instant_oauth_apps
         oauth-client :instant_oauth_app_clients}
        (oauth-app-model/get-client-and-app-by-client-id! {:client-id client-id})

        _ (ex/assert-valid! :redirect_uri
                            redirect-uri
                            (when-not (ucoll/exists?
                                       (fn [u] (= redirect-uri u))
                                       (:authorized_redirect_urls oauth-client))
                              ;; DDD: Note about how to fix
                              ["Invalid redirect_uri."]))

        cookie (random-uuid)
        cookie-expires (java.util.Date. (+ (.getTime (java.util.Date.))
                                           ;; 1 hour
                                           (* 1000 60 60)))
        redirect-id (random-uuid)

        redirect (oauth-app-model/create-redirect {:redirect-id redirect-id
                                                   :client-id (:client_id oauth-client)
                                                   :state state
                                                   :cookie cookie
                                                   :redirect-uri redirect-uri
                                                   ;; DDD
                                                   :scopes (string/split scope #" ")
                                                   :code-challenge-method code-challenge-method
                                                   :code-challenge code-challenge})

        dash-url (url/add-query-params (str (config/dashboard-origin) "/platform/oauth/start")
                                       {:redirect-id redirect-id})]

    ;; http://localhost:8888/platform/oauth/start?client_id=2637f3ee-095d-4350-a2ad-0f641cc739a7&redirect_uri=http%3A%2F%2Fexample.com&response_type=code&scope=all&state=new-state
    (-> (response/found dash-url)
        (response/set-cookie cookie-name
                             (format-cookie cookie)
                             {:http-only true
                              ;; DDD: Also add not secure if the redirect-uri is localhost
                              :secure (not= :dev (config/get-env))
                              :expires cookie-expires
                              :path "/platform/oauth"
                              ;; access cookie on redirect
                              :same-site :lax}))))

;; DDD: Check for expiration (we can just look at created-at)
(defn claim-oauth-redirect [req]
  (let [user (req->auth-user! req)
        redirect-id (ex/get-param! req
                                   [:body :redirect]
                                   uuid-util/coerce)
        redirect (oauth-app-model/claim-redirect! {:redirect-id redirect-id
                                                   :user-id (:id user)})

        {oauth-app :instant_oauth_apps
         oauth-client :instant_oauth_app_clients}
        (oauth-app-model/get-client-and-app-by-client-id! {:client-id (:client_id redirect)})

        _ (when (and (or (not (:is_public oauth-app))
                         ;; DDD: Maybe we should store this in the redirect instead??
                         (= "localhost" (:host (uri/parse (:redirect_url redirect)))))
                     (not (get-member-role (:app_id oauth-app)
                                           (:id user))))
            (oauth-app-model/deny-redirect {:redirect-id redirect-id})
            (ex/throw+ {::ex/type ::ex/permission-denied
                        ::ex/message
                        (cond (not (:is_public oauth-app))
                              "This OAuth app is not public, only members of the app may use it."
                              (= "localhost" (:host (uri/parse (:redirect_url redirect))))
                              "Redirects to localhost can only be used by members of the app."
                              :else (throw (Exception. "Unhandled case")))}))]
    (response/ok {:appName (:app_name oauth-app)
                  :supportEmail (:support_email oauth-app)
                  :appPrivacyPolicyLink (:app_privacy_policy_link oauth-app)
                  :appLogo (:app_logo oauth-app)
                  :appTosLink (:app_tos_link oauth-app)
                  :appHomePage (:app_home_page oauth-app)
                  :redirectOrigin (:host (:redirect_url redirect))
                  :scope (:scopes redirect)
                  :grantToken (:grant_token redirect)})))

;; DDD: Check expired
(defn oauth-grant-access [req]
  (let [redirect-id (ex/get-param! req
                                   [:params :redirect_id]
                                   uuid-util/coerce)

        grant-token (ex/get-param! req
                                   [:params :grant_token]
                                   uuid-util/coerce)
        redirect (oauth-app-model/grant-redirect! {:redirect-id redirect-id
                                                   :grant-token grant-token})

        {oauth-app :instant_oauth_apps
         oauth-client :instant_oauth_app_clients}
        (oauth-app-model/get-client-and-app-by-client-id! {:client-id (:client_id redirect)})

        cookie-param (get-in req [:cookies cookie-name :value])

        _ (when (not cookie-param)
            (ex/throw+ {::ex/type ::ex/param-missing
                        ::ex/message "Missing cookie."}))

        _ (when (not (crypt-util/constant-uuid= cookie-param (:cookie redirect)))
            (ex/throw+ {::ex/type ::ex/param-missing
                        ::ex/message "Invalid cookie."}))

        code (random-uuid)
        code-record (oauth-app-model/create-code {:code code
                                                  :client-id (:client_id redirect)
                                                  :redirect-uri (:redirect_uri redirect)
                                                  :user-id (:user_id redirect)
                                                  :scopes (:scopes redirect)})]
    (response/found (url/add-query-params (:redirect_uri code-record)
                                          {:code code
                                           :state (:state redirect)
                                           :scope (clojure.string/join " " (:scopes code-record))}))))

(defn complete-access-token-request
  "Exchanges a code for a new access token and refresh token."
  [oauth-client req-params]
  (let [redirect-uri (ex/get-param! req-params
                                    [:redirect_uri]
                                    url/coerce-web-url)
        code (ex/get-param! req-params
                            [:code]
                            uuid-util/coerce)

        code-record (oauth-app-model/claim-code! {:code code})

        _ (when (not= (:client_id oauth-client) (:client_id code-record))
            (ex/throw+ {::ex/type ::ex/param-malformed
                        ::ex/message "Invalid client_id parameter"
                        ::ex/hint {:input (:client_id oauth-client)}}))

        _ (when-not (crypt-util/constant-bytes= (.getBytes redirect-uri)
                                                (.getBytes (:redirect_uri code-record)))
            (ex/throw+ {::ex/type ::ex/param-malformed
                        ::ex/message "Invalid redirect_uri parameter"
                        ::ex/hint {:input redirect-uri}}))


        {:keys [access-token refresh-token]}
        (oauth-app-model/create-tokens-for-code {:client-id (:client_id code-record)
                                                 :user-id (:user_id code-record)
                                                 :scopes (:scopes code-record)})]
    (response/ok {:access_token (:token-value access-token)
                  :expires_in (-> access-token
                                  :record
                                  oauth-app-model/access-token-expires-in)
                  :token_type "Bearer"
                  :refresh_token (:token-value refresh-token)
                  :scopes (->> access-token
                               :record
                               :scopes
                               (string/join " "))})))

(defn complete-refresh-token-request
  "Exchanges a refresh token for a new access token."
  [oauth-client req-params]
  (let [refresh-token (ex/get-param! req-params
                                     [:refresh_token]
                                     string-util/coerce-non-blank-str)
        refresh-token-record (oauth-app-model/refresh-token-by-token-value!
                              {:refresh-token refresh-token
                               :client-id (:client_id oauth-client)})

        access-token
        (oauth-app-model/create-access-token
         {:client-id (:client_id oauth-client)
          :user-id (:user_id refresh-token-record)
          :scopes (:scopes refresh-token-record)
          :refresh-token-lookup-key (:lookup_key refresh-token-record)})]
    (response/ok {:access_token (:token-value access-token)
                  :expires_in (-> access-token
                                  :record
                                  oauth-app-model/access-token-expires-in)
                  :token_type "Bearer"
                  :scope (->> access-token
                              :record
                              :scopes
                              (string/join " "))})))

(defn oauth-token [req]
  (let [content-type (get-in req [:headers "content-type"])
        ;; Allow either url-encoded or json-encoded bodies
        params (cond (some-> content-type
                             (string/starts-with? "application/x-www-form-urlencoded"))

                     (:params req)

                     (some-> content-type
                             (string/starts-with? "application/json"))
                     (:body req))
        client-id (ex/get-param! params
                                 [:client_id]
                                 uuid-util/coerce)
        client-secret (ex/get-param! params
                                     [:client_secret]
                                     string-util/coerce-non-blank-str)
        oauth-client (oauth-app-model/get-client-by-client-id-and-secret!
                      {:client-id client-id
                       :client-secret client-secret})
        grant-type (ex/get-param! params
                                  [:grant_type]
                                  string-util/coerce-non-blank-str)]
    (case grant-type
      "authorization_code"
      (complete-access-token-request oauth-client params)

      "refresh_token"
      (complete-refresh-token-request oauth-client params)

      (ex/throw+ {::ex/type ::ex/param-malformed
                  ::ex/message "Unrecognized `grant_type` parameter, expected either `authorization_code` or `refresh_token`"
                  ::ex/hint {:input grant-type}}))))

(defroutes routes
  (GET "/platform/oauth/start" [] (wrap-cookies oauth-start {:decoder parse-cookie}))
  (POST "/platform/oauth/claim" [] claim-oauth-redirect)
  (POST "/platform/oauth/grant" [] (wrap-cookies oauth-grant-access {:decoder parse-cookie}))
  (POST "/platform/oauth/token" [] oauth-token))
