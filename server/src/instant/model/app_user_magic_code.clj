(ns instant.model.app-user-magic-code
  (:require
   [instant.jdbc.aurora :as aurora]
   [instant.model.app :as app-model]
   [instant.model.app-user :as app-user-model]
   [instant.model.instant-user :as instant-user-model]
   [instant.system-catalog-ops :refer [update-op]]
   [instant.util.crypt :as crypt-util]
   [instant.util.exception :as ex]
   [instant.util.string :refer [rand-num-str]])
  (:import
   (java.util Date UUID)))

(def etype "$magicCodes")

(defn rand-code []
  (rand-num-str 6))

(def ttl-ms
  (* 24 60 60 1000))

(defn expired? [magic-code]
  (when magic-code
    (let [created-at ^Date (:created_at magic-code)]
      (< (+ (.getTime created-at) ttl-ms) (System/currentTimeMillis)))))

(defn create!
  ([params]
   (create! (aurora/conn-pool :write) params))
  ([conn {:keys [app-id email id code]}]
   (let [id   (or id (random-uuid))
         code (or code (rand-code))]
     (update-op
      conn
      {:app-id app-id
       :etype etype}
      (fn [{:keys [transact! get-entity]}]
        (transact! [{:id       id
                     :etype    etype
                     :codeHash (-> code
                                   crypt-util/str->sha256
                                   crypt-util/bytes->hex-string)
                     :email    email}])
        (assoc (get-entity id)
               :code code))))))

(defn consume!
  ([params]
   (consume! (aurora/conn-pool :write) params))
  ([conn {:keys [email code app-id] :as params}]
   (update-op
    conn
    {:app-id app-id
     :etype etype}
    (fn [{:keys [get-entity-where delete-entity!]}]
      (let [code-hash (-> code
                          crypt-util/str->sha256
                          crypt-util/bytes->hex-string)
            {code-id :id} (or
                           (get-entity-where
                            {:codeHash code-hash
                             :email    email})
                           ;; TODO remove after migrating to $magicCodes.email
                           (get-entity-where
                            {:codeHash code-hash
                             :$user.email email}))]
        (ex/assert-record! code-id :app-user-magic-code {:args [params]})
        (let [code (delete-entity! code-id)]
          (ex/assert-record! code :app-user-magic-code {:args [params]})
          (when (expired? code)
            (ex/throw-expiration-err! :app-user-magic-code {:args [params]}))
          code))))))

(comment
  (def instant-user (instant-user-model/get-by-email
                     {:email "stopa@instantdb.com"}))
  (def app (first (app-model/get-all-for-user {:user-id (:id instant-user)})))
  (def runtime-user (app-user-model/get-by-email {:app-id (:id app)
                                                  :email "stopa@instantdb.com"}))

  (def m (create! {:id (UUID/randomUUID)
                   :code (rand-code)
                   :user-id (:id runtime-user)}))

  (consume! {:email "stopa@instantdb.com"
             :app-id (:id app)
             :code (:code m)}))
