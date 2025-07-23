(ns instant.dash.routes
  (:require [clj-http.client :as clj-http]
            [clojure.core.cache.wrapped :as cache]
            [clojure.set :as set]
            [clojure.string :as string]
            [clojure.tools.logging :as log]
            [clojure.walk :as w]
            [compojure.core :as compojure :refer [defroutes DELETE GET POST PUT]]
            [instant.config :as config]
            [instant.dash.admin :as dash-admin]
            [instant.dash.ephemeral-app :as ephemeral-app]
            [instant.db.indexing-jobs :as indexing-jobs]
            [instant.db.model.attr :as attr-model]
            [instant.discord :as discord]
            [instant.fixtures :as fixtures]
            [instant.flags :as flags :refer [admin-email?]]
            [instant.intern.metrics :as metrics]
            [instant.jdbc.aurora :as aurora]
            [instant.lib.ring.websocket :as ws]
            [instant.machine-summaries :as machine-summaries]
            [instant.model.app :as app-model]
            [instant.model.app-admin-token :as app-admin-token-model]
            [instant.model.app-authorized-redirect-origin :as app-authorized-redirect-origin-model]
            [instant.model.app-email-sender :as app-email-sender-model]
            [instant.model.app-email-template :as app-email-template-model]
            [instant.model.app-file :as app-file-model]
            [instant.model.app-member-invites :as instant-app-member-invites-model]
            [instant.model.app-members :as instant-app-members]
            [instant.model.app-oauth-client :as app-oauth-client-model]
            [instant.model.app-oauth-service-provider :as app-oauth-service-provider-model]
            [instant.model.instant-cli-login :as instant-cli-login-model]
            [instant.model.instant-oauth-code :as instant-oauth-code-model]
            [instant.model.instant-oauth-redirect :as instant-oauth-redirect-model]
            [instant.model.instant-personal-access-token :as instant-personal-access-token-model]
            [instant.model.instant-profile :as instant-profile-model]
            [instant.model.instant-stripe-customer :as instant-stripe-customer-model]
            [instant.model.instant-subscription :as instant-subscription-model]
            [instant.model.instant-user :as instant-user-model]
            [instant.model.instant-user-magic-code :as instant-user-magic-code-model]
            [instant.model.instant-user-refresh-token :as instant-user-refresh-token-model]
            [instant.model.oauth-app :as oauth-app-model]
            [instant.model.outreach :as outreach-model]
            [instant.model.rule :as rule-model]
            [instant.model.schema :as schema-model]
            [instant.postmark :as postmark]
            [instant.reactive.ephemeral :as eph]
            [instant.session-counter :as session-counter]
            [instant.storage.coordinator :as storage-coordinator]
            [instant.stripe :as stripe]
            [instant.superadmin.routes :refer [req->superadmin-user-and-app!]]
            [instant.system-catalog :as system-catalog]
            [instant.util.async :refer [fut-bg]]
            [instant.util.coll :as ucoll]
            [instant.util.crypt :as crypt-util]
            [instant.util.date :as date]
            [instant.util.email :as email]
            [instant.util.exception :as ex]
            [instant.util.http :as http-util]
            [instant.util.json :as json]
            [instant.util.number :as number-util]
            [instant.util.semver :as semver]
            [instant.util.string :as string-util]
            [instant.util.token :as token-util]
            [instant.util.tracer :as tracer]
            [instant.util.url :as url-util]
            [instant.util.uuid :as uuid-util]
            [medley.core :as medley]
            [next.jdbc :as next-jdbc]
            [ring.middleware.cookies :refer [wrap-cookies]]
            [ring.util.http-response :as response])
  (:import
   (com.stripe.model.checkout Session)
   (io.undertow.websockets.core WebSocketChannel)
   (java.util Map UUID)))

(def cli-min-version (semver/parse "v0.19.0"))

;; ---
;; Auth helpers

(def idx->member-role [:collaborator :admin])
(def member-role->idx (set/map-invert idx->member-role))

(def idx->app-role (conj idx->member-role :owner))
(def app-role->idx (set/map-invert idx->app-role))

(defn req->auth-user! [req]
  (let [refresh-token (http-util/req->bearer-token! req)]
    (instant-user-model/get-by-refresh-token! {:refresh-token refresh-token
                                               :auth? true})))

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
         subscription (instant-subscription-model/get-by-app-id {:app-id app-id})]

     (assert-least-privilege!
      least-privilege
      (cond
        (= user-id app-creator-id) :owner
        (stripe/pro-plan? subscription) (get-member-role app-id user-id)))
     {:app app :user user :subscription subscription})))

(defn req->app-and-user-accepting-platform-tokens! [least-privilege scope req]
  (let [token (http-util/req->bearer-token! req)]
    (if (token-util/is-platform-token? token)
      (req->superadmin-user-and-app! scope req)
      (req->app-and-user! least-privilege req))))

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
    {:from {:name title
            :email "verify@dash-pm.instantdb.com"}
     :to [{:email email}]
     :subject (str code " is your verification code for " title)
     :html
     (email/standard-body
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
  (def m {:code (string-util/rand-num-str 6)})
  (postmark/send-structured! (magic-code-email {:user user :magic-code m})))

(defn send-magic-code-post [req]
  (let [email (ex/get-param! req [:body :email] email/coerce)
        {user-id :id :as u} (or  (instant-user-model/get-by-email {:email email})
                                 (instant-user-model/create!
                                  {:id (UUID/randomUUID) :email email}))
        magic-code (instant-user-magic-code-model/create!
                    {:id (UUID/randomUUID)
                     :code (instant-user-magic-code-model/rand-code)
                     :user-id user-id})]
    (postmark/send-structured!
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
        code (ex/get-param! req [:body :code] string-util/safe-trim)
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

(defn admin-check-get [req]
  (let [{:keys [email]} (req->auth-user! req)]
    (assert-admin-email! email)
    (response/ok {:ok true})))

(defn admin-top-get [req]
  (let [{:keys [email]} (req->auth-user! req)
        n (get-in req [:params :n])
        n-val (number-util/parse-int n 7)]
    (assert-admin-email! email)
    (response/ok {:users (dash-admin/get-top-users n-val)})))

(defn admin-investor-updates-get [req]
  (let [{:keys [email]} (req->auth-user! req)
        _ (assert-admin-email! email)
        conn (aurora/conn-pool :read)
        metrics (metrics/investor-update-metrics conn)
        metrics-with-b64-charts
        (update metrics :charts (partial medley/map-vals
                                         (fn [chart] (metrics/chart->base64-png chart
                                                                                500 400))))]
    (response/ok {:metrics metrics-with-b64-charts})))

(defn admin-overview-daily-get [req]
  (let [{:keys [email]} (req->auth-user! req)
        _ (assert-admin-email! email)
        conn (aurora/conn-pool :read)
        overview (metrics/overview-metrics conn)
        rev-subs (dash-admin/get-revenue-generating-subscriptions)
        overview-with-b64-charts
        (update overview :charts (partial medley/map-vals
                                          (fn [chart] (metrics/chart->base64-png chart
                                                                                 500 400))))
        subscription-info {:num-subs (count rev-subs)
                           :total-monthly-revenue (reduce + (map :monthly-revenue rev-subs))}]

    (response/ok (assoc overview-with-b64-charts
                        :subscription-info subscription-info))))

(defn admin-overview-minute-get [req]
  (let [{:keys [email]} (req->auth-user! req)
        _ (assert-admin-email! email)
        hz (eph/get-hz)
        session-reports (machine-summaries/get-all-session-reports hz)]
    (response/ok
     {:session-reports session-reports})))

(defn admin-paid-get [req]
  (let [{:keys [email]} (req->auth-user! req)]
    (assert-admin-email! email)
    (response/ok {:subscriptions (dash-admin/get-paid)})))

(defn admin-storage-get [req]
  (let [{:keys [email]} (req->auth-user! req)]
    (assert-admin-email! email)
    (response/ok {:apps (dash-admin/get-storage-metrics)})))

(defn admin-debug-uri-get [req]
  (let [{:keys [email]} (req->auth-user! req)
        _ (assert-admin-email! email)
        trace-id (ex/get-param! req [:params :trace-id] string-util/coerce-non-blank-str)
        span-id (ex/get-param! req [:params :span-id] string-util/coerce-non-blank-str)]

    ;; Make sure our trace-id and span-id are valid
    (try
      (crypt-util/hex-string->bytes trace-id)
      (catch Exception _
        (ex/throw+ {::ex/type ::ex/param-malformed
                    ::ex/message "Invalid trace id"
                    ::ex/hint {:trace-id trace-id}})))
    (try
      (crypt-util/hex-string->bytes span-id)
      (catch Exception _
        (ex/throw+ {::ex/type ::ex/param-malformed
                    ::ex/message "Invalid span id"
                    ::ex/hint {:span-id span-id}})))

    (response/ok {:urls [{:label "View trace in Honeycomb"
                          :url (tracer/honeycomb-uri {:trace-id trace-id
                                                      :span-id span-id})}
                         {:label "Search trace in Cloudwatch"
                          :url (tracer/cloudwatch-uri {:trace-id trace-id
                                                       :span-id span-id})}]})))

;; ---
;; Dash

(defn dash-get [req]
  (let [{:keys [id email]} (req->auth-user! req)
        apps (app-model/get-all-for-user {:user-id id})
        profile (instant-profile-model/get-by-user-id {:user-id id})
        invites (instant-app-member-invites-model/get-pending-for-invitee {:email email})]
    (response/ok {:apps apps
                  :profile profile
                  :invites invites
                  :user {:id id :email email}})))

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
  (let [title (ex/get-param! req [:body :title] string-util/coerce-non-blank-str)
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

  (app-model/delete-immediately-by-id! {:id app-id}))

(defn apps-delete [req]
  (let [{{app-id :id} :app} (req->app-and-user! req)]
    (app-model/mark-for-deletion! {:id app-id})
    (response/ok {:ok true})))

(defn apps-clear [req]
  (let [{{app-id :id} :app} (req->app-and-user! req)]
    (app-model/clear-by-id! {:id app-id})
    (response/ok {:ok true})))

(defn admin-tokens-regenerate [req]
  (let [{{app-id :id} :app} (req->app-and-user! :admin req)
        admin-token (ex/get-param! req [:body :admin-token] uuid-util/coerce)]
    (response/ok (app-admin-token-model/recreate! {:app-id app-id
                                                   :token admin-token}))))

;; --------
;; Rules

(defn rules-post [req]
  (let [{{app-id :id} :app} (req->app-and-user-accepting-platform-tokens! :collaborator
                                                                          :apps/write
                                                                          req)
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
  (let [coerce-optional-param!
        (fn [path]
          (ex/get-optional-param! req
                                  path
                                  string-util/coerce-non-blank-str))

        {{app-id :id} :app} (req->app-and-user! :collaborator req)
        provider-id (ex/get-param! req [:body :provider_id] uuid-util/coerce)
        client-name (ex/get-param! req [:body :client_name] string-util/coerce-non-blank-str)
        client-id (coerce-optional-param! [:body :client_id])
        client-secret (coerce-optional-param! [:body :client_secret])
        authorization-endpoint (coerce-optional-param! [:body :authorization_endpoint])
        token-endpoint (coerce-optional-param! [:body :token_endpoint])
        discovery-endpoint (ex/get-param! req [:body :discovery_endpoint] string-util/coerce-non-blank-str)
        meta (ex/get-optional-param! req [:body :meta] (fn [x] (when (map? x) x)))
        client (app-oauth-client-model/create! {:app-id app-id
                                                :provider-id provider-id
                                                :client-name client-name
                                                :client-id client-id
                                                :client-secret client-secret
                                                :authorization-endpoint authorization-endpoint
                                                :token-endpoint token-endpoint
                                                :discovery-endpoint discovery-endpoint
                                                :meta meta})]
    (response/ok {:client (select-keys client [:id :provider_id :client_name
                                               :client_id :created_at :meta :discovery_endpoint])})))

(defn oauth-clients-delete [req]
  (let [{{app-id :id} :app} (req->app-and-user! :collaborator req)
        id (ex/get-param! req [:params :id] uuid-util/coerce)
        client (app-oauth-client-model/delete-by-id-ensure! {:id id :app-id app-id})]
    (response/ok {:client (select-keys client [:id :provider_id :client_name
                                               :client_id :created_at])})))

(defn ephemeral-claim-post [req]
  (let [app-id (ex/get-param! req [:params :app_id] uuid-util/coerce)
        token (ex/get-param! req [:body :token] uuid-util/coerce)
        {app-creator-id :creator_id} (app-model/get-by-id! {:id app-id})
        {user-id :id} (req->auth-user! req)]
    (ex/assert-permitted!
     :ephemeral-app?
     app-id
     (= (:id @ephemeral-app/ephemeral-creator) app-creator-id))
    ;; make sure the request comes with a valid admin token
    (app-admin-token-model/fetch! {:app-id app-id :token token})
    (app-model/change-creator! {:id app-id
                                :new-creator-id user-id})
    (response/ok {})))

;; --------
;; OAuth

(def oauth-cookie-name "__session")
(def oauth-redirect-url (str config/server-origin "/dash/oauth/callback"))

(defn coerce-redirect-path [path]
  (cond
    (string/blank? path) "/dash"
    (.startsWith ^String path "/") path
    :else (str "/" path)))

(defn oauth-start [{{:keys [redirect_path redirect_to_dev ticket]} :params}]
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
                                           :redirect-to-dev (= redirect_to_dev "true")
                                           :ticket ticket})
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

(defn oauth-callback-response [{:keys [error code redirect-to-dev ticket]}]
  (let [dash (if redirect-to-dev
               (config/dashboard-origin {:env :dev})
               (config/dashboard-origin))
        base-url (str dash "/dash/oauth/callback")
        redirect-url (str base-url "?" (if error
                                         (str "error=" (java.net.URLEncoder/encode error))
                                         (str "code=" code))
                          (if ticket (str "&ticket=" ticket) ""))]
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
                          :client_secret (crypt-util/secret-value (:client-secret (config/get-google-oauth-client)))
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
                           (#(.decode (java.util.Base64/getUrlDecoder) ^String %))
                           (#(String. ^bytes %))
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
          (oauth-callback-response {:code code
                                    :redirect-to-dev (:redirect_to_dev oauth-redirect)
                                    :ticket (:ticket oauth-redirect)}))
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

(defn checkout-session-post [req]
  (let [{{app-id :id app-title :title} :app
         {user-id :id user-email :email :as user} :user} (req->app-and-user! req)
        {:keys [name]} (instant-subscription-model/get-by-app-id {:app-id app-id})
        already-subscribed? (not (or (= name default-subscription) (nil? name)))
        _ (when already-subscribed?
            (ex/throw-record-not-unique! :instant-subscription))
        {customer-id :id} (instant-stripe-customer-model/get-or-create! {:user user})
        metadata {"app-id" app-id "user-id" user-id}
        description (str "App name: " app-title)
        session-params {"success_url" (str (config/stripe-success-url) "&app=" app-id)
                        "cancel_url" (str (config/stripe-cancel-url) "&app=" app-id)
                        "customer" customer-id
                        "metadata" metadata
                        "allow_promotion_codes" (or (flags/promo-code-email? user-email)
                                                    (admin-email? user-email))
                        "subscription_data" {"metadata" metadata
                                             "description" description
                                             "billing_cycle_anchor"
                                             (.toEpochSecond (date/first-of-next-month-est))}
                        "mode" "subscription"
                        "line_items" [{"price" (config/stripe-pro-subscription)
                                       "quantity" 1}]}
        session (Session/create ^Map session-params)]
    (response/ok {:id (.getId session)})))

(defn create-portal [req]
  (let [{{app-id :id} :app user :user} (req->app-and-user! req)
        {customer-id :id} (instant-stripe-customer-model/get-or-create! {:user user})
        session-params {"return_url" (str (config/stripe-success-url) "&app=" app-id)
                        "customer" customer-id}
        session (com.stripe.model.billingportal.Session/create ^Map session-params)]
    (response/ok {:url (.getUrl session)})))

(defn get-billing [req]
  (let [{{app-id :id} :app} (req->app-and-user! :collaborator req)
        {subscription-name :name stripe-subscription-id :stripe_subscription_id}
        (instant-subscription-model/get-by-app-id {:app-id app-id})
        {total-app-bytes :num_bytes} (app-model/app-usage {:app-id app-id})
        total-storage-bytes (:total_byte_size (app-file-model/get-app-usage app-id))]
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
    (next-jdbc/with-transaction [tx-conn (aurora/conn-pool :write)]
      (instant-app-member-invites-model/accept-by-id! tx-conn {:id invite-id})
      (condp = invitee_role
        "creator"
        (app-model/change-creator!
         tx-conn
         {:id app_id
          :new-creator-id user-id})
        (instant-app-members/create! tx-conn {:user-id user-id
                                              :app-id app_id
                                              :role invitee_role})))
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
;; Personal access tokens

(defn personal-access-tokens-get [req]
  (let [{user-id :id} (req->auth-user! req)
        personal-access-tokens (instant-personal-access-token-model/list-by-user-id! {:user-id user-id})]
    (response/ok {:data (map instant-personal-access-token-model/format-token-for-api
                             personal-access-tokens)})))

(defn personal-access-tokens-post [req]
  (let [{user-id :id} (req->auth-user! req)
        name (ex/get-param! req [:body :name] string-util/coerce-non-blank-str)
        personal-access-token (instant-personal-access-token-model/create! {:user-id user-id
                                                                            :name name})]
    (response/ok {:data (instant-personal-access-token-model/format-token-for-api
                         personal-access-token)})))

(defn personal-access-tokens-delete [req]
  (let [{user-id :id} (req->auth-user! req)
        id (ex/get-param! req [:params :id] uuid-util/coerce)]
    (instant-personal-access-token-model/delete-by-id! {:id id :user-id user-id})
    (response/ok {})))

(comment
  (def user (instant-user-model/get-by-email {:email "alex@instantdb.com"}))
  (def refresh-token (instant-user-refresh-token-model/create! {:id (UUID/randomUUID) :user-id (:id user)}))
  (def headers {"authorization" (str "Bearer " (:id refresh-token))})
  (def record (personal-access-tokens-post {:headers headers :body {:name "Test Token"}}))

  (personal-access-tokens-get {:headers headers})
  (personal-access-tokens-delete {:headers headers :params {:id (-> record :body :data :id)}}))

;; ---------------
;; Email templates

(defn sender-verification-get [req]
  (let [{{app-id :id} :app} (req->app-and-user! :admin req)
        {postmark-id :postmark_id}
        (app-email-template-model/get-by-app-id-and-email-type
         {:app-id app-id :email-type "magic-code"})]
    (response/ok {:verification (when postmark-id
                                  (-> (postmark/get-sender! {:id postmark-id})
                                      :body
                                      (select-keys [:ID :EmailAddress :Confirmed
                                                    :DKIMHost :DKIMPendingHost
                                                    :DKIMPendingTextValue :DKIMTextValue
                                                    :ReturnPathDomain :ReturnPathDomainCNAMEValue])))})))

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

(defn upload-put [req]
  (let [{{app-id :id} :app} (req->app-and-user! :collaborator req)
        params (:headers req)
        path (ex/get-param! params ["path"] string-util/coerce-non-blank-str)
        file (ex/get-param! req [:body] identity)
        data (storage-coordinator/upload-file!
              {:app-id app-id
               :path path
               :file file
               :content-type (:content-type req)
               :content-length (:content-length req)
               :skip-perms-check? true}
              file)]
    (response/ok {:data data})))

(defn files-delete [req]
  (let [filenames (ex/get-param! req [:body :filenames] vec)
        {{app-id :id} :app} (req->app-and-user! :collaborator req)
        data (storage-coordinator/delete-files! {:app-id app-id
                                                 :paths filenames})]
    (response/ok {:data data})))

;; ---
;; CLI

(defn- remove-system-namespaces [entities]
  (ucoll/filter-keys
   #(not (system-catalog/reserved? (name %)))
   entities))

(defn schema-push-plan-post [req]
  (let [{{app-id :id} :app} (req->app-and-user-accepting-platform-tokens! :collaborator
                                                                          :apps/read
                                                                          req)
        client-defs         (-> req
                                :body
                                :schema
                                (update :entities remove-system-namespaces))
        check-types?        (-> req :body :check_types)
        background-updates? (-> req :body :supports_background_updates)]
    (response/ok (schema-model/plan! {:app-id app-id
                                      :check-types? check-types?
                                      :background-updates? background-updates?}
                                     client-defs))))

(defn schema-push-apply-post [req]
  (let [{{app-id :id} :app} (req->app-and-user-accepting-platform-tokens! :collaborator
                                                                          :apps/write
                                                                          req)
        client-defs         (-> req
                                :body
                                :schema
                                (update :entities remove-system-namespaces))
        check-types?        (-> req :body :check_types)
        background-updates? (-> req :body :supports_background_updates)
        r (schema-model/plan! {:app-id app-id
                               :check-types? check-types?
                               :background-updates? background-updates?}
                              client-defs)
        plan-result (schema-model/apply-plan! app-id r)]
    (response/ok (merge r plan-result))))

(defn schema-pull-get [req]
  (let [{{app-id :id app-title :title} :app} (req->app-and-user-accepting-platform-tokens! :collaborator
                                                                                           :apps/read
                                                                                           req)
        current-attrs (attr-model/get-by-app-id app-id)
        current-schema (schema-model/attrs->schema current-attrs)]
    (response/ok {:schema current-schema :app-title app-title})))

(defn perms-pull-get [req]
  (let [{{app-id :id} :app} (req->app-and-user-accepting-platform-tokens! :collaborator
                                                                          :apps/write
                                                                          req)
        perms (rule-model/get-by-app-id {:app-id app-id})
        r {:perms (:code perms)}]
    (response/ok r)))

;; -------------
;; Indexing Jobs

(defn indexing-job-get [req]
  (let [{{app-id :id} :app} (req->app-and-user! :collaborator req)
        job-id (ex/get-param! req [:params :job_id] uuid-util/coerce)
        job (indexing-jobs/get-by-id-for-client app-id job-id)]
    (response/ok {:job job})))

(defn indexing-jobs-group-get [req]
  (let [{{app-id :id} :app} (req->app-and-user-accepting-platform-tokens! :collaborator
                                                                          :apps/write
                                                                          req)
        group-id (ex/get-param! req [:params :group_id] uuid-util/coerce)
        jobs (indexing-jobs/get-by-group-id-for-client app-id group-id)]
    (response/ok {:jobs jobs})))

(defn indexing-job-post [req]
  (let [{{app-id :id} :app} (req->app-and-user! :collaborator req)
        attr-id (ex/get-param! req [:body :attr-id] uuid-util/coerce)
        job-type (ex/get-param! req
                                [:body :job-type]
                                string-util/coerce-non-blank-str)
        _ (when-not (contains? indexing-jobs/jobs job-type)
            (ex/throw-validation-err! :job-type
                                      job-type
                                      [{:message (format "Invalid job type %s." job-type)}]))
        attrs (attr-model/get-by-app-id app-id)
        attr (ex/assert-record! (attr-model/seek-by-id attr-id attrs)
                                :attrs
                                {:attr-id attr-id})

        job (ex/assert-record!
             (indexing-jobs/create-job!
              (cond-> {:app-id app-id
                       :attr-id (:id attr)
                       :job-type job-type}
                (= "check-data-type" job-type)
                (assoc :checked-data-type
                       (ex/get-param! req
                                      [:body :checked-data-type]
                                      string-util/coerce-non-blank-str))))
             :indexing-job
             {:attr-id attr-id
              :job-type job-type})]
    (indexing-jobs/enqueue-job job)
    (response/ok {:job (indexing-jobs/job->client-format job)})))

(comment
  (def counters-app-id  #uuid "137ace7a-efdd-490f-b0dc-a3c73a14f892")
  (def u (instant-user-model/get-by-email {:email "stopa@instantdb.com"}))
  (def r (instant-user-refresh-token-model/create! {:id (UUID/randomUUID) :user-id (:id u)}))
  (schema-model/schemas->ops
   true
   {:refs {}
    :blobs {}}
   {:refs {["posts" "comments" "comments" "post"] {:unique? false :cardinality "many"}}
    :blobs {:ns {:a {:cardinality "many"} :b {:cardinality  "many"}}}})
  (schema-push-plan-post {:params {:app_id counters-app-id}
                          :headers {"authorization" (str "Bearer " (:id r))}}))

;; --------
;; CLI auth

(defn cli-auth-register-post [_]
  (let [secret (UUID/randomUUID)
        ticket (UUID/randomUUID)]
    (instant-cli-login-model/create!
     (aurora/conn-pool :write)
     {:secret secret
      :ticket ticket})
    (response/ok {:secret secret :ticket ticket})))

(defn cli-auth-claim-post [req]
  (let [{user-id :id} (req->auth-user! req)
        ticket (ex/get-param! req [:body :ticket] uuid-util/coerce)]
    (instant-cli-login-model/claim! (aurora/conn-pool :write) {:user-id user-id :ticket ticket})
    (response/ok {:ticket ticket})))

(defn cli-auth-void-post [req]
  (let [_ (req->auth-user! req)
        ticket (ex/get-param! req [:body :ticket] uuid-util/coerce)]
    (instant-cli-login-model/void! (aurora/conn-pool :write) {:ticket ticket})
    (response/ok {})))

(defn cli-auth-check-post [req]
  (let [secret (ex/get-param! req [:body :secret] uuid-util/coerce)
        cli-auth (instant-cli-login-model/use! (aurora/conn-pool :write) {:secret secret})
        user-id (:user_id cli-auth)
        refresh-token (instant-user-refresh-token-model/create! {:id (UUID/randomUUID) :user-id user-id})
        token (:id refresh-token)
        {email :email} (instant-user-model/get-by-id! {:id user-id})
        res {:token token :email email}]
    (response/ok res)))

;; -------------
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
                   (ws/send-json! nil (format "[%s] ok" id) channel)))
      :on-message (fn [{:keys [^WebSocketChannel channel data]}]
                    (tracer/with-span! {:name "ws-play/on-message" :attributes {:id id :data data}}
                      (condp = (string/trim data)
                        "break"
                        (tracer/with-span! {:name "ws-play/break" :attributes {:id id}}
                          (.close channel))
                        "throw-err"
                        (tracer/with-span! {:name "ws-play/throw-err" :attributes {:id id}}
                          (do (.close channel)
                              (ws/send-json! nil "this can't send" channel)))
                        (ws/send-json! nil (format "[%s] received %s" id data) channel))))

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

(def active-session-cache (cache/ttl-cache-factory {} :ttl 5000))

(defn get-total-count-cached []
  (cache/lookup-or-miss active-session-cache
                        :total-count
                        (fn [_]
                          (->> (machine-summaries/get-all-num-sessions (eph/get-hz))
                               vals
                               (reduce +)))))

(defn active-sessions-get [_]
  (response/ok {:total-count (get-total-count-cached)}))

(defn oauth-apps-get [req]
  (let [{{app-id :id} :app} (req->app-and-user! :collaborator req)]
    (response/ok (oauth-app-model/get-for-dash {:app-id app-id}))))

(defn oauth-apps-post
  "Creates a new OAuth platform app."
  [req]
  (let [{{app-id :id} :app} (req->app-and-user! :collaborator req)
        app-name (ex/get-param! req
                                [:body :app_name]
                                string-util/coerce-non-blank-str)
        app-logo-base64-url (ex/get-optional-param! req
                                                    [:body :app_logo]
                                                    string-util/coerce-non-blank-str)
        app-logo-bytes (when app-logo-base64-url
                         (try
                           (oauth-app-model/base64-image-url->bytes app-logo-base64-url)
                           (catch Exception e
                             (ex/throw+ {::ex/type ::ex/param-malformed
                                         ::ex/message
                                         (case (.getMessage e)
                                           "Invalid image url" "Invalid image url"
                                           "Invalid mime type" "Invalid image type"
                                           "Image is too large" "Image is too large"
                                           "Invalid image type" "Invalid image type"
                                           "Invalid image")}))))
        support-email (ex/get-optional-param! req
                                              [:body :support_email]
                                              string-util/coerce-non-blank-str)
        app-home-page (ex/get-optional-param! req
                                              [:body :app_home_page]
                                              url-util/coerce-web-url)
        app-privacy-policy-link (ex/get-optional-param! req
                                                        [:body :app_privacy_policy_link]
                                                        url-util/coerce-web-url)
        app-tos-link (ex/get-optional-param! req
                                             [:body :app_tos_link]
                                             url-util/coerce-web-url)

        create-res (oauth-app-model/create-app {:app-id app-id
                                                :app-name app-name
                                                :support-email support-email
                                                :app-home-page app-home-page
                                                :app-privacy-policy-link app-privacy-policy-link
                                                :app-tos-link app-tos-link
                                                :app-logo app-logo-bytes})]

    (response/ok {:app (oauth-app-model/format-oauth-app-for-api create-res)})))

(defn oauth-app-post
  "Updates an existing OAuth platform app.
   Uses access to the Instant app as a permission guard for the oauth
   app."
  [req]
  (let [{{app-id :id} :app} (req->app-and-user! :collaborator req)
        oauth-app-id-unverified (ex/get-param! req
                                               [:params :oauth_app_id]
                                               uuid-util/coerce)
        app-name (ex/get-optional-param! req
                                         [:body :app_name]
                                         string-util/coerce-non-blank-str)
        app-logo-base64-url (ex/get-optional-param! req
                                                    [:body :app_logo]
                                                    string-util/coerce-non-blank-str)
        app-logo-bytes (when app-logo-base64-url
                         (try
                           (oauth-app-model/base64-image-url->bytes app-logo-base64-url)
                           (catch Exception e
                             (ex/throw+ {::ex/type ::ex/param-malformed
                                         ::ex/message
                                         (case (.getMessage e)
                                           "Invalid image url" "Invalid image url"
                                           "Invalid mime type" "Invalid image type"
                                           "Image is too large" "Image is too large"
                                           "Invalid image type" "Invalid image type"
                                           "Invalid image")}))))
        support-email (ex/get-optional-param! req
                                              [:body :support_email]
                                              string-util/coerce-non-blank-str)
        app-home-page (ex/get-optional-param! req
                                              [:body :app_home_page]
                                              url-util/coerce-web-url)
        app-privacy-policy-link (ex/get-optional-param! req
                                                        [:body :app_privacy_policy_link]
                                                        url-util/coerce-web-url)
        app-tos-link (ex/get-optional-param! req
                                             [:body :app_tos_link]
                                             url-util/coerce-web-url)

        oauth-app (oauth-app-model/update-app! {:oauth-app-id-unverified oauth-app-id-unverified
                                                :app-id app-id
                                                :app-name app-name
                                                :support-email support-email
                                                :app-home-page app-home-page
                                                :app-privacy-policy-link app-privacy-policy-link
                                                :app-tos-link app-tos-link
                                                :app-logo app-logo-bytes})]

    (response/ok {:app (oauth-app-model/format-oauth-app-for-api oauth-app)})))

(defn oauth-app-delete
  "Deletes an existing OAuth app.
   Uses access to the Instant app as a permission guard for the oauth
   app."
  [req]
  (let [{{app-id :id} :app} (req->app-and-user! :admin req)
        oauth-app-id-unverified (ex/get-param! req
                                               [:params :oauth_app_id]
                                               uuid-util/coerce)
        oauth-app (oauth-app-model/delete-app! {:oauth-app-id-unverified oauth-app-id-unverified
                                                :app-id app-id})]

    (response/ok {:app (oauth-app-model/format-oauth-app-for-api oauth-app)})))

(defn oauth-app-client-delete
  "Deletes an existing OAuth app client.
   Uses access to the Instant app as a permission guard for the oauth
   app client."
  [req]
  (let [{{app-id :id} :app} (req->app-and-user! :admin req)
        client-id-unverified (ex/get-param! req
                                            [:params :client_id]
                                            uuid-util/coerce)
        client (oauth-app-model/delete-client! {:client-id-unverified client-id-unverified
                                                :app-id app-id})]

    (response/ok {:client (oauth-app-model/format-client-for-api client)})))

(defn oauth-app-clients-post
  "Create a new OAuth client for an OAuth app.
   Uses access to the Instant app as a permission guard for the oauth
   app client."
  [req]
  (let [{{app-id :id} :app} (req->app-and-user! :collaborator req)
        oauth-app-id-unverified (ex/get-param! req
                                               [:params :oauth_app_id]
                                               uuid-util/coerce)
        oauth-app (oauth-app-model/get-oauth-app-by-id-and-app-id!
                   {:app-id app-id
                    :oauth-app-id-unverified oauth-app-id-unverified})
        client-name (ex/get-param! req
                                   [:body :client_name]
                                   string-util/coerce-non-blank-str)
        authorized-redirect-urls (ex/get-optional-param! req
                                                         [:body :authorized_redirect_urls]
                                                         #(when (coll? %) %))

        _ (run! (fn [redirect-url]
                  (ex/assert-valid!
                   :authorized_redirect_urls
                   redirect-url
                   (url-util/redirect-url-validation-errors
                    redirect-url
                    :allow-localhost? (not (:is_public oauth-app)))))
                authorized-redirect-urls)
        {:keys [client client-secret secret-value]}
        (oauth-app-model/create-client {:app-id app-id
                                        :oauth-app-id (:id oauth-app)
                                        :client-name client-name
                                        :authorized-redirect-urls authorized-redirect-urls})]

    (response/ok {:client (oauth-app-model/format-client-for-api client)
                  :clientSecret (oauth-app-model/format-client-secret-for-api client-secret)
                  :secretValue secret-value})))

(defn oauth-app-client-post
  "Update an existing OAuth app client.
   Uses access to the Instant app as a permission guard for the oauth
   app client."
  [req]
  (let [{{app-id :id} :app} (req->app-and-user! :collaborator req)
        client-id-unverified (ex/get-param! req
                                            [:params :client_id]
                                            uuid-util/coerce)
        oauth-app (oauth-app-model/get-oauth-app-by-client-id-and-app-id!
                   {:app-id app-id
                    :client-id-unverified client-id-unverified})
        client-name (ex/get-optional-param! req
                                            [:body :client_name]
                                            string-util/coerce-non-blank-str)
        add-redirect-url (ex/get-optional-param! req
                                                 [:body :add_redirect_url]
                                                 string-util/coerce-non-blank-str)

        _ (when add-redirect-url
            (ex/assert-valid!
             :authorized_redirect_urls
             add-redirect-url
             (url-util/redirect-url-validation-errors
              add-redirect-url
              :allow-localhost? (not (:is_public oauth-app)))))
        remove-redirect-url (ex/get-optional-param! req
                                                    [:body :remove_redirect_url]
                                                    string-util/coerce-non-blank-str)
        client (oauth-app-model/update-client! {:app-id app-id
                                                :client-id-unverified client-id-unverified
                                                :client-name client-name
                                                :add-redirect-url add-redirect-url
                                                :remove-redirect-url remove-redirect-url})]
    (response/ok {:client (oauth-app-model/format-client-for-api client)})))

(defn oauth-app-client-secrets
  "Create a new OAuth app client secret.
   Uses access to the Instant app as a permission guard for the oauth
   app client."
  [req]
  (let [{{app-id :id} :app} (req->app-and-user! :collaborator req)
        client-id-unauthed (ex/get-param! req
                                          [:params :client_id]
                                          uuid-util/coerce)
        {:keys [record secret-value]} (oauth-app-model/create-client-secret-by-client-id-and-app-id!
                                       {:app-id app-id
                                        :client-id client-id-unauthed})]

    (response/ok {:clientSecret (oauth-app-model/format-client-secret-for-api
                                 record)
                  :secretValue secret-value})))

(defn oauth-app-client-secret-delete
  "Delete an existing OAuth app client secret.
   Uses access to the Instant app as a permission guard for the oauth
   app client secret."
  [req]
  (let [{{app-id :id} :app} (req->app-and-user! :collaborator req)
        client-secret-id-unauthed (ex/get-param! req
                                                 [:params :client_secret_id]
                                                 uuid-util/coerce)
        client-secret (oauth-app-model/delete-client-secret-by-id-and-app-id!
                       {:app-id app-id
                        :client-secret-id client-secret-id-unauthed})]

    (response/ok {:clientSecret (oauth-app-model/format-client-secret-for-api
                                 client-secret)})))

(defn authorized-oauth-apps [user-id]
  (let [oauth-apps (oauth-app-model/user-authorized {:user-id user-id})]
    (sort-by :name
             (map (fn [app]
                    {:id (:id app)
                     :name (:app_name app)
                     :logo (some-> app
                                   :app_logo
                                   oauth-app-model/bytes->base64-image-url)
                     :homePage (:app_home_page app)
                     :privacyPolicyLink (:app_privacy_policy_link app)
                     :tosLink (:app_tos_link app)})
                  oauth-apps))))

(defn user-oauth-apps-get [req]
  (let [user (req->auth-user! req)]
    (response/ok {:oauthApps (authorized-oauth-apps (:id user))})))

(defn user-oauth-apps-revoke-access [req]
  (let [user (req->auth-user! req)
        oauth-app-id (ex/get-param! req
                                    [:body :oauthAppId]
                                    uuid-util/coerce)]
    (tracer/with-span! {:name "revoke-oauth-app"
                        :attributes {:user-id (:id user)
                                     :oauth-app-id oauth-app-id}}
      (let [revoked-tokens (oauth-app-model/revoke-app-for-user {:user-id (:id user)
                                                                 :oauth-app-id oauth-app-id})]
        (tracer/add-data! {:attributes {:revoked-token-count (count revoked-tokens)}})))
    (response/ok {:oauthApps (authorized-oauth-apps (:id user))})))

(defroutes routes
  (POST "/dash/auth/send_magic_code" [] send-magic-code-post)
  (POST "/dash/auth/verify_magic_code" [] verify-magic-code-post)
  (GET "/dash/admin" [] admin-get)

  ;; internal admin routes
  (GET "/dash/check-admin" [] admin-check-get)
  (GET "/dash/top" [] admin-top-get)
  (GET "/dash/paid" [] admin-paid-get)
  (GET "/dash/storage" [] admin-storage-get)
  (GET "/dash/investor_updates" [] admin-investor-updates-get)
  (GET "/dash/overview/daily" [] admin-overview-daily-get)
  (GET "/dash/overview/minute" [] admin-overview-minute-get)
  (GET "/dash/admin-debug-uri" [] admin-debug-uri-get)

  (GET "/dash" [] dash-get)
  (POST "/dash/apps" [] apps-post)
  (POST "/dash/profiles" [] profiles-post)
  (DELETE "/dash/apps/:app_id" [] apps-delete)
  (POST "/dash/apps/:app_id/clear" [] apps-clear)
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

  (GET "/dash/oauth/start" [] (wrap-cookies oauth-start))

  (GET "/dash/oauth/callback" [] (wrap-cookies oauth-callback))

  (POST "/dash/oauth/token" [] oauth-token-callback)

  (POST "/dash/cli/auth/register" [] cli-auth-register-post)
  (POST "/dash/cli/auth/check" [] cli-auth-check-post)
  (POST "/dash/cli/auth/claim" [] cli-auth-claim-post)
  (POST "/dash/cli/auth/void" [] cli-auth-void-post)

  (GET "/dash/cli/version" [] (response/ok {:min-version cli-min-version}))

  (GET "/dash/session_counts" [] session-counts-get)

  (POST "/dash/apps/:app_id/checkout_session" [] checkout-session-post)
  (POST "/dash/apps/:app_id/portal_session" [] create-portal)
  (GET "/dash/apps/:app_id/billing" [] get-billing)

  (POST "/dash/apps/:app_id/invite/send" [] team-member-invite-send-post)
  (DELETE "/dash/apps/:app_id/invite/revoke" [] team-member-invite-revoke-delete)

  (DELETE "/dash/apps/:app_id/members/remove" [] team-member-remove-delete)
  (POST "/dash/apps/:app_id/members/update" [] team-member-update-post)

  (GET "/dash/apps/:app_id/sender-verification" [] sender-verification-get)
  (POST "/dash/apps/:app_id/email_templates" [] email-template-post)
  (DELETE "/dash/apps/:app_id/email_templates/:id" [] email-template-delete)

  (POST "/dash/invites/accept" [] team-member-invite-accept-post)
  (POST "/dash/invites/decline" [] team-member-invite-decline-post)

  (GET "/dash/personal_access_tokens" [] personal-access-tokens-get)
  (POST "/dash/personal_access_tokens" [] personal-access-tokens-post)
  (DELETE "/dash/personal_access_tokens/:id" [] personal-access-tokens-delete)

  (POST "/dash/apps/:app_id/rename" [] app-rename-post)

  ;; Storage
  (PUT "/dash/apps/:app_id/storage/upload", [] upload-put)
  (POST "/dash/apps/:app_id/storage/files/delete" [] files-delete)

  (POST "/dash/apps/:app_id/schema/push/plan" [] schema-push-plan-post)
  (POST "/dash/apps/:app_id/schema/push/apply" [] schema-push-apply-post)
  (GET "/dash/apps/:app_id/schema/pull" [] schema-pull-get)
  (GET "/dash/apps/:app_id/perms/pull" [] perms-pull-get)

  (GET "/dash/apps/:app_id/indexing-jobs/:job_id" [] indexing-job-get)
  (GET "/dash/apps/:app_id/indexing-jobs/group/:group_id" [] indexing-jobs-group-get)
  (POST "/dash/apps/:app_id/indexing-jobs" [] indexing-job-post)

  (GET "/dash/ws_playground" [] ws-playground-get)

  (POST "/dash/signout" [] signout)

  (GET "/dash/stats/active_sessions" [] active-sessions-get)

  (GET "/dash/apps/:app_id/oauth-apps" [] oauth-apps-get)
  (POST "/dash/apps/:app_id/oauth-apps" [] oauth-apps-post)
  (POST "/dash/apps/:app_id/oauth-apps/:oauth_app_id" [] oauth-app-post)
  (DELETE "/dash/apps/:app_id/oauth-apps/:oauth_app_id" [] oauth-app-delete)

  (POST "/dash/apps/:app_id/oauth-apps/:oauth_app_id/clients" [] oauth-app-clients-post)
  (POST "/dash/apps/:app_id/oauth-app-clients/:client_id" [] oauth-app-client-post)
  (DELETE "/dash/apps/:app_id/oauth-app-clients/:client_id" [] oauth-app-client-delete)
  (POST "/dash/apps/:app_id/oauth-app-clients/:client_id/client-secrets" [] oauth-app-client-secrets)
  (DELETE "/dash/apps/:app_id/oauth-app-client-secrets/:client_secret_id" [] oauth-app-client-secret-delete)

  (GET "/dash/user/oauth_apps" [] user-oauth-apps-get)
  (POST "/dash/user/oauth_apps/revoke_access" [] user-oauth-apps-revoke-access))
