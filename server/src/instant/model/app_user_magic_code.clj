(ns instant.model.app-user-magic-code
  (:require
   [instant.flags :as flags]
   [instant.jdbc.aurora :as aurora]
   [instant.model.app :as app-model]
   [instant.model.app-user :as app-user-model]
   [instant.model.instant-user :as instant-user-model]
   [instant.system-catalog-ops :refer [update-op]]
   [instant.totp :as totp]
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

(defn totp-secret-key [app-id ^String email]
  (let [app-secret-key (app-model/get-totp-secret-key {:id app-id})
        derived-key (crypt-util/hmac-256 app-secret-key (.getBytes email))]
    derived-key))

(defn generate-totp [app-id ^String email]
  (let [secret-key (totp-secret-key app-id email)]
    (totp/generate-totp secret-key)))

(defn create!
  ([params]
   (create! (aurora/conn-pool :write) params))
  ([conn {:keys [app-id email id]}]
   (let [id   (or id (random-uuid))
         code (if (flags/generate-with-totp?)
                (generate-totp app-id email)
                (rand-code))]

     (when (or (not (flags/validate-with-totp?))
               (not (flags/generate-with-totp?))
               (flags/dual-write-totp?))
       (update-op
        conn
        {:app-id app-id
         :etype etype}
        (fn [{:keys [transact!]}]
          (transact! [{:id       id
                       :etype    etype
                       :codeHash (-> code
                                     crypt-util/str->sha256
                                     crypt-util/bytes->hex-string)
                       :email    email}]))))
     code)))


(defn validate-totp! [app-id ^String email ^String code]
  (let [secret-key (totp-secret-key app-id email)
        expiry-periods (or (some-> (app-model/get-by-id! {:id app-id})
                                   :totp_expiry_minutes
                                   (max 5) ;; Minimum of 5 minutes
                                   (min 1440) ;; Maximum of 1 day
                                   (* 60)
                                   (/ totp/default-time-step)
                                   (Math/ceil))
                           ;; Default to 10 minutes
                           (/ 600 totp/default-time-step))]
    ;; Have to add 1 extra period in case the code was generated near the
    ;; end of a period
    (when-not (totp/valid-totp? secret-key (inc expiry-periods) code)
      (ex/throw-expiration-err! :app-user-magic-code {:args [{:code code
                                                              :email email}]}))))

(defn consume!
  ([params]
   (consume! (aurora/conn-pool :write) params))
  ([conn {:keys [email code app-id] :as params}]
   (when (or (not (flags/validate-with-totp?))
             (flags/dual-write-totp?))
     (update-op
      conn
      {:app-id app-id
       :etype etype}
      (fn [{:keys [get-entity-where delete-entity!]}]
        (let [code-hash (-> code
                            crypt-util/str->sha256
                            crypt-util/bytes->hex-string)
              {code-id :id} (get-entity-where
                             {:codeHash code-hash
                              :email    email})]
          (ex/assert-record! code-id :app-user-magic-code {:args [params]})
          (let [code (delete-entity! code-id)]
            (ex/assert-record! code :app-user-magic-code {:args [params]})
            (when (expired? code)
              (ex/throw-expiration-err! :app-user-magic-code {:args [params]})))))))
   (when (flags/validate-with-totp?)
     (validate-totp! app-id email code))))

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
