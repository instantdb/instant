(ns instant.webhook-jwt
  (:require
   [instant.isn :as isn]
   [instant.config :as config]
   [instant.util.crypt :as crypt]
   [instant.util.exception :as ex])
  (:import
   (com.google.crypto.tink PublicKeySign PublicKeySign PublicKeyVerify)
   (com.nimbusds.jose JOSEObjectType JWSAlgorithm JWSHeader$Builder JWSSigner JWSVerifier)
   (com.nimbusds.jose.jca JCAContext)
   (com.nimbusds.jose.util Base64URL)
   (com.nimbusds.jwt JWTClaimNames JWTClaimsSet$Builder SignedJWT)
   (com.nimbusds.jwt.proc BadJWTException DefaultJWTClaimsVerifier)
   (java.security GeneralSecurityException)
   (java.time Instant)
   (java.util Collections Date HashSet)))

(defn- sign ^Base64URL [^bytes signing-input]
  (let [^PublicKeySign signer (crypt/get-sign-primitive (config/webhook-signing-key))
        ^bytes signature-bytes (.sign signer signing-input)]
    (Base64URL/encode signature-bytes)))

(def ^{:tag 'JWSSigner} tink-signer
  (reify JWSSigner
    (supportedJWSAlgorithms [_]
      (Collections/singleton JWSAlgorithm/EdDSA))
    (getJCAContext [_]
      (JCAContext.))
    (sign [_  _header signing-input]
      (sign signing-input))))

(defn- verify [^bytes signed-content ^Base64URL signature]
  (let [^PublicKeyVerify verifier (crypt/get-verify-primitive (config/webhook-public-key))]
    (.verify verifier (.decode signature) signed-content)))

(def ^{:tag 'JWSVerifier} tink-verifier
  "Wraps a Tink KeysetHandle (containing a public key) into a Nimbus JWSVerifier."
  (reify JWSVerifier
    (supportedJWSAlgorithms [_]
      (Collections/singleton JWSAlgorithm/EdDSA))
    (getJCAContext [_]
      (JCAContext.))
    (verify [_  _header signed-content signature]
      (try
        (verify signed-content signature)
        true
        (catch GeneralSecurityException _
          false)))))

(def header (delay (-> (JWSHeader$Builder. JWSAlgorithm/EdDSA)
                       (.type JOSEObjectType/JWT)
                       (.keyID (-> (config/webhook-public-key)
                                   (.getKeysetInfo)
                                   (.getPrimaryKeyId)
                                   (str)))
                       (.build))))

(defn webhook-payload-jwt
  "Generates a jwt that the webhook receiver can use to fetch the webhook
   payload."
  ^String [{:keys [app-id webhook-id isn]}]
  (let [claims (-> (JWTClaimsSet$Builder.)
                   (.issuer config/server-origin)
                   (.subject (str app-id))
                   ;; 1 hour
                   (.expirationTime (Date/from (.plusSeconds (Instant/now) 3600))) ; xxx
                   (.claim "webhook-id" (str webhook-id))
                   (.claim "app-id" (str app-id))
                   (.claim "isn" (str isn))
                   (.build))
        ^SignedJWT signed-jwt (SignedJWT. @header claims)]
    (.sign signed-jwt tink-signer)
    (.serialize signed-jwt)))

(def required-claims (doto (HashSet.)
                       (.add JWTClaimNames/EXPIRATION_TIME)))

(defn verify-webhook-payload-jwt
  "Verifies that we signed the jwt, it's not expired, and that the claims match
   the given claims.
   Returns {:app-id, :webhook-id, :isn}"
  [^String token-string {:keys [app-id webhook-id isn] :as _claims}]
  (let [^SignedJWT parsed-jwt (SignedJWT/parse token-string)]
    (if-not (.verify parsed-jwt tink-verifier)
      (ex/throw-validation-err! :jwt token-string [{:message "Invalid JWT."}])
      (let [claims-verifier (DefaultJWTClaimsVerifier. (-> (JWTClaimsSet$Builder.)
                                                           (.issuer config/server-origin)
                                                           (.subject (str app-id))
                                                           (.claim "webhook-id" (str webhook-id))
                                                           (.claim "app-id" (str app-id))
                                                           (.claim "isn" (str isn))
                                                           (.build))
                                                       nil)
            claims (.getJWTClaimsSet parsed-jwt)]
        (try
          (.verify claims-verifier claims nil)
          {:app-id (parse-uuid (.getStringClaim claims "app-id"))
           :webhook-id (parse-uuid (.getStringClaim claims "webhook-id"))
           :isn (isn/of-string (.getStringClaim claims "isn"))}
          (catch BadJWTException e
            (ex/throw-validation-err! :jwt token-string [{:message (.getMessage e)}])))))))
