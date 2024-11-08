(ns instant.reactive.invalidator
  (:require
   [clojure.core.async :as a]
   [clojure.set :as clojure-set]
   [instant.config :as config]
   [instant.db.model.attr :as attr-model]
   [instant.db.pg-introspect :as pg-introspect]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.wal :as wal]
   [instant.reactive.session :as session]
   [instant.reactive.store :as rs]
   [instant.util.async :as ua]
   [instant.util.crypt :as crypt-util]
   [instant.util.json :refer [<-json ->json]]
   [instant.util.tracer :as tracer])
  (:import (java.util UUID)
           (java.sql Timestamp)))

(declare wal-opts)

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
        v (if (:eav m)
            (UUID/fromString v-parsed)
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
  [store-conn {:keys [app-id tx-id] :as wal-record}]
  (let [topics (topics-for-changes wal-record)
        [db session-ids] (rs/mark-stale-topics! store-conn app-id tx-id topics)
        sockets (keep (partial rs/get-socket db) session-ids)]
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
  [table-info app-id store-conn {:keys [tx-id] :as record}]
  (let [topics (topics-for-byop-changes table-info record)
        [db session-ids] (rs/mark-stale-topics! store-conn app-id tx-id topics)
        sockets (keep (partial rs/get-socket db) session-ids)]
    sockets))

;; ------
;; wal record xf

(defn update-users-shims!
  "Updates our view of the mapping from app-users to the attributes we use to
   generate the $users table.
   Only looks at inserts. If the table is disabled, we won't remove them until
   the server restarts, but the worst that will happen is that we create a bit
   of extra spam in the invalidator when the app gets a new user."
  [idents-changes users-shims]
  (doseq [{:keys [action columns]} idents-changes
          :when (= action :insert)
          :let [{:strs [app_id etype label attr_id]} (columns->map columns)]
          :when (and (= "$users" etype)
                     (#{"id" "email"} label))]
    (swap! users-shims
           assoc-in
           [app_id (case label
                     "id" :id-attr-id
                     "email" :email-attr-id)]
           attr_id)))

(defn $users-triple-change-for-attr
  "Coerces the app-user update into the triple format"
  [app-id app-users-id created-at-ms attr-id attr-value]
  (let [value (->json attr-value)
        value-md5 (-> value crypt-util/str->md5 crypt-util/bytes->hex-string)]
    {:action :update
     :shmema "public"
     :table "triples"
     :columns [{:name "app_id" :type "uuid" :value app-id}
               {:name "entity_id" :type "uuid" :value app-users-id}
               {:name "attr_id" :type "uuid" :value attr-id}
               {:name "value", :type "jsonb", :value value}
               {:name "value_md5" :type "text" :value value-md5}
               {:name "ea", :type "boolean", :value true}
               {:name "eav", :type "boolean", :value false}
               {:name "av", :type "boolean", :value true}
               {:name "ave", :type "boolean", :value true}
               {:name "vae", :type "boolean", :value false}
               {:name "created_at", :type "bigint", :value created-at-ms}]}))

(defn $users-triples-changes
  "Converts any changes to the app-users table into triples changes.
   It's a noop if the app hasn't enabled the users table."
  [app-users-changes users-shims]
  (mapcat (fn [{:keys [columns]}]
            (let [{:strs [app_id id email created_at]} (columns->map columns)
                  {:keys [id-attr-id email-attr-id]} (get users-shims app_id)]
              (when (and app_id id email created_at id-attr-id email-attr-id)
                (let [created-at-ms (.getTime (Timestamp/valueOf created_at))]
                  [($users-triple-change-for-attr app_id
                                                  id
                                                  created-at-ms
                                                  (str id-attr-id)
                                                  id)
                   ($users-triple-change-for-attr app_id
                                                  id
                                                  created-at-ms
                                                  (str email-attr-id)
                                                  email)]))))
          app-users-changes))

(defn triple-changes-with-app-users [triple-changes app-user-changes users-shims]
  (concat triple-changes
          ($users-triples-changes app-user-changes users-shims)))

(defn app-id-from-columns [columns]
  (some-> columns
          (get-column "app_id")
          (parse-uuid)))

(defn extract-app-id
  [{:keys [columns] :as _change}]
  (app-id-from-columns columns))

(defn extract-tx-id [{:keys [columns] :as _change}]
  (get-column columns "id"))

(defn transform-wal-record [{:keys [changes] :as _record} users-shims]
  (let [{:strs [idents triples attrs transactions app_users]}
        (group-by :table changes)

        triple-changes (triple-changes-with-app-users triples
                                                      app_users
                                                      @users-shims)

        some-changes (or (seq idents)
                         (seq triple-changes)
                         (seq attrs))
        transactions-change (first transactions)
        app-id (extract-app-id transactions-change)]
    (update-users-shims! idents users-shims)

    (doseq [attr attrs]
      (attr-model/evict-app-id-from-cache (or app-id
                                              (extract-app-id attr))))
    (when (and some-changes app-id)
      {:attr-changes attrs
       :ident-changes idents
       :triple-changes triple-changes
       :app-id app-id
       :tx-id (extract-tx-id transactions-change)})))

(defn wal-record-xf
  "Filters wal records for supported changes. Returns [app-id changes]"
  [users-shims]
  (keep (fn [record]
          (transform-wal-record record users-shims))))

(defn transform-byop-wal-record [{:keys [changes nextlsn]}]
  ;; TODO(byop): if change is empty, then there might be changes to the schema
  (let [triple-changes (filter (fn [c]
                                 (#{:update :insert :delete} (:action c)))
                               changes)]
    (when triple-changes
      {:triple-changes triple-changes
       :tx-id (.asLong nextlsn)})))

(defn byop-wal-record-xf
  []
  (keep #'transform-byop-wal-record))

;; ------
;; invalidator

(defn start-worker [store-conn wal-chan]
  (tracer/record-info! {:name "invalidation-worker/start"})
  (loop []
    (let [wal-record (a/<!! wal-chan)]
      (if-not wal-record
        (tracer/record-info! {:name "invalidation-worker/shutdown"})
        (let [{:keys [app-id tx-id]} wal-record]
          (tracer/with-span! {:name "invalidator/work"
                              :attributes {:app-id app-id :tx-id tx-id}}

            (try
              (let [sockets (invalidate! store-conn wal-record)]
                (tracer/add-data! {:attributes {:num-sockets (count sockets)}})
                (doseq [{:keys [id]} sockets]
                  (tracer/with-span! {:name "invalidator/send-refresh"
                                      :attributes {:session-id id}}
                    (session/enqueue->receive-q session/receive-q
                                                {:op :refresh :session-id id}))))
              (catch Throwable t
                (def -wal-record wal-record)
                (def -store-value @store-conn)
                (tracer/add-exception! t {:escaping? false}))))
          (recur))))))

(defn handle-byop-record [table-info app-id store-conn wal-record]
  (when-let [record (transform-byop-wal-record wal-record)]
    (try
      (let [sockets (invalidate-byop! table-info app-id store-conn record)]
        (tracer/add-data! {:attributes {:num-sockets (count sockets)}})
        (doseq [{:keys [id]} sockets]
          (tracer/with-span! {:name "invalidator/send-refresh"
                              :session-id id}
            (session/enqueue->receive-q session/receive-q {:op :refresh
                                                           :session-id id}))))
      (catch Throwable t
        (def -wal-record wal-record)
        (def -store-value @store-conn)
        (tracer/add-exception! t {:escaping? false})))))

(defn start-byop-worker [store-conn wal-chan]
  (tracer/record-info! {:name "invalidation-worker/start-byop"})
  (let [app-id config/instant-on-instant-app-id
        {:keys [table-info]} (pg-introspect/introspect aurora/conn-pool
                                                       "public")]
    (loop []
      (let [wal-record (a/<!! wal-chan)]
        (if-not wal-record
          (tracer/record-info! {:name "invalidation-worker/shutdown-byop"})
          (do
            (try
              (handle-byop-record app-id
                                  table-info
                                  store-conn
                                  wal-record)
              (catch Throwable t
                (def -wal-record wal-record)
                (def -store-value @store-conn)
                (tracer/add-exception! t {:escaping? false})))
            (recur)))))))

;; ------
;; orchestration

(defn wal-ex-handler [e]
  (tracer/record-exception-span! e {:name "invalidator/wal-ex-handler"
                                    :escaping? false})
  (wal/shutdown! wal-opts))

(defn create-wal-chans []
  (let [users-shims (atom {})]
    (if-not config/instant-on-instant-app-id
      (let [chan (a/chan 1 (wal-record-xf users-shims))]
        {:wal-chan chan
         :close-signal-chan (a/chan)
         :worker-chan chan
         :users-shims users-shims})
      (let [wal-chan (a/chan 1)
            mult (a/mult wal-chan)
            worker-chan (a/chan 1 (wal-record-xf users-shims))
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
         :byop-chan byop-chan
         :users-shims users-shims}))))

(defn start
  "Entry point for invalidator. Starts a WAL listener and pipes WAL records to
  our partition router. Partition router dispatches records to app workers who run `go-work`"
  ([]
   (start @config/process-id))
  ([process-id]
   (let [{:keys [wal-chan worker-chan byop-chan close-signal-chan users-shims]}
         (create-wal-chans)

         wal-opts (wal/make-wal-opts {:wal-chan wal-chan
                                      :close-signal-chan close-signal-chan
                                      :ex-handler wal-ex-handler
                                      :conn-config (config/get-aurora-config)
                                      :slot-name process-id})]
     (ua/fut-bg
      (wal/start-worker wal-opts))

     @(:started-promise wal-opts)

     (tracer/with-span! {:name "invalidator/init-users-shims"}
       (reset! users-shims (attr-model/get-all-users-shims aurora/conn-pool)))

     (ua/fut-bg
      (start-worker rs/store-conn worker-chan))

     (when byop-chan
       (ua/fut-bg
        (start-byop-worker rs/store-conn byop-chan)))

     wal-opts)))

(defn start-global []
  (def wal-opts (start)))

(defn stop [wal-opts]
  (let [shutdown-future (future (wal/shutdown! wal-opts))]
    (loop []
      (when-not (realized? shutdown-future)
        (wal/kick-wal aurora/conn-pool)
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
