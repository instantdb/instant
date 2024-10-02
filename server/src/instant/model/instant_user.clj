(ns instant.model.instant-user
  (:require [instant.jdbc.aurora :as aurora]
            [instant.jdbc.sql :as sql]
            [instant.util.exception :as ex])
  (:import
   (java.util UUID)))

(defn create!
  ([params] (create! aurora/conn-pool params))
  ([conn {:keys [id email google-sub]}]
   (sql/execute-one! conn
                     ["INSERT INTO instant_users (id, email, google_sub) VALUES (?::uuid, ?, ?)"
                      id email google-sub])))

(defn update-email!
  ([params] (update-email! aurora/conn-pool params))
  ([conn {:keys [id email]}]
   (sql/execute-one! conn
                     ["UPDATE instant_users set email = ? where id = ?::uuid"
                      email id])))

(defn update-google-sub!
  ([params] (update-google-sub! aurora/conn-pool params))
  ([conn {:keys [id google-sub]}]
   (sql/execute-one! conn
                     ["UPDATE instant_users set google_sub = ? where id = ?::uuid"
                      google-sub id])))

(defn get-by-id
  ([params] (get-by-id aurora/conn-pool params))
  ([conn {:keys [id]}]
   (sql/select-one conn
                   ["SELECT * FROM instant_users WHERE id = ?::uuid" id])))

(defn get-by-id! [params]
  (ex/assert-record! (get-by-id params) :instant-user {:args [params]}))

(defn get-by-app-id
  ([params] (get-by-app-id aurora/conn-pool params))
  ([conn {:keys [app-id]}]
   (sql/select-one conn
                   ["SELECT 
                    iu.*
                    FROM instant_users iu 
                    JOIN apps a 
                    ON iu.id = a.creator_id
                    WHERE a.id = ?::uuid"
                    app-id])))

(defn get-by-refresh-token
  ([params] (get-by-refresh-token aurora/conn-pool params))
  ([conn {:keys [refresh-token]}]
   (sql/select-one
    conn
    ["SELECT instant_users.*
     FROM instant_users
     JOIN instant_user_refresh_tokens ON instant_users.id = instant_user_refresh_tokens.user_id
     WHERE instant_user_refresh_tokens.id = ?::uuid"
     refresh-token])))

(defn get-by-refresh-token! [params]
  (ex/assert-record! (get-by-refresh-token params) :instant-user {:args [params]}))

(defn get-by-personal-access-token
  ([params] (get-by-personal-access-token aurora/conn-pool params))
  ([conn {:keys [personal-access-token]}]
   (sql/select-one
    conn
    ["SELECT instant_users.*
      FROM instant_users
      JOIN instant_personal_access_tokens
      ON instant_users.id = instant_personal_access_tokens.user_id
      WHERE instant_personal_access_tokens.id = ?::uuid"
     personal-access-token])))

(defn get-by-personal-access-token! [params]
  (ex/assert-record! (get-by-personal-access-token params) :instant-user {:args [params]}))

(defn get-by-email
  ([params] (get-by-email aurora/conn-pool params))
  ([conn {:keys [email]}]
   (sql/select-one conn
                   ["SELECT * FROM instant_users WHERE email = ?"
                    email])))

(defn get-by-email-or-google-sub
  ([params] (get-by-email-or-google-sub aurora/conn-pool params))
  ([conn {:keys [email google-sub]}]
   (sql/select conn
               ["SELECT * FROM instant_users where email = ? or google_sub = ?"
                email google-sub])))

(defn delete-by-email!
  ([params] (delete-by-email! aurora/conn-pool params))
  ([conn {:keys [email]}]
   (sql/execute-one! conn
                     ["DELETE FROM instant_users WHERE email = ?" email])))

(comment
  (get-by-email {:email "stopa@instantdb.com"})
  (create! {:id (UUID/randomUUID) :email "testinguser@gmail.com"})
  (delete-by-email! {:email "testinguser@gmail.com"}))
