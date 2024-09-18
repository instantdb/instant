(ns instant.auth.oauth
  (:require
   [chime.core :as chime-core]
   [clj-http.client :as clj-http]
   [clojure.core.cache.wrapped :as cache]
   [clojure.string :as string] 
   [instant.auth.jwt :refer [verify-jwt]]
   [instant.util.crypt]
   [instant.util.json :as json]
   [instant.util.tracer :as tracer]
   [instant.util.url :as url])
  (:import
   (clojure.lang PersistentHashSet)
   (instant.util.crypt Secret)
   (java.time Duration Instant)))

(defprotocol OAuthClient
  (create-authorization-url [this state redirect-url])
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
                               ^PersistentHashSet id-token-signing-alg-values-supported]
  OAuthClient
  (create-authorization-url [this state redirect-url]
    (let [params {:scope "email"
                  :response_type "code"
                  :state state
                  :redirect_uri redirect-url
                  :client_id (:client-id this)}]
      (url/add-query-params (:authorization-endpoint this) params)))

  (get-user-info [this code redirect-url]
    (let [resp (clj-http/post (:token-endpoint this)
                              {:throw-exceptions false
                               :as :json
                               :coerce :always
                               :form-params {:client_id (:client-id this)
                                             :client_secret (.value (:client-secret this))
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
                                 second
                                 (#(.decode (java.util.Base64/getUrlDecoder) %))
                                 String.
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
                  {:type :error :message "Missing user info."}))))))))
  (get-user-info-from-id-token [this nonce jwt {:keys [allow-unverified-email?
                                                       ignore-audience?]}]
    (if (or (string/blank? (:jwks-uri this))
            (string/blank? (:issuer this))
            (empty? (:id-token-signing-alg-values-supported this)))
      {:type :error :message "OAuth client does not support id_token."}

      (let [verified-jwt (verify-jwt {:jwks-uri (:jwks-uri this)
                                      :jwt jwt})
            ;; verify lets us know that the jwk was issued by
            ;; e.g. google but we still need to make sure it was
            ;; issued by our client and has all of the fields we need
            ;; https://developers.google.com/identity/sign-in/ios/backend-auth#verify-the-integrity-of-the-id-token
            issuer-mismatch (not= (.getIssuer verified-jwt)
                                  (:issuer this))
            unsupported-alg (not (contains? (:id-token-signing-alg-values-supported this)
                                            (.getAlgorithm verified-jwt)))
            client-id-mismatch (and (not ignore-audience?)
                                    (not (contains? (set (.getAudience verified-jwt))
                                                    (:client-id this))))
            sub (.getSubject verified-jwt)
            email-verified (.asBoolean (.getClaim verified-jwt "email_verified"))
            email (.asString (.getClaim verified-jwt "email"))

            jwt-nonce (.asString (.getClaim verified-jwt "nonce"))
            nonce-error (cond (= jwt-nonce nonce)
                              nil

                              (and (string/blank? jwt-nonce)
                                   (not (string/blank? nonce)))
                              "The id_token is missing a nonce."

                              (and (string/blank? nonce)
                                   (not (string/blank? jwt-nonce)))
                              "The nonce parameter was not provided in the request."

                              :else "The nonces do not match.")

            error (cond
                    nonce-error nonce-error
                    issuer-mismatch (str "The id_token wasn't issued by " (:issuer this))
                    unsupported-alg "The id_token used an unsupported algorithm."
                    client-id-mismatch "The id_token was generated for the wrong OAuth client."
                    (and (not allow-unverified-email?)
                         (not email-verified)) "The email address is not verified."
                    (not email) "The id_token had no email."
                    (not sub) "The id_token had no subject."
                    :else nil)]
        (if error
          {:type :error :message error}
          {:type :success :email email :sub sub})))))

;; Map of endpoint to JSON results
;; {"google.com/.well-known/..." {:data {...}, :date #obj[java.time.Instant...]}
(defonce discovery-endpoint-cache (cache/lru-cache-factory {} :threshold 32))

(defn fetch-discovery [endpoint]
  (let [resp (clj-http/get endpoint {:throw-exceptions false
                                     :as :json})]
    (if (clj-http/success? resp)
      {:date (Instant/now)
       :data (:body resp)}
      (throw (ex-info "Unable to fetch OAuth configuration."
                      {:type :oauth-error :message "Unable to fetch OAuth configuration."})))))

(defn get-discovery [endpoint]
  (:data (cache/lookup-or-miss discovery-endpoint-cache endpoint fetch-discovery)))

(defn generic-oauth-client-from-discovery-url [{:keys [app-id
                                                       provider-id
                                                       client-id ^Secret
                                                       client-secret
                                                       discovery-endpoint]}]
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
                                                                       (set id_token_signing_alg_values_supported))})))

(def schedule nil)

(defn start []
  (tracer/record-info! {:name "oauth/start"})
  (try
    ;; Initialize with Google
    (get-discovery "https://accounts.google.com/.well-known/openid-configuration")
    (catch Exception e
      (tracer/record-exception-span! e {:name "oauth/start-error"})))
  (tracer/record-info! {:name "oauth/start-refresh-worker"})
  (def schedule (chime-core/chime-at (-> (chime-core/periodic-seq (Instant/now) (Duration/ofHours 1))
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
  (when schedule
    (.close schedule)))

(defn restart []
  (stop)
  (start))


(comment
  (fetch-discovery "https://accounts.google.com/.well-known/openid-configuration")
  (fetch-discovery "https://accounts.google.com/.well-known/openid-configuration")

  (restart)
  discovery-endpoint-cache)
