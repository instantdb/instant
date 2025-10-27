(ns instant.jdbc.cache-evict
  (:require
   [instant.db.model.attr :as attr-model]
   [instant.model.app :as app-model]
   [instant.model.instant-user :as instant-user-model]
   [instant.model.rule :as rule-model]))

(defn get-column [columns col-name]
  (reduce (fn [_acc col]
            (when (= col-name (:name col))
              (reduced (:value col))))
          nil
          columns))

(defn app-id-from-columns [columns]
  (some-> columns
          (get-column "app_id")
          (parse-uuid)))

(defn id-from-columns [columns]
  (some-> columns
          (get-column "id")
          (parse-uuid)))

(defn get-app-id [wal-record]
  (some-> wal-record
          (get-column "app_id")
          parse-uuid))

(defn get-id [wal-record]
  (some-> wal-record
          (get-column "id")
          parse-uuid))

(defn evict-cache! [wal-record]
  (case (tool/inspect (:action wal-record))
    (:insert :update :delete)
    (case (:table wal-record)
      ;; n.b. Add the table to the `add-tables` setting in
      ;;      create-replication-stream or else we will never be notified
      ;;      about it.
      "attrs" (attr-model/evict-app-id-from-cache (get-app-id wal-record))
      "rules" (rule-model/evict-app-id-from-cache (get-app-id wal-record))
      "apps" (let [app-id (get-id wal-record)]
               (app-model/evict-app-id-from-cache app-id)
               (instant-user-model/evict-app-id-from-cache app-id))
      "instant_users" (instant-user-model/evict-user-id-from-cache (get-id wal-record))

      nil)

    nil))
