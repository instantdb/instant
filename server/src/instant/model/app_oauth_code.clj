(ns instant.model.app-oauth-code
  (:require [instant.jdbc.aurora :as aurora]
            [instant.jdbc.sql :as sql]
            [instant.util.crypt :as crypt-util]
            [instant.util.exception :as ex])
  (:import
   (java.time Instant)
   (java.time.temporal ChronoUnit)
   (java.util Base64)))

(defn create!
  ([params] (create! aurora/conn-pool params))
  ([conn {:keys [code user-id app-id
                 code-challenge-method code-challenge]}]
   (sql/execute-one!
    conn
    ["INSERT INTO app_oauth_codes (
        lookup_key, user_id, app_id, code_challenge_method, code_challenge
      ) VALUES (?::bytea, ?::uuid, ?::uuid, ?, ?)"
     (crypt-util/uuid->sha256 code) user-id app-id
     code-challenge-method code-challenge])))

(defn verify-pkce!
  "Verifies that the code verifier matches the code challenge, if it was
   provided at the start of the OAuth flow.

   Returns the oauth-code if verification succeeded, throws a validation error 
   if it fails 

   See https://www.oauth.com/oauth2-servers/pkce/authorization-request/"
  [{:keys [code_challenge code_challenge_method] :as oauth-code}
   verifier]
  (cond
    (and (not code_challenge) (not verifier))
    oauth-code

    (and verifier (not code_challenge))
    (ex/throw-validation-err! :app-oauth-code oauth-code
                              [{:message "The code_verifier was provided, but no code_challenge was provided."}])

    (and (not verifier) code_challenge)
    (ex/throw-validation-err! :app-oauth-code oauth-code
                              [{:message "The code_challenge was provided, but no code_verifier was provided."}])

    :else
    (case code_challenge_method
      "plain" (if (crypt-util/constant-string= verifier code_challenge)
                oauth-code
                (ex/throw-validation-err! :app-oauth-code oauth-code
                                          [{:message "The code_challenge and code_verifier do not match."}]))

      "S256" (try
               (let [verifier-bytes (crypt-util/str->sha256 verifier)
                     challenge-bytes (.decode (Base64/getUrlDecoder)
                                              code_challenge)]
                 (if (crypt-util/constant-bytes= verifier-bytes
                                                 challenge-bytes)
                   oauth-code
                   (ex/throw-validation-err! :app-oauth-code oauth-code
                                             [{:message "The code_challenge and code_verifier do not match."}])))
               (catch IllegalArgumentException _e
                 (ex/throw-validation-err! :app-oauth-code oauth-code
                                           [{:message "Invalid code_verifier. Expected a url-safe Base64 string."}])))

      (ex/throw-validation-err! :app-oauth-code
                                oauth-code
                                [{:message "Unknown code challenge method."}]))))

(defn expired?
  ([oauth-redirect] (expired? (Instant/now) oauth-redirect))
  ([now {created-at :created_at}]
   (> (.between ChronoUnit/MINUTES (.toInstant created-at) now) 5)))

(defn consume!
  "Gets and deletes the oauth-code so that it can be used only once."
  ([params] (consume! aurora/conn-pool params))
  ([conn {:keys [code app-id verifier] :as params}]
   (let [oauth-code (sql/execute-one! conn
                                      ["DELETE FROM app_oauth_codes
                                              where lookup_key = ?::bytea
                                               and app_id = ?::uuid"
                                       (crypt-util/uuid->sha256 code)
                                       app-id])]
     (ex/assert-record! oauth-code :app-oauth-code {:args [params]})
     (when (expired? oauth-code)
       (ex/throw-expiration-err! :app-oauth-code {:args [params]}))
     (verify-pkce! oauth-code verifier))))

;; Don't add more get functions. We use lookup by code because we can lookup a hashed version
;; of the code in the db to prevent timing attacks.


