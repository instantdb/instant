(ns instant.model.oauth-app
  (:require [clojure.string :as string]
            [honey.sql :as hsql]
            [instant.jdbc.aurora :as aurora]
            [instant.jdbc.sql :as sql]
            [instant.util.coll :as ucoll]
            [instant.util.crypt :as crypt-util]
            [instant.util.exception :as ex]
            [instant.util.token :refer [platform-refresh-token-prefix
                                        platform-access-token-prefix]]
            [next.jdbc :as next-jdbc])
  (:import [java.sql Timestamp]))

(set! *warn-on-reflection* true)

(def apps-read-scope "apps-read")
(def apps-write-scope "apps-write")

(def default-expires-at [:+ :%now [:interval "10 minutes"]])

(defn satisfies-scope? [scopes scope]
  (condp = scope
    apps-read-scope (or (ucoll/exists? #(= % apps-read-scope) scopes)
                        (ucoll/exists? #(= % apps-write-scope) scopes))
    apps-write-scope (ucoll/exists? #(= % apps-write-scope) scopes)))

(defn hash-client-secret ^bytes [^String client-secret]
  (crypt-util/str->sha256 client-secret))

(defn gen-client-secret ^String []
  ;; Extra two so that we can display the first 4 chars
  (crypt-util/random-hex 34))

;; DDD: TODOS:
;;  1. Way to regenerate the client-secret

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
                                        ;; DDD: logo
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

(defn get-client-by-client-id-and-secret!
  ([params]
   (get-client-by-client-id-and-secret! (aurora/conn-pool :read) params))
  ([conn {:keys [client-id
                 client-secret] :as params}]
   (let [hashed-secret (hash-client-secret client-secret)
         q {:select :client.*
            :from [[:instant-oauth-app-clients :client]]
            :join [[:instant-oauth-app-client-secrets :secret]
                   [:= :secret.client-id :client.client-id]]
            :where [:= :secret.hashed-secret hashed-secret]}
         record (sql/select-one ::get-client-by-client-id-and-secret!
                                conn
                                (hsql/format q))]
     (ex/assert-record! record
                        :oauth-app-client
                        {:args [{:client-id client-id}]}))))

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
                               :instant_oauth_app_redirect_status]
                      :expires-at default-expires-at}]}]
     (sql/execute! ::create-redirect
                   conn
                   (hsql/format q)))))

(defn assert-not-expired! [record record-type]
  (let [^Timestamp expires (:expires_at record)
        now (Timestamp. (System/currentTimeMillis))]
    (if (.after expires now)
      record
      (ex/throw-expiration-err! record-type {:expired_at expires}))))

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
     (-> record
         (ex/assert-record! :oauth-app-redirect
                            {:args [{:redirect-id redirect-id}]})
         (assert-not-expired! :oauth-app-redirect)))))

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
       (-> record
           (ex/assert-record! :oauth-app-redirect
                              {:args [{:redirect-id redirect-id}]})
           (assert-not-expired! :oauth-app-redirect))))))

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
                      :scopes [:array scopes :text]
                      :expires-at default-expires-at}]
            :returning :*}]
     (sql/execute-one! ::create-code conn (hsql/format q)))))

(defn claim-code!
  ([params]
   (claim-code! (aurora/conn-pool :write) params))
  ([conn {:keys [code]}]
   (let [hashed-code (crypt-util/uuid->sha256 code)
         q {:delete-from :instant_oauth_app_codes
            :where [:= :hashed-code hashed-code]
            :returning :*}
         record (sql/execute-one! ::claim-code! conn (hsql/format q))]
     (-> record
         (ex/assert-record! :oauth-code {:code code})
         (assert-not-expired! :oauth-code)))))

(def refresh-token-limit 5)

;; DDD: tracer
(defn remove-old-refresh-tokens
  ([params]
   (remove-old-refresh-tokens (aurora/conn-pool :write) params))
  ([conn {:keys [client-id
                 user-id]}]
   (let [q {:delete-from :instant_user_oauth_refresh_tokens
            :where [:in :lookup-key {:select :lookup-key
                                     :from :instant_user_oauth_refresh_tokens
                                     :where [:and
                                             [:= :client-id client-id]
                                             [:= :user-id user-id]]
                                     :order-by [[:created-at :desc]]
                                     :offset refresh-token-limit}]}])))

(defn new-token [type]
  (case type
    :access (str platform-access-token-prefix (crypt-util/random-hex 32))
    :refresh (str platform-refresh-token-prefix (crypt-util/random-hex 32))))

(defn create-refresh-token
  ([params]
   (create-refresh-token (aurora/conn-pool :write) params))
  ([conn {:keys [client-id
                 user-id
                 scopes]}]
   (let [token (new-token :refresh)
         hashed-token (crypt-util/str->sha256 token)
         q {:insert-into :instant_user_oauth_refresh_tokens
            :values [{:lookup-key hashed-token
                      :client-id client-id
                      :user-id user-id
                      :scopes [:array scopes :text]}]
            :returning :*}
         record (sql/execute-one! ::create-refresh-token conn (hsql/format q))]
     {:record record
      :token-value token})))

(defn access-token-expires-in
  "Returns the number of seconds between now and when
   the token expires."
  [{:keys [^java.sql.Timestamp expires_at]}]
  (int (/ (- (.getTime expires_at)
             (System/currentTimeMillis))
          1000)))

(defn create-access-token
  ([params]
   (create-access-token (aurora/conn-pool :write) params))
  ([conn {:keys [client-id
                 user-id
                 scopes
                 refresh-token-lookup-key]}]
   (let [token (new-token :access)
         hashed-token (crypt-util/str->sha256 token)
         q {:insert-into :instant_user_oauth_access_tokens
            :values [{:lookup-key hashed-token
                      :refresh-token-lookup-key refresh-token-lookup-key
                      :client-id client-id
                      :user-id user-id
                      :scopes [:array scopes :text]
                      :expires-at [:+ :%now [:interval "2 weeks"]]}]
            :returning :*}
         record (sql/execute-one! ::create-auth-token conn (hsql/format q))]
     {:record record
      :token-value token})))

(defn create-tokens-for-code
  ([params]
   (create-tokens-for-code (aurora/conn-pool :write) params))
  ([conn {:keys [client-id
                 user-id
                 scopes]}]
   (let [refresh-token (create-refresh-token conn {:client-id client-id
                                                   :user-id user-id
                                                   :scopes scopes})
         access-token (create-access-token conn {:client-id client-id
                                                 :user-id user-id
                                                 :scopes scopes
                                                 :refresh-token-lookup-key (-> refresh-token
                                                                               :record
                                                                               :lookup_key)})]
     ;; Only allow 5 refresh tokens at a time per user + client
     (remove-old-refresh-tokens conn {:client-id client-id
                                      :user-id user-id})
     {:refresh-token refresh-token
      :access-token access-token})))

(defn refresh-token-by-token-value!
  ([params]
   (refresh-token-by-token-value! (aurora/conn-pool :read) params))
  ([conn {:keys [client-id
                 refresh-token]}]
   (let [hashed-token (crypt-util/str->sha256 refresh-token)
         q {:select :*
            :from :instant_user_oauth_refresh_tokens
            :where [:and
                    [:= :lookup-key hashed-token]
                    [:= :client-id client-id]]}
         record (sql/select-one ::refresh-token-by-token-value!
                                conn
                                (hsql/format q))]
     (ex/assert-record! record :oauth-refresh-token nil))))

(defn access-token-by-token-value!
  ([params]
   (access-token-by-token-value! (aurora/conn-pool :read) params))
  ([conn {:keys [access-token]}]
   (let [hashed-token (crypt-util/str->sha256 access-token)
         q {:select :*
            :from :instant_user_oauth_access_tokens
            :where [:= :lookup-key hashed-token]}
         record (sql/select-one ::access-token-by-token-value
                                conn
                                (hsql/format q))
         ^Timestamp expires (:expires_at record)
         now (Timestamp. (System/currentTimeMillis))]
     (-> record
         (ex/assert-record! :oauth-access-token nil)
         (assert-not-expired! :oauth-access-token)))))


;; DDD: Clean out old data (e.g. expired tokens)
;; DDD: Do I need indexes on created-at?
