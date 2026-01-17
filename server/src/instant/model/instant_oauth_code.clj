(ns instant.model.instant-oauth-code
  (:require [instant.jdbc.aurora :as aurora]
            [instant.jdbc.sql :as sql]
            [instant.util.crypt :as crypt-util]
            [instant.util.exception :as ex])
  (:import
   (java.time Instant)
   (java.time.temporal ChronoUnit)
   (java.util Date)))

(defn create!
  ([params] (create! (aurora/conn-pool :write) params))
  ([conn {:keys [code user-id redirect-path]}]
   (sql/execute-one! conn
                     ["INSERT INTO instant_oauth_codes (lookup_key, user_id, redirect_path)
                         VALUES (?::bytea, ?::uuid, ?)"
                      (crypt-util/uuid->sha256 code), user-id, redirect-path])))

(defn expired?
  ([oauth-redirect] (expired? (Instant/now) oauth-redirect))
  ([now {created-at :created_at}]
   (> (.between ChronoUnit/MINUTES (Date/.toInstant created-at) now) 5)))

(defn consume!
  "Gets and deletes the oauth-code so that it can be used only once."
  ([params] (consume! (aurora/conn-pool :write) params))
  ([conn {:keys [code] :as params}]
   (let [record  (sql/execute-one! conn
                                   ["DELETE FROM instant_oauth_codes where lookup_key = ?::bytea"
                                    (crypt-util/uuid->sha256 code)])]
     (ex/assert-record! record :instant-oauth-code {:args [params]})
     (when (expired? record)
       (ex/throw-expiration-err! :instant-oauth-code {:args [params]}))
     record)))

;; Don't add more get functions. We use lookup by code because we can lookup a hashed version
;; of the code in the db to prevent timing attacks.

