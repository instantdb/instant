(ns instant.jdbc.cache-evict
  (:require
   [instant.db.model.attr :as attr-model]
   [instant.db.model.transaction :as tx-model]
   [instant.model.app :as app-model]
   [instant.model.app-stream :as app-stream-model]
   [instant.model.instant-user :as instant-user-model]
   [instant.model.rule :as rule-model]
   [instant.model.webhook :as webhook-model]
   [instant.reactive.store :as rs]
   [instant.system-catalog :as system-catalog]))

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

(defn parse-json-uuid [v]
  (when (and (= 38 (count v))
             (= \" (first v))
             (= \" (last v)))
    (parse-uuid (subs v 1 37))))

(defn notify-stream-machine-id-changed [{:keys [columns]}]
  (let [stream-id (-> columns
                      (nth 1)
                      :value
                      parse-uuid)]
    (when-let [machine-id (-> columns
                              (nth 3)
                              :value
                              parse-json-uuid)]
      (app-stream-model/notify-machine-id-changed stream-id machine-id))))

(defn notify-app-status-changed
  "Pushes the app's status to this machine's sessions when it changes."
  [wal-record app-id]
  (when (and app-id (= :update (:action wal-record)))
    (let [new-status (get-column (:columns wal-record) "status")
          old-status (get-column (:identity wal-record) "status")]
      (when (and new-status (not= new-status old-status))
        (doseq [{:keys [id]} (rs/all-sockets-for-app rs/store app-id)]
          (rs/try-send-event! rs/store app-id id {:op :app-status-changed
                                                  :status new-status}))))))

(defn evict-cache! [wal-record]
  (case (:action wal-record)
    (:insert :update :delete)
    (case (:table wal-record)
      ;; n.b. Add the table to the `add-tables` setting in
      ;;      create-replication-stream or else we will never be notified
      ;;      about it.
      "attrs" (do (attr-model/evict-app-id-from-cache (get-app-id wal-record))
                  (webhook-model/evict-webhooks-for-attr-id (get-id wal-record)))
      "rules" (rule-model/evict-app-id-from-cache (get-app-id wal-record))
      "apps" (let [app-id (get-id wal-record)]
               (app-model/evict-app-id-from-cache app-id)
               (instant-user-model/evict-app-id-from-cache app-id)
               (notify-app-status-changed wal-record app-id))
      "instant_users" (instant-user-model/evict-user-id-from-cache (get-id wal-record))
      "transactions" (when (= :insert (:action wal-record))
                       (tx-model/set-max-seen-tx-id (get-column (:columns wal-record) "id")))
      "triples" (when (and (= :update (:action wal-record))
                           (= stream-machine-id-aid (-> wal-record
                                                        :identity
                                                        (nth 2)
                                                        :value)))
                  (notify-stream-machine-id-changed wal-record))
      "webhooks" (webhook-model/evict-webhook-from-cache {:app-id (get-app-id wal-record)
                                                          :webhook-id (get-id wal-record)})
      nil)

    nil))
