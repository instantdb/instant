(ns instant.model.app-oauth-code
  (:require [instant.jdbc.aurora :as aurora]
            [instant.jdbc.sql :as sql]
            [instant.system-catalog-ops :refer [update-op]]
            [instant.util.crypt :as crypt-util]
            [instant.util.exception :as ex])
  (:import
   (java.time Instant)
   (java.time.temporal ChronoUnit)
   (java.util Base64)))

(def etype "$oauth-codes")

(defn create!
  ([params] (create! aurora/conn-pool params))
  ([conn {:keys [code
                 user-id
                 app-id
                 code-challenge-method
                 code-challenge
                 code-challenge-hash]}]
   (update-op
    conn
    {:app-id app-id
     :etype etype
     :legacy-op
     (fn [conn]
       (sql/execute-one!
        conn
        ["INSERT INTO app_oauth_codes (
            lookup_key, user_id, app_id, code_challenge_method, code_challenge
          ) VALUES (?::bytea, ?::uuid, ?::uuid, ?, ?)"
         (crypt-util/uuid->sha256 code) user-id app-id
         code-challenge-method code-challenge]))
     :triples-op
     (fn [{:keys [resolve-id transact! get-entity]}]
       (let [eid (random-uuid)
             code-hash (-> code
                           crypt-util/uuid->sha256
                           crypt-util/bytes->hex-string)
             challenge-hash (or code-challenge-hash
                                (when code-challenge
                                  (crypt-util/str->sha256 code-challenge)))]
         (transact! [[:add-triple eid (resolve-id :id) eid]
                     [:add-triple eid (resolve-id :code-hash) code-hash]
                     [:add-triple eid (resolve-id :$user) user-id]
                     [:add-triple eid (resolve-id :code-challenge-method) code-challenge-method]
                     [:add-triple eid (resolve-id :code-challenge-hash) challenge-hash]])
         (get-entity eid)))})))

;; XXX: TEST
(defn verify-pkce!
  "Verifies that the code verifier matches the code challenge, if it was
   provided at the start of the OAuth flow.

   Returns the oauth-code if verification succeeded, throws a validation error
   if it fails

   See https://www.oauth.com/oauth2-servers/pkce/authorization-request/"
  [{:keys [code_challenge code_challenge_method code_challenge_hash] :as oauth-code}
   verifier]
  (let [challenge-hash (or (when code_challenge_hash
                             (crypt-util/hex-string->bytes code_challenge_hash))
                           (when code_challenge
                             (-> code_challenge
                                 (crypt-util/str->sha256))))]
    (cond
      (and (not challenge-hash) (not verifier))
      oauth-code

      (and verifier (not challenge-hash))
      (ex/throw-validation-err! :app-oauth-code oauth-code
                                [{:message "The code_verifier was provided, but no code_challenge was provided."}])

      (and (not verifier) challenge-hash)
      (ex/throw-validation-err! :app-oauth-code oauth-code
                                [{:message "The code_challenge was provided, but no code_verifier was provided."}])

      :else
      (case code_challenge_method
        "plain" (if (crypt-util/constant-bytes= (crypt-util/str->sha256 verifier)
                                                challenge-hash)
                  oauth-code
                  (ex/throw-validation-err! :app-oauth-code oauth-code
                                            [{:message "The code_challenge and code_verifier do not match."}]))

        "S256" (try
                 (let [verifier-bytes (->> verifier
                                           crypt-util/str->sha256
                                           (.encode (Base64/getUrlEncoder)) ;; XXX: do we need this?
                                           crypt-util/bytes->sha256)]
                   (if (crypt-util/constant-bytes= verifier-bytes challenge-hash)
                     oauth-code
                     (ex/throw-validation-err! :app-oauth-code oauth-code
                                               [{:message "The code_challenge and code_verifier do not match."}])))
                 (catch IllegalArgumentException _e
                   (ex/throw-validation-err! :app-oauth-code oauth-code
                                             [{:message "Invalid code_verifier. Expected a url-safe Base64 string."}])))

        (ex/throw-validation-err! :app-oauth-code
                                  oauth-code
                                  [{:message "Unknown code challenge method."}])))))

(defn expired?
  ([oauth-redirect] (expired? (Instant/now) oauth-redirect))
  ([now {created-at :created_at}]
   (> (.between ChronoUnit/MINUTES (.toInstant created-at) now) 5)))

(defn consume!
  "Gets and deletes the oauth-code so that it can be used only once."
  ([params] (consume! aurora/conn-pool params))
  ([conn {:keys [code app-id verifier] :as params}]
   (let [oauth-code
         (update-op
          conn
          {:app-id app-id
           :etype etype
           :legacy-op
           (fn [conn]
             (sql/execute-one! conn
                               ["delete from app_oauth_codes
                                  where lookup_key = ?::bytea
                                   and app_id = ?::uuid"
                                (crypt-util/uuid->sha256 code)
                                app-id]))
           :triples-op
           (fn [{:keys [delete-entity! resolve-id]}]
             (let [code-hash (-> code
                                 crypt-util/uuid->sha256
                                 crypt-util/bytes->hex-string)]
               (delete-entity! [(resolve-id :code-hash) code-hash])))})]
     (ex/assert-record! oauth-code :app-oauth-code {:args [params]})
     (when (expired? oauth-code)
       (ex/throw-expiration-err! :app-oauth-code {:args [params]}))
     (verify-pkce! oauth-code verifier))))

;; Don't add more get functions. We use lookup by code because we can lookup a hashed version
;; of the code in the db to prevent timing attacks.
