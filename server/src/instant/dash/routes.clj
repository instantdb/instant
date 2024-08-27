(ns instant.dash.routes
  (:require [clj-http.client :as clj-http]
            [clojure.string :as string]
            [clojure.set :as set]
            [clojure.tools.logging :as log]
            [compojure.core :refer [defroutes GET POST DELETE] :as compojure]
            [instant.dash.admin :as dash-admin]
            [instant.db.datalog :as d]
            [instant.db.permissioned-transaction :as permissioned-tx]
            [instant.model.app :as app-model]
            [instant.model.app-authorized-redirect-origin :as app-authorized-redirect-origin-model]
            [instant.model.app-oauth-client :as app-oauth-client-model]
            [instant.model.app-oauth-service-provider :as app-oauth-service-provider-model]
            [instant.model.instant-user-magic-code :as  instant-user-magic-code-model]
            [instant.model.outreach :as outreach-model]
            [instant.discord :as discord]
            [instant.model.instant-user-refresh-token :as instant-user-refresh-token-model]
            [instant.model.instant-user :as instant-user-model]
            [instant.model.app-member-invites :as instant-app-member-invites-model]
            [instant.model.app-members :as instant-app-members]
            [instant.model.instant-oauth-code :as instant-oauth-code-model]
            [instant.model.instant-oauth-redirect :as instant-oauth-redirect-model]
            [instant.db.model.attr :as attr-model]
            [instant.data.emails :refer [admin-email?]]
            [instant.model.rule :as rule-model]
            [instant.model.instant-profile :as instant-profile-model]
            [instant.model.instant-subscription :as instant-subscription-model]
            [instant.model.app-email-template :as app-email-template-model]
            [instant.model.app-email-sender :as app-email-sender-model]
            [instant.postmark :as postmark]
            [instant.util.async :refer [fut-bg]]
            [instant.util.coll :as coll]
            [instant.util.crypt :as crypt-util]
            [instant.util.email :as email]
            [instant.util.json :as json]
            [instant.util.tracer :as tracer]
            [instant.util.uuid :as uuid-util]
            [instant.util.string :as string-util]
            [instant.session-counter :as session-counter]
            [ring.middleware.cookies :refer [wrap-cookies]]
            [ring.util.http-response :as response]
            [instant.model.app-admin-token :as app-admin-token-model]
            [clojure.walk :as w]
            [instant.config :as config]
            [instant.fixtures :as fixtures]
            [instant.dash.ephemeral-app :as ephemeral-app]
            [instant.model.instant-stripe-customer :as instant-stripe-customer-model]
            [instant.util.date :as date]
            [instant.util.exception :as ex]
            [instant.util.http :as http-util]
            [next.jdbc :as next-jdbc]
            [instant.lib.ring.websocket :as ws]
            [instant.jdbc.aurora :as aurora]
            [instant.stripe :as stripe]
            [instant.storage.s3 :as s3-util]
            [instant.storage.beta :as storage-beta])

  (:import
   (java.util UUID)
   (com.stripe.model.checkout Session)))

;; ---
;; Auth helpers

(def idx->member-role [:collaborator :admin])
(def member-role->idx (set/map-invert idx->member-role))

(def idx->app-role (conj idx->member-role :owner))
(def app-role->idx (set/map-invert idx->app-role))

(defn req->auth-user! [req]
  (let [refresh-token (http-util/req->bearer-token! req)]
    (instant-user-model/get-by-refresh-token! {:refresh-token refresh-token})))

(defn assert-valid-member-role! [role]
  (ex/assert-valid! :role role (when-not (member-role->idx (keyword role)) ["Invalid role"])))

(comment
  (assert-valid-member-role! :collaborator)
  (assert-valid-member-role! :admin)
  (assert-valid-member-role! :owner)
  (assert-valid-member-role! nil)
  (assert-valid-member-role! 1))

(defn assert-least-privilege! [least-privilege-role user-role]
  (assert (app-role->idx least-privilege-role) "Expected valid least-privilege-role")
  (ex/assert-valid!
   :user-role
   user-role
   (when-not
    (and (app-role->idx user-role) user-role)
     [{:message "This is not a valid role"
       :expected idx->member-role}]))
  (ex/assert-permitted! :allowed-member-role? user-role
                        (<= (app-role->idx least-privilege-role)
                            (app-role->idx user-role))))

(defn get-member-role [app-id user-id]
  (keyword (:member_role (instant-app-members/get-by-app-and-user {:app-id app-id :user-id user-id}))))

(defn req->app-and-user!
  ([req] (req->app-and-user! :owner req))
  ([least-privilege req]
   (let [app-id (ex/get-param! req [:params :app_id] uuid-util/coerce)
         {app-creator-id :creator_id :as app} (app-model/get-by-id! {:id app-id})
         {user-id :id :as user} (req->auth-user! req)
         subscription (instant-subscription-model/get-by-user-app {:user-id (:creator_id app)
                                                                   :app-id (:id app)})]
     (assert-least-privilege!
      least-privilege
      (cond
        (= user-id app-creator-id) :owner
        (stripe/pro-plan? subscription) (get-member-role app-id user-id)))
     {:app app :user user :subscription subscription})))

(defn with-team-app-fixtures [role f]
  (fixtures/with-team-app
    (instant-user-model/get-by-email {:email "marky@instantdb.com"})
    (instant-user-model/get-by-email {:email "stopa@instantdb.com"}) role f))

(defn with-pro-app-fixtures [f]
  (fixtures/with-pro-app
    (instant-user-model/get-by-email {:email "marky@instantdb.com"}) f))

(comment
  (with-team-app-fixtures
    "admin"
    (fn [{:keys [invitee-req]}]
      (req->app-and-user! :owner invitee-req)))

  (with-team-app-fixtures
    "admin"
    (fn [{:keys [invitee-req]}]
      (req->app-and-user! :admin invitee-req)))

  (with-team-app-fixtures
    "owner"
    (fn [{:keys [owner-req]}]
      (req->app-and-user! :owner owner-req)))

  (def crole :collaborator)
  (def arole :admin)
  (assert-least-privilege! :collaborator nil)
  (assert-least-privilege! :collaborator 1)
  (assert-least-privilege! :owner crole)
  (assert-least-privilege! :admin arole)
  (assert-least-privilege! :owner arole)
  (assert-least-privilege! :owner :owner)
  (member-role->idx :not-a-role))

;; --------
;; Outreach

(defn ping-for-outreach [user-id]
  (let [{user-id :id email :email} (instant-user-model/get-by-id! {:id user-id})
        outreach (outreach-model/get-by-user-id {:user-id user-id})
        turn (rand-nth ["Stopa" "Joe"])]
    (if outreach
      (log/infof "ignoring outreach for user = %s" user-id)
      (do
        (outreach-model/create! {:user-id user-id})
        (discord/send!
         config/discord-signups-channel-id
         (str "🎉 A new user signed up! Say hi to " "`" email "`"))
        (postmark/send!
         {:from "Instant Assistant <hello@pm.instantdb.com>"
          :to "founders@instantdb.com"
          :reply-to email
          :subject (str "New sign up! " email " -- turn: " turn)
          :html
          (str
           "<div>
              <p>Hey hey! We just got a new sign up</p>
              <p>Email: <a href=\"mailto:" email "\">" email "</a></p>
              <p>" turn ", it's on you to send the ping :). Research and let's find out why they're peeking at Instant!</p>
            </div>")})))))

(comment
  (def u (instant-user-model/get-by-email {:email "stopa@instantdb.com"}))
  (outreach-model/delete-by-user-id! {:user-id (:id u)})
  (ping-for-outreach (:id u)))

;; -------
;; Magic Codes

(defn magic-code-email [{:keys [user magic-code]}]
  (let [title "Instant"
        {:keys [email]} user
        {:keys [code]} magic-code]
    {:from (str title " <auth@pm.instantdb.com>")
     :to email
     :subject (str code " is your verification code for " title)
     :html
     (postmark/standard-body
      "<p><strong>Welcome,</strong></p>
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
       </p>")}))

(comment
  (def user (instant-user-model/get-by-email {:email "stopa@instantdb.com"}))
  (def m {:code "123123"})
  (postmark/send! (magic-code-email {:user user :magic-code m})))

(defn send-magic-code-post [req]
  (let [email (ex/get-param! req [:body :email] email/coerce)
        {user-id :id :as u} (or  (instant-user-model/get-by-email {:email email})
                                 (instant-user-model/create!
                                  {:id (UUID/randomUUID) :email email}))
        magic-code (instant-user-magic-code-model/create!
                    {:id (UUID/randomUUID)
                     :code (instant-user-magic-code-model/rand-code)
                     :user-id user-id})]
    (postmark/send!
     (magic-code-email {:user u :magic-code magic-code}))
    (response/ok {:sent true})))

(comment
  (send-magic-code-post {:body {:email "stopainstantdb.com"}})
  (send-magic-code-post {:body {:email "stopa@instantdb.com"}})
  (send-magic-code-post {:body {:email "stopa+magic-code@instantdb.com"}})
  (instant-user-model/delete-by-email!
   {:email "stopa+magic-code@instantdb.com"}))

(defn verify-magic-code-post [req]
  (let [email (ex/get-param! req [:body :email] email/coerce)
        code (ex/get-param! req [:body :code] string/trim)
        {user-id :user_id} (instant-user-magic-code-model/consume!
                            {:code code :email email})
        {refresh-token-id :id} (instant-user-refresh-token-model/create!
                                {:id (UUID/randomUUID)
                                 :user-id user-id})]

    (fut-bg (ping-for-outreach user-id))
    (response/ok {:token refresh-token-id})))

(comment
  (def u (instant-user-model/get-by-email {:email "stopa@instantdb.com"}))
  (def m (instant-user-magic-code-model/create! {:id (UUID/randomUUID) :user-id (:id u) :code (instant-user-magic-code-model/rand-code)}))
  (verify-magic-code-post {:body {:email "stopainstantdb" :code (:code m)}})
  (verify-magic-code-post {:body {:email "stopa@instantdb.com" :code "0"}})
  (verify-magic-code-post {:body {:email "stopa@instantdb.com" :code (:code m)}}))

;; ---
;; Admin

(defn assert-admin-email! [email]
  (ex/assert-permitted! :admin? email (admin-email? email)))

(defn admin-get [req]
  (let [{:keys [email]} (req->auth-user! req)]
    (assert-admin-email! email)
    (response/ok {:users (dash-admin/get-recent)})))

(defn top-get [req]
  (let [{:keys [email]} (req->auth-user! req)]
    (assert-admin-email! email)
    (response/ok {:users (dash-admin/get-top-users)})))

(defn paid-get [req]
  (let [{:keys [email]} (req->auth-user! req)]
    (assert-admin-email! email)
    (response/ok {:subscriptions (dash-admin/get-paid)})))

;; ---
;; Dash

(defn dash-get [req]
  (let [{:keys [id email]} (req->auth-user! req)
        apps (app-model/get-all-for-user {:user-id id})
        profile (instant-profile-model/get-by-user-id {:user-id id})
        invites (instant-app-member-invites-model/get-pending-for-invitee {:email email})
        whitelist (storage-beta/whitelist)
        storage-enabled-app-ids (->> apps
                                     (map :id)
                                     (filter #(contains? whitelist (str %))))]
    (response/ok {:apps apps
                  :profile profile
                  :invites invites
                  :user {:id id :email email}
                  :flags {:storage_enabled_apps storage-enabled-app-ids}})))

(comment
  (def u (instant-user-model/get-by-email {:email "stopa@instantdb.com"}))
  (instant-app-member-invites-model/get-pending-for-invitee {:email "marky@instantdb.com"})
  (def r (instant-user-refresh-token-model/create! {:id (UUID/randomUUID) :user-id (:id u)}))
  (req->auth-user! {:headers {"authorization" (str "Bearer " (:id r))}})
  (dash-get {:headers {"authorization" (str "Bearer " (:id r))}})
  (instant-user-refresh-token-model/delete-by-id! r))

(defn profiles-post [req]
  (let [{user-id :id} (req->auth-user! req)
        meta (ex/get-param! req [:body :meta] identity)
        profile (instant-profile-model/put! {:user-id user-id :meta meta})]
    (response/ok {:profile profile})))

(defn apps-post [req]
  (let [title (ex/get-param! req [:body :title] string/trim)
        id (ex/get-param! req [:body :id] uuid-util/coerce)
        token (ex/get-param! req [:body :admin_token] uuid-util/coerce)
        {creator-id :id} (req->auth-user! req)
        app (app-model/create!
             {:id id
              :title title
              :creator-id creator-id
              :admin-token token})]
    (response/ok {:app app})))

(comment
  (def u (instant-user-model/get-by-email {:email "stopa@instantdb.com"}))
  (def r (instant-user-refresh-token-model/create! {:id (UUID/randomUUID) :user-id (:id u)}))
  (def app-id (str (UUID/randomUUID)))
  (apps-post {:headers {"authorization" (str "Bearer " (:id r))}
              :body {:id app-id :title "Foo!" :admin_token (UUID/randomUUID)}})

  (app-model/get-all-for-user {:user-id (:id u)})

  (app-model/delete-by-id! {:id app-id}))

(defn apps-delete [req]
  (let [{{app-id :id} :app} (req->app-and-user! req)]
    (app-model/delete-by-id! {:id app-id})
    (response/ok {:ok true})))

(defn admin-tokens-regenerate [req]
  (let [{{app-id :id} :app} (req->app-and-user! req)
        admin-token (ex/get-param! req [:body :admin-token] uuid-util/coerce)]
    (response/ok (app-admin-token-model/recreate! {:app-id app-id
                                                   :token admin-token}))))

;; --------
;; Rules

(defn rules-post [req]
  (let
   [{{app-id :id} :app} (req->app-and-user! :collaborator req)
    code (ex/get-param! req [:body :code] w/stringify-keys)]
    (ex/assert-valid! :rule code (rule-model/validation-errors code))
    (response/ok {:rules (rule-model/put! {:app-id app-id
                                           :code code})})))
(comment
  (def u (instant-user-model/get-by-email {:email "stopa@instantdb.com"}))
  (def r (instant-user-refresh-token-model/create! {:id (UUID/randomUUID) :user-id (:id u)}))
  (def app (first (app-model/get-all-for-user {:user-id (:id u)})))
  (def code {:docs {:allow {:view "lol"}}})
  (rules-post {:headers {"authorization" (str "Bearer " (:id r))}
               :params {:id (:id app)}
               :body {:code code}})
  (instant-user-refresh-token-model/delete-by-id! (select-keys r [:id])))

;; ---------
;; Apps Auth

(defn dash-apps-auth-get [req]
  (let [{{app-id :id} :app} (req->app-and-user! :collaborator req)
        {:keys [data]} (app-model/get-dash-auth-data {:app-id app-id})]
    (response/ok data)))

(defn authorized-redirect-origins-post [req]
  (let [{{app-id :id} :app} (req->app-and-user! :collaborator req)
        service (ex/get-param! req [:body :service] string-util/coerce-non-blank-str)
        service-params (ex/get-param! req [:body :params] #(when (coll? %) %))
        origin-req {:app-id app-id
                    :service service
                    :params service-params}
        _ (ex/assert-valid!
           :origin-request
           origin-req
           (when-let [err (app-authorized-redirect-origin-model/validation-error
                           service service-params)]
             [err]))
        origin (app-authorized-redirect-origin-model/add! origin-req)]
    (response/ok {:origin (select-keys origin [:id :service :params :created_at])})))

(defn authorized-redirect-origins-delete [req]
  (let [{{app-id :id} :app} (req->app-and-user! :collaborator req)
        id (ex/get-param! req [:params :id] uuid-util/coerce)
        origin (app-authorized-redirect-origin-model/delete-by-id-ensure!
                {:id id :app-id app-id})]
    (response/ok {:origin (select-keys origin [:id :service :params :created_at])})))

(defn oauth-service-providers-post [req]
  (let [{{app-id :id} :app} (req->app-and-user! :collaborator req)
        provider-name (ex/get-param! req
                                     [:body :provider_name]
                                     string-util/coerce-non-blank-str)
        provider (app-oauth-service-provider-model/create! {:app-id app-id
                                                            :provider-name provider-name})]

    (response/ok {:provider (select-keys provider [:id :provider_name :created_at])})))

(defn oauth-clients-post [req]
  (let [{{app-id :id} :app} (req->app-and-user! :collaborator req)
        provider-id (ex/get-param! req [:body :provider_id] uuid-util/coerce)
        client-name (ex/get-param! req [:body :client_name] string-util/coerce-non-blank-str)
        client-id (ex/get-param! req [:body :client_id] string-util/coerce-non-blank-str)
        client-secret (ex/get-param! req [:body :client_secret] string-util/coerce-non-blank-str)
        authorization-endpoint (ex/get-param! req [:body :authorization_endpoint] string-util/coerce-non-blank-str)
        token-endpoint (ex/get-param! req [:body :token_endpoint] string-util/coerce-non-blank-str)
        discovery-endpoint (ex/get-param! req [:body :discovery_endpoint] string-util/coerce-non-blank-str)
        client (app-oauth-client-model/create! {:app-id app-id
                                                :provider-id provider-id
                                                :client-name client-name
                                                :client-id client-id
                                                :client-secret client-secret
                                                :authorization-endpoint authorization-endpoint
                                                :token-endpoint token-endpoint
                                                :discovery-endpoint discovery-endpoint})]
    (response/ok {:client (select-keys client [:id :provider_id :client_name
                                               :client_id :created_at])})))

(defn oauth-clients-delete [req]
  (let [{{app-id :id} :app} (req->app-and-user! :collaborator req)
        id (ex/get-param! req [:params :id] uuid-util/coerce)
        client (app-oauth-client-model/delete-by-id-ensure! {:id id :app-id app-id})]
    (response/ok {:client (select-keys client [:id :provider_id :client_name
                                               :client_id :created_at])})))

(defn ephemeral-claim-post [req]
  (let [app-id (ex/get-param! req [:params :app_id] uuid-util/coerce)
        admin-token (ex/get-param! req [:body :token] uuid-util/coerce)
        {app-creator-id :creator_id} (app-model/get-by-id! {:id app-id})
        {user-id :id} (req->auth-user! req)]
    (ex/assert-permitted!
     :ephemeral-app?
     app-id
     (= (:id @ephemeral-app/ephemeral-creator) app-creator-id))
    (app-model/change-creator! {:id app-id :new-creator-id user-id :admin-token admin-token})
    (response/ok {})))

;; --------
;; OAuth

(def oauth-cookie-name "__session")
(def oauth-redirect-url (str config/server-origin "/dash/oauth/callback"))

(defn coerce-redirect-path [path]
  (cond
    (string/blank? path) "/dash"
    (.startsWith path "/") path
    :else (str "/" path)))

(defn oauth-start [{{:keys [redirect_path redirect_to_dev]} :params}]
  (let [cookie (UUID/randomUUID)
        cookie-expires (java.util.Date. (+ (.getTime (java.util.Date.))
                                           ;; 1 hour
                                           (* 1000 60 60)))
        state (UUID/randomUUID)
        params {:scope "email"
                :response_type "code"
                :state state
                :redirect_uri oauth-redirect-url
                :client_id (:client-id (config/get-google-oauth-client))}
        encoded-params (string/join "&" (map (fn [[param value]]
                                               (str (name param) "=" (java.net.URLEncoder/encode (str value))))
                                             params))
        ;; Hard-coded to google for now, but if we add additional services in the future, we
        ;; can accept a service param and dispatch off of that.
        redirect-url (str "https://accounts.google.com/o/oauth2/v2/auth" "?" encoded-params)]
    (instant-oauth-redirect-model/create! {:state state
                                           :cookie cookie
                                           :service "google"
                                           :redirect-path (coerce-redirect-path redirect_path)
                                           :redirect-to-dev (= redirect_to_dev "true")})
    (-> (response/found redirect-url)
        (response/set-cookie oauth-cookie-name cookie {:http-only true
                                                       ;; Don't require https in dev
                                                       :secure (not= :dev (config/get-env))
                                                       :expires cookie-expires
                                                       ;; matches everything under the subdirectory
                                                       :path "/dash/oauth"
                                                       ;; access cookie on oauth redirect
                                                       :same-site :lax}))))

(defn upsert-user-from-google-sub! [email google-sub]
  (let [users (instant-user-model/get-by-email-or-google-sub {:email email
                                                              :google-sub google-sub})]
    (cond
      (< 1 (count users))
      (let [err (format "Got multiple users for email=%s and google-sub=%s."
                        email
                        google-sub)]
        (tracer/record-exception-span! (Exception. err)
                                       {:name "oauth/upsert-user-from-google-sub!"
                                        :escaping? false
                                        :attributes {:email email
                                                     :google-sub google-sub
                                                     :user-ids (pr-str (map :id users))}})
        nil)

      (= 1 (count users))
      (let [user (first users)]
        (cond
          (not= (:email user) email)
          (tracer/with-span! {:name "oauth/updating-email-for-instant_user"
                              :attributes {:id (:id user)
                                           :from-email (:email user)
                                           :to-email email}}
            (instant-user-model/update-email! {:id (:id user)
                                               :email email}))

          (not= (:google_sub user) google-sub)
          (tracer/with-span! {:name "oauth/updating-google-sub-for-instant_user"
                              :attributes {:id (:id user)
                                           :from-sub (:google-sub user)
                                           :to-sub google-sub}}
            (instant-user-model/update-google-sub!
             {:id (:id user)
              :google-sub google-sub}))

          :else user))
      :else (let [user-id (UUID/randomUUID)
                  user (instant-user-model/create! {:id user-id
                                                    :email email
                                                    :google-sub google-sub})]
              (fut-bg (ping-for-outreach user-id))
              user))))

(defn oauth-callback-response [{:keys [error code redirect-to-dev]}]
  (let [dash (if redirect-to-dev
               (config/dashboard-origin {:env :dev})
               (config/dashboard-origin))
        base-url (str dash "/dash/oauth/callback")
        redirect-url (str base-url "?" (if error
                                         (str "error=" (java.net.URLEncoder/encode error))
                                         (str "code=" code)))]
    (response/found redirect-url)))

(defn oauth-callback [req]
  (let [error-param (-> req :params :error)
        state-param (-> req :params :state)
        cookie-param (get-in req [:cookies oauth-cookie-name :value])
        state (uuid-util/coerce state-param)
        cookie (uuid-util/coerce cookie-param)
        oauth-redirect (when (and state cookie)
                         (instant-oauth-redirect-model/consume! {:state state}))
        code (-> req :params :code)
        user-info
        (when (and code oauth-redirect)
          (clj-http/post
           "https://oauth2.googleapis.com/token"
           {:throw-exceptions false
            :as :json
            :coerce :always ;; also coerce error responses to json
            :form-params {:client_id (:client-id (config/get-google-oauth-client))
                          :client_secret (.value (:client-secret (config/get-google-oauth-client)))
                          :code code
                          :grant_type "authorization_code"
                          :redirect_uri oauth-redirect-url}}))

        id-token (try
                   ;; extract the id token data that has the email and sub from the id_token JWT
                   (some-> user-info
                           :body
                           :id_token
                           (string/split #"\.")
                           second
                           (#(.decode (java.util.Base64/getUrlDecoder) %))
                           String.
                           (json/<-json true))
                   (catch IllegalArgumentException _e
                     (log/errorf "Invalid id_token %s" (-> user-info :body :id_token))
                     nil))
        google-sub (when (:email_verified id-token) (:sub id-token))
        email (email/coerce (:email id-token))
        user-info-error (when (and user-info (not (clj-http/success? user-info)))
                          (str "Error fetching user data from Google: "
                               (get-in user-info [:body :error_description] "Unknown error") "."))
        error (cond error-param (str "Error from Google: " error-param)
                    (not state-param) "Missing state param in OAuth redirect."
                    (not cookie-param) "Missing cookie."
                    (not state) "Invalid state param in OAuth redirect."
                    (not cookie) "Invalid cookie."
                    (not code) "Missing code param in OAuth redirect."
                    (not oauth-redirect) "Could not find OAuth request."

                    (not (crypt-util/constant-uuid= cookie (:cookie oauth-redirect)))
                    "Mismatch in OAuth request cookie."

                    user-info-error user-info-error
                    (not id-token) "Invalid response from Google."
                    (not (:email_verified id-token)) "Could not verify email."
                    (not email) "Could not determine email."
                    (not google-sub) "Could not determine user info."
                    (instant-oauth-redirect-model/expired? oauth-redirect) "Request is expired."
                    :else nil)]
    (if error
      (oauth-callback-response {:error error})
      (if-let [user (upsert-user-from-google-sub! email google-sub)]
        (let [code (UUID/randomUUID)]
          (instant-oauth-code-model/create! {:code code
                                             :user-id (:id user)
                                             :redirect-path (:redirect_path oauth-redirect)})
          (oauth-callback-response {:code code :redirect-to-dev (:redirect_to_dev oauth-redirect)}))
        (oauth-callback-response {:error "Could not create or update user."})))))

(defn oauth-token-callback [req]
  (let [code (ex/get-param! req [:body :code] uuid-util/coerce)
        oauth-code (instant-oauth-code-model/consume! {:code code})
        {refresh-token-id :id} (instant-user-refresh-token-model/create!
                                {:id (UUID/randomUUID)
                                 :user-id (:user_id oauth-code)})]
    (response/ok {:token refresh-token-id
                  :redirect_path (:redirect_path oauth-code)})))

;; --------
;; Billing

(def default-subscription "Free")

(defn calculate-storage-usage [app-id]
  (let [objects-resp (s3-util/list-app-objects app-id)
        objects (:object-summaries objects-resp)
        usage (reduce (fn [acc obj] (+ acc (:size obj))) 0 objects)]
    usage))

(comment
  (def app-id  #uuid "524bc106-1f0d-44a0-b222-923505264c47")
  (calculate-storage-usage app-id))

(defn checkout-session-post [req]
  (let [{{app-id :id app-title :title} :app
         {user-id :id user-email :email :as user} :user} (req->app-and-user! req)
        {:keys [name]} (instant-subscription-model/get-by-user-app
                        {:user-id user-id :app-id app-id})
        already-subscribed? (not (or (= name default-subscription) (nil? name)))
        _ (when already-subscribed?
            (ex/throw-record-not-unique! :instant-subscription))
        {customer-id :id} (instant-stripe-customer-model/get-or-create! {:user user})
        metadata {"app-id" app-id "user-id" user-id}
        description (str "App name: " app-title)
        session
        (Session/create
         {"success_url" (str (config/stripe-success-url) "&app=" app-id)
          "cancel_url" (str (config/stripe-cancel-url) "&app=" app-id)
          "customer" customer-id
          "metadata" metadata
          "allow_promotion_codes" (admin-email? user-email)
          "subscription_data" {"metadata" metadata
                               "description" description
                               "billing_cycle_anchor"
                               (.toEpochSecond (date/first-of-next-month-est))}
          "mode" "subscription"
          "line_items" [{"price" (config/stripe-pro-subscription)
                         "quantity" 1}]})]
    (response/ok {:id (.getId session)})))

(defn create-portal [req]
  (let [{{app-id :id} :app user :user} (req->app-and-user! req)
        {customer-id :id} (instant-stripe-customer-model/get-or-create! {:user user})
        session
        (com.stripe.model.billingportal.Session/create
         {"return_url" (str (config/stripe-success-url) "&app=" app-id)
          "customer" customer-id})]
    (response/ok {:url (.getUrl session)})))

(defn get-billing [req]
  (let [{{app-id :id} :app {user-id :id} :user} (req->app-and-user! req)
        {subscription-name :name stripe-subscription-id :stripe_subscription_id}
        (instant-subscription-model/get-by-user-app {:user-id user-id :app-id app-id})
        {total-app-bytes :num_bytes} (app-model/app-usage {:app-id app-id})
        total-storage-bytes (calculate-storage-usage app-id)]
    (response/ok {:subscription-name (or subscription-name default-subscription)
                  :stripe-subscription-id stripe-subscription-id
                  :total-app-bytes total-app-bytes
                  :total-storage-bytes total-storage-bytes})))

(defn session-counts-get [_req]
  (session-counter/undertow-config))

;; -------
;; Teams

(defn team-member-invite-email [{:keys [invitee-email inviter-id app-id]}]
  (let [title "Instant"
        user (instant-user-model/get-by-id! {:id inviter-id})
        app (app-model/get-by-id! {:id app-id})]
    {:from (str title " <teams@pm.instantdb.com>")
     :to invitee-email
     :subject (str "[Instant] You've been invited to collaborate on " (:title app))
     :html
     (postmark/standard-body
      "<p><strong>Hey there!</strong></p>
       <p>
         " (:email user) " invited you to collaborate on their app " (:title app) ".
       </p>
       <p>
         Navigate to <a href=\"https://instantdb.com/dash?s=invites\">Instant</a> to accept the invite.
       </p>
       <p>
         Note: This invite will expire in 3 days. If you
         don't know the user inviting you, please reply to this email.
       </p>")}))

(comment
  (with-pro-app-fixtures
    (fn [{:keys [app owner]}]
      (team-member-invite-email
       {:invitee-email "stopa@instantdb.com"
        :inviter-id (:id owner)
        :app-id (:id app)}))))

(defn team-member-invite-send-post [req]
  (let [{{app-id :id} :app {inviter-id :id} :user} (req->app-and-user! :admin req)
        invitee-email (ex/get-param! req [:body :invitee-email] email/coerce)
        role (ex/get-param! req [:body :role] string-util/coerce-non-blank-str)]
    (assert-valid-member-role! role)
    (instant-app-member-invites-model/create! {:app-id app-id
                                               :inviter-id inviter-id
                                               :email invitee-email
                                               :role role})
    (postmark/send!
     (team-member-invite-email {:inviter-id inviter-id
                                :invitee-email invitee-email
                                :app-id app-id}))
    (response/ok {})))

(defn team-member-invite-accept-post [req]
  (let [{user-email :email user-id :id} (req->auth-user! req)
        invite-id (ex/get-param! req [:body :invite-id] uuid-util/coerce)
        {:keys [invitee_role status app_id invitee_email]} (instant-app-member-invites-model/get-by-id! {:id invite-id})]
    (ex/assert-permitted! :invitee? invitee_email (= invitee_email user-email))
    (ex/assert-permitted! :acceptable? invite-id (not= status "revoked"))
    (next-jdbc/with-transaction [tx-conn aurora/conn-pool]
      (instant-app-member-invites-model/accept-by-id! tx-conn {:id invite-id})
      (instant-app-members/create! tx-conn {:user-id user-id
                                            :app-id app_id
                                            :role invitee_role}))
    (response/ok {})))

(comment
  (def the-invite-id "2fc83c72-c43b-415e-8b8a-09061951ae52")
  (def i (instant-app-member-invites-model/get-by-id! {:id the-invite-id}))
  (def u (instant-user-model/get-by-email {:email (:invitee_email i)}))
  (def r' (fixtures/mock-app-req {:id "_"} u))
  (def body {:invite-id the-invite-id})
  (team-member-invite-accept-post (assoc r' :body body))
  (with-pro-app-fixtures
    (fn [{:keys [app owner]}]
      (let [e "stopa@instantdb.com"
            u (instant-user-model/get-by-email {:email e})
            i  (instant-app-member-invites-model/create! {:app-id (:id app)
                                                          :inviter-id (:id owner)
                                                          :email e
                                                          :role "collaborator"})]
        (team-member-invite-accept-post
         (assoc (fixtures/mock-app-req {:id "not used"} u) :body {:invite-id (:id i)}))))))

(defn team-member-invite-decline-post [req]
  (let [{user-email :email} (req->auth-user! req)
        invite-id (ex/get-param! req [:body :invite-id] uuid-util/coerce)
        {invitee-email :invitee_email} (instant-app-member-invites-model/get-by-id! {:id invite-id})]
    (ex/assert-permitted! :declinable? invite-id (= user-email invitee-email))
    (instant-app-member-invites-model/reject-by-id {:id invite-id})
    (response/ok {})))

(defn team-member-invite-revoke-delete [req]
  (let [invite-id (ex/get-param! req [:body :invite-id] uuid-util/coerce)]
    (req->app-and-user! :admin req)
    (instant-app-member-invites-model/reject-by-id {:id invite-id})
    (response/ok {})))

(comment
  (with-team-app-fixtures
    "collaborator"
    (fn [{:keys [owner-req invite]}]
      (team-member-invite-revoke-delete
       (assoc owner-req :body {:invite-id (:id invite)})))))

(defn team-member-remove-delete [req]
  (let [id (ex/get-param! req [:body :id] uuid-util/coerce)]
    (req->app-and-user! :admin req)
    (instant-app-members/delete-by-id! {:id id})
    (response/ok {})))

(comment
  (with-team-app-fixtures
    "collaborator"
    (fn [{:keys [owner-req member]}]
      (team-member-remove-delete
       (assoc owner-req :body {:id (:id member)})))))

(defn team-member-update-post [req]
  (let [member-id (ex/get-param! req [:body :id] uuid-util/coerce)
        role (ex/get-param! req [:body :role] string-util/coerce-non-blank-str)]
    (assert-valid-member-role! role)
    (req->app-and-user! :admin req)
    (instant-app-members/update-role {:id member-id :role role})
    (response/ok {})))

(comment
  (with-team-app-fixtures
    "collaborator"
    (fn [{:keys [owner-req member]}]
      (team-member-update-post
       (assoc owner-req :body {:role "admin" :id (:id member)})))))

;; --- 
;; Email templates

(defn email-template-post [req]
  (let [{app :app user :user} (req->app-and-user! :admin req)
        email-type (ex/get-param! req [:body :email-type] string-util/coerce-non-blank-str)
        subject (ex/get-param! req [:body :subject] string-util/coerce-non-blank-str)
        _ (ex/assert-valid! :subject subject
                            (when-not
                             (string/includes? subject "{code}")
                              [{:message "Subject does not contain template variable: '{code}'"}]))
        body (ex/get-param! req [:body :body] string-util/coerce-non-blank-str)
        _ (ex/assert-valid! :body body
                            (when-not
                             (string/includes? body "{code}")
                              [{:message  "Body does not contain template variable: '{code}'"}]))
        sender-email (email/coerce (get-in req [:body :sender-email])) ;; optional
        custom-sender-name (string-util/coerce-non-blank-str (get-in req [:body :sender-name])) ;; optional
        sender-name (or custom-sender-name (:title app))
        sender (when sender-email
                 (app-email-sender-model/sync-sender!
                  {:app-id (:id app)
                   :user-id (:id user)
                   :email sender-email
                   :name sender-name}))
        template (app-email-template-model/put!
                  {:app-id (:id app)
                   :email-type email-type
                   :sender-id (:id sender)
                   :name sender-name
                   :subject subject
                   :body body})]
    (response/ok {:id (:id template)})))

(comment
  (def any-app (app-model/get-by-id {:id "d8f9e0a9-b6f5-49e9-a186-eabc7fe4ddac"}))
  (def tmpl-res (email-template-post (assoc (fixtures/mock-app-req any-app) :body {:email-type "magic-code"
                                                                                   :subject "Hey {user_email}! Your code for '{app_title}' is: {code}"
                                                                                   :body "<b>{codes}</b>"
                                                                                   :sender-email "instant-test-7@marky.fyi"
                                                                                   :sender-name "Marky at Instant"})))
  (def tmpl-id (str (get-in tmpl-res [:body :id])))
  (email-template-delete (assoc-in (fixtures/mock-app-req any-app) [:params :id] tmpl-id)))

(defn email-template-delete [req]
  (let [{app :app} (req->app-and-user! req)
        id (ex/get-param! req [:params :id] uuid-util/coerce)]
    (app-email-template-model/delete-by-id! {:id id :app-id (:id app)})
    (response/ok {})))

(defn app-rename-post [req]
  (let
   [{{app-id :id} :app} (req->app-and-user! :owner req)
    title (ex/get-param! req [:body :title] string-util/coerce-non-blank-str)]
    (app-model/rename-by-id! {:id app-id
                              :title title})
    (response/ok {})))

;; ---
;; Storage

(defn signed-download-url-get [req]
  (let [{{app-id :id} :app} (req->app-and-user! :collaborator req)
        filename (ex/get-param! req [:params :filename] string-util/coerce-non-blank-str)
        expiration (+ (System/currentTimeMillis) (* 1000 60 60 24 7)) ;; 7 days
        object-key (s3-util/->object-key app-id filename)]
    (storage-beta/assert-storage-enabled! app-id)
    (response/ok {:data (str (s3-util/signed-download-url object-key expiration))})))

(defn signed-upload-url-post [req]
  (let [{{app-id :id} :app} (req->app-and-user! :collaborator req)
        filename (ex/get-param! req [:body :filename] string-util/coerce-non-blank-str)
        object-key (s3-util/->object-key app-id filename)]
    (storage-beta/assert-storage-enabled! app-id)
    (response/ok {:data (str (s3-util/signed-upload-url object-key))})))

(defn format-object [{:keys [key size owner etag last-modified]}]
  {:key key
   :size size
   :owner owner
   :etag etag
   :last_modified (.getMillis last-modified)})

;; Retrieves all files that have been uploaded via Storage APIs
(defn files-get [req]
  (let [{{app-id :id} :app} (req->app-and-user! :collaborator req)
        _ (storage-beta/assert-storage-enabled! app-id)
        subdirectory (-> req :params :subdirectory)
        objects-resp (if (string/blank? subdirectory)
                       (s3-util/list-app-objects app-id)
                       (s3-util/list-app-objects (str app-id "/" subdirectory)))
        objects (:object-summaries objects-resp)]
    (response/ok {:data (map format-object objects)})))

;; Deletes a single file by name/path (e.g. "demo.png", "profiles/me.jpg")
(defn file-delete [req]
  (let [{{app-id :id} :app} (req->app-and-user! :collaborator req)
        _ (storage-beta/assert-storage-enabled! app-id)
        filename (-> req :params :filename)
        key (s3-util/->object-key app-id filename)
        resp (s3-util/delete-object key)]
    (response/ok {:data resp})))

;; Deletes a multiple files by name/path (e.g. "demo.png", "profiles/me.jpg")
(defn files-delete [req]
  (let [{{app-id :id} :app} (req->app-and-user! :collaborator req)
        _ (storage-beta/assert-storage-enabled! app-id)
        filenames (-> req :body :filenames)
        keys (mapv (fn [filename] (s3-util/->object-key app-id filename)) filenames)
        resp (s3-util/delete-objects keys)]
    (response/ok {:data resp})))

(comment
  (def app-id  #uuid "524bc106-1f0d-44a0-b222-923505264c47")
  (def user (instant-user-model/get-by-email {:email "alex@instantdb.com"}))
  (def guest (instant-user-model/get-by-email {:email "stopa@instantdb.com"}))
  (def refresh-token (instant-user-refresh-token-model/create! {:id (UUID/randomUUID) :user-id (:id user)}))
  (def guest-refresh-token (instant-user-refresh-token-model/create! {:id (UUID/randomUUID) :user-id (:id guest)}))
  (files-get {:params {:app_id app-id}
              :headers {"authorization" (str "Bearer " (:id refresh-token))}})
  (files-get {:params {:app_id app-id}
              :headers {"authorization" (str "Bearer " (:id guest-refresh-token))}})
  (file-delete {:params {:app_id app-id :filename "pika.webp"}
                :headers {"authorization" (str "Bearer " (:id refresh-token))}}))

;; --- 
;; CLI

(defn map-map [f m]
  (into {} (map (fn [[k v]] [k (f [k v])]) m)))

(defn schemas->ops [current-schema new-schema]
  (let [{new-blobs :blobs new-refs :refs} new-schema
        eid-ops (map (fn [[ns-name _]] (if (get-in current-schema [:blobs ns-name])
                                         nil
                                         [:add-attr
                                          {:value-type :blob
                                           :cardinality :one
                                           :id (UUID/randomUUID)
                                           :forward-identity [(UUID/randomUUID) (name ns-name) "id"]
                                           :unique? false
                                           :index? false}])) new-blobs)
        blob-ops (mapcat
                  (fn [[ns-name attrs]]
                    (map (fn [[attr-name new-attr]]
                           (let
                            [current-attr (get-in current-schema [:blobs ns-name attr-name])
                             new-attr? (not current-attr)
                             unchanged-attr? (and
                                              (= (get new-attr :unique?) (get current-attr :unique?))
                                              (= (get new-attr :index?) (get current-attr :index?)))]
                             (cond
                               unchanged-attr? nil
                               new-attr?  [:add-attr
                                           {:value-type :blob
                                            :cardinality :one
                                            :id (UUID/randomUUID)
                                            :forward-identity [(UUID/randomUUID) (name ns-name) (name attr-name)]
                                            :unique? (:unique? new-attr)
                                            :index? (:index? new-attr)}]
                               :else [:update-attr
                                      {:value-type :blob
                                       :cardinality :one
                                       :id (:id current-attr)
                                       :forward-identity (:forward-identity current-attr)
                                       :unique? (:unique? new-attr)
                                       :index? (:index? new-attr)}])))
                         attrs))
                  new-blobs)
        ref-ops (map
                 (fn [[link-desc new-attr]]
                   (let
                    [[from-ns from-attr to-ns to-attr] link-desc
                     current-attr (get-in current-schema [:refs link-desc])
                     new-attr? (not current-attr)
                     unchanged-attr? (and
                                      (= (get new-attr :cardinality) (get current-attr :cardinality))
                                      (= (get new-attr :unique?) (get current-attr :unique?)))]
                     (cond
                       unchanged-attr? nil
                       new-attr? [:add-attr
                                  {:value-type :ref
                                   :id (UUID/randomUUID)
                                   :forward-identity [(UUID/randomUUID) from-ns from-attr]
                                   :reverse-identity [(UUID/randomUUID) to-ns to-attr]
                                   :cardinality (:cardinality new-attr)
                                   :unique? (:unique? new-attr)
                                   :index? (:index? new-attr)}]
                       :else [:update-attr
                              {:value-type :ref
                               :id (:id current-attr)
                               :forward-identity (:forward-identity current-attr)
                               :reverse-identity (:reverse-identity current-attr)
                               :cardinality (:cardinality new-attr)
                               :unique? (:unique? new-attr)
                               :index? (:index? new-attr)}])))
                 new-refs)]
    (->> (concat eid-ops blob-ops ref-ops)
         (filter some?)
         vec)))

(defn attrs->schema [attrs]
  (let [{blobs :blob refs :ref} (group-by :value-type attrs)
        refs-indexed (into {} (map (fn [{:keys [forward-identity reverse-identity] :as attr}]
                                     [[(second forward-identity)
                                       (coll/third forward-identity)
                                       (second reverse-identity)
                                       (coll/third reverse-identity)] attr])
                                   refs))
        blobs-indexed (->> blobs
                           (group-by #(-> % attr-model/fwd-etype keyword))
                           (map-map (fn [[_ attrs]]
                                      (into {}
                                            (map (fn [a]
                                                   [(keyword (-> a :forward-identity coll/third))
                                                    a])
                                                 attrs)))))]
    {:refs refs-indexed :blobs blobs-indexed}))

(def relationships->schema-params {[:many :many] {:cardinality :many
                                                  :unique? false}
                                   [:one :one] {:cardinality :one
                                                :unique? true}
                                   [:many :one] {:cardinality :many
                                                 :unique? true}
                                   [:one :many] {:cardinality :one
                                                 :unique? false}})

(defn defs->schema [defs]
  (let [{entities :entities links :links} defs
        refs-indexed (into {} (map (fn [[_
                                         {from-ns :from
                                          from-attr :fromAttr
                                          from-has :fromHas
                                          to-ns :to
                                          to-attr :toAttr
                                          to-has :toHas}]]
                                     [[from-ns from-attr to-ns to-attr]
                                      (merge
                                       {:id nil
                                        :value-type :ref
                                        :index? false
                                        :forward-identity [nil from-ns from-attr]
                                        :reverse-identity [nil to-ns to-attr]}
                                       (get relationships->schema-params
                                            [(keyword from-has) (keyword to-has)]))])
                                   links))
        blobs-indexed (map-map (fn [[ns-name def]]
                                 (map-map (fn [[attr-name attr-def]]
                                            {:id nil
                                             :value-type :blob
                                             :cardinality :one
                                             :forward-identity [nil (name ns-name) (name attr-name)]
                                             :unique? (or (-> attr-def :config :unique) false)
                                             :index? (or (-> attr-def :config :indexed) false)})
                                          (:attrs def)))
                               entities)]
    {:refs refs-indexed :blobs blobs-indexed}))

(defn schema-push-steps [app-id client-defs]
  (let [new-schema (defs->schema client-defs)
        current-attrs (attr-model/get-by-app-id aurora/conn-pool app-id)
        current-schema (attrs->schema current-attrs)
        steps (schemas->ops current-schema new-schema)]
    {:new-schema new-schema
     :current-schema current-schema
     :current-attrs current-attrs
     :steps steps}))

(defn schema-push-plan-post [req]
  (let [{{app-id :id} :app} (req->app-and-user! :collaborator req)
        client-defs (-> req :body :schema)
        r (schema-push-steps app-id client-defs)]
    (response/ok r)))

(defn schema-push-apply-post [req]
  (let [{{app-id :id} :app} (req->app-and-user! :collaborator req)
        client-defs (-> req :body :schema)
        r (schema-push-steps app-id client-defs)
        tx-ctx {:admin? true
                :db {:conn-pool aurora/conn-pool}
                :app-id app-id
                :attrs (attr-model/get-by-app-id aurora/conn-pool app-id)
                :datalog-query-fn d/query
                :rules (rule-model/get-by-app-id aurora/conn-pool
                                                 {:app-id app-id})}
        _ (permissioned-tx/transact! tx-ctx (:steps r))]
    (response/ok r)))

(defn schema-pull-get [req]
  (let [{{app-id :id app-title :title} :app} (req->app-and-user! :collaborator req)
        current-attrs (attr-model/get-by-app-id aurora/conn-pool app-id)
        current-schema (attrs->schema current-attrs)
        r {:schema current-schema :app-title app-title}]
    (response/ok r)))

(defn perms-pull-get [req]
  (let [{{app-id :id} :app} (req->app-and-user! :collaborator req)
        perms (rule-model/get-by-app-id
               aurora/conn-pool
               {:app-id app-id})
        r {:perms (:code perms)}]
    (response/ok r)))

(comment
  (def counters-app-id  #uuid "137ace7a-efdd-490f-b0dc-a3c73a14f892")
  (def u (instant-user-model/get-by-email {:email "stopa@instantdb.com"}))
  (def r (instant-user-refresh-token-model/create! {:id (UUID/randomUUID) :user-id (:id u)}))
  (schemas->ops
   {:refs {["posts" "comments" "comments" "post"] {:unique? true}}
    :blobs {:ns {:a {:cardinality "one"} :b {:cardinality "many"} :c {:cardinality "one"}}}}
   {:refs {["posts" "comments" "comments" "post"] {:unique? false}}
    :blobs {:ns {:a {:cardinality "many"} :b {:cardinality  "many"}}}})
  (schema-push-plan-post {:params {:app_id counters-app-id}
                          :headers {"authorization" (str "Bearer " (:id r))}}))

;; --- 
;; WS playground 

(def id-atom (atom 0))
(defn ws-playground-get
  "This is a simple websocket playground, to play with undertow's websocket behavior. 
  
   To try it out, 
   ```bash
   brew install websocat 
   websocat ws://localhost:8888/dash/ws_playground 
   hi 
   break 
   ```"
  [_]
  (let [id (swap! id-atom inc)]
    {:undertow/websocket
     {:on-open (fn [{:keys [channel]}]
                 (tracer/with-span! {:name "ws-play/on-open" :attributes {:id id}}
                   (ws/send-json! (format "[%s] ok" id) channel)))
      :on-message (fn [{:keys [channel data]}]
                    (tracer/with-span! {:name "ws-play/on-message" :attributes {:id id :data data}}
                      (condp = (string/trim data)
                        "break"
                        (tracer/with-span! {:name "ws-play/break" :attributes {:id id}}
                          (.close channel))
                        "throw-err"
                        (tracer/with-span! {:name "ws-play/throw-err" :attributes {:id id}}
                          (do (.close channel)
                              (ws/send-json! "this can't send" channel)))
                        (ws/send-json! (format "[%s] received %s" id data) channel))))

      :on-close (fn [_]
                  (tracer/record-info! {:name  "ws-play/on-close" :attributes {:id id}}))
      :on-close-message (fn [_]
                          (tracer/record-info! {:name  "ws-play/on-close-message" :attributes {:id id}}))
      :on-error (fn [_]
                  (tracer/record-info! {:name  "ws-play/on-error" :attributes {:id id}}))}}))

(defn signout [req]
  (let [_user (req->auth-user! req) ;; just calling this for the error handling
        token (http-util/req->bearer-token! req)]
    (instant-user-refresh-token-model/delete-by-id! {:id token})
    (response/ok {})))

(defroutes routes
  (POST "/dash/auth/send_magic_code" [] send-magic-code-post)
  (POST "/dash/auth/verify_magic_code" [] verify-magic-code-post)
  (GET "/dash/admin" [] admin-get)
  (GET "/dash/top" [] top-get)
  (GET "/dash/paid" [] paid-get)
  (GET "/dash" [] dash-get)
  (POST "/dash/apps" [] apps-post)
  (POST "/dash/profiles" [] profiles-post)
  (DELETE "/dash/apps/:app_id" [] apps-delete)
  (POST "/dash/apps/:app_id/rules" [] rules-post)
  (POST "/dash/apps/:app_id/tokens" [] admin-tokens-regenerate)

  (GET "/dash/apps/ephemeral/:app_id" [] ephemeral-app/http-get-handler)
  (POST "/dash/apps/ephemeral" [] ephemeral-app/http-post-handler)
  (POST "/dash/apps/ephemeral/:app_id/claim" [] ephemeral-claim-post)

  (GET "/dash/apps/:app_id/auth" [] dash-apps-auth-get)
  (POST "/dash/apps/:app_id/authorized_redirect_origins" [] authorized-redirect-origins-post)
  (DELETE "/dash/apps/:app_id/authorized_redirect_origins/:id" [] authorized-redirect-origins-delete)

  (POST "/dash/apps/:app_id/oauth_service_providers" [] oauth-service-providers-post)

  (POST "/dash/apps/:app_id/oauth_clients" [] oauth-clients-post)
  (DELETE "/dash/apps/:app_id/oauth_clients/:id" [] oauth-clients-delete)

  (wrap-cookies
   (GET "/dash/oauth/start" [] oauth-start))

  (wrap-cookies
   (GET "/dash/oauth/callback" [] oauth-callback))

  (POST "/dash/oauth/token" [] oauth-token-callback)

  (GET "/dash/session_counts" [] session-counts-get)

  (POST "/dash/apps/:app_id/checkout_session" [] checkout-session-post)
  (POST "/dash/apps/:app_id/portal_session" [] create-portal)
  (GET "/dash/apps/:app_id/billing" [] get-billing)

  (POST "/dash/apps/:app_id/invite/send" [] team-member-invite-send-post)
  (DELETE "/dash/apps/:app_id/invite/revoke" [] team-member-invite-revoke-delete)

  (DELETE "/dash/apps/:app_id/members/remove" [] team-member-remove-delete)
  (POST "/dash/apps/:app_id/members/update" [] team-member-update-post)

  (POST "/dash/apps/:app_id/email_templates" [] email-template-post)
  (DELETE "/dash/apps/:app_id/email_templates/:id" [] email-template-delete)

  (POST "/dash/invites/accept" [] team-member-invite-accept-post)
  (POST "/dash/invites/decline" [] team-member-invite-decline-post)

  (POST "/dash/apps/:app_id/rename" [] app-rename-post)

  (POST "/dash/apps/:app_id/storage/signed-upload-url" [] signed-upload-url-post)
  (GET "/dash/apps/:app_id/storage/signed-download-url", [] signed-download-url-get)
  (GET "/dash/apps/:app_id/storage/files" [] files-get)
  (DELETE "/dash/apps/:app_id/storage/files" [] file-delete) ;; single delete
  (POST "/dash/apps/:app_id/storage/files/delete" [] files-delete) ;; bulk delete

  (POST "/dash/apps/:app_id/schema/push/plan" [] schema-push-plan-post)
  (POST "/dash/apps/:app_id/schema/push/apply" [] schema-push-apply-post)
  (GET "/dash/apps/:app_id/schema/pull" [] schema-pull-get)
  (GET "/dash/apps/:app_id/perms/pull" [] perms-pull-get)

  (GET "/dash/ws_playground" [] ws-playground-get)

  (POST "/dash/signout" [] signout))
