(ns instant.jdbc.wal
  "Listen to changes in Postgres.

   Background:

   When Postgres makes a change to the database, it first records the change into a
   Write-Ahead Log (WAL). This is useful for error recovery, and crucially,
   for replication.

   Postgres supports two kinds of replication: physical and logical.
   Physical Replication sends disk-level changes (think binary). Logical
   Replication sends data (think transactions)

   Logical Replication is very useful for us. If we subscribed to
   all logical changes in Postgres, we'd be able to keep InstaQL queries up to date.

   This namespace lets you create logical replication streams.
   This is done in three steps:
     1. Create a temporary replication slot. A replication slot is like a registration
        to the master database, saying 'I want to subscribe to you'.
     2. Create a special kind of PGConnection, configured for replication.
     3. Use pgjdbc's `replicationAPI` to start a stream."
  (:require
   [chime.core :as chime-core]
   [clojure.core.async :as a]
   [instant.aurora-config :as aurora-config]
   [instant.config :as config]
   [instant.discord :as discord]
   [instant.gauges :as gauges]
   [instant.health :as health]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.util.async :as ua]
   [instant.util.lang :as lang]
   [instant.util.json :refer [<-json]]
   [instant.util.tracer :as tracer]
   [lambdaisland.uri :as uri]
   [next.jdbc.connection :refer [jdbc-url]])
  (:import
   (java.nio ByteBuffer)
   (java.sql Connection DriverManager)
   (java.time Duration Instant)
   (java.util Properties)
   (java.util.concurrent TimeUnit)
   (org.postgresql PGConnection PGProperty)
   (org.postgresql.replication LogSequenceNumber PGReplicationStream)
   (org.postgresql.replication.fluent.logical ChainedLogicalStreamBuilder)))

;; ----
;; Connection

(defn jdbc-username ^String [db-spec]
  (or (:user db-spec)
      (:user (uri/query-map (jdbc-url db-spec)))))

(defn jdbc-password ^String [db-spec]
  (or (:password db-spec)
      (:password (uri/query-map (jdbc-url db-spec)))))

(defn- get-pg-replication-conn
  "Given a db-spec, return a PGConnection you can use for replication.

   This PG connection has a few special settings to support replication
   (e.g REPLICATION, ASSUME_MIN_SERVER_VERSION, PREFER_QUERY_MODE)"
  ^PGConnection [db-spec]
  (let [db-spec (if-let [secret-arn (:secret-arn db-spec)]
                  (-> db-spec
                      (dissoc db-spec :secret-arn)
                      (merge (aurora-config/secret-arn->db-creds secret-arn)))
                  db-spec)
        props (Properties.)
        _ (do (.set PGProperty/USER props (jdbc-username db-spec))
              (.set PGProperty/PASSWORD props (jdbc-password db-spec))
              (.set PGProperty/REPLICATION props "database")
              (.set PGProperty/ASSUME_MIN_SERVER_VERSION props "9.4")
              (.set PGProperty/PREFER_QUERY_MODE props "simple"))
        conn (DriverManager/getConnection (jdbc-url (-> db-spec
                                                        (dissoc :user :password)))
                                          props)]
    (.unwrap conn PGConnection)))

(comment
  (def pg-conn (get-pg-replication-conn (config/get-aurora-config)))
  (.close pg-conn))

;; -----
;; Slots

(defn create-temporary-logical-replication-slot!
  "A replication slot is like a 'registration' to the master DB,
   saying 'I want to subscribe to you'

   Once slots are created, you can use them to start replication streams.
   Each slot tracks the LSN it has processed, so PG knows when to clean up
   old WAL records.

   This slot is cleaned up when the `replication-conn` is closed.
  "
  [replication-conn slot-name output-plugin]
  (sql/execute-one! replication-conn
                    ["SELECT
                        slot_name,
                        lsn
                      FROM
                        pg_create_logical_replication_slot(?, ?, true);"
                     slot-name output-plugin]))

(defn create-logical-replication-slot!
  "A replication slot is like a 'registration' to the master DB,
   saying 'I want to subscribe to you'

   Once slots are created, you can use them to start replication streams.
   Each slot tracks the LSN it has processed, so PG knows when to clean up
   old WAL records.

   The slot is not temporary and must be cleaned up manually."
  [replication-conn slot-name output-plugin]
  (sql/execute-one! replication-conn
                    ["SELECT
                        *
                      FROM
                        pg_create_logical_replication_slot(?, ?, false);"
                     slot-name output-plugin]))

(defn get-logical-replication-slot
  [conn slot-name]
  (sql/select-one conn
                  ["SELECT slot_name, confirmed_flush_lsn as lsn
                      FROM pg_replication_slots
                     WHERE slot_name = ?"
                   slot-name]))

(defn get-replication-latency-bytes [conn slot-name]
  (->
   (sql/select-one
    conn
    ["select pg_wal_lsn_diff(pg_current_wal_lsn(), confirmed_flush_lsn) as latency
        from pg_replication_slots
       where slot_name = ?"
     slot-name])
   :latency))

(defn drop-logical-replication-slot [conn slot-name]
  (sql/execute! conn
                ["SELECT pg_drop_replication_slot(?)" slot-name]))

(defn get-all-slots
  "Returns a list of all replication slots.

   To learn about the columns, see:
   https://www.postgresql.org/docs/current/view-pg-replication-slots.html"
  [conn]
  (sql/select conn ["SELECT * FROM pg_replication_slots;"]))

(defn get-inactive-replication-slots [conn]
  (sql/select conn ["select slot_name
                       from pg_replication_slots
                      where active = false
                        and plugin = 'wal2json'"]))

(defn cleanup-inactive-replication-slots [conn slot-names]
  (sql/select conn ["select slot_name, pg_drop_replication_slot(slot_name)
                       from pg_replication_slots
                      where active = false
                        and slot_name in (select unnest(?::text[]))"
                    (with-meta (vec slot-names) {:pgtype "text[]"})]))

(comment
  (def pg-conn (get-pg-replication-conn (config/get-aurora-config)))
  (create-temporary-logical-replication-slot! pg-conn "test_slot" "wal2json")
  (.close pg-conn)
  (get-all-slots (aurora/conn-pool :read)))

;; -------------------------
;; LSN

(defn get-current-wal-lsn
  "LSN (Log Sequence Number) is a sequential, unique identifier for a WAL record.
   This returns the latest LSN processed by PG."
  [conn]
  (:pg_current_wal_lsn
   (sql/select-one conn ["SELECT * FROM pg_current_wal_lsn();"])))

(comment
  (get-current-wal-lsn (aurora/conn-pool :read)))

;; ------
;; Stream

(defn- create-replication-stream
  "Given a PGConnection (with replication settings), a slot,
   and a starting LSN, this creates a logical replication stream.

   Note: you can't just call this with any PGConnection. Replication requires
   a PGConnection with some specific settings. Use `get-pg-replication-conn`
   to get the right kind of PGConnection."
  ^PGReplicationStream
  [^PGConnection replication-conn slot-name ^String start-lsn ^Long version]
  (let [builder (-> replication-conn
                    (.getReplicationAPI)
                    (.replicationStream)
                    (.logical)
                    (.withSlotOption "include-lsn" true)
                    (.withSlotOption "format-version" version)
                    (.withStartPosition (LogSequenceNumber/valueOf start-lsn))
                    (.withSlotName slot-name)
                    (.withStatusInterval 1 TimeUnit/SECONDS))]
    (.start ^ChainedLogicalStreamBuilder builder)))

(defn kw-action [action]
  (case action
    "B" :begin
    "I" :insert
    "U" :update
    "D" :delete
    "T" :truncate
    "M" :message
    "C" :close
    (tracer/with-span! {:name "wal/unknown-action"
                        :attributes {:action action}}
      action)))

(defn- wal-buffer->record
  "PGReplicationStream returns a ByteBuffer. This
   function converts it to a clojure map."
  [^ByteBuffer buffer]
  (let [src (.array buffer)
        offset (.arrayOffset buffer)
        record-len (- (count src) offset)
        json-str (String. src offset record-len)
        record (<-json json-str true)]
    (-> record
        (update :action kw-action)
        (assoc :tx-bytes record-len))))

(comment
  (wal-buffer->record (ByteBuffer/wrap (.getBytes "{\"x\": 1}"))))

;; ------
;; Start

(defn unexpected-state [state record next-state]
  (tracer/with-span! {:name "wal/unexpected-state"
                      :attributes {:next-action (:next-action state)
                                   :record record}}
    next-state))

(def produce-start-state {:next-action :begin
                          :records []
                          :tx-bytes 0})

(defn- produce
  "Repeatedly read from the stream and >!! records to the `to` channel.

   We do some book-keeping for the replication stream, by recording the LSN
   for the last record that was pushed to `to`."
  [^PGReplicationStream stream to close-signal-chan]
  ;; :next-action is either:
  ;;   :begin, we're waiting for a :begin record
  ;;   :close, we got :begin and we're collecting records until we get :close
  ;;   :deliver, we got close and we need to proceed to the invalidator
  (loop [buffer (.read stream)
         state produce-start-state]
    (if-not buffer
      (when-not (.isClosed stream)
        (recur (.read stream) state))
      (let [record (wal-buffer->record buffer)
            next-state (-> (case (:next-action state)
                             :begin (case (:action record)
                                      :begin (-> state
                                                 (assoc :next-action :close))
                                      (unexpected-state state
                                                        record
                                                        ;; Let's just reset
                                                        {:next-action :close
                                                         :records []}))
                             :close (case (:action record)
                                      (:insert :update :delete) (update state :records conj record)

                                      ;; Don't handle truncate or message
                                      (:truncate :message) state

                                      :close (assoc state :next-action :deliver)

                                      :begin (unexpected-state state
                                                               record
                                                               {:next-action :close
                                                                :records []})
                                      (unexpected-state state
                                                        record
                                                        ;; Just keep going
                                                        state))
                             (unexpected-state state record state))
                           (update :tx-bytes (fnil + 0) (:tx-bytes record)))]
        (if (not= :deliver (:next-action next-state))
          (recur (.read stream) next-state)
          (let [last-receive-lsn ^LogSequenceNumber (.getLastReceiveLSN stream)
                msg {:changes (:records state)
                     :nextlsn (LogSequenceNumber/valueOf ^String (:nextlsn record))
                     :lsn (LogSequenceNumber/valueOf ^String (:lsn record))
                     :tx-bytes (:tx-bytes state)}
                put-result (a/alt!! [[to msg]] :put
                                    ;; The close signal chan keeps us from
                                    ;; waiting to put on a closed `to` channel
                                    close-signal-chan :closed)]
            (when (and (= put-result :put)
                       (not (.isClosed stream)))
              (.setAppliedLSN stream last-receive-lsn)
              (.setFlushedLSN stream last-receive-lsn)
              (recur (.read stream) produce-start-state))))))))

(defn make-wal-opts [{:keys [wal-chan close-signal-chan
                             ex-handler get-conn-config slot-name]}]
  {:to wal-chan
   :close-signal-chan close-signal-chan
   :ex-handler ex-handler
   :get-conn-config get-conn-config
   :slot-name slot-name
   :shutdown-fn (atom nil)
   :started-promise (promise)})

(defn set-shutdown-fn [wal-opts shutdown-fn]
  (swap! (:shutdown-fn wal-opts)
         (fn [existing]
           (if existing
             (throw (Exception. "shutdown-fn already set for wal worker"))
             shutdown-fn))))

(defn closed? [o]
  (condp instance? o
    Connection (Connection/.isClosed o)
    PGReplicationStream (PGReplicationStream/.isClosed o)))

(defn close-nicely [closeable]
  (when-not (closed? closeable)
    (let [close-error (try (lang/close closeable) (catch Exception e e))]
      (when-not (closed? closeable)
        (throw (ex-info "Unable to close" {} close-error))))))

(defn alert-discord [slot-name]
  (discord/send-error-async!
   (str (:instateam discord/mention-constants)
        " The wal handler threw an exception. Check if it restart automatically."
        " If it didn't, redeploy the server.\n\nIf you're quick enough you can "
        "peek at the transaction that caused the error:\n\n"
        (format "```\nselect data from pg_logical_slot_peek_changes('%s', null, null, 'format-version', '2', 'include-lsn', 'true');```"
                slot-name))))

(defn get-reconnect-conn*
  "Tries to create a new connection and restart the replication stream"
  [get-conn-config slot-name]
  (try
    (let [conn (get-pg-replication-conn (get-conn-config))]
      ;; try is double-nested so that we can dispose of the connection
      ;; if we get an error creating the stream.
      (try
        (let [slot (get-logical-replication-slot conn slot-name)
              stream (create-replication-stream conn slot-name (:lsn slot) 2)]
          {:conn conn
           :slot slot
           :stream stream})
        (catch Exception e
          (tracer/record-exception-span! e {:name "wal/get-reconnect-conn*"})
          (try (close-nicely conn) (catch Exception _e nil))
          nil)))
    (catch Exception e
      (tracer/record-exception-span! e {:name "wal/get-reconnect-conn*"})
      nil)))

(defn get-reconnect-conn
  "Repeatedly tries to create a new connection and restart the replication stream,
   waiting a second between tries."
  [get-conn-config slot-name]
  (loop [i 1]
    (if-let [res (get-reconnect-conn* get-conn-config slot-name)]
      res
      (do
        (tracer/record-info! {:name "wal/get-reconnect-conn"
                              :attributes {:attempt i}})
        (Thread/sleep 1000)
        (recur (inc i))))))

(defn start-worker
  "Starts a logical replication stream and pushes records to
   the given `to` channel.

   Note: Blocks the calling thread. Call with fut-bg.

   Use `shutdown!` to stop the stream and clean up."
  [{:keys [get-conn-config slot-name to ex-handler close-signal-chan started-promise]
    :as wal-opts}]
  (let [replication-conn (get-pg-replication-conn (get-conn-config))
        {:keys [lsn]} (create-logical-replication-slot! replication-conn
                                                        slot-name
                                                        "wal2json")
        shutdown? (atom false)]
    (loop [replication-conn replication-conn
           stream (create-replication-stream replication-conn slot-name lsn 2)
           restart-count 0]
      (deliver started-promise true)
      (tracer/record-info! {:name "wal-worker/start"
                            :attributes {:slot-name slot-name}})
      (set-shutdown-fn wal-opts (fn []
                                  (reset! shutdown? true)
                                  (close-nicely stream)
                                  (drop-logical-replication-slot replication-conn slot-name)
                                  (close-nicely replication-conn)
                                  (health/mark-wal-healthy-async)))
      (let [produce-error (try
                            (produce stream to close-signal-chan)
                            (catch Exception e
                              (tracer/with-span! {:name "wal-worker/produce-error"
                                                  :attributes {:exception e}}
                                e)))]
        (when-not @shutdown?
          (health/mark-wal-unhealthy-async)
          (when (= :prod (config/get-env))
            (alert-discord slot-name))
          (tracer/record-exception-span! (Exception. "Wal handler closed unexpectedly, trying to restart")
                                         {:name "wal-worker/unexpected-reconnect"
                                          :escpaing? false})
          (try (close-nicely stream) (catch Exception _e nil))
          (try (close-nicely replication-conn) (catch Exception _e nil))
          (let [{new-conn :conn stream :stream} (get-reconnect-conn get-conn-config slot-name)]
            (if-not stream
              (ex-handler produce-error)
              (do
                (tracer/record-info! {:name "wal-worker/reconnect"
                                      :attributes {:slot-name slot-name
                                                   :produce-error produce-error}})
                (reset! (:shutdown-fn wal-opts) nil)
                (when (< restart-count 3)
                  ;; If we keep restarting, stop marking ourselves as healthy
                  (health/mark-wal-healthy-async))
                (recur new-conn stream (inc restart-count))))))))))

(defn shutdown! [wal-opts]
  (tracer/with-span! {:name "wal-worker/shutdown!"
                      :attributes {:slot-name (:slot-name wal-opts)}}
    (if-let [shutdown-fn @(:shutdown-fn wal-opts)]
      (shutdown-fn)
      (tracer/record-exception-span! (Exception. "Wal worker shutdown before startup")
                                     {:name "wal-worker/shutdown-called-before-startup"
                                      :escaping? false}))))

(defn cleanup-slots-impl [inactive-slots]
  (tracer/with-span! {:name "wal/cleanup-inactive-slots"}
    (let [slot-names (map :slot_name inactive-slots)
          removed    (cleanup-inactive-replication-slots (aurora/conn-pool :write) slot-names)
          cleaned    (set (map :slot_name removed))
          uncleaned  (remove #(contains? cleaned %) slot-names)]
      (tracer/add-data! {:attributes {:cleaned-slot-names cleaned
                                      :active-uncleaned-slots uncleaned}}))))

(defn start []
  (def cleanup-slots-schedule
    (chime-core/chime-at
     (chime-core/periodic-seq (Instant/now) (Duration/ofHours 1))
     (fn [_time]
       ;; First, get any slots that are inactive, then drop them if they're
       ;; still inactive in 5 minutes. This will prevent dropping slots that
       ;; are still being set up.
       (try
         (let [conn-pool      (aurora/conn-pool :read)
               inactive-slots (get-inactive-replication-slots conn-pool)]
           (when (seq inactive-slots)
             (def cleanup-slots-impl-schedule
               (chime-core/chime-at
                [(.plusSeconds (Instant/now) 300)]
                (fn [_time]
                  (cleanup-slots-impl inactive-slots))))))
         (catch Exception e
           (tracer/record-exception-span! e {:name "wal/cleanup-error"
                                             :escaping? false}))))))

  (let [replication-latency-bytes (atom 0)]
    (def latency-schedule
      (chime-core/chime-at
       (rest (chime-core/periodic-seq (Instant/now) (Duration/ofMinutes 1)))
       (fn [_time]
         (try
           (let [latency (get-replication-latency-bytes (aurora/conn-pool :read) @config/process-id)]
             (reset! replication-latency-bytes latency))
           (catch Exception e
             (tracer/record-exception-span! e {:name "wal/check-latency-error"
                                               :escaping? false}))))))

    (def cleanup-gauge
      (gauges/add-gauge-metrics-fn
       (fn [_]
         [{:path "instant.jdb.wal.replication-latency-bytes"
           :value @replication-latency-bytes}])))))

(defn stop []
  (lang/close cleanup-slots-schedule)
  (lang/close cleanup-slots-impl-schedule)
  (lang/close latency-schedule)
  (cleanup-gauge))

(defn before-ns-unload []
  (stop))

(defn after-ns-reload []
  (start))

(comment
  (def shutdown? (atom false))
  (def to (a/chan 1024))
  (def opts {:conn-config (config/get-aurora-config)
             :slot-name "test_slot"
             :to to
             :shutdown? shutdown?
             :ex-handler (fn [e] (tracer/record-exception-span! e {:name "wal-ex-handler"
                                                                   :escpaing? false}))})
  (ua/fut-bg (start-worker opts))
  (do
    (require 'instant.db.transaction-test)
    #_{:clj-kondo/ignore [:unresolved-namespace]}
    (clojure.test/run-tests 'instant.db.transaction-test))
  (ua/<!!-timeout to 1000)
  (shutdown! opts))

(defn kick-wal
  "A hacky way to trigger the stream reader so that it will close faster.
   Useful to speed up exit in dev where there isn't much activity on the wal."
  [conn]
  (sql/execute! conn ["insert into config (k, v) values ('kick-wal', to_jsonb(now())) on conflict (k) do update set v = excluded.v"]))
