(ns instant.model.webhook
  (:require
   [instant.config :as config]
   [instant.db.model.attr :as attr-model]
   [instant.flags :as flags]
   [instant.isn :as isn]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.model.history :as history]
   [instant.reactive.topics :as topics]
   [instant.system-catalog :as system-catalog]
   [instant.util.cache :as cache]
   [instant.util.coll :as ucoll]
   [instant.util.exception :as ex]
   [instant.util.hsql :as uhsql]
   [instant.util.memoize :refer [vmemoize]]
   [instant.util.tracer :as tracer]
   [instant.util.uuid :as uuid-util]
   [instant.webhook-sender :as webhook-sender]
   [lambdaisland.uri :as uri]
   [next.jdbc])
  (:import
   (com.github.benmanes.caffeine.cache Cache)
   (instant.isn ISN)
   (java.nio ByteBuffer)
   (java.nio.charset StandardCharsets)
   (java.security MessageDigest)
   (java.time Duration Instant)
   (java.util Set UUID)
   (java.util.concurrent ConcurrentHashMap)
   (javax.crypto Mac)))

;; Map of attr-id -> webhook-ids, used to invalidate the webhook
;; cache if the underlying attrs change.
(def ^{:tag 'ConcurrentHashMap} attr-listeners (ConcurrentHashMap.))

(defn add-attr-listener [webhook]
  (doseq [attr-id (:id_attr_ids webhook)]
    (.compute attr-listeners attr-id (fn [_k webhook-ids]
                                       (let [^Set s (or webhook-ids
                                                        (ConcurrentHashMap/newKeySet))]
                                         (.add s {:app-id (:app_id webhook)
                                                  :webhook-id (:id webhook)})
                                         s)))))

(defn remove-attr-listener [webhook]
  (doseq [attr-id (:id_attr_ids webhook)]
    (.compute attr-listeners attr-id (fn [_k ^Set webhook-ids]
                                       (when webhook-ids
                                         (.remove webhook-ids {:app-id (:app_id webhook)
                                                               :webhook-id (:id webhook)})
                                         (when-not (.isEmpty webhook-ids)
                                           webhook-ids))))))

(def ^{:tag Cache} webhook-with-etypes-cache
  (cache/make {:max-size 2048
               :on-remove (fn [_k webhook _]
                            (remove-attr-listener webhook))}))

(defn evict-webhook-from-cache [{:keys [app-id webhook-id]}]
  (cache/invalidate webhook-with-etypes-cache {:app-id app-id
                                               :webhook-id webhook-id}))

(defmacro with-cache-invalidation [cache-key & body]
  `(let [cache-key# ~cache-key]
     (evict-webhook-from-cache cache-key#)
     (let [res# (do ~@body)]
       (evict-webhook-from-cache cache-key#)
       res#)))

(defn evict-webhooks-for-attr-id [attr-id]
  (doseq [params (.get attr-listeners attr-id)]
    (evict-webhook-from-cache params)))

(def get-by-app-id-and-webhook-id-q
  (uhsql/preformat {:select [:* [{:select [[[:array_agg :etype]]]
                                  :from :attrs
                                  :where [:and
                                          [:or
                                           [:= :app_id :?app-id]
                                           [:= :app_id [:cast [:inline (str system-catalog/system-catalog-app-id)] :uuid]]]
                                          [:= :id [:any :id-attr-ids]]]}
                                 :etypes]]
                    :from :webhooks
                    :where [:and
                            [:= :app_id :?app-id]
                            [:= :id :?webhook-id]]}))

(defn get-by-app-id-and-webhook-id!*
  ([params]
   (get-by-app-id-and-webhook-id!* (aurora/conn-pool :read) params))
  ([conn {:keys [app-id webhook-id]}]
   (-> (sql/select-one ::get-by-app-id-and-webhook-id!
                       conn
                       (uhsql/formatp get-by-app-id-and-webhook-id-q
                                      {:app-id app-id :webhook-id webhook-id}))
       (ex/assert-record! :webhook {:args [{:app-id app-id
                                            :webhook-id webhook-id}]}))))

(defn get-by-app-id-and-webhook-id!
  ([params]
   ;; Use this approach so that we can invalidate the webhook if the
   ;; attrs changes, since we rely on the attrs to get the etype
   ;; https://github.com/ben-manes/caffeine/wiki/Compute
   (->  webhook-with-etypes-cache
        (.asMap)
        (.computeIfAbsent params (fn [params]
                                   (let [res (get-by-app-id-and-webhook-id!* params)]
                                     (add-attr-listener res)
                                     res)))))

  ([conn params]
   (if (= conn (aurora/conn-pool :read))
     (get-by-app-id-and-webhook-id! params)
     (get-by-app-id-and-webhook-id!* params))))

(def get-all-by-app-id-q
  (uhsql/preformat {:select [:* [{:select [[[:array_agg :etype]]]
                                  :from :attrs
                                  :where [:and
                                          [:or
                                           [:= :app_id :?app-id]
                                           [:= :app_id [:cast [:inline (str system-catalog/system-catalog-app-id)] :uuid]]]
                                          [:= :id [:any :id-attr-ids]]]}
                                 :etypes]]
                    :from :webhooks
                    :where [:= :app_id :?app-id]
                    :order-by [[:created-at :desc]]}))

(defn get-all-by-app-id
  ([params] (get-all-by-app-id (aurora/conn-pool :read) params))
  ([conn {:keys [app-id]}]
   (sql/select ::get-all-by-app-id
               conn
               (uhsql/formatp get-all-by-app-id-q {:app-id app-id}))))

(def events-bucket-count 3)
(def ^{:tag Duration} events-max-age (Duration/ofDays 60))

(def get-events-q
  ;; Cursor pagination on (created_at, isn). When :?cursor-created-at is null
  ;; we're on the first page and the row-comparison branch is skipped. The
  ;; bucket and time-floor predicates limit the scan to recent partitions and
  ;; ~60 days of data.
  (uhsql/preformat
   {:select :*
    :from :webhook-events
    :where [:and
            [:= :app-id :?app-id]
            [:= :webhook-id :?webhook-id]
            [:= :partition-bucket [:any :?buckets]]
            [:>= :created-at :?floor]
            [:or
             [:is [:cast :?after-created-at :timestamptz] nil]
             [:< [:composite :created-at :isn]
              [:composite :?after-created-at :?after-isn]]]]
    :order-by [[:created-at :desc] [:isn :desc]]
    :limit :?limit}))

(defn get-events
  ([params] (get-events (aurora/conn-pool :read) params))
  ([conn {:keys [app-id webhook-id after limit]
          :or {limit 100}}]
   (let [now (Instant/now)
         floor (.minus now events-max-age)
         buckets (history/recent-partition-buckets now events-bucket-count)]
     (sql/select ::get-events
                 conn
                 (uhsql/formatp get-events-q
                                {:app-id app-id
                                 :webhook-id webhook-id
                                 :buckets (with-meta buckets {:pgtype "int[]"})
                                 :floor floor
                                 :after-created-at (:created-at after)
                                 :after-isn (:isn after)
                                 :limit limit})))))

(def get-event-by-isn-q
  (uhsql/preformat
   {:select :*
    :from :webhook-events
    :where [:and
            [:= :app-id :?app-id]
            [:= :webhook-id :?webhook-id]
            [:= :isn :?isn]
            [:= :partition-bucket [:any :?buckets]]]}))

(defn get-event-by-isn
  ([params] (get-event-by-isn (aurora/conn-pool :read) params))
  ([conn {:keys [app-id webhook-id isn]}]
   (let [now (Instant/now)
         buckets (history/recent-partition-buckets now events-bucket-count)]
     (sql/select-one ::get-event-by-isn
                     conn
                     (uhsql/formatp get-event-by-isn-q
                                    {:app-id app-id
                                     :webhook-id webhook-id
                                     :buckets (with-meta buckets {:pgtype "int[]"})
                                     :isn isn})))))

(defn assert-valid-url! [url-string]
  (let [{:keys [scheme host]} (uri/uri url-string)]
    (when-not (= scheme "https")
      (ex/throw-validation-err! :webhook {:url url-string} [{:message "The Webhook url must be https"}]))
    (when (or (= host "localhost")
              (= host "127.0.0.1"))
      (ex/throw-validation-err! :webhook {:url url-string} [{:message "The Webhook url must be a public url, localhost is not allowed."}]))
    (webhook-sender/validate-url url-string)))

(defn maximum-active-webhooks []
  (flags/flag :maximum-active-webhooks 100))

(defn app-id->lock-key
  "Generates a hash that fits in an int4 for use as the second lock key in a
   pg advisoy lock."
  ^long [^UUID app-id]
  (let [mac (doto (Mac/getInstance "HmacSHA256")
              (.init @config/rate-limit-hmac-secret))
        digest (.doFinal mac (uuid-util/->bytes app-id))]
    (.getInt (ByteBuffer/wrap digest))))

(defn take-webhook-count-lock!
  "Allows us to take a lock before we create a new webhook so that we can
   prevent anybody from sneaking past the webhook limit."
  [conn app-id]
  (sql/select ::take-webhook-count-lock!
              conn
              ["select pg_advisory_xact_lock(?::int4, ?::int4)"
               (config/pg-lock-ns :webhook)
               (app-id->lock-key app-id)]))

(def check-webhook-limit-q
  (uhsql/preformat {:select [[:%count.* :webhook-count]]
                    :from :webhooks
                    :where [:and
                            [:= :status [:cast [:inline "active"] :webhook_status]]
                            [:= :app-id :?app-id]]}))

(defn check-webhook-limit!
  "Checks that app is below the webhook limit, will throw a validation error
   if there are more then 100 (by default) active webhooks for the app."
  [conn app-id]
  (let [{:keys [webhook_count]}
        (sql/select-one ::check-webhook-limit!
                        conn
                        (uhsql/formatp check-webhook-limit-q
                                       {:app-id app-id}))
        max-webhooks (maximum-active-webhooks)]
    (when (>= webhook_count max-webhooks)
      (ex/throw-validation-err! :webhooks
                                {:app-id app-id}
                                [{:message (format "An app may not have more than %d active webhooks."
                                                   max-webhooks)}]))))

(def check-webhook-duplicate-q
  (uhsql/preformat {:select :id
                    :from :webhooks
                    :where [:and
                            [:= :status [:inline [:cast [:inline "active"] :webhook_status]]]
                            [:= :app-id :?app-id]
                            [:= :id-attr-ids :?id-attr-ids]
                            [:= :actions :?actions]
                            [:= :sink :?sink]]}))

(defn check-webhook-duplicate!
  "Checks that app doesn't already have a webhook with the same properties.
   Will throw a validation error if it finds one.
   Pass ignore-id if you're running an update on a webhook to prevent the update
   from seeing itself."
  [conn app-id {:keys [url id-attr-ids actions ignore-id]}]
  (let [{:keys [id]}
        (sql/select-one ::check-webhook-duplicate!
                        conn
                        (uhsql/formatp check-webhook-duplicate-q
                                       {:app-id app-id
                                        :id-attr-ids (with-meta (or id-attr-ids []) {:pgtype "uuid[]"})
                                        :actions (with-meta (or actions []) {:pgtype "webhook_action[]"})
                                        :sink {:url url}}))]
    (when (and id
               (not= id ignore-id))
      (ex/throw-validation-err! :webhooks
                                {:app-id app-id}
                                [{:message "A webhook already exists with all of the same properties"
                                  :hint {:webhook-id id}}]))))

(def create-q
  (uhsql/preformat {:insert-into :webhooks
                    :values [{:id :?id
                              :app-id :?app-id
                              :topics :?topics
                              :id-attr-ids :?id-attr-ids
                              :actions :?actions
                              :status [:inline [:cast [:inline "active"] :webhook_status]]
                              :sink :?sink}]}))

(defn etypes->id-attr-ids+topics!
  "Resolves etypes to a set of id-attr-ids (the `id` attr for each etype) and a
   bloom-filter `topics` value. Throws a validation error if any etype is unknown."
  [app-id etypes]
  (let [attrs (attr-model/get-by-app-id app-id)
        id-attr-ids (reduce (fn [attr-ids etype]
                              (let [attr-id (:id (attr-model/seek-by-fwd-ident-name [etype "id"] attrs))]
                                (when-not attr-id
                                  (ex/throw-validation-err!
                                   :webhook
                                   {:etype etype}
                                   [{:message (format "Could not find matching table for %s" etype)}]))
                                (conj attr-ids attr-id)))
                            #{}
                            etypes)
        topics (reduce (fn [acc id]
                         (bit-or acc (history/bloom-bit id)))
                       0
                       id-attr-ids)]
    (when-not (seq id-attr-ids)
      (ex/throw-validation-err! :webhook {:etypes etypes} [{:message "Webhook must have at least one table."}]))
    {:id-attr-ids id-attr-ids
     :topics topics}))

(defn create!
  "Creates a new webhook, validating that the etypes are valid, the webhook url is valid,
   and that the app has not exceeded the maximum number of webhooks."
  ([params] (create! (aurora/conn-pool :write) params))
  ([conn {:keys [app-id etypes actions url]}]
   (assert-valid-url! url)
   (let [{:keys [id-attr-ids topics]} (etypes->id-attr-ids+topics! app-id etypes)]
     (when-not (seq actions)
       (ex/throw-validation-err! :webhook {:actions actions} [{:message "Webhook must have at least one action."}]))
     (next.jdbc/with-transaction [conn conn]
       (take-webhook-count-lock! conn app-id)
       (check-webhook-limit! conn app-id)
       (check-webhook-duplicate! conn app-id {:url url
                                              :id-attr-ids id-attr-ids
                                              :actions actions})
       (sql/execute-one! ::create!
                         conn
                         (uhsql/formatp create-q
                                        {:id (random-uuid)
                                         :app-id app-id
                                         :id-attr-ids (with-meta id-attr-ids {:pgtype "uuid[]"})
                                         :topics topics
                                         :actions (with-meta actions {:pgtype "webhook_action[]"})
                                         :sink {:url url}}))))))

(def disable-q (uhsql/preformat {:update :webhooks
                                 :set {:status [:cast [:inline "disabled"] :webhook_status]
                                       :disabled_reason :?reason}
                                 :where [:and
                                         [:= :app-id :?app-id]
                                         [:= :id :?webhook-id]]}))

(defn disable!
  ([params] (disable! (aurora/conn-pool :write) params))
  ([conn {:keys [app-id webhook-id reason]}]
   (with-cache-invalidation {:app-id app-id
                             :webhook-id webhook-id}
     (sql/do-execute! ::disable!
                      conn
                      (uhsql/formatp disable-q {:app-id app-id
                                                :webhook-id webhook-id
                                                :reason reason})))))

(def enable-q (uhsql/preformat {:update :webhooks
                                :set {:status [:cast [:inline "active"] :webhook_status]
                                      :disabled_reason nil}
                                :where [:and
                                        [:= :app-id :?app-id]
                                        [:= :id :?webhook-id]]}))

(defn enable!
  ([params] (enable! (aurora/conn-pool :write) params))
  ([conn {:keys [app-id webhook-id reason]}]
   (with-cache-invalidation {:app-id app-id
                             :webhook-id webhook-id}
     (next.jdbc/with-transaction [conn conn]
       (take-webhook-count-lock! conn app-id)
       (check-webhook-limit! conn app-id)
       (let [existing (get-by-app-id-and-webhook-id! conn {:app-id app-id
                                                           :webhook-id webhook-id})]
         (check-webhook-duplicate! conn app-id {:url (-> existing :sink (get "url"))
                                                :id-attr-ids (:id_attr_ids existing)
                                                :actions (:actions existing)
                                                :ignore-id webhook-id}))
       (sql/do-execute! ::enable!
                        conn
                        (uhsql/formatp enable-q {:app-id app-id
                                                 :webhook-id webhook-id
                                                 :reason reason}))))))

(def update-q
  (uhsql/preformat
   {:update :webhooks
    :set {:sink [:coalesce [:cast :?sink :jsonb] :sink]
          :id-attr-ids [:coalesce [:cast :?id-attr-ids (keyword "uuid[]")] :id-attr-ids]
          :topics [:coalesce :?topics :topics]
          :actions [:coalesce [:cast :?actions (keyword "webhook_action[]")] :actions]}
    :where [:and
            [:= :app-id :?app-id]
            [:= :id :?webhook-id]]}))

(defn update!
  "Partial update of a webhook's url, etypes, and/or actions. Pass only the
   fields you want to change. Does not touch status — use disable!/enable!."
  ([params] (update! (aurora/conn-pool :write) params))
  ([conn {:keys [app-id webhook-id url etypes actions] :as params}]
   (when (contains? params :url)
     (assert-valid-url! url))
   (when (contains? params :actions)
     (when-not (seq actions)
       (ex/throw-validation-err! :webhook
                                 {:actions actions}
                                 [{:message "Webhook must have at least one action."}])))
   (let [{new-id-attr-ids :id-attr-ids
          new-topics :topics} (when (contains? params :etypes)
                                (etypes->id-attr-ids+topics! app-id etypes))]
     (with-cache-invalidation {:app-id app-id
                               :webhook-id webhook-id}
       (next.jdbc/with-transaction [conn conn]
         (take-webhook-count-lock! conn app-id)
         (let [existing (get-by-app-id-and-webhook-id! conn {:app-id app-id
                                                             :webhook-id webhook-id})]
           (check-webhook-duplicate! conn app-id {:url (or url
                                                           (-> existing :sink (get "url")))
                                                  :id-attr-ids (or new-id-attr-ids
                                                                   (:id_attr_ids existing))
                                                  :actions (or actions
                                                               (:actions existing))
                                                  :ignore-id webhook-id}))
         (sql/do-execute! ::update!
                          conn
                          (uhsql/formatp
                           update-q
                           {:app-id app-id
                            :webhook-id webhook-id
                            :sink (when (contains? params :url) {:url url})
                            :id-attr-ids (when new-id-attr-ids
                                           (with-meta new-id-attr-ids {:pgtype "uuid[]"}))
                            :topics new-topics
                            :actions (when (contains? params :actions)
                                       (with-meta actions {:pgtype "webhook_action[]"}))})))))))

(def delete-q
  (uhsql/preformat {:delete-from :webhooks
                    :where [:and
                            [:= :app-id :?app-id]
                            [:= :id :?webhook-id]]}))

(defn delete!
  ([params] (delete! (aurora/conn-pool :write) params))
  ([conn {:keys [app-id webhook-id]}]
   (with-cache-invalidation {:app-id app-id
                             :webhook-id webhook-id}
     (sql/do-execute! ::delete!
                      conn
                      (uhsql/formatp delete-q {:app-id app-id
                                               :webhook-id webhook-id})))))

(def requeue-q
  (uhsql/preformat {:update :webhook-events
                    :set {:status [:cast [:inline "pending"] :webhook_event_status]}
                    :where [:and
                            [:= :app-id :?app-id]
                            [:= :webhook-id :?webhook-id]
                            [:= :isn :?isn]
                            [:= :machine-id nil]]}))

(defn requeue!
  "Re-queues an event for delivery unless it is locked by another machine"
  ([params] (requeue! (aurora/conn-pool :write) params))
  ([conn {:keys [app-id webhook-id isn]}]
   (sql/execute-one! ::requeue!
                     conn
                     (uhsql/formatp requeue-q
                                    {:isn isn
                                     :app-id app-id
                                     :webhook-id webhook-id}))))

(def attr-id-column-idx 2)
(def pg-size-column-idx 12)

(defn webhook-matches? [wal-record {:keys [id_attr_ids
                                           actions]}]
  (let [triple-groups (group-by :action (:triple-changes wal-record))]
    (reduce (fn [_ action]
              (case action
                ;; To do a create, you had to insert a triple with the id attr
                "create" (when (reduce (fn [_ {:keys [columns]}]
                                         (let [attr-id (-> columns
                                                           (nth attr-id-column-idx)
                                                           :value
                                                           parse-uuid)]
                                           (when (not (nil? (ucoll/index-of attr-id id_attr_ids)))
                                             (reduced true))))
                                       nil
                                       (:insert triple-groups))
                           (reduced true))
                ;; To do an update, you had to update the triple with the id attr
                "update" (when (reduce (fn [_ {:keys [columns] :as wal-entry}]
                                         (let [attr-id (-> columns
                                                           (nth attr-id-column-idx)
                                                           :value
                                                           parse-uuid)]
                                           (when (and (not (nil? (ucoll/index-of attr-id id_attr_ids)))
                                                      ;; Filter out updates to pg-size
                                                      (= (:value (nth columns pg-size-column-idx))
                                                         (:value (nth (:identity wal-entry) pg-size-column-idx))))
                                             (reduced true))))
                                       nil
                                       (:update triple-groups))
                           (reduced true))
                ;; To do a delete, you had to delete the triple with the id attr
                "delete" (when (reduce (fn [_ wal-entry]
                                         (let [attr-id (-> wal-entry
                                                           :identity (nth attr-id-column-idx)
                                                           :value
                                                           parse-uuid)]
                                           (when (not (nil? (ucoll/index-of attr-id id_attr_ids)))
                                             (reduced true))))
                                       nil
                                       (:delete triple-groups))
                           (reduced true))))
            nil
            actions)))

(defn collect-create-event-params [events]
  (loop [events events
         webhook-id (transient [])
         isn (transient [])
         app-id (transient [])
         status (transient [])
         partition-bucket (transient [])]
    (if-let [event (first events)]
      (recur (rest events)
             (conj! webhook-id (:webhook-id event))
             (conj! isn (:isn event))
             (conj! app-id (:app-id event))
             (conj! status (:status event))
             (conj! partition-bucket (:partition-bucket event)))
      {:webhook-id (with-meta (persistent! webhook-id) {:pgtype "uuid[]"})
       :isn (with-meta (persistent! isn) {:pgtype "isn[]"})
       :app-id (with-meta (persistent! app-id) {:pgtype "uuid[]"})
       :status (with-meta (persistent! status) {:pgtype "webhook_event_status[]"})
       :partition-bucket (with-meta (persistent! partition-bucket) {:pgtype "int[]"})})))

(def create-events-q
  (uhsql/preformat {:insert-into [[:webhook-events [:webhook-id :isn :app-id :status :partition-bucket]]
                                  {:select [:webhook-id
                                            [[:cast [:composite :slot-num :lsn] :isn]]
                                            :app-id
                                            :status
                                            :partition-bucket]
                                   :from [[[:unnest :?webhook-id :?isn :?app-id :?status :?partition-bucket]
                                           [:t [:composite :webhook-id :slot-num :lsn :app-id :status :partition-bucket]]]]}]
                    :on-conflict [:webhook-id :isn :partition-bucket]
                    :do-nothing true
                    :returning [:webhook-id :isn :partition-bucket]}))

(defn create-events!
  "Takes the wal-records and a list of potential webhooks.
   Creates webhook events for each match where there is a valid change."
  ([wal-records matches]
   (create-events! (aurora/conn-pool :write) wal-records matches))
  ([conn wal-records matches]
   (tracer/with-span! {:name "webhook/create-events!"
                       :attributes {:match-count (count matches)}}
     (let [get-wal-record (vmemoize (fn [isn]
                                      (ucoll/seek #(= isn (:isn %)) wal-records)))
           events (ucoll/reduce-tr (fn [acc {:keys [isn] :as match}]
                                     (let [wal-record (get-wal-record isn)]
                                       (if (webhook-matches? wal-record match)
                                         (conj! acc {:webhook-id (:webhook_id match)
                                                     :isn isn
                                                     :app-id (:app-id wal-record)
                                                     :status "pending"
                                                     :partition-bucket (history/partition-bucket-of-wal-record wal-record)})
                                         acc)))

                                   []
                                   matches)]
       (tracer/add-data! {:attributes {:event-count (count events)
                                       :false-positives (- (count matches)
                                                           (count events))}})
       (when (seq events)
         (let [params (collect-create-event-params events)]
           (sql/execute! ::create-events!
                         conn
                         (uhsql/formatp create-events-q params))))))))

(def claim-events-q
  (uhsql/preformat {:select [:webhook-id
                             :isn
                             :partition-bucket
                             :app-id
                             :created-at
                             [[:coalesce [:cardinality :attempts] :0] :attempt-count]]
                    :from [[[:claim_webhook_events :?machine-id [:cast :?max-apps :int] [:cast :?max-per-app :int]]]]}))

(defn claim-events!
  ([params] (claim-events! (aurora/conn-pool :write) params))
  ([conn {:keys [max-apps max-per-app machine-id]
          :or {max-apps 10
               max-per-app 10
               machine-id config/machine-id}}]
   (sql/execute! ::claim-events!
                 conn
                 (uhsql/formatp claim-events-q {:machine-id machine-id
                                                :max-apps max-apps
                                                :max-per-app max-per-app}))))

(def claim-retry-events-q
  (uhsql/preformat {:with [[:locked {:select [:ctid
                                              :tableoid
                                              :partition_bucket
                                              :next_attempt_after]
                                     :from :webhook-events
                                     :for [:update :skip-locked]
                                     :where [:and
                                             [:= :status [:cast [:inline "error"] :webhook_event_status]]
                                             [:< :next-attempt-after :?attempt-after]
                                             [:= :partition_bucket [:any :?buckets]]]
                                     :order-by [[:next-attempt-after :asc]]
                                     :limit :?max-events}]]
                    :update :webhook-events
                    :set {:status [:cast [:inline "processing"] :webhook_event_status]
                          :machine-id :?machine-id
                          :next-attempt-after nil}
                    :from :locked
                    :where [:and
                            [:= :webhook-events.ctid :locked.ctid]
                            [:= :webhook-events.tableoid :locked.tableoid]
                            [:= :webhook-events.partition-bucket :locked.partition-bucket]]
                    :returning [:webhook-events.webhook-id
                                :webhook-events.isn
                                :webhook-events.partition-bucket
                                :webhook-events.app-id
                                :locked.next-attempt-after
                                [[:coalesce [:cardinality :attempts] :0] :attempt-count]]}))

(defn claim-retry-events!
  "Claims the events that are ready to retry (status = error and next_attempt_after > now),
   oldest first"
  ([params] (claim-retry-events! (aurora/conn-pool :write) params))
  ([conn {:keys [max-events attempt-after machine-id]
          :or {max-events 100
               attempt-after (Instant/now)
               machine-id config/machine-id}}]
   (let [current-bucket (history/partition-bucket-for-time attempt-after)
         previous-bucket (history/previous-partition-bucket current-bucket)
         buckets (with-meta [current-bucket previous-bucket] {:pgtype "int[]"})
         params {:machine-id machine-id
                 :max-events max-events
                 :attempt-after attempt-after
                 :buckets buckets}]
     (sql/execute! ::claim-retry-events!
                   conn
                   (uhsql/formatp claim-retry-events-q params)))))

(def record-attempt-q
  (uhsql/preformat {:update :webhook-events
                    :set {:status [:cast :?status :webhook_event_status]
                          :attempts [:array_append :attempts :?attempt]
                          :machine-id nil
                          :next-attempt-after :?next-attempt-after}
                    :where [:and
                            [:= :webhook-id :?webhook-id]
                            [:= :isn :?isn]
                            [:= :partition-bucket :?partition-bucket]
                            [:= :machine-id :?machine-id]]}))

(def max-attempts 11)

(defn retry-duration
  "Determines how long to wait before the next retry.
   Uses the same schedule as Stripe's webhooks.
   With 11 attempts, we will give up after 3 days."
  ^Duration [^long previous-attempt-count]
  (case previous-attempt-count
    0 (Duration/ofMinutes 1)
    1 (Duration/ofMinutes 5)
    2 (Duration/ofMinutes 30)
    3 (Duration/ofHours 2)
    4 (Duration/ofHours 5)
    5 (Duration/ofHours 10)
    (Duration/ofHours 12)))

(defn record-attempt!
  "Updates the webhook event status and adds the attempt to the attempts array on the row."
  ([event attempt] (record-attempt! (aurora/conn-pool :write)
                                    event
                                    attempt
                                    config/machine-id))
  ([conn
    {:keys [app_id webhook_id isn partition_bucket attempt_count]}
    attempt
    machine-id]
   (let [gone? (= 410 (:status-code attempt))
         status (cond (:success? attempt)
                      "success"

                      (or gone?
                          (= "disabled" (:error-type attempt))
                          (>= (inc attempt_count) max-attempts))
                      "failed"

                      :else "error")
         params {:webhook-id webhook_id
                 :isn isn
                 :partition-bucket partition_bucket
                 :machine-id machine-id
                 :attempt attempt
                 :status status
                 :next-attempt-after (when (= status "error")
                                       (.plus (Instant/now)
                                              ^Duration (retry-duration attempt_count)))}
         res (sql/do-execute! ::record-attempt!
                              conn
                              (uhsql/formatp record-attempt-q
                                             params))]

     ;; Allows servers to turn off the spigot by returning a 410 if someone
     ;; typos a domain or tries to attack one
     (when (and gone?
                ;; Don't mark as disabled if someone stole the event from us
                (some-> res
                        first
                        :next.jdbc/update-count
                        pos?))
       (disable! conn {:app-id app_id
                       :webhook-id webhook_id
                       :reason "Endpoint returned 410 status code."}))
     res)))

(def free-stuck-events-q
  (uhsql/formatp (uhsql/preformat {:update :webhook-events
                                   :set {:status [:cast [:inline "pending"] :webhook_event_status]
                                         :machine-id nil}
                                   :where [:and
                                           [:= :status [:cast [:inline "processing"] :webhook_event_status]]
                                           [:< :updated-at [:- :%now [:interval [:inline "1 minute"]]]]]
                                   :returning [:webhook-id :isn :partition-bucket]})
                 {}))

(defn free-stuck-events!
  ([] (free-stuck-events! (aurora/conn-pool :write)))
  ([conn]
   (sql/execute! ::free-stuck-events! conn free-stuck-events-q)))

(defn uuids->labels [attrs ent]
  (persistent!
   (reduce-kv (fn [acc attr-id v]
                (let [attr (-> attr-id
                               parse-uuid
                               (attr-model/seek-by-id attrs))]
                  (if (= :blob (:value-type attr))
                    (assoc! acc (attr-model/fwd-label attr) v)
                    acc)))
              (transient {})
              ent)))

(defn record-idempotency-key
  "Creates a sha-256 hash of the inputs and generates a UUID from the first
   128 bits. Clients can use it to ensure that they don't handle the same
   record twice."
  [{:keys [^String etype ^String action ^UUID id ^ISN isn]}]
  (let [digest (MessageDigest/getInstance "SHA-256")]
    (.update digest (.getBytes etype StandardCharsets/UTF_8))
    (.update digest (.getBytes action StandardCharsets/UTF_8))
    (.update digest (uuid-util/->bytes id))
    (.update digest (isn/->bytes isn))
    (uuid-util/<-bytes (.digest digest))))

(defn payload-idempotency-key
  "Creates a sha-256 hash of the inputs and generates a UUID from the first
   128 bits. Clients can use it to ensure that they don't handle the same
   payload twice."
  [{:keys [^UUID webhook-id ^ISN isn]}]
  (let [digest (MessageDigest/getInstance "SHA-256")]
    (.update digest (uuid-util/->bytes webhook-id))
    (.update digest (isn/->bytes isn))
    (uuid-util/<-bytes (.digest digest))))

(defn webhook-data-for-wal-record
  "Returns a list of records:
   [{etype: <etype>
     id: <uuid>
     action: <create|update|delete>}
     before: <?ent>
     after: <?ent>]"
  [webhook wal-record]
  (let [attrs (attr-model/get-by-app-id (:app-id wal-record))
        ents-after (topics/extract-entities-after wal-record)
        ents-before (topics/extract-entities-before attrs
                                                    ents-after
                                                    wal-record)
        etypes (fn [etype]
                 (not (nil? (ucoll/index-of etype (:etypes webhook)))))
        actions (fn [action]
                  (not (nil? (ucoll/index-of action (:actions webhook)))))]
    (concat (for [[etype ents] ents-after
                  [id ent] ents
                  :let [ent-before (get-in ents-before [etype id])
                        action (if ent-before "update" "create")]
                  :when (and (etypes etype)
                             (actions action))
                  :let [id (parse-uuid id)
                        before (when (= action "update")
                                 (uuids->labels attrs ent-before))
                        after (uuids->labels attrs ent)]
                  ;; Filters out the updates where we only add or remove a link,
                  ;; we currently don't support webhooks for linking
                  :when (not= before after)]
              {:etype etype
               :action action
               :id id
               :before before
               :after after
               :idempotencyKey (record-idempotency-key {:etype etype
                                                        :action action
                                                        :id id
                                                        :isn (:isn wal-record)})})
            (for [[etype ents] ents-before
                  [id ent] ents
                  :when (and (not (get-in ents-after [etype id]))
                             (etypes etype)
                             (actions "delete"))
                  :let [id (parse-uuid id)]]
              {:etype etype
               :action "delete"
               :id id
               :before (uuids->labels attrs ent)
               :after nil
               :idempotencyKey (record-idempotency-key {:etype etype
                                                        :action "delete"
                                                        :id id
                                                        :isn (:isn wal-record)})}))))

(defn webhook-data-for-isn
  "Returns a list of records:
   [{etype: <etype>
     id: <uuid>
     action: <create|update|delete>}
     before: <?ent>
     after: <?ent>]"
  ([params] (webhook-data-for-isn (aurora/conn-pool :read) params))
  ([conn {:keys [app-id isn webhook]}]
   (when-let [{:keys [wal-record]} (history/get-by-app-id-and-isn conn {:isn isn
                                                                        :app-id app-id})]
     (webhook-data-for-wal-record webhook wal-record))))
