(ns instant.model.app-user-oauth-link
  (:require [instant.jdbc.aurora :as aurora]
            [instant.jdbc.sql :as sql]))

(defn create!
  ([params] (create! aurora/conn-pool params))
  ([conn {:keys [id app-id sub provider-id user-id]}]
   (sql/execute-one!
    conn
    ["INSERT INTO app_user_oauth_links (id, app_id, sub, provider_id, user_id)
       VALUES (?::uuid, ?::uuid, ?, ?::uuid, ?::uuid)"
     id app-id, sub, provider-id user-id])))
