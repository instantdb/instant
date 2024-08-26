(ns instant.reactive.invalidator
  (:require
   [clojure.core.async :as a]
   [clojure.set :as clojure-set]
   [instant.config :as config]
   [instant.db.pg-introspect :as pg-introspect]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.wal :as wal]
   [instant.reactive.session :as session]
   [instant.reactive.store :as rs]
   [instant.util.async :as ua]
   [instant.util.coll :as ucoll]
   [instant.util.json :refer [<-json]]
   [instant.util.tracer :as tracer])
  (:import (java.util UUID)))

(declare wal-opts)

(defn- topics-for-triple-insert [change]
  (let [zipped (ucoll/zip (map keyword (:columnnames change))
                          (:columnvalues change))
        m (into {} zipped)
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
  (let [zipped (ucoll/zip (map keyword (:columnnames change))
                          (:columnvalues change))
        m (into {} zipped)
        e (UUID/fromString (:entity_id m))
        a (UUID/fromString (:attr_id m))
        ks (->> #{:ea :eav :av :ave :vae}
                (filter m))]
    ;; (XXX): If we had the old value we wouldn't need to do this wildcard
    ;; business. Would be better if we can be more specific
    (map (fn [k] [k #{e} #{a} '_]) ks)))

(defn- topics-for-triple-delete [change]
  (let [{:keys [oldkeys]} change
        zipped (ucoll/zip (map keyword (:keynames oldkeys))
                          (:keyvalues oldkeys))
        m (into {} zipped)
        e (UUID/fromString (:entity_id m))
        a (UUID/fromString (:attr_id m))
        ;; (XXX): The changeset doesn't include the index cols of the triple
        ;; so for now we just invalidate all possible indexes
        ks #{:ea :eav :av :ave :vae}]
    ;; (XXX): Similar to update, we don't have the prev val, so we use wildcard
    ;; later on lets think how we can be more specific
    (map (fn [k] [k #{e} #{a} '_]) ks)))

(defn- topics-for-change [{:keys [kind] :as change}]
  ;; (XXX): We only handle triples atm, later on we should handle things
  ;; like add/delete attrs and apps
  (condp = kind
    "insert" (topics-for-triple-insert change)
    "update" (topics-for-triple-update change)
    "delete" (topics-for-triple-delete change)
    #{}))

(defn topics-for-triple-changes [changes]
  (->> changes
       (mapcat topics-for-change)
       set))

(defn- topics-for-ident-upsert [{:keys [columnvalues]}]
  (let [indexes #{:ea :eav :av :ave :vae}
        attr-id (UUID/fromString (nth columnvalues 2))
        topics (map (fn [k] [k '_ attr-id '_]) indexes)]
    (set topics)))

(defn- topics-for-attr-upsert [{:keys [columnvalues]}]
  (let [indexes #{:ea :eav :av :ave :vae}
        attr-id (UUID/fromString (first columnvalues))
        topics (map (fn [k] [k '_ attr-id '_]) indexes)]
    (set topics)))

(defn- topics-for-attr-delete [{:keys [oldkeys]}]
  (let [attr-id (UUID/fromString (first (:keyvalues oldkeys)))
        indexes #{:ea :eav :av :ave :vae}
        topics (map (fn [k] [k '_ attr-id '_]) indexes)]
    (set topics)))

(defn topics-for-ident-change [{:keys [kind] :as change}]
  (condp = kind
    "update" (topics-for-ident-upsert change)
    "insert" (topics-for-ident-upsert change)
    #{}))

(defn topics-for-ident-changes [changes]
  (->> changes
       (mapcat topics-for-ident-change)
       set))

(defn topics-for-attr-change [{:keys [kind] :as change}]
  (condp = kind
    "update" (topics-for-attr-upsert change)
    "insert" (topics-for-attr-upsert change)
    "delete" (topics-for-attr-delete change)
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
  (let [zipped (ucoll/zip (map keyword (:columnnames change))
                          (:columnvalues change))
        m (into {} zipped)
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
  (let [zipped (ucoll/zip (map keyword (:columnnames change))
                          (:columnvalues change))
        m (into {} zipped)
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
  (let [{:keys [oldkeys]} change
        zipped (ucoll/zip (map keyword (:keynames oldkeys))
                          (:keyvalues oldkeys))
        m (into {} zipped)
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

(defn- topics-for-byop-change [table-info {:keys [kind] :as change}]
  ;; (XXX): We only handle triples atm, later on we should handle things
  ;; like add/delete attrs and apps
  (case kind
    "insert" (topics-for-byop-triple-insert table-info change)
    "update" (topics-for-byop-triple-update table-info change)
    "delete" (topics-for-byop-triple-delete table-info change)
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

(defn ident-changes-only [changes]
  (filter (comp #{"idents"} :table) changes))

(defn attr-changes-only [changes]
  (filter (comp #{"attrs"} :table) changes))

(defn triple-changes-only [changes]
  (filter (comp #{"triples"} :table) changes))

(defn transaction-changes-only [changes]
  (filter (comp #{"transactions"} :table) changes))

(defn extract-app-id
  [{:keys [columnvalues] :as _change}]
  (when-let [app-id (second columnvalues)]
    (UUID/fromString app-id)))

(defn extract-tx-id [{:keys [columnvalues] :as _change}]
  (first columnvalues))

(defn transform-wal-record [{:keys [change] :as _record}]
  (let [ident-changes (ident-changes-only change)
        triple-changes (triple-changes-only change)
        attr-changes (attr-changes-only change)
        some-changes (or (seq ident-changes)
                         (seq triple-changes)
                         (seq attr-changes))
        [transactions-change] (transaction-changes-only change)
        app-id (extract-app-id transactions-change)]
    (when (and some-changes transactions-change app-id)
      {:attr-changes attr-changes
       :ident-changes ident-changes
       :triple-changes triple-changes
       :app-id app-id
       :tx-id (extract-tx-id transactions-change)})))

(defn wal-record-xf
  "Filters wal records for supported changes. Returns [app-id changes]"
  []
  (keep #'transform-wal-record))

(defn transform-byop-wal-record [{:keys [change nextlsn]}]
  ;; TODO(byop): if change is empty, then there might be changes to the schema
  (let [triple-changes (filter (fn [c]
                                 (#{"update" "insert" "delete"} (:kind c)))
                               change)]
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
                                      :session-id id}
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
  (if-not config/instant-on-instant-app-id
    (let [chan (a/chan 1 (wal-record-xf))]
      {:wal-chan chan
       :worker-chan chan})
    (let [wal-chan (a/chan 1)
          mult (a/mult wal-chan)
          worker-chan (a/chan 1 (wal-record-xf))
          byop-chan (a/chan 1)]
      (a/tap mult worker-chan)
      (a/tap mult byop-chan)
      {:wal-chan wal-chan
       :worker-chan worker-chan
       :byop-chan byop-chan})))

(defn start
  "Entry point for invalidator. Starts a WAL listener and pipes WAL records to
  our parition router. Partion router dispatches records to app workers who run `go-work`"
  []
  (let [{:keys [wal-chan worker-chan byop-chan]} (create-wal-chans)
        wal-opts {:to wal-chan
                  :ex-handler wal-ex-handler
                  :conn-config (config/get-aurora-config)
                  :slot-name @config/process-id
                  :shutdown? (atom false)}]

    (def wal-opts wal-opts)

    (ua/fut-bg
     (wal/start-worker wal-opts))
    (ua/fut-bg
     (start-worker rs/store-conn worker-chan))

    (when byop-chan
      (ua/fut-bg
       (start-byop-worker rs/store-conn byop-chan)))))

(defn stop []
  (wal/shutdown! wal-opts))

(defn restart []
  (stop)
  (start))
