(ns instant.oauth-apps.routes
  (:require [clojure.string :as string]
            [compojure.core :as compojure :refer [defroutes GET POST]]
            [hiccup2.core :as h]
            [instant.auth.oauth :refer [verify-pkce!]]
            [instant.config :as config]
            [instant.dash.routes :refer [get-member-role req->auth-user!]]
            [instant.model.app :as app-model]
            [instant.model.oauth-app :as oauth-app-model]
            [instant.runtime.routes :refer [format-cookie parse-cookie]]
            [instant.util.coll :as ucoll]
            [instant.util.crypt :as crypt-util]
            [instant.util.exception :as ex]
            [instant.util.string :as string-util]
            [instant.util.token :as token-util]
            [instant.util.tracer :as tracer]
            [instant.util.url :as url]
            [instant.util.uuid :as uuid-util]
            [lambdaisland.uri :as uri]
            [ring.middleware.cookies :refer [wrap-cookies]]
            [ring.util.http-response :as response]))

(def cookie-name "__session")

(defn oauth-error-page
  "Used when we need to show the user an error page, e.g. the user is sent to an authorization
   URL without a client_id."
  [error]
  {:status 400
   :headers {"content-type" "text/html"}
   :body (str (h/html (h/raw "<!DOCTYPE html>")
                      [:html {:lang "en"}
                       [:head
                        [:meta {:charset "UTF-8"}]
                        [:meta {:name "viewport"
                                :content "width=device-width, initial-scale=1.0"}]

                        [:title "OAuth error"]
                        [:style "
                           body {
                             margin: 0;
                             height: 100vh;
                             display: flex;
                             justify-content: center;
                             align-items: center;
                             background-color: white;
                             flex-direction: column;
                             font-family: sans-serif;
                           }

                           a.button {
                             text-decoration: none;
                             padding: 15px 30px;
                             font-size: 18px;
                             border-radius: 5px;
                             font-family: sans-serif;
                             text-align: center;
                           }

                           a {
                             cursor: pointer;
                           }

                           @media (prefers-color-scheme: dark) {
                             body {
                               background-color: black;
                             }
                             a.button {
                               color: black;
                               background-color: white;
                             }
                           }

                           @media (prefers-color-scheme: light) {
                             a.button {
                               color: white;
                               background-color: black;
                             }
                           }"]]
                       [:body
                        [:p "There was an error with your OAuth request."]
                        [:p error]]]))})

(defn oauth-start [req]
  (tracer/add-data! {:attributes (select-keys (:params req)
                                              [:client_id
                                               :redirect_uri
                                               :reponse_type
                                               :scope
                                               :code_challenge_method])})
  (try
    (let [client-id (ex/get-param! req
                                   [:params :client_id]
                                   uuid-util/coerce)
          redirect-uri (ex/get-param! req
                                      [:params :redirect_uri]
                                      string-util/coerce-non-blank-str)
          response-type (ex/get-param! req
                                       [:params :response_type]
                                       string-util/coerce-non-blank-str)

          _ (when-not (= response-type "code")
              (ex/throw+ {::ex/type ::ex/param-malformed
                          ::ex/message "`response_type` parameter must have value `code`"}))

          scope-input (ex/get-param! req
                                     [:params :scope]
                                     string-util/coerce-non-blank-str)

          requested-scopes (let [scopes (string/split scope-input #" ")]
                             (when-not (seq scopes)
                               (ex/throw+ {::ex/type ::ex/param-malformed
                                           ::ex/message "The scope param must specify at least one scope"}))
                             (keep (fn [scope]
                                     (if (contains? oauth-app-model/all-scopes scope)
                                       scope
                                       (ex/throw+ {::ex/type ::ex/param-malformed
                                                   ::ex/message (format "Invalid scope %s" scope)
                                                   ::ex/hint {:scope-input scope-input
                                                              :invalid-scope scope}})))
                                   scopes))

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
                                ["The code_challenge param must be provided when code_challenge_method is provided"]))

          _ (ex/assert-valid! :code-challenge-method
                              code-challenge-method
                              (when (and code-challenge
                                         (not code-challenge-method))
                                ["The code_challenge_method param must be provided when code_challenge is provided"]))

          {oauth-app :instant_oauth_apps
           oauth-client :instant_oauth_app_clients}
          (oauth-app-model/get-client-and-app-by-client-id! {:client-id client-id})

          _ (tracer/add-data! {:attributes {:oauth-app-id (:id oauth-app)
                                            :oauth-app-app-id (:app_id oauth-app)}})

          _ (ex/assert-valid!
             :scope
             scope-input
             (when (:is_public oauth-app)
               (let [granted-scopes (set (:granted_scopes oauth-app))
                     invalid-scopes (filter (fn [scope]
                                              (not (contains? granted-scopes
                                                              scope)))
                                            requested-scopes)]
                 (when (seq invalid-scopes)
                   [(format "this OAuth app has not been granted the %s scopes"
                            (string-util/join-in-sentence invalid-scopes))]))))

          _ (ex/assert-valid! :redirect_uri
                              redirect-uri
                              (when-not (ucoll/exists?
                                         (fn [u] (= redirect-uri u))
                                         (:authorized_redirect_urls oauth-client))
                                ["The redirect_uri does not appear in the set of authorized redirect uri for the OAuth client."]))

          _ (ex/assert-valid! :redirect_uri
                              redirect-uri
                              (url/redirect-url-validation-errors
                               redirect-uri
                               :allow-localhost? (not (:is_public oauth-app))))

          cookie (random-uuid)
          cookie-expires (java.util.Date. (+ (.getTime (java.util.Date.))
                                             ;; 1 hour
                                             (* 1000 60 60)))
          redirect-id (random-uuid)

          dash-url (url/add-query-params (str (config/dashboard-origin) "/platform/oauth/start")
                                         {:redirect-id redirect-id})]

      (oauth-app-model/create-redirect {:redirect-id redirect-id
                                        :client-id (:client_id oauth-client)
                                        :state state
                                        :cookie cookie
                                        :redirect-uri redirect-uri
                                        :scopes requested-scopes
                                        :code-challenge-method code-challenge-method
                                        :code-challenge code-challenge})

      (-> (response/found dash-url)
          (response/set-cookie cookie-name
                               (format-cookie cookie)
                               {:http-only true
                                :secure (not= :dev (config/get-env))
                                :expires cookie-expires
                                :path "/platform/oauth"
                                ;; access cookie on redirect
                                :same-site :lax})))
    (catch clojure.lang.ExceptionInfo e
      (if-let [msg (-> e ex-data ::ex/message)]
        (oauth-error-page msg)
        (throw e)))))

(defn claim-oauth-redirect [req]
  (let [user (req->auth-user! req)
        _ (tracer/add-data! {:attributes {:user-id (:id user)}})
        redirect-id (ex/get-param! req
                                   [:body :redirect]
                                   uuid-util/coerce)
        redirect (oauth-app-model/claim-redirect! {:redirect-id redirect-id
                                                   :user-id (:id user)})

        {oauth-app :instant_oauth_apps}
        (oauth-app-model/get-client-and-app-by-client-id! {:client-id (:client_id redirect)})

        _ (tracer/add-data! {:attributes {:oauth-app-id (:id oauth-app)
                                          :oauth-app-app-id (:app_id oauth-app)}})

        _ (when (and (or (not (:is_public oauth-app))
                         (= "localhost" (:host (uri/parse (:redirect_uri redirect)))))
                     (not (app-model/get-by-id-and-creator {:app-id (:app_id oauth-app)
                                                            :user-id (:id user)}))
                     (not (get-member-role (:app_id oauth-app)
                                           (:id user))))
            (oauth-app-model/deny-redirect! {:redirect-id redirect-id})
            (ex/throw+ {::ex/type ::ex/permission-denied
                        ::ex/message
                        (cond (not (:is_public oauth-app))
                              "This OAuth app is not public, only members of the app may use it."
                              (= "localhost" (:host (uri/parse (:redirect_uri redirect))))
                              "Redirects to localhost can only be used by members of the app."
                              :else (throw (Exception. "Unhandled case")))}))]
    (response/ok {:appName (:app_name oauth-app)
                  :userEmail (:email user)
                  :supportEmail (:support_email oauth-app)
                  :appPrivacyPolicyLink (:app_privacy_policy_link oauth-app)
                  :appLogo (some-> oauth-app
                                   :app_logo
                                   oauth-app-model/bytes->base64-image-url)
                  :appTosLink (:app_tos_link oauth-app)
                  :appHomePage (:app_home_page oauth-app)
                  :redirectOrigin (-> redirect
                                      :redirect_uri
                                      uri/uri
                                      :host)
                  :scopes (:scopes redirect)
                  :grantToken (:grant_token redirect)})))

(defn oauth-grant-access [req]
  (try
    (let [redirect-id (ex/get-param! req
                                     [:params :redirect_id]
                                     uuid-util/coerce)

          grant-token (ex/get-param! req
                                     [:params :grant_token]
                                     uuid-util/coerce)
          redirect (oauth-app-model/grant-redirect! {:redirect-id redirect-id
                                                     :grant-token grant-token})]
      (try
        (let [{oauth-app :instant_oauth_apps
               oauth-client :instant_oauth_app_clients}
              (oauth-app-model/get-client-and-app-by-client-id! {:client-id (:client_id redirect)})

              _ (tracer/add-data! {:attributes {:oauth-app-id (:id oauth-app)
                                                :oauth-app-app-id (:app_id oauth-app)
                                                :oauth-client-id (:client_id oauth-client)}})

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
                                                        :scopes (:scopes redirect)
                                                        :code-challenge (:code_challenge redirect)
                                                        :code-challenge-method (:code_challenge_method redirect)})]
          (response/found (url/add-query-params (:redirect_uri code-record)
                                                {:code code
                                                 :state (:state redirect)
                                                 :scope (clojure.string/join " " (:scopes code-record))})))
        (catch clojure.lang.ExceptionInfo e
          (if-let [msg (-> e ex-data ::ex/message)]
            (response/found (url/add-query-params (:redirect_uri redirect)
                                                  {:error (case (-> e ex-data ::ex/type)
                                                            (::ex/param-missing
                                                             ::ex/param-malformed) "invalid_request"
                                                            "server_error")
                                                   :error_description msg
                                                   :state (:state redirect)}))
            (throw e)))))
    (catch clojure.lang.ExceptionInfo e
      (if-let [msg (-> e ex-data ::ex/message)]
        (oauth-error-page msg)
        (throw e)))))

(defn oauth-deny-access [req]
  (let [redirect-id (ex/get-param! req
                                   [:params :redirect_id]
                                   uuid-util/coerce)

        grant-token (ex/get-param! req
                                   [:params :grant_token]
                                   uuid-util/coerce)
        redirect (oauth-app-model/deny-redirect! {:redirect-id redirect-id
                                                 :grant-token grant-token})

        cookie-param (get-in req [:cookies cookie-name :value])

        _ (when (not cookie-param)
            (ex/throw+ {::ex/type ::ex/param-missing
                        ::ex/message "Missing cookie."}))

        _ (when (not (crypt-util/constant-uuid= cookie-param (:cookie redirect)))
            (ex/throw+ {::ex/type ::ex/param-missing
                        ::ex/message "Invalid cookie."}))]
    (response/found (url/add-query-params (:redirect_uri redirect)
                                          {:error "access_denied"
                                           :state (:state redirect)}))))

(defn complete-pkce-access-token-request
  "Exchanges a code for a new access token with PKCE, does not return
   a refresh token."
  [client-id req-params]
  (let [redirect-uri (ex/get-param! req-params
                                    [:redirect_uri]
                                    string-util/coerce-non-blank-str)
        code-param (ex/get-param! req-params
                                  [:code]
                                  uuid-util/coerce)

        code* (oauth-app-model/claim-code! {:code code-param})

        _ (when (not= client-id (:client_id code*))
            (ex/throw+ {::ex/type ::ex/param-malformed
                        ::ex/message "Invalid client_id parameter"
                        ::ex/hint {:input client-id}}))

        _ (when-not (crypt-util/constant-bytes= (String/.getBytes redirect-uri)
                                                (String/.getBytes (:redirect_uri code*)))
            (ex/throw+ {::ex/type ::ex/param-malformed
                        ::ex/message "Invalid redirect_uri parameter"
                        ::ex/hint {:input redirect-uri}}))

        _ (when-not (and (:code_challenge code*)
                         (:code_challenge_method code*))
            (ex/throw+ {::ex/type ::ex/param-missing
                        ::ex/message "You must provide the client_secret from a secure server or use the client-side PKCE flow to exchange the OAuth code for a token."}))

        verifier (ex/get-param! req-params
                                [:code_verifier]
                                string-util/coerce-non-blank-str)

        code (verify-pkce! :oauth-code code* verifier)

        access-token
        (oauth-app-model/create-access-token {:client-id (:client_id code)
                                              :user-id (:user_id code)
                                              :scopes (:scopes code)})]
    (response/ok {:access_token (:token-value access-token)
                  :expires_in (-> access-token
                                  :record
                                  oauth-app-model/access-token-expires-in)
                  :token_type "Bearer"
                  :scopes (->> access-token
                               :record
                               :scopes
                               (string/join " "))})))

(defn complete-access-token-request
  "Exchanges a code for a new access token and refresh token."
  [oauth-client req-params]
  (let [redirect-uri (ex/get-param! req-params
                                    [:redirect_uri]
                                    string-util/coerce-non-blank-str)
        code (ex/get-param! req-params
                            [:code]
                            uuid-util/coerce)

        code-record (oauth-app-model/claim-code! {:code code})

        _ (when (not= (:client_id oauth-client) (:client_id code-record))
            (ex/throw+ {::ex/type ::ex/param-malformed
                        ::ex/message "Invalid client_id parameter"
                        ::ex/hint {:input (:client_id oauth-client)}}))

        _ (when-not (crypt-util/constant-bytes= (String/.getBytes redirect-uri)
                                                (String/.getBytes (:redirect_uri code-record)))
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
        _ (tracer/add-data! {:attributes (select-keys params [:grant_type
                                                              :client_id])})

        grant-type (ex/get-param! params
                                  [:grant_type]
                                  string-util/coerce-non-blank-str)

        client-id (ex/get-param! params
                                 [:client_id]
                                 uuid-util/coerce)
        client-secret (ex/get-optional-param! params
                                              [:client_secret]
                                              string-util/coerce-non-blank-str)]
    (if-not client-secret
      (case grant-type
        "authorization_code"
        (complete-pkce-access-token-request client-id params)
        (ex/throw+ {::ex/type ::ex/param-malformed
                    ::ex/message "Unrecognized `grant_type` parameter only `authorization_code` is allowed for the PKCE flow."
                    ::ex/hint {:input grant-type}}))
      (let [oauth-client (oauth-app-model/get-client-by-client-id-and-secret!
                          {:client-id client-id
                           :client-secret client-secret})]
        (case grant-type
          "authorization_code"
          (complete-access-token-request oauth-client params)

          "refresh_token"
          (complete-refresh-token-request oauth-client params)

          (ex/throw+ {::ex/type ::ex/param-malformed
                      ::ex/message "Unrecognized `grant_type` parameter, expected either `authorization_code` or `refresh_token`"
                      ::ex/hint {:input grant-type}}))))))

(defn get-token-info [req]
  (let [token-str (ex/get-param! (:params req)
                                 [:access_token]
                                 string-util/coerce-non-blank-str)
        token (token-util/coerce-token-from-string token-str)]
    (when-not (token-util/is-platform-access-token? token)
      (ex/throw-validation-err! :access_token
                                {}
                                [{:message "The access_token is not a valid platform OAuth access token."}]))

    (let [record (oauth-app-model/access-token-by-token-value!
                  {:access-token (token-util/platform-access-token-value token)})]
      (response/ok {:expires_in (oauth-app-model/access-token-expires-in record)
                    :token_type "Bearer"
                    :scopes (->> record
                                 :scopes
                                 (string/join " "))}))))

(defn revoke-oauth-token [req]
  (let [token (ex/get-param! req
                             [:params :token]
                             string-util/coerce-non-blank-str)]
    (cond (string/starts-with? token token-util/platform-refresh-token-prefix)
          (oauth-app-model/revoke-refresh-token {:token token})

          (string/starts-with? token token-util/platform-access-token-prefix)
          (oauth-app-model/revoke-access-token {:token token})

          :else
          (ex/throw+ {::ex/type ::ex/param-malformed
                      ::ex/message "Token is not a access token or a refresh token."}))
    (response/ok {})))

(defroutes routes
  (GET "/platform/oauth/start" [] (wrap-cookies oauth-start {:decoder parse-cookie}))
  (POST "/platform/oauth/claim" [] claim-oauth-redirect)
  (POST "/platform/oauth/grant" [] (wrap-cookies oauth-grant-access {:decoder parse-cookie}))
  (POST "/platform/oauth/deny" [] (wrap-cookies oauth-deny-access {:decoder parse-cookie}))
  (POST "/platform/oauth/token" [] oauth-token)
  (GET "/platform/oauth/token-info" [] get-token-info)
  (POST "/platform/oauth/revoke" [] revoke-oauth-token))
