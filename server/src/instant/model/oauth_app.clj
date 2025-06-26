(ns instant.model.oauth-app
  (:require [clojure.string :as string]
            [honey.sql :as hsql]
            [instant.jdbc.aurora :as aurora]
            [instant.jdbc.sql :as sql]
            [instant.util.coll :as ucoll]
            [instant.util.crypt :as crypt-util]
            [instant.util.exception :as ex]
            [instant.util.token :refer [generate-platform-refresh-token
                                        generate-platform-access-token]]
            [next.jdbc :as next-jdbc])
  (:import (java.nio ByteBuffer)
           (java.nio.charset StandardCharsets)
           (java.util Base64 Date)))

(set! *warn-on-reflection* true)

(def apps-read-scope "apps-read")
(def apps-write-scope "apps-write")
(def data-read-scope "data-read")
(def data-write-scope "data-write")
(def storage-read-scope "storage-read")
(def storage-write-scope "storage-write")

(def all-scopes (set [apps-read-scope
                      apps-write-scope
                      data-read-scope
                      data-write-scope
                      storage-read-scope
                      storage-write-scope]))

(def default-expires-at [:+ :%now [:interval "10 minutes"]])

(defn satisfies-scope? [scopes scope]
  (condp = scope
    apps-read-scope (or (ucoll/exists? #(= % apps-read-scope) scopes)
                        (ucoll/exists? #(= % apps-write-scope) scopes))
    apps-write-scope (ucoll/exists? #(= % apps-write-scope) scopes)

    data-read-scope (or (ucoll/exists? #(= % data-read-scope) scopes)
                        (ucoll/exists? #(= % data-write-scope) scopes))
    data-write-scope (ucoll/exists? #(= % data-write-scope) scopes)

    storage-read-scope (or (ucoll/exists? #(= % storage-read-scope) scopes)
                           (ucoll/exists? #(= % storage-write-scope) scopes))
    storage-write-scope (ucoll/exists? #(= % storage-write-scope) scopes)))

(defn hash-client-secret ^bytes [^String client-secret]
  (crypt-util/str->sha256 client-secret))

(defn gen-client-secret ^String []
  ;; Extra two so that we can display the first 4 chars
  (crypt-util/random-hex 34))

(defn base64-image-url->bytes
  "Converts a base64 image url into a custom encoding where the first
   4 bytes are the mime type and the rest of the bytes are the data."
  ^bytes [^String s]
  (let [[prefix mime-type] (re-find #"^data:image/(\w+);base64," s)]
    (when-not (and prefix mime-type)
      (throw (Exception. "Invalid image url")))
    (when (< 4 (count mime-type))
      (throw (Exception. "Invalid mime type")))
    (when-not (contains? #{"jpg" "jpeg" "png" "svg" "webp"} mime-type)
      (throw (Exception. "Invalid image type")))
    (let [mimetype-bytes (.getBytes (format "%-4s" mime-type))
          _ (assert (= 4 (alength mimetype-bytes)))
          base64-string (subs s (count prefix))
          image-bytes (.decode (Base64/getDecoder) base64-string)
          bytes (ByteBuffer/allocate (+ 4
                                        (alength image-bytes)))]
      (when (< (* 1024 1024) (count image-bytes))
        (throw (Exception. "Image is too large")))
      (.put bytes mimetype-bytes)
      (.put bytes image-bytes)
      (.array bytes))))

(defn bytes->base64-image-url
  "Converts our custom encoding (from `base64-image-url->bytes`) into a
   base64 image url"
  ^String [^bytes b]
  (let [mimetype (string/trim (-> StandardCharsets/UTF_8
                                  (.decode (ByteBuffer/wrap b 0 4))
                                  (.toString)))
        base64-string (-> (Base64/getEncoder)
                          (.encode (ByteBuffer/wrap b 4 (- (count b) 4)))
                          (.array)
                          (String. "UTF-8"))]
    (str "data:image/" mimetype ";base64," base64-string)))

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
                                        is_public
                                        support_email
                                        app_home_page
                                        app_privacy_policy_link
                                        app_tos_link
                                        app_logo
                                        created_at
                                        updated_at]}]
  {:id id
   :appId app_id
   :appName app_name
   :appLogo (some-> app_logo
                    bytes->base64-image-url)
   :grantedScopes granted_scopes
   :isPublic is_public
   :supportEmail support_email
   :appHomePage app_home_page
   :appPrivacyPolicyLink app_privacy_policy_link
   :appTosLink app_tos_link
   :createdAt created_at
   :updatedAt updated_at})

(defn pg-bytes->base64-image-url
  "pg helper to convert bytes to the base64 image string.
   Implements base64-image-url->bytes in sql."
  [col]
  [:||
   "data:image/"
   [:btrim [:convert_from
            [:substring col :!from :1 :!for :4]
            "UTF8"]]
   ";base64,"
   [:encode [:substring col :!from :5] "base64"]])

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
                                     "appLogo" (pg-bytes->base64-image-url :oauth-app.app-logo)
                                     "grantedScopes" [:coalesce
                                                      [:array_to_json :oauth-app.granted-scopes]
                                                      [:inline "[]"]]
                                     "isPublic" :oauth-app.is_public
                                     "supportEmail" :oauth-app.support_email
                                     "appHomePage" :oauth-app.app_home_page
                                     "appPrivacyPolicyLink" :oauth-app.app_privacy_policy_link
                                     "appTosLink" :oauth-app.app_tos_link
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
  ([conn {:keys [app-id
                 oauth-app-id-unverified]}]
   (let [q {:select :*
            :from :instant-oauth-apps
            :where [:and
                    [:= :app-id app-id]
                    [:= :id oauth-app-id-unverified]]}]
     (-> (sql/select-one ::get-oauth-app-by-id-and-app-id!
                         conn
                         (hsql/format q))
         (ex/assert-record!
          :oauth-app
          {:args [{:app-id app-id
                   :oauth-app-id oauth-app-id-unverified}]})))))

(defn get-oauth-app-by-client-id-and-app-id!
  ([params]
   (get-oauth-app-by-client-id-and-app-id! (aurora/conn-pool :read) params))
  ([conn {:keys [app-id
                 client-id-unverified]}]
   (let [q {:select :oauth-app.*
            :from [[:instant-oauth-apps :oauth-app]]
            :join [[:instant-oauth-app-clients :client]
                   [:= :client.oauth-app-id :oauth-app.id]]
            :where [:and
                    [:= :app-id app-id]
                    [:= :client.client-id client-id-unverified]]}]
     (-> (sql/select-one ::get-oauth-app-by-client-id-and-app-id!
                         conn
                         (hsql/format q))
         (ex/assert-record! :oauth-app
                            {:args [{:app-id app-id
                                     :client-id client-id-unverified}]})))))

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
  ([conn {:keys [client-id]}]
   (ex/assert-record! (get-client-and-app-by-client-id conn {:client-id client-id})
                      :oauth-app-client
                      {:args [{:client-id client-id}]})))

(defn get-client-by-client-id-and-secret!
  ([params]
   (get-client-by-client-id-and-secret! (aurora/conn-pool :read) params))
  ([conn {:keys [client-id
                 client-secret]}]
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
   (create-client-secret (aurora/conn-pool :write) params))
  ([conn {:keys [client-id client-secret]}]
   (sql/execute-one! ::create-client-secret
                     conn
                     (hsql/format {:insert-into :instant-oauth-app-client-secrets
                                   :values [{:id (random-uuid)
                                             :client-id client-id
                                             :hashed-secret (hash-client-secret client-secret)
                                             :first-four (subs client-secret 0 4)}]
                                   :returning :*}))))

(defn create-client-secret-by-client-id-and-app-id!
  "Creates a new client secret for an oauth client id and the Instant app id.
   Uses the instant app id as a check that the user has permission to
   delete the secret."
  ([params]
   (create-client-secret-by-client-id-and-app-id! (aurora/conn-pool :write) params))
  ([conn {:keys [app-id
                 client-id]}]
   (let [client-secret (gen-client-secret)
         q {:insert-into :instant-oauth-app-client-secrets
            :values [{:id (random-uuid)
                      :hashed-secret (hash-client-secret client-secret)
                      :first-four (subs client-secret 0 4)
                      :client-id {:select :client.client-id
                                  :from [[:instant-oauth-app-clients :client]]
                                  :join [[:instant-oauth-apps :oauth-app]
                                         [:= :oauth-app.id :client.oauth-app-id]]
                                  :where [:and
                                          [:= :client.client-id client-id]
                                          [:= :oauth-app.app-id app-id]]}}]
            :returning :*}
         record (-> (sql/execute-one! conn (hsql/format q))
                    (ex/assert-record! :oauth-app-client-secrets
                                       {:args [{:app-id app-id
                                                :client-id client-id}]}))]
     {:record record
      :secret-value client-secret})))

(defn delete-client-secret-by-id-and-app-id!
  "Deletes a client secret by its id and the Instant app id. Uses the instant app id
   as a check that the user has permission to delete the secret."
  ([params]
   (delete-client-secret-by-id-and-app-id! (aurora/conn-pool :write) params))
  ([conn {:keys [app-id
                 client-secret-id]}]
   (let [q {:delete-from :instant-oauth-app-client-secrets
            :where [:= :id {:select :secret.id
                            :from [[:instant-oauth-app-client-secrets :secret]]
                            :join [[:instant-oauth-app-clients :client]
                                   [:= :client.client-id :secret.client-id]

                                   [:instant-oauth-apps :oauth-app]
                                   [:= :oauth-app.id :client.oauth-app-id]]
                            :where [:and
                                    [:= :secret.id client-secret-id]
                                    [:= :oauth-app.app-id app-id]]}]
            :returning :*}]
     (-> (sql/execute-one! conn (hsql/format q))
         (ex/assert-record! :oauth-app-client-secrets
                            {:args [{:app-id app-id
                                     :client-secret-id client-secret-id}]})))))

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
                      :is-public false
                      :support-email support-email
                      :app-home-page app-home-page
                      :app-privacy-policy-link app-privacy-policy-link
                      :app-tos-link app-tos-link
                      :app-logo app-logo}]
            :returning :*}]
     (sql/execute-one! ::create-app conn (hsql/format q)))))

(defn update-app!
  "Updates app, uses the app-id (an Instant app id) as the check that the user
   has access to the OAuth app."
  ([params]
   (update-app! (aurora/conn-pool :write) params))
  ([conn {:keys [app-id
                 oauth-app-id-unverified
                 app-name
                 support-email
                 app-home-page
                 app-privacy-policy-link
                 app-tos-link
                 app-logo]}]
   (let [q {:update :instant-oauth-apps
            :set (cond-> {}
                   app-name (assoc :app-name app-name)
                   support-email (assoc :support-email support-email)
                   app-home-page (assoc :app-home-page app-home-page)
                   app-privacy-policy-link (assoc :app-privacy-policy-link app-privacy-policy-link)
                   app-tos-link (assoc :app-tos-link app-tos-link)
                   app-logo (assoc :app-logo app-logo))
            :where [:and
                    [:= :app-id app-id]
                    [:= :id oauth-app-id-unverified]]
            :returning :*}]
     (-> (sql/execute-one! ::update-app conn (hsql/format q))
         (ex/assert-record! :oauth-app {:args [{:app-id app-id
                                                :oauth-app-id oauth-app-id-unverified}]})))))

(defn delete-app!
  ([params]
   (delete-app! (aurora/conn-pool :write) params))
  ([conn {:keys [app-id
                 oauth-app-id-unverified]}]
   (let [q {:delete-from :instant-oauth-apps
            :where [:and
                    [:= :app-id app-id]
                    ;; We check the app id as a permission guard
                    [:= :id oauth-app-id-unverified]]
            :returning :*}]
     (-> (sql/execute-one! ::delete-app! conn (hsql/format q))
         (ex/assert-record! :oauth-app {:args [{:app-id app-id
                                                :oauth-app-id oauth-app-id-unverified}]})))))

(defn update-client!
  "Updates app, uses the app-id (an Instant app id) as the check that the user
   has access to the OAuth client."
  ([params]
   (update-client! (aurora/conn-pool :write) params))
  ([conn {:keys [app-id
                 client-id-unverified
                 client-name
                 add-redirect-url
                 remove-redirect-url]}]
   (let [q {:update :instant-oauth-app-clients
            :set (cond-> {}
                   client-name (assoc :client-name client-name)
                   (or add-redirect-url
                       remove-redirect-url)
                   (assoc :authorized-redirect-urls
                          (cond-> :authorized-redirect-urls
                            add-redirect-url ((fn [existing]
                                                [:array_append existing add-redirect-url]))
                            remove-redirect-url ((fn [existing]
                                                   [:array_remove existing remove-redirect-url]))
                            ;; call distinct, but don't change the order
                            true ((fn [a]
                                    {:select [[[:array {:select :url
                                                        :from [[{:select-distinct-on [[:url] :url :ord]
                                                                 :from [[[:with-ordinality [:unnest a] [:t :url :ord]]]]}
                                                                :x]]
                                                        :order-by :x.ord}]]]})))))
            :where [:= :client-id {:select :client.client-id
                                   :from [[:instant-oauth-app-clients :client]]
                                   :join [[:instant-oauth-apps :oauth-app]
                                          [:= :oauth-app.id :client.oauth-app-id]]
                                   :where [:and
                                           [:= :oauth-app.app-id app-id]
                                           [:= :client.client-id client-id-unverified]]}]
            :returning :*}]
     (-> (sql/execute-one! ::update-client! conn (hsql/format q))
         (ex/assert-record! :oauth-client {:args [{:app-id app-id
                                                   :client-id client-id-unverified}]})))))

(defn delete-client!
  ([params]
   (delete-client! (aurora/conn-pool :write) params))
  ([conn {:keys [app-id
                 client-id-unverified]}]
   (let [q {:delete-from :instant-oauth-app-clients
            :where [:= :client-id {:select :client.client-id
                                   :from [[:instant-oauth-app-clients :client]]
                                   :join [[:instant-oauth-apps :oauth-app]
                                          [:= :oauth-app.id :client.oauth-app-id]]
                                   :where [:and
                                           [:= :oauth-app.app-id app-id]
                                           ;; We check app id as a permissions guard
                                           [:= :client.client-id client-id-unverified]]}]
            :returning :*}]
     (-> (sql/execute-one! ::delete-client! conn (hsql/format q))
         (ex/assert-record! :oauth-client {:args [{:app-id app-id
                                                   :client-id client-id-unverified}]})))))

;; OAuth flow
;; ----------

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
     (sql/do-execute! ::create-redirect
                      conn
                      (hsql/format q)))))

(defn assert-not-expired! [record record-type]
  (let [^Date expires (:expires_at record)
        now (Date.)]
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

(defn deny-redirect!
  "Deletes the redirect without returning it."
  ([params]
   (deny-redirect! (aurora/conn-pool :write) params))
  ([conn {:keys [redirect-id]}]
   (let [lookup-key (crypt-util/uuid->sha256 redirect-id)
         q {:delete-from :instant_oauth_app_redirects
            :where [:= :lookup-key lookup-key]
            :returning :*}
         record (sql/execute-one! ::deny-redirect conn (hsql/format q))]
     (-> record
         (ex/assert-record! :oauth-app-redirect
                            {:args [{:redirect-id redirect-id}]})))))

(defn create-code
  ([params]
   (create-code (aurora/conn-pool :write) params))
  ([conn {:keys [code
                 client-id
                 redirect-uri
                 user-id
                 scopes
                 code-challenge
                 code-challenge-method]}]
   (let [hashed-code (crypt-util/uuid->sha256 code)
         q {:insert-into :instant_oauth_app_codes
            :values [{:hashed-code hashed-code
                      :client-id client-id
                      :redirect-uri redirect-uri
                      :user-id user-id
                      :scopes [:array scopes :text]
                      :code-challenge code-challenge
                      :code-challenge-method code-challenge-method
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
         (ex/assert-record! :oauth-code {:args [{:code code}]})
         (assert-not-expired! :oauth-code)))))

(def refresh-token-limit 5)

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
                                     :offset refresh-token-limit}]}]
     (sql/do-execute! ::remove-old-refresh-tokens
                      conn
                      (hsql/format q)))))

(defn new-token [type]
  (case type
    :access (generate-platform-access-token)
    :refresh (generate-platform-refresh-token)))

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
  [{:keys [^Date expires_at]}]
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
                                (hsql/format q))]
     (-> record
         (ex/assert-record! :oauth-access-token nil)
         (assert-not-expired! :oauth-access-token)))))

(defn revoke-refresh-token
  ([params]
   (revoke-refresh-token (aurora/conn-pool :write) params))
  ([conn {:keys [token]}]
   (sql/do-execute! ::revoke-refresh-token
                    conn
                    (hsql/format {:delete-from :instant_user_oauth_refresh_tokens
                                  :where [:= :lookup-key (crypt-util/str->sha256 token)]}))))

(defn revoke-access-token
  ([params]
   (revoke-access-token (aurora/conn-pool :write) params))
  ([conn {:keys [token]}]
   (sql/do-execute! ::revoke-access-token
                    conn
                    (hsql/format {:delete-from :instant_user_oauth_access_tokens
                                  :where [:= :lookup-key (crypt-util/str->sha256 token)]}))))

(defn user-authorized
  ([params]
   (user-authorized (aurora/conn-pool :read) params))
  ([conn {:keys [user-id]}]
   (sql/select ::user-authorized
               conn
               (hsql/format {:select :*
                             :from :instant_oauth_apps
                             :where [:in :id {:select :oauth_app_id
                                              :from :instant_oauth_app_clients
                                              :where [:in :client_id {:union-all [{:select :client_id
                                                                                   :from :instant_user_oauth_access_tokens
                                                                                   :where [:= :user_id user-id]}
                                                                                  {:select :client_id
                                                                                   :from :instant_user_oauth_refresh_tokens
                                                                                   :where [:= :user_id user-id]}]}]}]}))))

(defn revoke-app-for-user
  ([params]
   (revoke-app-for-user (aurora/conn-pool :write) params))
  ([conn {:keys [oauth-app-id user-id]}]
   (sql/execute! ::revoke-app-for-user
                 conn
                 (hsql/format {:with [[:client_ids
                                       {:select :client_id
                                        :from :instant_oauth_app_clients
                                        :where [:= :oauth-app-id oauth-app-id]}]

                                      [:refresh_token_ids
                                       {:delete-from :instant_user_oauth_refresh_tokens
                                        :where [:and
                                                [:= :user-id user-id]
                                                [:= :client-id [:any {:select :client_id :from :client_ids}]]]
                                        :returning :lookup-key}]

                                      [:access_token_ids
                                       {:delete-from :instant_user_oauth_access_tokens
                                        :where [:and
                                                [:= :user-id user-id]
                                                [:= :client-id [:any {:select :client_id :from :client_ids}]]]
                                        :returning :lookup-key}]

                                      [:ids {:union-all [{:select :lookup-key
                                                          :from :refresh_token_ids}
                                                         {:select :lookup-key
                                                          :from :access_token_ids}]}]]
                               :select :lookup-key
                               :from :ids}))))
