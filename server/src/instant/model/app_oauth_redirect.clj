(ns instant.model.app-oauth-redirect
  (:require [instant.jdbc.aurora :as aurora]
            [instant.jdbc.sql :as sql]
            [instant.util.$users :refer [$user-update]]
            [instant.util.crypt :as crypt-util])
  (:import
   (java.time Instant)
   (java.time.temporal ChronoUnit)))

(def etype "$oauth-redirects")

(defn hash-uuid [uuid]
  (-> uuid
      (crypt-util/uuid->sha256)
      (crypt-util/bytes->hex-string)))

(defn create!
  ([params] (create! aurora/conn-pool params))
  ([conn {:keys [state cookie redirect-url oauth-client-id
                 code-challenge-method code-challenge]}]
   ($user-update
    conn
    {:app-id app-id
     :etype etype
     :legacy-op
     (fn []
       (sql/execute-one!
        conn
        ["INSERT INTO app_oauth_redirects (
          lookup_key,
           state,
           cookie,
           redirect_url,
           client_id,
           code_challenge_method,
           code_challenge
         ) VALUES (?::bytea, ?::uuid, ?::uuid, ?, ?::uuid, ?, ?)"
         (crypt-util/uuid->sha256 state)
         state
         cookie
         redirect-url
         oauth-client-id
         code-challenge-method
         code-challenge]))
     :$users-op
     (fn [{:keys [transact! resolve-id get-entity]}]
       (let [eid (random-uuid)
             challenge-hash (when code-challenge
                              (-> code-challenge
                                  (crypt-util/str->sha256)
                                  (crypt-util/bytes->hex-string)))]
         (transact! [[:add-triple eid (resolve-id :id) eid]
                     [:add-triple eid (resolve-id :state-hash) (hash-uuid state)]
                     [:add-triple eid (resolve-id :cookie-hash) (hash-uuid cookie)]
                     [:add-triple eid (resolve-id :redirect-url) redirect-url]
                     [:add-triple eid (resolve-id :$oauth-client) oauth-client-id]
                     [:add-triple eid (resolve-id :code-challenge-method) code-challenge-method]
                     [:add-triple eid (resolve-id :code-challenge-hash) challenge-hash]])
         (get-entity eid)))})))

(defn consume!
  "Gets and deletes the oauth-redirect so that it can be used only once."
  ([params] (consume! aurora/conn-pool params))
  ([conn {:keys [state]}]
   ($user-update
    conn
    ;; XXX
    {:app-id (random-uuid) ;; app-id
     :etype etype
     :legacy-op
     (fn [conn]
       (sql/execute-one! conn
                         ["DELETE FROM app_oauth_redirects where lookup_key = ?::bytea"
                          (crypt-util/uuid->sha256 state)]))
     :$users-op :TODO})))

;; Don't add more get functions. We lookup by state because we can lookup a hashed version
;; of state in the db to prevent timing attacks.

(defn expired?
  ([oauth-redirect] (expired? (Instant/now) oauth-redirect))
  ([now {created-at :created_at}]
   (> (.between ChronoUnit/MINUTES (.toInstant created-at) now) 10)))
