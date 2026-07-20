(ns instant.model.app-status
  "Operational status (maintenance mode) for an app.

   `active`    - everything works
   `read-only` - reads keep working, durable writes are rejected
   `disabled`  - reads are rejected too; init and sign-out stay available

   Status lives on the `apps` row (control plane), so the toggle itself never
   enters the Instant transaction machinery and can't lock itself out.
   Reads go through the WAL-evicted app cache, so enforcement adds no SQL to
   hot paths."
  (:require
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.util.exception :as ex]))

;; Resolved lazily to avoid a circular dependency:
;; db.transaction -> app-status -> model.app -> system-catalog-ops -> db.transaction
(def ^:private get-app-by-id
  (delay (requiring-resolve 'instant.model.app/get-by-id)))

(def ^:private evict-app-id-from-cache
  (delay (requiring-resolve 'instant.model.app/evict-app-id-from-cache)))

(def statuses #{:active :read-only :disabled})

(defn coerce-status [x]
  (when (or (string? x) (keyword? x))
    (statuses (keyword x))))

(defn get-status
  "Cached app record -> status keyword; no SQL on hot paths."
  [app-id]
  (or (some-> (@get-app-by-id {:id app-id})
              :status
              keyword)
      :active))

(defn- sign-out-only?
  "The one exempt transaction shape: every step deletes a $userRefreshTokens
   entity (sign-out). Mixed transactions fail closed."
  [tx-step-maps]
  (and (seq tx-step-maps)
       (every? (fn [{:keys [op etype]}]
                 (and (= :delete-entity op)
                      (= "$userRefreshTokens" etype)))
               tx-step-maps)))

(defn assert-write-allowed!
  "Authoritative write check, called from the base transaction layer."
  [app-id tx-step-maps]
  (let [status (get-status app-id)]
    (when (and (not= :active status)
               (not (sign-out-only? tx-step-maps)))
      (case status
        :read-only (ex/throw-app-read-only!)
        :disabled (ex/throw-app-disabled!)))))

(defn assert-read-allowed!
  "Rejects data reads while the app is disabled."
  [app-id]
  (when (= :disabled (get-status app-id))
    (ex/throw-app-disabled!)))

(defn set-status!
  "Plain UPDATE on apps; never an Instant transaction, so it works in every
   status. The WAL evicts the app cache on every other machine."
  ([params] (set-status! (aurora/conn-pool :write) params))
  ([conn {:keys [app-id status]}]
   (let [status (or (coerce-status status)
                    (ex/throw-validation-err!
                     :app-status
                     status
                     [{:message "Status must be one of: active, read-only, disabled."}]))]
     (@evict-app-id-from-cache app-id)
     (let [res (sql/execute-one! ::set-status!
                                 conn
                                 ["UPDATE apps SET status = ? WHERE id = ?::uuid RETURNING *"
                                  (name status) app-id])]
       (@evict-app-id-from-cache app-id)
       res))))
