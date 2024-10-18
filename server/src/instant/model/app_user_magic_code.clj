(ns instant.model.app-user-magic-code
  (:require
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.model.app :as app-model]
   [instant.model.app-user :as app-user-model]
   [instant.model.instant-user :as instant-user-model]
   [instant.system-catalog-ops :refer [update-op]]
   [instant.util.crypt :as crypt-util]
   [instant.util.exception :as ex]
   [instant.util.string :refer [rand-num-str]])
  (:import
   (java.time Instant)
   (java.time.temporal ChronoUnit)
   (java.util UUID)))

(def etype "$magic-codes")

(defn rand-code []
  (rand-num-str 6))

(defn create!
  ([params] (create! aurora/conn-pool params))
  ([conn {:keys [app-id id code user-id]}]
   (update-op
    conn
    {:app-id app-id
     :etype etype
     :legacy-op (fn [conn]
                  (sql/execute-one! conn
                                    ["INSERT INTO app_user_magic_codes (id, code, user_id) VALUES (?::uuid, ?, ?::uuid)"
                                     id code user-id]))
     :triples-op (fn [{:keys [resolve-id transact! get-entity]}]
                  (transact! [[:add-triple id (resolve-id :id) id]
                              [:add-triple id (resolve-id :code-hash) (-> code
                                                                          crypt-util/str->sha256
                                                                          crypt-util/bytes->hex-string)]
                              [:add-triple id (resolve-id :$user) user-id]])
                  (assoc (get-entity id)
                         :code code))})))

(defn expired?
  ([magic-code] (expired? (Instant/now) magic-code))
  ([now {created-at :created_at}]
   (> (.between ChronoUnit/HOURS (.toInstant created-at) now) 24)))

(defn consume!
  ([params] (consume! aurora/conn-pool params))
  ([conn {:keys [email code app-id] :as params}]
   (update-op
    conn
    {:app-id app-id
     :etype etype
     :legacy-op
     (fn [conn]
       (let [m (sql/execute-one!
                conn
                ["DELETE FROM app_user_magic_codes
                   USING app_users
                   WHERE
                     app_user_magic_codes.user_id = app_users.id AND
                     app_user_magic_codes.code = ? AND
                     app_users.email = ? AND
                     app_users.app_id = ?::uuid
                   RETURNING app_user_magic_codes.*"
                 code email app-id])]
         (ex/assert-record! m :app-user-magic-code {:args [params]})
         (when (expired? m)
           (ex/throw-expiration-err! :app-user-magic-code {:args [params]}))
         m))
     :triples-op
     (fn [{:keys [get-entity-where delete-entity!]}]
       (let [code-hash (-> code
                           crypt-util/str->sha256
                           crypt-util/bytes->hex-string)
             {code-id :id} (get-entity-where {:code-hash code-hash
                                              :$user.email email})]
         (ex/assert-record! code-id :app-user-magic-code {:args [params]})
         (let [code (delete-entity! code-id)]
           (when (expired? code)
             (ex/throw-expiration-err! :app-user-magic-code {:args [params]}))
           code)))})))

(comment
  (def instant-user (instant-user-model/get-by-email
                     {:email "stopa@instantdb.com"}))
  (def app (first (app-model/get-all-for-user {:user-id (:id instant-user)})))
  (def runtime-user (app-user-model/get-by-email {:app-id (:id app)
                                                  :email "stopa@instantdb.com"}))

  (def m (create! {:id (UUID/randomUUID)
                   :code (rand-code)
                   :user-id (:id runtime-user)}))

  (expired? (.plus (Instant/now) 1 ChronoUnit/HOURS) m)
  (expired? (.plus (Instant/now) 25 ChronoUnit/HOURS) m)
  (consume! {:email "stopa@instantdb.com"
             :app-id (:id app)
             :code (:code m)}))
