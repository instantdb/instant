(ns instant.model.instant-user
  (:require
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.util.cache :as cache]
   [instant.util.crypt :as crypt-util]
   [instant.util.exception :as ex]
   [instant.util.token :as token-util])
  (:import
   (java.util UUID)
   (instant.util.token PersonalAccessToken)))

;; We lookup the user by the app-id, but want to evict
;; by both the app-id and the user-id

(declare user-by-app-id-cache
         user-by-user-id-cache)

(def user-by-app-id-cache
  (cache/make {:max-size  256
               :on-remove (fn [_app-id user _]
                            (cache/invalidate user-by-user-id-cache (:id user)))}))

(def user-by-user-id-cache
  (cache/make {:max-size  256
               :on-remove (fn [_user-id user _]
                            (cache/invalidate user-by-app-id-cache (:app_id user)))}))

(defn evict-app-id-from-cache [app-id]
  (cache/invalidate user-by-app-id-cache app-id))

(defn evict-user-id-from-cache [user-id]
  (cache/invalidate user-by-user-id-cache user-id))

(defmacro with-cache-invalidation [key & body]
  `(do
     (evict-user-id-from-cache ~key)
     (let [res# ~@body]
       (evict-user-id-from-cache ~key)
       res#)))

(defn create!
  ([params] (create! (aurora/conn-pool :write) params))
  ([conn {:keys [id email google-sub]}]
   (sql/execute-one! ::create!
                     conn
                     ["INSERT INTO instant_users (id, email, google_sub) VALUES (?::uuid, ?, ?)"
                      id email google-sub])))

(defn update-email!
  ([params] (update-email! (aurora/conn-pool :write) params))
  ([conn {:keys [id email]}]
   (with-cache-invalidation id
     (sql/execute-one! ::update-email!
                       conn
                       ["UPDATE instant_users set email = ? where id = ?::uuid"
                        email id]))))

(defn update-google-sub!
  ([params] (update-google-sub! (aurora/conn-pool :write) params))
  ([conn {:keys [id google-sub]}]
   (with-cache-invalidation id
     (sql/execute-one! ::update-google-sub!
                       conn
                       ["UPDATE instant_users set google_sub = ? where id = ?::uuid"
                        google-sub id]))))

(defn get-by-id
  ([params] (get-by-id (aurora/conn-pool :read) params))
  ([conn {:keys [id]}]
   (sql/select-one ::get-by-id
                   conn
                   ["SELECT * FROM instant_users WHERE id = ?::uuid" id])))

(defn get-by-id! [params]
  (ex/assert-record! (get-by-id params) :instant-user {:args [params]}))

(defn get-by-app-id* [conn app-id]
  (sql/select-one ::get-by-app-id*
                  conn
                  ["SELECT
                    iu.*, a.id app_id
                    FROM instant_users iu
                    JOIN apps a
                        ON iu.id = a.creator_id
                        or iu.id = (select m.user_id
                                      from org_members m
                                      join orgs o on o.id = m.org_id
                                      join apps a on o.id = a.org_id
                                     where a.id = ?::uuid
                                       and m.role = 'owner'
                                  order by m.created_at asc
                                     limit 1)
                    WHERE a.id = ?::uuid"
                   app-id
                   app-id]))

(defn get-by-app-id
  ([{:keys [app-id]}]
   (cache/get user-by-app-id-cache app-id
              (fn [app-id]
                (let [user (get-by-app-id* (aurora/conn-pool :read) app-id)]
                  (cache/put user-by-user-id-cache (:id user) user)
                  user))))
  ([conn {:keys [app-id]}]
   ;; Don't cache if we're using a custom connection
   (get-by-app-id* conn app-id)))

(defn get-by-refresh-token
  ([params] (get-by-refresh-token (aurora/conn-pool :read) params))
  ([conn {:keys [refresh-token]}]
   (sql/select-one
    ::get-by-refresh-token
    conn
    ["SELECT instant_users.*
     FROM instant_users
     JOIN instant_user_refresh_tokens ON instant_users.id = instant_user_refresh_tokens.user_id
     WHERE instant_user_refresh_tokens.id = ?::uuid"
     refresh-token])))

(defn get-by-refresh-token! [params]
  (ex/assert-record! (get-by-refresh-token params) :instant-user {}))

(defn get-by-personal-access-token
  ([params] (get-by-personal-access-token (aurora/conn-pool :read) params))
  ([conn {:keys [^PersonalAccessToken personal-access-token]}]
   (sql/select-one
    ::get-by-personal-access-token
    conn
    ["SELECT instant_users.*
      FROM instant_users
      JOIN instant_personal_access_tokens
      ON instant_users.id = instant_personal_access_tokens.user_id
      WHERE instant_personal_access_tokens.lookup_key = ?::bytea"
     (crypt-util/str->sha256 (token-util/personal-access-token-value personal-access-token))])))

(defn get-by-personal-access-token! [params]
  (ex/assert-record! (get-by-personal-access-token params) :instant-user {}))

(defn get-by-email
  ([params] (get-by-email (aurora/conn-pool :read) params))
  ([conn {:keys [email]}]
   (sql/select-one ::get-by-email
                   conn
                   ["SELECT * FROM instant_users WHERE email = ?"
                    email])))

(defn get-by-email-or-google-sub
  ([params] (get-by-email-or-google-sub (aurora/conn-pool :read) params))
  ([conn {:keys [email google-sub]}]
   (sql/select ::get-by-email-or-google-sub
               conn
               ["SELECT * FROM instant_users where email = ? or google_sub = ?"
                email google-sub])))

(defn delete-by-email!
  ([params] (delete-by-email! (aurora/conn-pool :write) params))
  ([conn {:keys [email]}]
   (let [res (sql/execute-one! ::delete-by-email!
                               conn
                               ["DELETE FROM instant_users WHERE email = ?" email])]
     (evict-user-id-from-cache (:id res))
     res)))

(comment
  (get-by-email {:email "stopa@instantdb.com"})
  (create! {:id (UUID/randomUUID) :email "testinguser@gmail.com"})
  (delete-by-email! {:email "testinguser@gmail.com"}))
