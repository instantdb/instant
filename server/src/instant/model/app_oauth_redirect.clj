(ns instant.model.app-oauth-redirect
  (:require [instant.jdbc.aurora :as aurora]
            [instant.jdbc.sql :as sql]
            [instant.util.crypt :as crypt-util])
  (:import
   (java.time Instant)
   (java.time.temporal ChronoUnit)))

(defn create!
  ([params] (create! aurora/conn-pool params))
  ([conn {:keys [state cookie redirect-url oauth-client-id
                 code-challenge-method code-challenge]}]
   (sql/execute-one!
    conn
    ["INSERT INTO app_oauth_redirects (
       lookup_key,
        state,
        cookie,
        redirect_url,
        client_id,
        code_challenge_method,
        code_challenge
      ) VALUES (?::bytea, ?::uuid, ?::uuid, ?, ?::uuid, ?, ?)"
     (crypt-util/uuid->sha256 state)
     state
     cookie
     redirect-url
     oauth-client-id
     code-challenge-method
     code-challenge])))

(defn consume!
  "Gets and deletes the oauth-redirect so that it can be used only once."
  ([params] (consume! aurora/conn-pool params))
  ([conn {:keys [state]}]
   (sql/execute-one! conn
                     ["DELETE FROM app_oauth_redirects where lookup_key = ?::bytea"
                      (crypt-util/uuid->sha256 state)])))

;; Don't add more get functions. We lookup by state because we can lookup a hashed version
;; of state in the db to prevent timing attacks.

(defn expired?
  ([oauth-redirect] (expired? (Instant/now) oauth-redirect))
  ([now {created-at :created_at}]
   (> (.between ChronoUnit/MINUTES (.toInstant created-at) now) 10)))
