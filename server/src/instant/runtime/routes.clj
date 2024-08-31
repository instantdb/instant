(ns instant.runtime.routes
  (:require [clojure.string :as string]
            [compojure.core :refer [defroutes GET POST] :as compojure]
            [instant.auth.oauth :as oauth]
            [instant.config :as config]
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
            [instant.postmark :as postmark]
            [instant.reactive.ephemeral :as eph]
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
            [ring.middleware.cookies :refer [wrap-cookies]]
            [ring.util.http-response :as response])
  (:import (java.util UUID)))

;; ----
;; ws

(defn session-get [_req]
  (session/undertow-config rs/store-conn
                           eph/ephemeral-store-atom
                           session/receive-q
                           {:id (UUID/randomUUID)}))

;; -----------
;; Magic codes

(defn default-body [title code]
  (postmark/standard-body "<p><strong>Welcome,</strong></p>
        <p>
          You asked to join " title ". To complete your registration, use this
          verification code:
        </p>
        <h2 style=\"text-align: center\"><strong>" code "</strong></h2>
       <p>
         Copy and paste this into the confirmation box, and you'll be on your way.
       </p>
       <p>
         Note: This code will expire in 24 hours, and can only be used once. If you
         didn't request this code, please reply to this email.
       </p>"))

(defn magic-code-email [{:keys [user params]}]
  (let [{:keys [email]} user

        {:keys [sender-name sender-email subject body]} params]
    {:from (str sender-name " " "<" sender-email ">")
     :to email
     :subject subject
     :reply-to sender-email
     :html
     body}))

(comment
  (def instant-user (instant-user-model/get-by-email
                     {:email "stopa@instantdb.com"}))
  (def app (first (app-model/get-all-for-user {:user-id (:id instant-user)})))
  (def runtime-user (app-user-model/get-by-email {:app-id (:id app)
                                                  :email "stopa@instantdb.com"}))
  (def m {:code "123123"})
  (postmark/send! (magic-code-email {:app app :user runtime-user :magic-code m}))

  (println  (postmark/standard-body (default-body "{app_title}" "{code}"))))

;; ------
;; Routes

(def postmark-unconfirmed-sender-body-error-code 400)
(def postmark-not-found-sender-body-error-code 401)

(def default-sender "auth@pm.instantdb.com")

(defn invalid-sender? [e]
  (let [code (-> e ex-data :body :ErrorCode)]
    (or (= code postmark-unconfirmed-sender-body-error-code)
        (= code postmark-not-found-sender-body-error-code))))

(defn template-replace [template params]
  (reduce
   (fn [acc [k v]]
     (string/replace acc (str "{" (name k) "}") v))
   template
   params))

(comment
  (template-replace "Hello {name}, your code is {code}" {:name "Stepan" :code "123"}))

(defn send-magic-code-post [req]
  (let [email (ex/get-param! req [:body :email] email/coerce)
        app-id (ex/get-param! req [:body :app-id] uuid-util/coerce)
        app (app-model/get-by-id! {:id app-id})
        {user-id :id :as u} (or (app-user-model/get-by-email {:app-id app-id :email email})
                                (app-user-model/create! {:id (UUID/randomUUID)
                                                         :app-id app-id
                                                         :email email}))
        magic-code (app-user-magic-code-model/create!
                    {:id (UUID/randomUUID)
                     :code (app-user-magic-code-model/rand-code)
                     :user-id user-id})
        template (app-email-template-model/get-by-app-id-and-email-type
                  {:app-id app-id
                   :email-type "magic-code"})
        template-params {:user_email (:email u)
                         :code (:code magic-code)
                         :app_title (:title app)}
        sender-email (or (:email template) default-sender)
        email-params (if template
                       {:sender-email sender-email
                        :sender-name (or (:name template) (:title app))
                        :subject (template-replace (:subject template) template-params)
                        :body (template-replace (:body template) template-params)}
                       {:sender-name (:title app)
                        :sender-email default-sender
                        :subject (str (:code magic-code) " is your verification code for " (:title app))
                        :body (default-body (:title app) (:code magic-code))})]
    (try
      (postmark/send! (magic-code-email {:user u
                                         :params email-params}))
      (catch clojure.lang.ExceptionInfo e
        (if (invalid-sender? e)
          (do
            (tracer/record-info! {:name "magic-code/unconfirmed-or-unknown-sender" :attributes {:email sender-email :app-id app-id}})
            (postmark/send! (magic-code-email {:user u
                                               :params (assoc email-params :sender-email default-sender)})))
          (throw e))))
    (response/ok {:sent true})))

(comment
  (def instant-user (instant-user-model/get-by-email
                     {:email "stopa@instantdb.com"}))
  (def app (first (app-model/get-all-for-user {:user-id (:id instant-user)})))
  (def runtime-user (app-user-model/get-by-email {:app-id (:id app)
                                                  :email "stopa@instantdb.com"}))

  (send-magic-code-post {:body {:email "stopainstantdb.com"}})
  (send-magic-code-post {:body {:email "stopa@instantdb.com" :app-id 1}}))

(defn verify-magic-code-post [req]
  (let [email (ex/get-param! req [:body :email] email/coerce)
        code (ex/get-param! req [:body :code] string/trim)
        app-id (ex/get-param! req [:body :app-id] uuid-util/coerce)
        m (app-user-magic-code-model/consume!
           {:app-id app-id
            :code code
            :email email})
        {user-id :user_id} m
        {refresh-token-id :id} (app-user-refresh-token-model/create! {:id (UUID/randomUUID)
                                                                      :user-id user-id})
        user (app-user-model/get-by-id {:app-id app-id :id user-id})]
    (response/ok {:user (assoc user :refresh_token refresh-token-id)})))

(comment
  (def instant-user (instant-user-model/get-by-email
                     {:email "stopa@instantdb.com"}))
  (def app (first (app-model/get-all-for-user {:user-id (:id instant-user)})))
  (def runtime-user (app-user-model/get-by-email {:app-id (:id app)
                                                  :email "stopa@instantdb.com"}))

  (def m (app-user-magic-code-model/create!
          {:id (UUID/randomUUID) :user-id (:id runtime-user) :code (app-user-magic-code-model/rand-code)}))
  (verify-magic-code-post {:body {:email "stopainstantdb.com" :code (:code m)}})
  (verify-magic-code-post {:body {:email "stopa@instantdb.com" :code (:code m)}})
  (verify-magic-code-post {:body {:email "stopa@instantdb.com" :code "0" :app-id (:id app)}})
  (verify-magic-code-post {:body {:email "stopa@instantdb.com" :code (:code m) :app-id (:id app)}}))

;; -----
;; Refresh Tokens

(defn verify-refresh-token-post [req]
  (let [refresh-token (ex/get-param! req [:body :refresh-token] uuid-util/coerce)
        app-id (ex/get-param! req [:body :app-id] uuid-util/coerce)
        user (app-user-model/get-by-refresh-token!
              {:app-id app-id :refresh-token refresh-token})]
    (response/ok {:user (assoc user :refresh_token refresh-token)})))

(defn signout-post [req]
  (let [refresh-token (ex/get-param! req [:body :refresh_token] uuid-util/coerce)]
    (app-user-refresh-token-model/delete-by-id! {:id refresh-token})
    (response/ok {})))

;; -----
;; OAuth

(def oauth-redirect-url (str config/server-origin "/runtime/oauth/callback"))
(def oauth-cookie-name "__session")

(defn oauth-start [{{:keys [state code_challenge code_challenge_method]} :params :as req}]
  (let [app-id (ex/get-param! req [:params :app_id] uuid-util/coerce)

        ;; Alias client_id to client_name for better integration with oauth sdks
        client-name (ex/get-some-param! req
                                        [[:params :client_name]
                                         [:params :client_id]]
                                        string-util/coerce-non-blank-str)

        client (app-oauth-client-model/get-by-client-name! {:app-id app-id
                                                            :client-name client-name})

        oauth-client (app-oauth-client-model/->OAuthClient client)

        redirect-uri (ex/get-param! req
                                    [:params :redirect_uri]
                                    string-util/coerce-non-blank-str)
        authorized-origins (app-authorized-redirect-origin-model/get-all-for-app
                            {:app-id (:app_id client)})
        matched-origin (app-authorized-redirect-origin-model/find-match
                        authorized-origins
                        redirect-uri)
        _ (when-not matched-origin
            (ex/throw-validation-err!
             :redirect-uri
             redirect-uri
             [{:message "Invalid redirect_uri. If you're the developer, make sure to add your website to the list of approved domains from the Dashboard."}]))

        app-redirect-url
        (if state
          (url/add-query-params redirect-uri {:state state})
          redirect-uri)

        cookie (UUID/randomUUID)
        cookie-expires (java.util.Date. (+ (.getTime (java.util.Date.))
                                             ;; 1 hour
                                           (* 1000 60 60)))
        state (UUID/randomUUID)

        redirect-url (oauth/create-authorization-url oauth-client state oauth-redirect-url)]
    (app-oauth-redirect-model/create! {:state state
                                       :cookie cookie
                                       :oauth-client-id (:id client)
                                       :redirect-url app-redirect-url
                                       :code-challenge code_challenge
                                       :code-challenge-method code_challenge_method})
    (-> (response/found redirect-url)
        (response/set-cookie oauth-cookie-name cookie {:http-only true
                                                         ;; Don't require https in dev
                                                       :secure (not= :dev (config/get-env))
                                                       :expires cookie-expires
                                                         ;; matches everything under the subdirectory
                                                       :path "/runtime/oauth"
                                                         ;; access cookie on oauth redirect
                                                       :same-site :lax}))))

(defn upsert-oauth-link! [{:keys [email sub app-id provider-id]}]
  (let [users (app-user-model/get-by-email-or-oauth-link-qualified
               {:email email
                :app-id app-id
                :sub sub
                :provider-id provider-id})]
    (cond
      (< 1 (count users))
      (let [err (format "Got multiple app users for email=%s, sub=%s, provider-id=%s."
                        email
                        sub
                        provider-id)]
        (tracer/record-exception-span!
         (Exception. err)
         {:name "oauth/upsert-oauth-link!"
          :escaping? false
          :attributes {:email email
                       :sub sub
                       :user-ids (pr-str (map :app_user/id users))}})
        nil)

      (= 1 (count users))
      (let [user (first users)]
        ;; extra caution because it would be really bad to
        ;; return users for a different app
        (assert (= app-id (:app_users/app_id user)))
        (cond (not= (:app_users/email user) email)
              (tracer/with-span! {:name "Updating email for app_user"
                                  :attributes {:id (:app_users/id user)
                                               :from-email (:app_users/email user)
                                               :to-email email}}
                (app-user-model/update-email! {:id (:app_users/id user)
                                               :email email}))

              (not (:app_user_oauth_links/id user))
              (tracer/with-span! {:name "Creating oauth_link for app_user"
                                  :attributes {:id (:app_users/id user)
                                               :provider_id provider-id
                                               :sub sub}}
                (app-user-oauth-link-model/create! {:id (UUID/randomUUID)
                                                    :app-id (:app_users/app_id user)
                                                    :provider-id provider-id
                                                    :sub sub
                                                    :user-id (:app_users/id user)}))

              :else (ucoll/select-keys-no-ns user :app_user_oauth_links)))

      (= 0 (count users))
      (let [user (app-user-model/create!
                  {:id (UUID/randomUUID)
                   :app-id app-id
                   :email email})]
        (app-user-oauth-link-model/create! {:id (UUID/randomUUID)
                                            :app-id app-id
                                            :provider-id provider-id
                                            :sub sub
                                            :user-id (:id user)})))))

(defn oauth-callback [{:keys [params] :as req}]
  (try
    (let [return-error (fn return-error [msg & params]
                         (throw (ex-info msg (merge {:type :oauth-error :message msg}
                                                    (apply hash-map params)))))

          _ (when (:error params)
              (return-error (:error params)))

          state-param (if-let [state (:state params)]
                        state
                        (return-error "Missing state param in OAuth redirect."))
          state (if-let [state (uuid-util/coerce state-param)]
                  state
                  (return-error "Invalid state param in OAuth redirect."))

          cookie (if-let [cookie (-> req
                                     (get-in [:cookies oauth-cookie-name :value])
                                     uuid-util/coerce)]
                   cookie
                   (return-error "Missing cookie."))

          oauth-redirect (if-let [oauth-redirect (app-oauth-redirect-model/consume! {:state state})]
                           oauth-redirect
                           (return-error "Could not find OAuth request."))
          _ (when (app-oauth-redirect-model/expired? oauth-redirect)
              (return-error "The request is expired."))
          _ (when (not (crypt-util/constant-uuid= cookie (:cookie oauth-redirect)))
              (return-error "Mismatch in OAuth request cookie."))

          code (if-let [code (:code params)]
                 code
                 (return-error "Missing code param in OAuth redirect."))

          client (if-let [client (app-oauth-client-model/get-by-id {:id (:client_id oauth-redirect)})]
                   client
                   (return-error "Missing OAuth client."))
          oauth-client (app-oauth-client-model/->OAuthClient client)

          user-info (let [user-info-response (oauth/get-user-info oauth-client code oauth-redirect-url)]
                      (if (= :error (:type user-info-response))
                        (return-error (:message user-info-response) :oauth-redirect oauth-redirect)
                        user-info-response))

          email (if-let [email (email/coerce (:email user-info))]
                  email
                  (return-error "Invalid email." :oauth-redirect oauth-redirect))
          sub (:sub user-info)

          social-login (upsert-oauth-link! {:email email
                                            :sub sub
                                            :app-id (:app_id client)
                                            :provider-id (:provider_id client)})

          code (UUID/randomUUID)
          _oauth-code (app-oauth-code-model/create!
                       {:code code
                        :user-id (:user_id social-login)
                        :app-id (:app_id social-login)
                        :code-challenge-method (:code_challenge_method oauth-redirect)
                        :code-challenge (:code_challenge oauth-redirect)})]
      (response/found (url/add-query-params (:redirect_url oauth-redirect)
                                            {:code code :_instant_oauth_redirect "true"})))

    (catch clojure.lang.ExceptionInfo e
      (let [{:keys [type oauth-redirect message]} (ex-data e)]
        (when-not (= :oauth-error type)
          (throw e))
        (when-not oauth-redirect
          (ex/throw-oauth-err! message))
        (response/found (url/add-query-params (:redirect_url oauth-redirect)
                                              {:error (-> e ex-data :message)
                                               :_instant_oauth_redirect "true"}))))))

(defn- param-paths [param]
  (mapcat (fn [k]
            [[k param] [k (name param)]])
          [:params :body :form-params]))

(defn oauth-token-callback [req]
  (let [app-id (ex/get-some-param! req (param-paths :app_id) uuid-util/coerce)
        code (ex/get-some-param! req (param-paths :code) uuid-util/coerce)
        code-verifier (some #(get-in req %) (param-paths :code_verifier))
        oauth-code (app-oauth-code-model/consume! {:code code
                                                   :app-id app-id
                                                   :verifier code-verifier})

        _ (when-let [origin (get-in req [:headers "origin"])]
            (let [authorized-origins (app-authorized-redirect-origin-model/get-all-for-app
                                      {:app-id app-id})]
              (when-not (app-authorized-redirect-origin-model/find-match
                         authorized-origins origin)
                (ex/throw-validation-err! :origin origin [{:message "Unauthorized origin."}]))))

        {user-id :user_id app-id :app_id} oauth-code
        {refresh-token-id :id} (app-user-refresh-token-model/create! {:id (UUID/randomUUID)
                                                                      :user-id user-id})
        user (app-user-model/get-by-id {:app-id app-id :id user-id})]
    (assert (= app-id (:app_id user)))
    (response/ok {:user (assoc user
                               :refresh_token refresh-token-id)
                  :refresh_token refresh-token-id})))

(defn oauth-id-token-callback [{{:keys [nonce]} :body :as req}]
  (let [id-token (ex/get-param! req [:body :id_token] string-util/coerce-non-blank-str)
        app-id (ex/get-param! req [:body :app_id] uuid-util/coerce)
        current-refresh-token-id (ex/get-optional-param! req [:body :refresh_token] uuid-util/coerce)
        client-name (ex/get-param! req [:body :client_name] string-util/coerce-non-blank-str)
        client (app-oauth-client-model/get-by-client-name! {:app-id app-id
                                                            :client-name client-name})
        oauth-client (app-oauth-client-model/->OAuthClient client)
        _ (when-let [origin (and (:client_secret client)
                                 (get-in req [:headers "origin"]))]
            (let [authorized-origins (app-authorized-redirect-origin-model/get-all-for-app
                                      {:app-id app-id})
                  match (app-authorized-redirect-origin-model/find-match
                         authorized-origins origin)]
              (when-not match
                (ex/throw-validation-err! :origin origin [{:message "Unauthorized origin."}]))))

        user-info (let [user-info-response (oauth/get-user-info-from-id-token
                                            oauth-client
                                            nonce
                                            id-token
                                            (when-not (:client_secret oauth-client)
                                              {:allow-unverified-email? true
                                               :ignore-audience? true}))]
                    (when (= :error (:type user-info-response))
                      (ex/throw-validation-err!
                       :id_token
                       id-token
                       [(:message user-info-response)]))
                    user-info-response)
        email (ex/get-param! user-info [:email] email/coerce)
        sub (:sub user-info)
        social-login (upsert-oauth-link! {:email email
                                          :sub sub
                                          :app-id (:app_id client)
                                          :provider-id (:provider_id client)})
        current-refresh-token (when current-refresh-token-id
                                (app-user-refresh-token-model/get-by-id {:id current-refresh-token-id}))
        {refresh-token-id :id} (if (and current-refresh-token
                                        (= (:user_id social-login)
                                           (:user_id current-refresh-token)))
                                 current-refresh-token
                                 (app-user-refresh-token-model/create! {:id (UUID/randomUUID)
                                                                        :user-id (:user_id social-login)}))
        user (app-user-model/get-by-id {:app-id app-id :id (:user_id social-login)})]
    (assert (= app-id (:app_id user)))
    (response/ok {:user (assoc user :refresh_token refresh-token-id)})))

(defn openid-configuration-get [req]
  (let [app-id (ex/get-param! req [:params :app_id] uuid-util/coerce)]
    (response/ok {:authorization_endpoint
                  (str config/server-origin "/runtime/" app-id "/oauth/start")

                  :token_endpoint
                  (str config/server-origin "/runtime/" app-id "/oauth/token")})))

(defroutes routes
  (POST "/runtime/auth/send_magic_code" [] send-magic-code-post)
  (POST "/runtime/auth/verify_magic_code" [] verify-magic-code-post)
  (POST "/runtime/auth/verify_refresh_token" [] verify-refresh-token-post)
  (wrap-cookies
   (GET "/runtime/oauth/start" [] oauth-start))
  (wrap-cookies
   (GET "/runtime/:app_id/oauth/start" [] oauth-start))
  (wrap-cookies
   (GET "/runtime/oauth/callback" [] oauth-callback))

  (POST "/runtime/oauth/token" [] oauth-token-callback)
  (POST "/runtime/:app_id/oauth/token" [] oauth-token-callback)
  (POST "/runtime/oauth/id_token" [] oauth-id-token-callback)
  (GET "/runtime/session" [] session-get)
  (POST "/runtime/signout" [] signout-post)
  (GET "/runtime/:app_id/.well-known/openid-configuration" [] openid-configuration-get))
