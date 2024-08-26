(ns instant.model.instant-oauth-redirect
  (:require [instant.jdbc.aurora :as aurora]
            [instant.jdbc.sql :as sql]
            [instant.util.crypt :as crypt-util])
  (:import
   (java.time Instant)
   (java.time.temporal ChronoUnit)))

(defn create!
  ([params] (create! aurora/conn-pool params))
  ([conn {:keys [state cookie service redirect-path redirect-to-dev ticket]}]
   (sql/execute-one!
    conn
    ["INSERT INTO instant_oauth_redirects (lookup_key, state, cookie, service, redirect_path, redirect_to_dev, ticket)
                         VALUES (?::bytea, ?::uuid, ?::uuid, ?, ?, ?, ?::uuid)"
     (crypt-util/uuid->sha256 state), state, cookie, service, redirect-path redirect-to-dev ticket])))

(defn consume!
  "Gets and deletes the oauth-redirect so that it can be used only once."
  ([params] (consume! aurora/conn-pool params))
  ([conn {:keys [state]}]
   (sql/execute-one! conn
                     ["DELETE FROM instant_oauth_redirects where lookup_key = ?::bytea"
                      (crypt-util/uuid->sha256 state)])))

;; Don't add more get functions. We lookup by state because we can lookup a hashed version
;; of state in the db to prevent timing attacks.

(defn expired?
  ([oauth-redirect] (expired? (Instant/now) oauth-redirect))
  ([now {created-at :created_at}]
   (> (.between ChronoUnit/MINUTES (.toInstant created-at) now) 10)))
