(ns instant.model.app-oauth-redirect
  (:require [instant.jdbc.aurora :as aurora]
            [instant.system-catalog-ops :refer [update-op]]
            [instant.util.crypt :as crypt-util])
  (:import
   (java.time Instant)
   (java.time.temporal ChronoUnit)
   (java.util Date)))

(def etype "$oauthRedirects")

(defn hash-uuid [uuid]
  (-> uuid
      (crypt-util/uuid->sha256)
      (crypt-util/bytes->hex-string)))

(defn create!
  ([params] (create! (aurora/conn-pool :write) params))
  ([conn {:keys [app-id state cookie redirect-url oauth-client-id
                 code-challenge-method code-challenge]}]
   (update-op
    conn
    {:app-id app-id
     :etype etype}
    (fn [{:keys [transact! resolve-id get-entity]}]
      (let [eid (random-uuid)]
        (transact! [[:add-triple eid (resolve-id :id) eid]
                    [:add-triple eid (resolve-id :stateHash) (hash-uuid state)]
                    [:add-triple eid (resolve-id :cookieHash) (hash-uuid cookie)]
                    [:add-triple eid (resolve-id :redirectUrl) redirect-url]
                    [:add-triple eid (resolve-id :$oauthClient) oauth-client-id]
                    [:add-triple eid (resolve-id :codeChallengeMethod) code-challenge-method]
                    [:add-triple eid (resolve-id :codeChallenge) code-challenge]])
        (get-entity eid))))))

(defn consume!
  "Gets and deletes the oauth-redirect so that it can be used only once."
  ([params] (consume! (aurora/conn-pool :write) params))
  ([conn {:keys [state app-id]}]
   (update-op
    conn
    {:app-id app-id
     :etype etype}
    (fn [{:keys [delete-entity! resolve-id]}]
      (let [state-hash (-> state
                           (crypt-util/uuid->sha256)
                           (crypt-util/bytes->hex-string))
            lookup [(resolve-id :stateHash) state-hash]
            row (delete-entity! lookup)]
        (when row
          (assoc row :cookie-hash-bytes (crypt-util/hex-string->bytes (:cookieHash row)))))))))

;; Don't add more get functions. We lookup by state because we can lookup a hashed version
;; of state in the db to prevent timing attacks.

(defn expired?
  ([oauth-redirect] (expired? (Instant/now) oauth-redirect))
  ([now {created-at :created_at}]
   (> (.between ChronoUnit/MINUTES (Date/.toInstant created-at) now) 10)))
