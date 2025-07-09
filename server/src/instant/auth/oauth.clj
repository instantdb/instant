(ns instant.auth.oauth
  (:require
   [chime.core :as chime-core]
   [clj-http.client :as clj-http]
   [clojure.core.cache.wrapped :as cache]
   [clojure.string :as string]
   [instant.auth.jwt :as jwt]
   [instant.util.crypt :as crypt-util]
   [instant.util.exception :as ex]
   [instant.util.lang :as lang]
   [instant.util.json :as json]
   [instant.util.tracer :as tracer]
   [instant.util.url :as url])
  (:import
   (clojure.lang PersistentHashSet)
   (instant.util.crypt Secret)
   (java.time Duration Instant)
   (java.util Base64)))

(def allowed-extra-params [:hd])

(defprotocol OAuthClient
  (create-authorization-url [this state redirect-url extra-params])
  (get-user-info [this code redirect-url])
  ;; Gets user-info from user-provided id_token after verifying the token
  (get-user-info-from-id-token [this nonce jwt opts]))

(defrecord GenericOAuthClient [app-id
                               provider-id
                               client-id
                               ^Secret client-secret
                               authorization-endpoint
                               token-endpoint
                               jwks-uri
                               issuer
                               ^PersistentHashSet id-token-signing-alg-values-supported
                               meta]
  OAuthClient
  (create-authorization-url [_ state redirect-url extra-params]
    (let [base-params {:scope "email"
                       :response_type "code"
                       :response_mode "form_post"
                       :state state
                       :redirect_uri redirect-url
                       :client_id client-id}
          params (merge base-params
                        (or (select-keys extra-params allowed-extra-params)
                            {}))]
      (url/add-query-params authorization-endpoint params)))

  (get-user-info [_ code redirect-url]
    (let [secret (case issuer
                   ("https://account.apple.com"
                    "https://appleid.apple.com")
                   (jwt/apple-client-secret
                    {:client-id   client-id
                     :team-id     (get meta "teamId")
                     :key-id      (get meta "keyId")
                     :private-key (.value client-secret)})

                   #_else
                   (.value client-secret))
          resp (clj-http/post token-endpoint
                              {:throw-exceptions false
                               :as :json
                               :coerce :always
                               :form-params {:client_id client-id
                                             :client_secret secret
                                             :code code
                                             :grant_type "authorization_code"
                                             :redirect_uri redirect-url}})]
      (if-not (clj-http/success? resp)
        {:type :error :message (get-in resp [:body :error_description] "Error exchanging code for token.")}
        (let [id-token (try
                         ;; extract the id token data that has the email and sub from the id_token JWT
                         (some-> resp
                                 :body
                                 :id_token
                                 (string/split #"\.")
                                 ^String (second)
                                 ^bytes (->> (.decode (java.util.Base64/getUrlDecoder)))
                                 (String.)
                                 (json/<-json true))
                         (catch IllegalArgumentException _e
                           (tracer/with-span! {:name "oauth/invalid-id_token"
                                               :attributes {:id_token (-> resp :body :id_token)}})))]
          (if-not id-token
            {:type :error :message "Invalid token exchanging code for token."}
            (let [email (when (:email_verified id-token) (:email id-token))
                  sub (:sub id-token)]
              (if (and email sub)
                {:type :success :email email :sub sub}
                (tracer/with-span! {:name "oauth/missing-user-info"
                                    :attributes {:id_token id-token}}
                  {:type :error :message "Missing user info"}))))))))

  (get-user-info-from-id-token [client nonce jwt {:keys [allow-unverified-email?
                                                         ignore-audience?]}]
    (when (or (string/blank? jwks-uri)
              (string/blank? issuer)
              (empty? id-token-signing-alg-values-supported))
      (ex/throw-validation-err! :id_token jwt [{:message "OAuth client does not support id_token."}]))

    (let [verified-jwt (jwt/verify-jwt {:jwks-uri jwks-uri
                                        :jwt jwt})
            ;; verify lets us know that the jwk was issued by
            ;; e.g. google but we still need to make sure it was
            ;; issued by our client and has all of the fields we need
            ;; https://developers.google.com/identity/sign-in/ios/backend-auth#verify-the-integrity-of-the-id-token
          jwt-issuer (.getIssuer verified-jwt)
            ;; Handle Apple's issuer inconsistency: discovery endpoint and JWT tokens
            ;; use different issuer URLs (account.apple.com vs appleid.apple.com)
          issuer-mismatch (not (or (= jwt-issuer issuer)
                                     ;; Allow both Apple issuer URLs to match each other
                                   (and (or (= issuer "https://account.apple.com")
                                            (= issuer "https://appleid.apple.com"))
                                        (or (= jwt-issuer "https://account.apple.com")
                                            (= jwt-issuer "https://appleid.apple.com")))))
          unsupported-alg (not (contains? id-token-signing-alg-values-supported
                                          (.getAlgorithm verified-jwt)))
          client-id-mismatch (and (not ignore-audience?)
                                  (not (contains? (set (.getAudience verified-jwt))
                                                  client-id)))
          sub (.getSubject verified-jwt)
          email-verified (.asBoolean (.getClaim verified-jwt "email_verified"))
          email (.asString (.getClaim verified-jwt "email"))

          jwt-nonce (.asString (.getClaim verified-jwt "nonce"))
          skip-nonce-checks? (-> client
                                 :meta
                                 (get "skipNonceChecks"))
          nonce-error (cond
                        skip-nonce-checks?
                        nil

                        (= jwt-nonce nonce)
                        nil

                        ;; For some reason invertase replaces nonce with SHA256 of nonce
                        ;; https://github.com/invertase/react-native-apple-authentication/blob/cadd7cad1c8c2c59505959850affaa758328f1a3/android/src/main/java/com/RNAppleAuthentication/AppleAuthenticationAndroidModule.java#L139-L146
                        (and jwt-nonce nonce (= jwt-nonce (-> nonce crypt-util/str->sha256 crypt-util/bytes->hex-string)))
                        nil

                        (and (string/blank? jwt-nonce)
                             (not (string/blank? nonce)))
                        "The id_token is missing a nonce."

                        (and (string/blank? nonce)
                             (not (string/blank? jwt-nonce)))
                        "The nonce parameter was not provided in the request."

                        :else "The nonces do not match.")

          error (cond
                  nonce-error                        nonce-error
                  issuer-mismatch                    (str "The id_token wasn't issued by " issuer ".")
                  unsupported-alg                    "The id_token used an unsupported algorithm."
                  client-id-mismatch                 "The id_token was generated for the wrong OAuth client."
                  (and (not allow-unverified-email?)
                       (not email-verified))         "The email address is not verified."
                  (not email)                        "The id_token had no email."
                  (not sub)                          "The id_token had no subject.")]
      (when error
        (ex/throw-validation-err! :id_token jwt [{:message error}]))
      {:email email
       :sub   sub})))

;; Map of endpoint to JSON results
;; {"google.com/.well-known/..." {:data {...}, :date #obj[java.time.Instant...]}
(defonce discovery-endpoint-cache (cache/lru-cache-factory {} :threshold 32))

(defn fetch-discovery [endpoint]
  (let [resp (clj-http/get endpoint {:throw-exceptions false
                                     :as :json
                                     ;; for https://account.apple.com/.well-known/openid-configuration
                                     :headers {"User-Agent" "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15"}})]
    (if (clj-http/success? resp)
      {:date (Instant/now)
       :data (:body resp)}
      (do
        (tracer/record-exception-span! (ex-info "Error fetching discovery"
                                                {:status   (:status resp)
                                                 :body     (:body resp)
                                                 :endpoint endpoint})
                                       {:name "oauth/fetch-discovery-error"})
        (ex/throw-oauth-err! "Unable to fetch OAuth configuration.")))))

(defn get-discovery [endpoint]
  (:data (cache/lookup-or-miss discovery-endpoint-cache endpoint fetch-discovery)))

(defn generic-oauth-client-from-discovery-url [{:keys [app-id
                                                       provider-id
                                                       client-id
                                                       ^Secret client-secret
                                                       discovery-endpoint
                                                       meta]}]
  (let [{:keys [authorization_endpoint
                token_endpoint
                jwks_uri
                issuer
                id_token_signing_alg_values_supported]} (get-discovery discovery-endpoint)]
    (map->GenericOAuthClient {:app-id app-id
                              :provider-id provider-id
                              :client-id client-id
                              :client-secret client-secret
                              :authorization-endpoint authorization_endpoint
                              :token-endpoint token_endpoint
                              :jwks-uri jwks_uri
                              :issuer issuer
                              :id-token-signing-alg-values-supported (if (empty? id_token_signing_alg_values_supported)
                                                                       #{"RS256" "HS256"}
                                                                       (set id_token_signing_alg_values_supported))
                              :meta meta})))

(defn verify-pkce!
  "Verifies that the code verifier matches the code challenge, if it was
   provided at the start of the OAuth flow.

   Returns the record if verification succeeded, throws a validation
   error if it fails

   See https://www.oauth.com/oauth2-servers/pkce/authorization-request/"
  [record-type
   {:keys [code_challenge code_challenge_method] :as record}
   verifier]
  (cond
    (and (not code_challenge) (not verifier))
    record

    (and verifier (not code_challenge))
    (ex/throw-validation-err! record-type
                              {:code_verifier verifier}
                              [{:message "The code_verifier was provided, but no code_challenge was provided."}])

    (and (not verifier) code_challenge)
    (ex/throw-validation-err! record-type
                              {:code_verifier verifier}
                              [{:message "The code_challenge was provided, but no code_verifier was provided."}])

    :else
    (case code_challenge_method
      "plain" (if (crypt-util/constant-string= verifier code_challenge)
                record
                (ex/throw-validation-err! record-type
                                          {:code_verifier verifier}
                                          [{:message "The code_challenge and code_verifier do not match."}]))

      "S256" (try
               (let [verifier-bytes (crypt-util/str->sha256 verifier)
                     challenge-bytes (.decode (Base64/getUrlDecoder)
                                              ^String code_challenge)]
                 (if (crypt-util/constant-bytes= verifier-bytes
                                                 challenge-bytes)
                   record
                   (ex/throw-validation-err! record-type
                                             {:code_verifier verifier}
                                             [{:message "The code_challenge and code_verifier do not match."}])))
               (catch IllegalArgumentException _e
                 (ex/throw-validation-err! record-type
                                           {:code_verifier verifier}
                                           [{:message "Invalid code_verifier. Expected a url-safe Base64 string."}])))

      (ex/throw-validation-err! record-type
                                {:code_verifier verifier}
                                [{:message "Unknown code challenge method."}]))))

(comment
  (generic-oauth-client-from-discovery-url {:discovery-endpoint "https://account.apple.com/.well-known/openid-configuration"}))

(def schedule nil)

(defn start []
  (tracer/record-info! {:name "oauth/start"})
  (try
    ;; Initialize with Google
    (get-discovery "https://accounts.google.com/.well-known/openid-configuration")
    (catch Exception e
      (tracer/record-exception-span! e {:name "oauth/start-error"})))
  (tracer/record-info! {:name "oauth/start-refresh-worker"})
  (def schedule
    (chime-core/chime-at
     (-> (chime-core/periodic-seq (Instant/now) (Duration/ofHours 1))
         rest)
     (fn [_time]
       (for [endpoint (keys @discovery-endpoint-cache)]
         (tracer/with-span! {:name "oauth/updating-discovery-endpoint"
                             :endpoint endpoint}
           (try
             (let [data (fetch-discovery endpoint)]
               (swap! discovery-endpoint-cache assoc endpoint data))

             (catch Exception e
               (tracer/record-exception-span! e {:name "oauth/refresh-error"})))))))))

(defn stop []
  (lang/close schedule))

(defn restart []
  (stop)
  (start))

(defn before-ns-unload []
  (stop))

(defn after-ns-reload []
  (start))

(comment
  (fetch-discovery "https://accounts.google.com/.well-known/openid-configuration")
  (fetch-discovery "https://accounts.google.com/.well-known/openid-configuration")

  (restart)
  discovery-endpoint-cache)


