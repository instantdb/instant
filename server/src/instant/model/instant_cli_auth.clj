(ns instant.model.instant-cli-auth
  (:require [instant.jdbc.aurora :as aurora]
            [instant.jdbc.sql :as sql]))

(defn create!
  ([params] (create! aurora/conn-pool params))
  ([conn {:keys [ticket secret]}]
   (sql/execute-one!
    conn
    ["INSERT INTO
        instant_cli_auth
        (id, secret)
      VALUES
        (?, ?)"
     ticket secret])))

(defn claim!
  ([params] (claim! aurora/conn-pool params))
  ([conn {:keys [ticket user-id]}]
   (sql/execute-one!
    conn
    ["UPDATE
        instant_cli_auth
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
        instant_cli_auth
      SET
        used = true
      WHERE
        secret = ?
        AND created_at > now() - interval '2 minutes'
        AND user_id IS NOT NULL
        AND used = false
      RETURNING
        user_id"
     secret])))