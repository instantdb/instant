(ns instant.webhook-jwt-test
  (:require
   [clojure.test :refer [deftest is]]
   [instant.isn :as isn]
   [instant.util.exception :as ex]
   [instant.util.test :as test-util]
   [instant.webhook-jwt :as webhook-jwt]))

(deftest webhook-payload-jwt-round-trips
  (let [app-id (random-uuid)
        webhook-id (random-uuid)
        isn (isn/test-isn 1)
        token (webhook-jwt/webhook-payload-jwt
               {:app-id app-id
                :webhook-id webhook-id
                :isn isn})]
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
        token (webhook-jwt/webhook-payload-jwt
               {:app-id app-id
                :webhook-id webhook-id
                :isn isn})]
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

(deftest webhook-payload-jwt-rejects-tampered-token
  (let [claims {:app-id (random-uuid)
                :webhook-id (random-uuid)
                :isn (isn/test-isn 1)}
        token (webhook-jwt/webhook-payload-jwt claims)
        ;; Flip the last character of the signature segment to break verification.
        last-char (.charAt token (dec (count token)))
        replacement (if (= last-char \A) \B \A)
        tampered (str (subs token 0 (dec (count token))) replacement)]
    (is (= ::ex/validation-failed
           (-> (test-util/instant-ex-data
                (webhook-jwt/verify-webhook-payload-jwt tampered claims))
               ::ex/type)))))
