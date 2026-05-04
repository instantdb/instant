(ns instant.webhook-jwt-test
  (:require
   [clojure.test :refer [deftest is]]
   [instant.config :as config]
   [instant.isn :as isn]
   [instant.util.exception :as ex]
   [instant.util.test :as test-util]
   [instant.webhook-jwt :as webhook-jwt])
  (:import
   (com.nimbusds.jwt JWTClaimsSet$Builder SignedJWT)
   (java.time Instant)
   (java.util Date)))

(deftest webhook-payload-jwt-round-trips
  (let [app-id (random-uuid)
        webhook-id (random-uuid)
        isn (isn/test-isn 1)
        token (webhook-jwt/webhook-payload-jwt app-id
                                               webhook-id
                                               isn)]
    (is (= {:app-id app-id
            :webhook-id webhook-id
            :isn isn}
           (webhook-jwt/verify-webhook-payload-jwt
            token
            {:app-id app-id
             :webhook-id webhook-id
             :isn isn})))))

(deftest webhook-payload-jwt-rejects-mismatched-claims
  (let [app-id (random-uuid)
        webhook-id (random-uuid)
        isn (isn/test-isn 1)
        token (webhook-jwt/webhook-payload-jwt app-id
                                               webhook-id
                                               isn)]
    (is (= ::ex/validation-failed
           (-> (test-util/instant-ex-data
                (webhook-jwt/verify-webhook-payload-jwt
                 token
                 {:app-id (random-uuid)
                  :webhook-id webhook-id
                  :isn isn}))
               ::ex/type)))
    (is (= ::ex/validation-failed
           (-> (test-util/instant-ex-data
                (webhook-jwt/verify-webhook-payload-jwt
                 token
                 {:app-id app-id
                  :webhook-id (random-uuid)
                  :isn isn}))
               ::ex/type)))
    (is (= ::ex/validation-failed
           (-> (test-util/instant-ex-data
                (webhook-jwt/verify-webhook-payload-jwt
                 token
                 {:app-id app-id
                  :webhook-id webhook-id
                  :isn (isn/test-isn 2)}))
               ::ex/type)))))

(deftest webhook-payload-jwt-rejects-malformed-token
  (is (= ::ex/validation-failed
         (-> (test-util/instant-ex-data
              (webhook-jwt/verify-webhook-payload-jwt
               "not-a-jwt"
               {:app-id (random-uuid)
                :webhook-id (random-uuid)
                :isn (isn/test-isn 1)}))
             ::ex/type))))

(deftest webhook-payload-jwt-rejects-expired-token
  (let [app-id (random-uuid)
        webhook-id (random-uuid)
        isn (isn/test-isn 1)
        expired-claims (-> (JWTClaimsSet$Builder.)
                           (.issuer config/server-origin)
                           (.subject (str app-id))
                           (.expirationTime (Date/from (.minusSeconds (Instant/now) 3600)))
                           (.claim "app-id" (str app-id))
                           (.claim "webhook-id" (str webhook-id))
                           (.claim "isn" (str isn))
                           (.build))
        signed-jwt (SignedJWT. @webhook-jwt/header expired-claims)
        _ (.sign signed-jwt webhook-jwt/tink-signer)
        token (.serialize signed-jwt)]
    (is (= ::ex/validation-failed
           (-> (test-util/instant-ex-data
                (webhook-jwt/verify-webhook-payload-jwt
                 token
                 {:app-id app-id
                  :webhook-id webhook-id
                  :isn isn}))
               ::ex/type)))))

(deftest webhook-payload-jwt-rejects-tampered-token
  (let [claims {:app-id (random-uuid)
                :webhook-id (random-uuid)
                :isn (isn/test-isn 1)}
        token (webhook-jwt/webhook-payload-jwt (:app-id claims)
                                               (:webhook-id claims)
                                               (:isn claims))
        ;; Flip the first character of the signature.
        sig-start (inc (.lastIndexOf token (int \.)))
        c (.charAt token sig-start)
        replacement (if (= c \A) \B \A)
        tampered (str (subs token 0 sig-start)
                      replacement
                      (subs token (inc sig-start)))]
    (is (= ::ex/validation-failed
           (-> (test-util/instant-ex-data
                (webhook-jwt/verify-webhook-payload-jwt tampered claims))
               ::ex/type)))))
