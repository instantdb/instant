(ns instant.model.instant-cli-login
  (:require [instant.jdbc.aurora :as aurora]
            [instant.jdbc.sql :as sql]
            [instant.util.crypt :as crypt-util]))

(defn create!
  ([params] (create! aurora/conn-pool params))
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
  ([params] (claim! aurora/conn-pool params))
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

(defn check!
  ([params] (check! aurora/conn-pool params))
  ([conn {:keys [secret]}]
   (sql/execute-one!
    conn
    ["UPDATE
        instant_cli_logins
      SET
        used = true
      WHERE
        secret = ?
        AND created_at > now() - interval '2 minutes'
        AND user_id IS NOT NULL
        AND used = false
      RETURNING
        user_id"
     (crypt-util/uuid->sha256 secret)])))

(defn void!
  ([params] (void! aurora/conn-pool params))
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