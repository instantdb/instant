(ns instant.reactive.invalidator
  (:require
   [clojure.core.async :as a]
   [clojure.set :as clojure-set]
   [datascript.core :as ds]
   [instant.config :as config]
   [instant.db.model.attr :as attr-model]
   [instant.db.pg-introspect :as pg-introspect]
   [instant.grouped-queue :as grouped-queue]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.wal :as wal]
   [instant.model.app :as app-model]
   [instant.model.instant-user :as instant-user-model]
   [instant.model.rule :as rule-model]
   [instant.reactive.receive-queue :as receive-queue]
   [instant.reactive.store :as rs]
   [instant.util.async :as ua]
   [instant.util.json :refer [<-json]]
   [instant.util.e2e-tracer :as e2e-tracer]
   [instant.util.tracer :as tracer]
   [instant.db.model.triple :as triple-model])
  (:import
   (java.sql Timestamp)
   (java.time Instant)
   (java.time.temporal ChronoUnit)
   (java.util Map UUID)
   (java.util.concurrent ConcurrentHashMap)
   (org.postgresql.replication LogSequenceNumber)))

(declare wal-opts)

(declare invalidator-q)

(defn columns->map
  ([columns]
   (columns->map columns false))
  ([columns keywordize]
   (reduce (fn [acc column]
             (assoc acc
                    (if keywordize
                      (keyword (:name column))
                      (:name column))
                    (:value column)))
           {}
           columns)))

(defn get-column [columns col-name]
  (first (keep (fn [col]
                 (when (= col-name (:name col))
                   (:value col)))
               columns)))

(defn- topics-for-triple-insert [change]
  (let [m (columns->map (:columns change) true)
        e (UUID/fromString (:entity_id m))
        a (UUID/fromString (:attr_id m))
        v-parsed (<-json (:value m))
        v (cond
            (:eav m)
            (UUID/fromString v-parsed)
            (= (:checked_data_type m) "date")
            (triple-model/parse-date-value v-parsed)
            :else
            v-parsed)
        ks (->> #{:ea :eav :av :ave :vae}
                (filter m))]
    (map (fn [k] [k #{e} #{a} #{v}])
         ks)))

(defn- topics-for-triple-update
  [change]
  (let [m (columns->map (:columns change) true)
        e (UUID/fromString (:entity_id m))
        a (UUID/fromString (:attr_id m))
        ks (->> #{:ea :eav :av :ave :vae}
                (filter m))]
    ;; (XXX): If we had the old value we wouldn't need to do this wildcard
    ;; business. Would be better if we can be more specific
    (map (fn [k] [k #{e} #{a} '_]) ks)))

(defn- topics-for-triple-delete [change]
  (let [m (columns->map (:identity change) true)
        e (UUID/fromString (:entity_id m))
        a (UUID/fromString (:attr_id m))
        ;; (XXX): The changeset doesn't include the index cols of the triple
        ;; so for now we just invalidate all possible indexes
        ks #{:ea :eav :av :ave :vae}]
    ;; (XXX): Similar to update, we don't have the prev val, so we use wildcard
    ;; later on lets think how we can be more specific
    (map (fn [k] [k #{e} #{a} '_]) ks)))

(defn- topics-for-change [{:keys [action] :as change}]
  (case action
    :insert (topics-for-triple-insert change)
    :update (topics-for-triple-update change)
    :delete (topics-for-triple-delete change)
    #{}))

(defn topics-for-triple-changes [changes]
  (->> changes
       (mapcat topics-for-change)
       set))

(defn- topics-for-ident-upsert [{:keys [columns]}]
  (let [indexes #{:ea :eav :av :ave :vae}
        attr-id (parse-uuid (get-column columns "attr_id"))
        topics (map (fn [k] [k '_ #{attr-id} '_]) indexes)]
    (set topics)))

(defn- topics-for-attr-upsert [{:keys [columns]}]
  (let [indexes #{:ea :eav :av :ave :vae}
        attr-id (parse-uuid (get-column columns "id"))
        topics (map (fn [k] [k '_ #{attr-id} '_]) indexes)]
    (set topics)))

(defn- topics-for-attr-delete [{:keys [identity]}]
  (let [attr-id (parse-uuid (get-column identity "id"))
        indexes #{:ea :eav :av :ave :vae}
        topics (map (fn [k] [k '_ #{attr-id} '_]) indexes)]
    (set topics)))

(defn topics-for-ident-change [{:keys [action] :as change}]
  (case action
    :update (topics-for-ident-upsert change)
    :insert (topics-for-ident-upsert change)
    #{}))

(defn topics-for-ident-changes [changes]
  (->> changes
       (mapcat topics-for-ident-change)
       set))

(defn topics-for-attr-change [{:keys [action] :as change}]
  (case action
    :update (topics-for-attr-upsert change)
    :insert (topics-for-attr-upsert change)
    :delete (topics-for-attr-delete change)
    #{}))

(defn topics-for-attr-changes [changes]
  (->> changes
       (mapcat topics-for-attr-change)
       set))

(defn topics-for-changes [{:keys [ident-changes triple-changes attr-changes]}]
  (let [topics-for-attr-changes (topics-for-attr-changes attr-changes)
        topics-for-ident-changes (topics-for-ident-changes ident-changes)
        topics-for-triple-changes (topics-for-triple-changes triple-changes)
        topics (clojure-set/union topics-for-ident-changes
                                  topics-for-triple-changes
                                  topics-for-attr-changes)]
    topics))

(defn- invalidate!
  "Given a collection of changes, stales all relevant queries and returns
  sockets to be refreshed."
  ;; process-id used for tests
  [_process-id store {:keys [app-id tx-id] :as wal-record}]
  (let [topics      (topics-for-changes wal-record)
        session-ids (rs/mark-stale-topics! store app-id tx-id topics)
        sockets     (keep #(:session/socket (rs/session store %)) session-ids)]
    sockets))

(defn- topics-for-byop-triple-insert [table-info change]
  (let [m (columns->map (:columns change) true)
        id-field (get-in table-info [(:table change) :primary-key :field])
        e (get m id-field)
        ;; just making everything :ea for now
        ks [:ea]]
    (for [k ks
          [col v] m
          :let [a (get-in table-info [(:table change) :fields (keyword col) :attr-id])]]
      [k #{e} #{a} #{v}])))

(defn- topics-for-byop-triple-update
  [table-info change]
  (let [m (columns->map (:columns change) true)
        id-field (get-in table-info [(:table change) :primary-key :field])
        e (get m id-field)
        ;; just making everything :ea for now
        ks [:ea]]
    ;; (XXX): If we had the old value we wouldn't need to do this wildcard
    ;; business. Would be better if we can be more specific
    (for [k ks
          [col _v] m
          :let [a (get-in table-info [(:table change) :fields (keyword col) :attr-id])]]
      [k #{e} #{a} '_])))

(defn- topics-for-byop-triple-delete [table-info change]
  (let [m (columns->map (:identity change) true)
        id-field (get-in table-info [(:table change) :primary-key :field])
        e (get m id-field)
        ;; just making everything :ea for now
        ks [:ea]]
    ;; (XXX): Similar to update, we don't have the prev val, so we use wildcard
    ;; later on lets think how we can be more specific
    (for [k ks
          [col _v] m
          :let [a (get-in table-info [(:table change) :fields (keyword col) :attr-id])]]
      [k #{e} #{a} '_])))

(defn- topics-for-byop-change [table-info {:keys [action] :as change}]
  ;; (XXX): We only handle triples atm, later on we should handle things
  ;; like add/delete attrs and apps
  (case action
    :insert (topics-for-byop-triple-insert table-info change)
    :update (topics-for-byop-triple-update table-info change)
    :delete (topics-for-byop-triple-delete table-info change)
    #{}))

(defn topics-for-byop-triple-changes [table-info changes]
  (->> changes
       (mapcat (partial topics-for-byop-change table-info))
       set))

(defn- topics-for-byop-changes [table-info {:keys [triple-changes]}]
  (topics-for-byop-triple-changes table-info triple-changes))

(defn- invalidate-byop!
  "Given a collection of changes, stales all relevant queries and returns
  sockets to be refreshed."
  [table-info app-id store {:keys [tx-id] :as record}]
  (let [topics      (topics-for-byop-changes table-info record)
        session-ids (rs/mark-stale-topics! store app-id tx-id topics)
        sockets     (keep #(:session/socket (rs/session store %)) session-ids)]
    sockets))

;; ------
;; wal record xf

(defn app-id-from-columns [columns]
  (some-> columns
          (get-column "app_id")
          (parse-uuid)))

(defn extract-app-id
  [{:keys [columns] :as _change}]
  (app-id-from-columns columns))

(defn id-from-columns [columns]
  (some-> columns
          (get-column "id")
          (parse-uuid)))

(defn extract-id
  [{:keys [columns] :as _change}]
  (id-from-columns columns))

(defn extract-tx-id [{:keys [columns] :as _change}]
  (get-column columns "id"))

(defn extract-tx-created-at [{:keys [columns] :as _change}]
  (when-let [^String created-at (get-column columns "created_at")]
    (.toInstant (Timestamp/valueOf created-at))))

(defn transform-wal-record [{:keys [changes tx-bytes] :as _record}]
  (let [{:strs [idents triples attrs transactions rules apps instant_users]}
        (group-by :table changes)

        some-changes (or (seq idents)
                         (seq triples)
                         (seq attrs))
        transactions-change (first transactions)
        app-id (extract-app-id transactions-change)]
    (doseq [attr attrs]
      (attr-model/evict-app-id-from-cache (or app-id
                                              (extract-app-id attr))))
    (doseq [rule rules]
      (let [app-id (or app-id (extract-app-id rule))]
        (rule-model/evict-app-id-from-cache app-id)))

    (doseq [app apps]
      (let [app-id (or app-id (extract-id app))]
        (app-model/evict-app-id-from-cache app-id)
        (instant-user-model/evict-app-id-from-cache app-id)))

    (doseq [user instant_users]
      (let [id (extract-id user)]
        (instant-user-model/evict-user-id-from-cache id)))

    (when (and some-changes app-id)
      (let [tx-id (extract-tx-id transactions-change)
            tx-created-at (extract-tx-created-at transactions-change)]
        (e2e-tracer/invalidator-tracking-step! {:tx-id tx-id
                                                :tx-created-at tx-created-at
                                                :name "transform-wal-record"})
        ;; n.b. make sure to update combine-wal-records below if new
        ;;      items are added to this map
        {:attr-changes attrs
         :ident-changes idents
         :triple-changes triples
         :app-id app-id
         :tx-created-at tx-created-at
         :tx-id tx-id
         :tx-bytes tx-bytes}))))

(defn wal-record-xf
  "Filters wal records for supported changes. Returns [app-id changes]"
  []
  (keep #'transform-wal-record))

(defn combine-wal-records
  "Combines a list of wal-records into a single wal-record.
   We combine all of the change lists and advance the tx-id to the
   latest tx-id in the list."
  [r1 r2]
  (when (< (::grouped-queue/combined r1 1) 100)
    ;; Complain loudly if we accidently mix wal-records from multiple apps
    (when (not= (:app-id r1) (:app-id r2))
      (throw (ex-info "app-id mismatch in combine-wal-records" {:r1 r1 :r2 r2})))
    (e2e-tracer/invalidator-tracking-step! {:tx-id (:tx-id r1)
                                            :name "skipped-in-combined-wal-record"})

    ;; Keep the old tx-created-at so that we see the worst case wal-latency-ms
    (-> r1
        (update :attr-changes   (fnil into []) (:attr-changes r2))
        (update :ident-changes  (fnil into []) (:ident-changes r2))
        (update :triple-changes (fnil into []) (:triple-changes r2))
        (update :tx-bytes       (fnil + 0) (:tx-bytes r2))
        (assoc :tx-id           (:tx-id r2)))))

(defn transform-byop-wal-record [{:keys [changes nextlsn]}]
  ;; TODO(byop): if change is empty, then there might be changes to the schema
  (let [triple-changes (filter (fn [c]
                                 (#{:update :insert :delete} (:action c)))
                               changes)]
    (when triple-changes
      {:triple-changes triple-changes
       :tx-id (LogSequenceNumber/.asLong nextlsn)})))

(defn byop-wal-record-xf
  []
  (keep #'transform-byop-wal-record))

;; ------
;; invalidator

(defn- store-snapshot [store app-id]
  (rs/->ReactiveStore
   (ds/conn-from-db @(:sessions store))
   (^[Map] ConcurrentHashMap/new
    (if-let [conn (some-> store
                          :conns
                          (Map/.get app-id)
                          deref
                          ds/conn-from-db)]
      {app-id conn}
      {}))))

(defn wal-latency-ms [{:keys [tx-created-at]}]
  (when tx-created-at
    (.between ChronoUnit/MILLIS tx-created-at (Instant/now))))

(defn process-wal-record [process-id store record-count wal-record]
  (let [{:keys [app-id tx-id tx-created-at tx-bytes]} wal-record]
    (tracer/with-span! {:name "invalidator/work"
                        :attributes {:app-id app-id
                                     :tx-id tx-id
                                     :wal-record-count record-count
                                     :wal-latency-ms (wal-latency-ms wal-record)
                                     :tx-bytes tx-bytes}}

      (try
        (let [sockets (invalidate! process-id store wal-record)]
          (tracer/add-data! {:attributes {:num-sockets (count sockets)
                                          :tx-latency-ms (e2e-tracer/tx-latency-ms tx-created-at)}})
          (e2e-tracer/invalidator-tracking-step! {:tx-id tx-id
                                                  :tx-created-at tx-created-at
                                                  :name "send-refreshes"
                                                  :attributes {:num-sockets (count sockets)}})
          (tracer/with-span! {:name "invalidator/send-refreshes"}
            (doseq [{:keys [id]} sockets]
              (receive-queue/put! {:op :refresh
                                   :session-id id
                                   :tx-id tx-id
                                   :tx-created-at tx-created-at}))))
        (catch Throwable t
          (def -wal-record wal-record)
          (def -store-value (store-snapshot store app-id))
          (tracer/add-exception! t {:escaping? false}))))))

(defn start-worker [process-id store wal-chan]
  (tracer/record-info! {:name "invalidation-worker/start"})
  (let [queue
        (grouped-queue/start
         {:group-key-fn :app-id
          :combine-fn   combine-wal-records
          :process-fn   (fn [_key wal-record]
                         (process-wal-record process-id
                                             store
                                             (::grouped-queue/combined wal-record 1)
                                             wal-record))
          :metrics-path "instant.reactive.invalidator.q"
          :max-workers  8})]
    (a/go
      (loop []
        (when-some [wal-record (a/<! wal-chan)]
          (grouped-queue/put! queue wal-record)
          (recur)))
      (grouped-queue/stop queue)
      (tracer/record-info! {:name "invalidation-worker/shutdown"}))
    queue))

(defn handle-byop-record [table-info app-id store wal-record]
  (when-let [record (transform-byop-wal-record wal-record)]
    (try
      (let [sockets (invalidate-byop! table-info app-id store record)]
        (tracer/add-data! {:attributes {:num-sockets (count sockets)}})
        (tracer/with-span! {:name "invalidator/send-refreshes"}
          (doseq [{:keys [id]} sockets]
            (receive-queue/put! {:op :refresh
                                 :session-id id}))))
      (catch Throwable t
        (def -wal-record wal-record)
        (def -store-value (store-snapshot store app-id))
        (tracer/add-exception! t {:escaping? false})))))

(defn start-byop-worker [store wal-chan]
  (tracer/record-info! {:name "invalidation-worker/start-byop"})
  (let [app-id config/instant-on-instant-app-id
        {:keys [table-info]} (pg-introspect/introspect (aurora/conn-pool :read)
                                                       "public")]
    (loop []
      (let [wal-record (a/<!! wal-chan)]
        (if-not wal-record
          (tracer/record-info! {:name "invalidation-worker/shutdown-byop"})
          (do
            (try
              (handle-byop-record app-id
                                  table-info
                                  store
                                  wal-record)
              (catch Throwable t
                (def -wal-record wal-record)
                (def -store-value store)
                (tracer/add-exception! t {:escaping? false})))
            (recur)))))))

;; ------
;; orchestration

(defn wal-ex-handler [e]
  (tracer/record-exception-span! e {:name "invalidator/wal-ex-handler"
                                    :escaping? false})
  (wal/shutdown! wal-opts))

(defn create-wal-chans []
  (if-not config/instant-on-instant-app-id
    (let [chan (a/chan 1 (wal-record-xf))]
      {:wal-chan chan
       :close-signal-chan (a/chan)
       :worker-chan chan})
    (let [wal-chan (a/chan 1)
          mult (a/mult wal-chan)
          worker-chan (a/chan 1 (wal-record-xf))
          byop-chan (a/chan 1)]
      (a/tap mult worker-chan)
      (a/tap mult byop-chan)
      {:wal-chan wal-chan
       ;; Nothing will ever be put on this chan,
       ;; it will be closed when the wal-chan is closed
       ;; so that the consumer can know to stop waiting for
       ;; its puts to complete
       :close-signal-chan (a/chan)
       :worker-chan worker-chan
       :byop-chan byop-chan})))

(defn start
  "Entry point for invalidator. Starts a WAL listener and pipes WAL records to
  our partition router. Partition router dispatches records to app workers who run `go-work`"
  ([]
   (start @config/process-id))
  ([process-id]
   (let [{:keys [wal-chan worker-chan byop-chan close-signal-chan]}
         (create-wal-chans)

         wal-opts (wal/make-wal-opts {:wal-chan wal-chan
                                      :close-signal-chan close-signal-chan
                                      :ex-handler wal-ex-handler
                                      :get-conn-config (fn []
                                                         (or (config/get-next-aurora-config)
                                                             ;; Use the next db so that we don't
                                                             ;; have to worry about restarting the
                                                             ;; invalidator when failing over to a
                                                             ;; new blue/green deployment
                                                             (config/get-aurora-config)))
                                      :slot-name process-id})]
     (ua/fut-bg
      (wal/start-worker wal-opts))

     @(:started-promise wal-opts)

     (def invalidator-q
       (start-worker process-id rs/store worker-chan))

     (when byop-chan
       (ua/fut-bg
        (start-byop-worker rs/store byop-chan)))

     wal-opts)))

(defn start-global []
  (def wal-opts (start)))

(defn stop [wal-opts]
  (let [shutdown-future (future (wal/shutdown! wal-opts))]
    (loop []
      (when-not (realized? shutdown-future)
        (wal/kick-wal (aurora/conn-pool :write))
        (Thread/sleep 100)
        (recur))))
  (a/close! (:to wal-opts))
  (a/close! (:close-signal-chan wal-opts)))

(defn stop-global []
  (when (bound? #'wal-opts)
    (stop wal-opts)))

(defn restart []
  (stop-global)
  (start-global))
