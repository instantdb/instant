(ns instant.jdbc.cache-evict
  (:require
   [instant.db.model.attr :as attr-model]
   [instant.db.model.transaction :as tx-model]
   [instant.model.app :as app-model]
   [instant.model.app-stream :as app-stream-model]
   [instant.model.instant-user :as instant-user-model]
   [instant.model.rule :as rule-model]
   [instant.util.json :as json]
   [instant.system-catalog :as system-catalog]
   [instant.util.uuid :as uuid-util]))

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
  (or (some-> wal-record
              :columns
              (get-column "app_id")
              parse-uuid)
      (some-> wal-record
              :identity
              (get-column "app_id")
              parse-uuid)))

(defn get-id [wal-record]
  (or (some-> wal-record
              :columns
              (get-column "id")
              parse-uuid)
      (some-> wal-record
              :identity
              (get-column "id")
              parse-uuid)))

(def stream-machine-id-aid (->> system-catalog/$streams-attrs
                                (filter (fn [a]
                                          (= "machineId" (last (:forward-identity a)))))
                                first
                                :id
                                str))

(defn notify-stream-machine-id-changed [{:keys [identity]}]
  (let [stream-id (-> identity
                      (nth 1)
                      :value
                      parse-uuid)]
    (app-stream-model/notify-machine-id-changed stream-id)))

(defn evict-cache! [wal-record]
  (case (:action wal-record)
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
      "transactions" (when (= :insert (:action wal-record))
                       (tx-model/set-max-seen-tx-id (get-column (:columns wal-record) "id")))
      "triples" (when (and (= :update (:action wal-record))
                           (= stream-machine-id-aid (-> wal-record
                                                        :identity
                                                        (nth 2)
                                                        :value)))
                  (notify-stream-machine-id-changed wal-record))
      nil)

    nil))
