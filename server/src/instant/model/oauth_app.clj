(ns instant.model.oauth-app
  (:require [clojure.string :as string]
            [honey.sql :as hsql]
            [instant.jdbc.aurora :as aurora]
            [instant.jdbc.sql :as sql]
            [instant.util.coll :as ucoll]
            [instant.util.crypt :as crypt-util]
            [instant.util.exception :as ex]
            [next.jdbc :as next-jdbc]))

(defn hash-client-secret ^bytes [^String client-secret]
  (crypt-util/str->sha256 client-secret))

(defn gen-client-secret ^String []
  (crypt-util/random-hex 34))

;; XXX: TODOS:
;;  1. Way to regenerate the client-secret
;;    a. It would be nice if we could have multiple client secrets??

(defn format-client-secret-for-api [{:keys [id
                                            client_id
                                            first_four
                                            created_at]}]
  {:id id
   :clientId client_id
   :firstFour first_four
   :createdAt created_at})

(defn format-client-for-api [{:keys [client_id
                                     oauth_app_id
                                     client_name
                                     authorized_redirect_urls
                                     created_at
                                     updated_at]}]
  {:clientId client_id
   :oauthAppId oauth_app_id
   :clientName client_name
   :authorizedRedirectUrls authorized_redirect_urls
   :createdAt created_at
   :updatedAt updated_at})

(defn format-oauth-app-for-api [{:keys [id
                                        app_id
                                        app_name
                                        granted_scopes
                                        authorized_domains
                                        is_public
                                        support_email
                                        app_home_page
                                        app_privacy_policy_link
                                        app_tos_link
                                        ;; XXX: logo
                                        ;; app_logo
                                        created_at
                                        updated_at]}]
  {:id id
   :appId app_id
   :appName app_name
   :grantedScopes granted_scopes
   :authorizedDomains authorized_domains
   :isPublic is_public
   :supportEmail support_email
   :appHomePage app_home_page
   :appPrivacyPolicyLink app_privacy_policy_link
   :appTosLink app_tos_link
   :createdAt created_at
   :updatedAt updated_at})

(defn get-for-dash
  ([params]
   (get-for-dash (aurora/conn-pool :read) params))
  ([conn {:keys [app-id]}]
   (let [q {:select [[[:json_build_object
                       "apps"
                       {:select [[[:coalesce
                                   [:json_agg
                                    [:json_build_object
                                     "id" :oauth-app.id
                                     "appId" :oauth-app.app-id
                                     "appName" :oauth-app.app-name
                                     "grantedScopes" [:coalesce
                                                      [:array_to_json :oauth-app.granted-scopes]
                                                      [:inline "[]"]]
                                     "isPublic" :oauth-app.is_public
                                     "supportEmail" :oauth-app.support_email
                                     "appHomePage" :oauth-app.app_home_page
                                     "appPrivacyPolicyLink" :oauth-app.app_privacy_policy_link
                                     "appTosLink" :oauth-app.app_tos_link
                                     "authorizedDomains" [:coalesce
                                                          [:array_to_json :oauth-app.authorized-domains]
                                                          [:inline "[]"]]
                                     "createdAt" :oauth-app.created_at
                                     "updatedAt" :oauth-app.updated_at

                                     "clients"
                                     {:select
                                      [[[:coalesce
                                         [:json_agg
                                          [:json_build_object
                                           "clientId" :client.client-id
                                           "oauthAppId" :client.oauth-app-id
                                           "clientName" :client.client-name
                                           "authorizedRedirectUrls" [:coalesce
                                                                     [:array_to_json :client.authorized-redirect-urls]
                                                                     [:inline "[]"]]
                                           "createdAt" :client.created_at
                                           "updatedAt" :client.updated_at

                                           "clientSecrets"
                                           {:select
                                            [[[:coalesce
                                               [:json_agg
                                                [:json_build_object
                                                 "id" :s.id
                                                 "clientId" :s.client-id
                                                 "firstFour" :s.first-four
                                                 "createdAt" :s.created-at]]
                                               [:inline "[]"]]]]
                                            :from [[{:select :*
                                                     :from :instant-oauth-app-client-secrets
                                                     :where [:= :client-id :client.client-id]
                                                     :order-by [[:created-at :desc]]} :s]]}]]
                                         [:inline "[]"]]]]
                                      :from [[{:select :*
                                               :from :instant-oauth-app-clients
                                               :where [:= :oauth-app-id :oauth-app.id]
                                               :order-by [[:created-at :desc]]} :client]]}]]
                                   [:inline "[]"]]]]
                        :from [[{:select :*
                                 :from :instant-oauth-apps
                                 :where [:= :app-id app-id]
                                 :order-by [[:created-at :desc]]}
                                :oauth-app]]}]]]}]
     (-> (sql/select-one ::get-for-dash conn (hsql/format q))
         :json_build_object))))

(defn get-oauth-app-by-id-and-app-id!
  ([params]
   (get-oauth-app-by-id-and-app-id! (aurora/conn-pool :read) params))
  ([conn {:keys [app-id oauth-app-id] :as params}]
   (ex/assert-record! (sql/select-one ::get-oauth-app-by-id-and-app-id!
                                      conn
                                      (hsql/format {:select :*
                                                    :from :instant-oauth-apps
                                                    :where [:and
                                                            [:= :app-id app-id]
                                                            [:= :id oauth-app-id]]}))
                      :oauth-app
                      {:args [params]})))

(defn get-client-and-app-by-client-id
  ([params]
   (get-client-and-app-by-client-id (aurora/conn-pool :read) params))
  ([conn {:keys [client-id]}]
   (let [q {:select :*
            :from [[:instant-oauth-app-clients :client]]
            :join [[:instant-oauth-apps :app] [:= :app.id :client.oauth-app-id]]
            :where [:= :client.client-id client-id]}]
     (some-> (sql/select-qualified ::get-client-and-app-by-client-id
                                   conn
                                   (hsql/format q))

             first

             ucoll/split-map-by-namespace))))

(defn get-client-and-app-by-client-id!
  ([params]
   (get-client-and-app-by-client-id! (aurora/conn-pool :read) params))
  ([conn {:keys [client-id] :as params}]
   (ex/assert-record! (get-client-and-app-by-client-id conn {:client-id client-id})
                      :oauth-app-client
                      {:args [params]})))

(defn create-client-secret
  "Stores the hashed secret in the instant-oauth-app-client-secrets table.
   We use a separate table so that you can have multiple active at the same
   time, which makes it easier to gracefully rotate the secrets."
  ([params]
   (create-client-secret (aurora/conn-pool :write)))
  ([conn {:keys [client-id client-secret]}]
   (sql/execute-one! ::create-client-secret
                     conn
                     (hsql/format {:insert-into :instant-oauth-app-client-secrets
                                   :values [{:id (random-uuid)
                                             :client-id client-id
                                             :hashed-secret (hash-client-secret client-secret)
                                             :first-four (subs client-secret 0 4)}]
                                   :returning :*}))))

(defn create-client
  "Creates a client and a secret, returns them both, plus the secret value that
   we generated. We only store a hash of the secret so the user will have to
   generate a new one if they lose it."
  ([params]
   (create-client (aurora/conn-pool :write) params))
  ([conn {:keys [oauth-app-id
                 client-name
                 authorized-redirect-urls]}]
   (next-jdbc/with-transaction [tx-conn conn]
     (let [client-id (random-uuid)
           client-secret (gen-client-secret)
           q {:insert-into :instant-oauth-app-clients
              :values [{:client-id client-id
                        :oauth-app-id oauth-app-id
                        :client-name client-name
                        :authorized-redirect-urls [:array
                                                   (or authorized-redirect-urls [])
                                                   :text]}]
              :returning :*}
           _ (tool/def-locals)
           client-res (sql/execute-one! ::create-client tx-conn (hsql/format q))
           secret-res (create-client-secret tx-conn {:client-id client-id
                                                     :client-secret client-secret})]
       {:client client-res
        :client-secret secret-res
        ;; This is the only place we'll return the secret value in plaintext
        :secret-value client-secret}))))

(defn create-app
  ([params]
   (create-app (aurora/conn-pool :write) params))
  ([conn {:keys [app-id
                 app-name
                 authorized-domains
                 support-email
                 app-home-page
                 app-privacy-policy-link
                 app-tos-link
                 app-logo]}]
   (let [q {:insert-into :instant-oauth-apps
            :values [{:id (random-uuid)
                      :app-id app-id
                      :app-name app-name
                      :granted-scopes [:array [] :text]
                      :authorized-domains [:array (or authorized-domains []) :text]
                      :is-public false
                      :support-email support-email
                      :app-privacy-policy-link app-privacy-policy-link
                      :app-tos-link app-tos-link
                      :app-logo app-logo}]
            :returning :*}]
     (tool/def-locals)
     (sql/execute-one! ::create-app conn (hsql/format q)))))

(defn create-redirect
  ([params]
   (create-redirect (aurora/conn-pool :write) params))
  ([conn {:keys [redirect-id
                 client-id
                 state
                 cookie
                 redirect-uri
                 scopes
                 code-challenge-method
                 code-challenge]}]
   (let [lookup-key (crypt-util/uuid->sha256 redirect-id)
         ;; ^^ Hash the lookup key to prevent timing attacks
         q {:insert-into :instant_oauth_app_redirects
            :values [{:lookup-key lookup-key
                      :client-id client-id
                      :state state
                      :cookie cookie
                      :redirect-uri redirect-uri
                      :scopes [:array scopes :text]
                      :code-challenge-method code-challenge-method
                      :code-challenge code-challenge
                      :status [:cast "init"
                               :instant_oauth_app_redirect_status]}]}]
     (sql/execute! ::create-redirect
                   conn
                   (hsql/format q)))))

(defn claim-redirect!
  "The client makes an http post to claim the redirect from
   instantdb.com "
  ([params]
   (claim-redirect! (aurora/conn-pool :write) params))
  ([conn {:keys [redirect-id
                 user-id]}]
   (let [lookup-key (crypt-util/uuid->sha256 redirect-id)
         ;; ^^ Hash the lookup key to prevent timing attacks
         q {:update :instant_oauth_app_redirects
            :set {:user-id user-id
                  :status [:cast
                           "claimed"
                           :instant_oauth_app_redirect_status]
                  ;; Set a grant-token so that the client has information
                  ;; that nobody else could have. This prevents an attacker
                  ;; from accepting the oauth request on their behalf.
                  :grant-token :%gen_random_uuid}
            :where [:and
                    [:= :lookup-key lookup-key]
                    [:= :user-id nil]
                    [:= :status [:cast
                                 "init"
                                 :instant_oauth_app_redirect_status]]]
            :returning :*}
         record (sql/execute-one! ::claim-redirect
                                  conn
                                  (hsql/format q))]
     (tool/def-locals)
     (ex/assert-record! record
                        :oauth-app-redirect
                        {:args [{:redirect-id redirect-id}]}))))

(defn grant-redirect!
  "Deletes and returns the redirect so that it can be validated
   against the stored cookie.."
  ([params]
   (grant-redirect! (aurora/conn-pool :write) params))
  ([conn {:keys [redirect-id grant-token]}]
   (let [lookup-key (crypt-util/uuid->sha256 redirect-id)
         q {:delete-from :instant_oauth_app_redirects
            :where [:and
                    [:= :lookup-key lookup-key]]
            :returning :*}
         record (sql/execute-one! ::grant-redirect
                                  conn
                                  (hsql/format q))]
     (if (or (not grant-token)
               (not= grant-token (:grant_token record)))
       ;; Invalid grant-token
       (ex/assert-record! nil
                          :oauth-app-redirect
                          {:args [{:redirect-id :redirect-id}]})
       (ex/assert-record! record
                          :oauth-app-redirect
                          {:args [{:redirect-id redirect-id}]})))))

(defn deny-redirect
  "Deletes the redirect without returning it."
  ([params]
   (deny-redirect (aurora/conn-pool :write) params))
  ([conn {:keys [redirect-id]}]
   (let [lookup-key (crypt-util/uuid->sha256 redirect-id)
         q {:delete-from :instant_oauth_app_redirects
            :where [:= :lookup-key lookup-key]}]
     (sql/execute! ::deny-redirect conn (hsql/format q)))))

(defn create-code
  ([params]
   (create-code (aurora/conn-pool :write) params))
  ([conn {:keys [code
                 client-id
                 redirect-uri
                 user-id
                 scopes]}]
   (let [hashed-code (crypt-util/uuid->sha256 code)
         q {:insert-into :instant_oauth_app_codes
            :values [{:hashed-code hashed-code
                      :client-id client-id
                      :redirect-uri redirect-uri
                      :user-id user-id
                      :scopes [:array scopes :text]}]
            :returning :*}]
     (sql/execute-one! ::create-code conn (hsql/format q)))))
