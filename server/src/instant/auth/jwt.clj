(ns instant.auth.jwt
  (:require
   [chime.core :as chime-core]
   [clj-http.client :as clj-http]
   [clojure.core.cache.wrapped :as cache]
   [instant.util.exception :as ex]
   [instant.util.lang :as lang]
   [instant.util.tracer :as tracer])
  (:import
   (com.auth0.jwk Jwk SigningKeyNotFoundException)
   (com.auth0.jwt JWT)
   (com.auth0.jwt.algorithms Algorithm)
   (com.auth0.jwt.exceptions AlgorithmMismatchException JWTDecodeException SignatureVerificationException TokenExpiredException)
   (com.auth0.jwt.interfaces DecodedJWT ECDSAKeyProvider JWTVerifier RSAKeyProvider)
   (java.security KeyFactory)
   (java.security.spec PKCS8EncodedKeySpec)
   (java.text SimpleDateFormat)
   (java.time Duration Instant)
   (java.time.temporal ChronoUnit)
   (org.bouncycastle.util.io.pem PemReader)))

(def ^SimpleDateFormat rfc822-format
  (SimpleDateFormat. "EEE, dd MMM yyyy HH:mm:ss Z" java.util.Locale/US))

(defn parse-rfc822 [^String s]
  (.toInstant (.parse rfc822-format s)))

(defn- get-keys [jwks-uri]
  (tracer/with-span! {:name "jwt/get-keys"
                      :jwks-uri jwks-uri}
    (let [resp (clj-http/get jwks-uri {:as :json-string-keys})
          expires (if-let [expires-header (get-in resp [:headers "expires"])]
                    (parse-rfc822 expires-header)
                    (if-let [max-age (some-> resp
                                             (get-in [:headers "cache-control"])
                                             (#(re-find #"max-age=(\d+)" %))
                                             second)]
                      (.plus (Instant/now)
                             (Integer/parseInt max-age) ChronoUnit/SECONDS)
                      (tracer/with-span! {:name "jwk/no-expires-header"
                                          :attributes {:jwks-uri jwks-uri}}
                        ;; Just set it to one hour if there is no expires header
                        (.plus (Instant/now) 1 ChronoUnit/HOURS))))
          body-keys (let [keys (get-in resp [:body "keys"])]
                      (if (< 100 (count keys))
                        (tracer/with-span!
                          {:name "jwk/too-many-keys"
                           :attributes {:jwks-uri jwks-uri
                                        :count (count keys)}}
                          (take 100 keys))
                        keys))
          keys (map (fn [json] (Jwk/fromValues json))
                    body-keys)]
      {:expires expires
       :keys keys})))

(defonce keys-cache
  (cache/lru-cache-factory {} :threshold 32))

(defn find-key [{:keys [jwks-uri key-id no-recur]}]
  (let [{:keys [keys expires]} (cache/lookup-or-miss keys-cache jwks-uri get-keys)]
    (if-let [key (first (filter #(= key-id (Jwk/.getId %)) keys))]
      key
      ;; If we're close to cache expiry, try refreshing the cache
      (if (and (not no-recur)
               (> 120 (.getSeconds (Duration/between (Instant/now) expires))))
        (do
          (cache/evict keys-cache jwks-uri)
          (find-key {:jwks-uri jwks-uri :key-id key-id :no-recur true}))
        (throw (SigningKeyNotFoundException.
                (str "No key found in " jwks-uri " with kid " key-id)
                nil))))))

(defn- refresh-cached-keys [jwks-uri]
  (let [data (get-keys jwks-uri)]
    (swap! keys-cache assoc jwks-uri data)))

(defn- get-alg [jwt]
  (.getAlgorithm (JWT/decode jwt)))

(defn- get-verifier ^JWTVerifier [{:keys [jwks-uri jwt]}]
  (let [alg (get-alg jwt)
        get-public-key (fn get-public-key [kid]
                         (let [k (try
                                   (find-key {:jwks-uri jwks-uri :key-id kid})
                                   (catch Exception e
                                     (throw (SigningKeyNotFoundException.
                                             (str "Error searching " jwks-uri " for kid " kid)
                                             e))))]
                           (Jwk/.getPublicKey k)))
        algorithm (case alg
                    "RS256" (Algorithm/RSA256
                             (proxy [RSAKeyProvider] []
                               (getPublicKeyById [kid] (get-public-key kid))))
                    "ES256" (Algorithm/ECDSA256
                             (proxy [ECDSAKeyProvider] []
                               (getPublicKeyById [kid] (get-public-key kid))))
                    (ex/throw-oauth-err! (str "Unsupported signing algorithm " alg)))]
    (.build (JWT/require algorithm))))

(defn verify-jwt ^DecodedJWT [{:keys [jwks-uri ^String jwt]}]
  (try
    (.verify (get-verifier {:jwks-uri jwks-uri :jwt jwt})
             jwt)
    (catch SigningKeyNotFoundException e
      (ex/throw-oauth-err! "Error validating JWT. Could not find signing key."
                           e))
    (catch AlgorithmMismatchException e
      (ex/throw-oauth-err! "Error validating JWT. Algorithm Mismatch"
                           e))
    (catch SignatureVerificationException e
      (ex/throw-oauth-err! "Error validating JWT. Signature is invalid."
                           e))
    (catch TokenExpiredException e
      (ex/throw-oauth-err! "Error validating JWT. Token is expired."
                           e))
    (catch JWTDecodeException e
      (ex/throw-oauth-err! "Invalid JWT."
                           e))))

(defn apple-client-secret [{:keys [client-id team-id key-id private-key]}]
  (let [pk (-> (java.io.StringReader. private-key)
               (PemReader.)
               (.readPemObject)
               (.getContent)
               (PKCS8EncodedKeySpec.)
               (->> (.generatePrivate (KeyFactory/getInstance "EC"))))
        algorithm (Algorithm/ECDSA256 nil pk)]
    (-> (JWT/create)
        ;; payload
        (.withIssuer team-id)
        (.withIssuedAt (java.time.Instant/now))
        (.withExpiresAt (.plusSeconds (java.time.Instant/now) 120))
        (.withAudience (into-array String ["https://appleid.apple.com"]))
        (.withSubject client-id)
        ;; header
        (.withKeyId key-id)
        ;; sign
        (.sign algorithm))))

(def schedule nil)

(defn start []
  (tracer/record-info! {:name "jwk/start-cert-cache"})
  (try
    ;; Initialize with Google
    (refresh-cached-keys "https://www.googleapis.com/oauth2/v3/certs")
    (catch Exception e
      (tracer/record-exception-span! e {:name "jwk/start-error"})))
  (tracer/record-info! {:name "jwk/start-cert-refresh"})
  (def schedule
    (chime-core/chime-at
     (-> (chime-core/periodic-seq (Instant/now) (Duration/ofHours 1))
         rest)
     (fn [_time]
       (for [[endpoint {:keys [expires]}] @keys-cache
             :when (> 65 (.toMinutes (Duration/between (Instant/now) expires)))]
         (tracer/with-span! {:name "jwk/updating-certs"
                             :endpoint endpoint}
           (try
             (refresh-cached-keys endpoint)
             (catch Exception e
               (tracer/record-exception-span! e {:name "jwk/update-certs-error"})))))))))

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
  (get-keys "https://www.googleapis.com/oauth2/v3/certs")
  (get-keys "https://appleid.apple.com/auth/keys")
  (.getSubject (verify-jwt {:jwks-uri "https://www.facebook.com/.well-known/oauth/openid/jwks/" ;; "https://www.googleapis.com/oauth2/v3/certs";;;;
                            :jwt "YOUR_ID_TOKEN_HERE"})))
