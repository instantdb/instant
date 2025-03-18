(ns instant.model.instant-cli-login
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
  ([conn {:keys [ticket secret]}]
   (sql/execute-one!
    conn
    ["INSERT INTO
        instant_cli_logins
        (id, secret)
      VALUES
        (?, ?)"
     ticket (crypt-util/uuid->sha256 secret)])))

(defn claim!
  ([params] (claim! (aurora/conn-pool :write) params))
  ([conn {:keys [ticket user-id]}]
   (sql/execute-one!
    conn
    ["UPDATE
        instant_cli_logins
      SET
        user_id = ?::uuid
      WHERE
        id = ?"
     user-id ticket])))

(defn expired?
  ([magic-code] (expired? (Instant/now) magic-code))
  ([now {created-at :created_at}]
   (> (.between ChronoUnit/MINUTES (Date/.toInstant created-at) now) 2)))

(defn voided?
  [{used? :used user-id :user_id :as _login}]
  (and used? (not user-id)))

(defn use!
  ([params] (use! (aurora/conn-pool :write) params))
  ([conn {:keys [secret]}]
   (let [{user-id :user_id id :id :as login}
         (sql/select-one conn
                         ["SELECT * FROM instant_cli_logins WHERE secret = ?"
                          (crypt-util/uuid->sha256 secret)])

         _ (ex/assert-record! login :instant-cli-login {})

         _ (when (expired? login)
             (ex/throw-expiration-err! :instant-cli-login {:args [id]}))

         _ (when (voided? login)
             (ex/throw-validation-err! :instant-cli-login id [{:issue :user-voided-request
                                                               :message "This request has been denied"}]))
         _ (when-not user-id
             (ex/throw-validation-err! :instant-cli-login id [{:issue :waiting-for-user
                                                               :message "Waiting for a user to accept this request"}]))

         claimed (sql/execute-one!
                  conn
                  ["UPDATE 
                     instant_cli_logins 
                    SET 
                      used = true 
                    WHERE 
                      secret = ? AND 
                      user_id IS NOT NULL AND 
                      used = false 
                    RETURNING *"
                   (crypt-util/uuid->sha256 secret)])

         _ (when-not claimed
             (ex/throw-validation-err! :instant-cli-login
                                       :id
                                       [{:issue :user-already-claimed
                                         :message "This request has already been claimed"}]))]
     claimed)))

(defn void!
  ([params] (void! (aurora/conn-pool :write) params))
  ([conn {:keys [ticket]}]
   (sql/execute-one!
    conn
    ["UPDATE
        instant_cli_logins
      SET
        used = true
      WHERE
        id = ?::uuid"
     ticket])))
