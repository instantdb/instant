(ns instant.model.app-user-refresh-token
  (:require [instant.jdbc.aurora :as aurora]
            [instant.util.crypt :as crypt-util]
            [instant.model.app :as app-model]
            [instant.system-catalog-ops :refer [query-op update-op]]
            [instant.util.uuid :as uuid-util])
  (:import
   (java.util UUID)))

(def etype "$userRefreshTokens")

(defn hash-token [token]
  (-> token
      uuid-util/coerce
      crypt-util/uuid->sha256
      crypt-util/bytes->hex-string))

(defn get-by-id
  ([params] (get-by-id (aurora/conn-pool :read) params))
  ([conn {:keys [app-id id]}]
   (query-op conn
             {:app-id app-id
              :etype etype}
             (fn [{:keys [get-entity-where]}]
               (let [res (get-entity-where {:hashedToken (hash-token id)})]
                 (when res
                   ;; We're expecting `id` to be the token in the
                   ;; legacy version, but the triples format only
                   ;; stores a hash of the token.
                   (assoc res :id id)))))))

(defn create!
  ([params] (create! (aurora/conn-pool :write) params))
  ([conn {:keys [id app-id user-id]}]
   (update-op
    conn
    {:app-id app-id
     :etype etype}
    (fn [{:keys [transact! resolve-id get-entity]}]
      (let [entity-id (random-uuid)]
        (transact! [[:add-triple entity-id (resolve-id :id) entity-id]
                    [:add-triple entity-id (resolve-id :hashedToken) (hash-token id)]
                    [:add-triple entity-id (resolve-id :$user) user-id]])
        (assoc (get-entity entity-id)
               ;; backwards compatibility with legacy version that expects
               ;; token in the id field
               :id id))))))

(defn delete-by-user-id!
  ([params] (delete-by-user-id! (aurora/conn-pool :write) params))
  ([conn {:keys [app-id user-id]}]
   (update-op
    conn
    {:app-id app-id
     :etype etype}
    (fn [{:keys [transact! get-entities-where]}]
      (let [ents (get-entities-where {:$user user-id})]
        (when (seq ents)
          (transact! (mapv (fn [{:keys [id]}]
                             [:delete-entity id etype])
                           ents))))))))

(defn delete-by-id!
  ([params] (delete-by-id! (aurora/conn-pool :write) params))
  ([conn {:keys [app-id id]}]
   (update-op
    conn
    {:app-id app-id
     :etype etype}
    (fn [{:keys [transact! resolve-id]}]
      (transact! [[:delete-entity [(resolve-id :hashedToken) (hash-token id)] etype]])))))

(comment
  (require '[instant.model.instant-user :as instant-user-model])
  (require '[instant.model.app-user :as app-user-model])
  (def instant-user (instant-user-model/get-by-email
                     {:email "stopa@instantdb.com"}))
  (def app (first (app-model/get-all-for-user {:user-id (:id instant-user)})))
  (def runtime-user (app-user-model/get-by-email {:app-id (:id app)
                                                  :email "stopa@instantdb.com"}))
  (def runtime-user (app-user-model/get-by-email {:app-id "b502cabc-11ed-4534-b340-349d46548642"
                                                  :email "stopa@instantdb.com"}))

  (def r (create! {:id (UUID/randomUUID) :user-id (:id runtime-user)}))
  (delete-by-id! {:id (:id r)})
  (delete-by-user-id! {:user-id (:id runtime-user)}))
