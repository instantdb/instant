(ns instant.model.app-oauth-code
  (:require [instant.auth.oauth :refer [verify-pkce!]]
            [instant.jdbc.aurora :as aurora]
            [instant.system-catalog-ops :refer [update-op]]
            [instant.util.crypt :as crypt-util]
            [instant.util.exception :as ex])
  (:import
   (java.time Instant)
   (java.time.temporal ChronoUnit)
   (java.util Date)))

(def etype "$oauthCodes")

(defn create!
  ([params] (create! (aurora/conn-pool :write) params))
  ([conn {:keys [code
                 user-id
                 app-id
                 code-challenge-method
                 code-challenge]}]
   (update-op
    conn
    {:app-id app-id
     :etype etype}
    (fn [{:keys [resolve-id transact! get-entity]}]
      (let [eid (random-uuid)
            code-hash (-> code
                          crypt-util/uuid->sha256
                          crypt-util/bytes->hex-string)]
        (transact! [[:add-triple eid (resolve-id :id) eid]
                    [:add-triple eid (resolve-id :codeHash) code-hash]
                    [:add-triple eid (resolve-id :$user) user-id]
                    [:add-triple eid (resolve-id :codeChallengeMethod) code-challenge-method]
                    [:add-triple eid (resolve-id :codeChallenge) code-challenge]])
        (get-entity eid))))))

(defn expired?
  ([oauth-redirect] (expired? (Instant/now) oauth-redirect))
  ([now {created-at :created_at}]
   (> (.between ChronoUnit/MINUTES (Date/.toInstant created-at) now) 5)))

(defn consume!
  "Gets and deletes the oauth-code so that it can be used only once."
  ([params] (consume! (aurora/conn-pool :write) params))
  ([conn {:keys [code app-id verifier] :as params}]
   (let [oauth-code
         (update-op
          conn
          {:app-id app-id
           :etype etype}
          (fn [{:keys [delete-entity! resolve-id]}]
            (let [code-hash (-> code
                                crypt-util/uuid->sha256
                                crypt-util/bytes->hex-string)]
              (delete-entity! [(resolve-id :codeHash) code-hash]))))]
     (ex/assert-record! oauth-code :app-oauth-code {:args [params]})
     (when (expired? oauth-code)
       (ex/throw-expiration-err! :app-oauth-code {:args [params]}))
     (verify-pkce! :app-oauth-code oauth-code verifier))))

;; Don't add more get functions. We use lookup by code because we can lookup a hashed version
;; of the code in the db to prevent timing attacks.
