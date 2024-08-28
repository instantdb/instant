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
   [instant.config :as config]
   [instant.jdbc.sql :as sql]
   [instant.jdbc.aurora :as aurora]
   [instant.util.json :refer [<-json]]
   [instant.util.async :as ua]
   [clojure.core.async :as a]
   [next.jdbc.connection :refer [jdbc-url]]
   [instant.util.tracer :as tracer]
   [lambdaisland.uri :as uri])
  (:import
   (java.util Properties)
   (java.nio ByteBuffer)
   (java.time Duration Instant)
   (org.postgresql PGProperty PGConnection)
   (org.postgresql.replication PGReplicationStream LogSequenceNumber)
   (java.sql DriverManager)))

;; ----
;; Connection

(defn jdbc-username [db-spec]
  (or (:username db-spec)
      (:user (uri/query-map (jdbc-url db-spec)))))

(defn jdbc-password [db-spec]
  (or (:password db-spec)
      (:password (uri/query-map (jdbc-url db-spec)))))

(defn- get-pg-replication-conn
  "Given a db-spec, return a PGConnection you can use for replication.

   This PG connection has a few special settings to support replication
   (e.g REPLICATION, ASSUME_MIN_SERVER_VERSION, PREFER_QUERY_MODE)"
  ^PGConnection [db-spec]
  (let [props (Properties.)
        _ (do (.set PGProperty/USER props (jdbc-username db-spec))
              (.set PGProperty/PASSWORD props (jdbc-password db-spec))
              (.set PGProperty/REPLICATION props "database")
              (.set PGProperty/ASSUME_MIN_SERVER_VERSION props "9.4")
              (.set PGProperty/PREFER_QUERY_MODE props "simple"))
        conn (DriverManager/getConnection (jdbc-url db-spec) props)]
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
                      where active = false"]))

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
  (get-all-slots aurora/conn-pool))

;; -------------------------
;; LSN

(defn get-current-wal-lsn
  "LSN (Log Sequence Number) is a sequential, unique identifier for a WAL record.
   This returns the latest LSN processed by PG."
  [conn]
  (:pg_current_wal_lsn
   (sql/select-one conn ["SELECT * FROM pg_current_wal_lsn();"])))

(comment
  (get-current-wal-lsn aurora/conn-pool))

;; ------
;; Stream

(defn- create-replication-stream
  "Given a PGConnection (with replication settings), a slot,
   and a starting LSN, this creates a logical replication stream.

   Note: you can't just call this with any PGConnection. Replication requires
   a PGConnection with some specific settings. Use `get-pg-replication-conn`
   to get the right kind of PGConnection."
  ^PGReplicationStream
  [^PGConnection replication-conn slot-name start-lsn]
  (-> replication-conn
      (.getReplicationAPI)
      (.replicationStream)
      (.logical)
      (.withSlotName slot-name)
      (.withSlotOption "include-lsn" true)
      (.withStartPosition (LogSequenceNumber/valueOf start-lsn))
      (.start)))

(defn- wal-buffer->record
  "PGReplicationStream returns a ByteBuffer. This
   function converts it to a clojure map."
  [^ByteBuffer buffer]
  (let [src (.array buffer)
        offset (.arrayOffset buffer)
        record-len (- (count src) offset)
        json-str (String. src offset record-len)
        record (<-json json-str true)]
    (update record :nextlsn #(LogSequenceNumber/valueOf %))))

(comment
  (wal-buffer->record (ByteBuffer/wrap (.getBytes "{\"x\": 1}"))))

;; ------
;; Start

(defn- produce
  "Repeatedly read from the stream and >!! records to the `to` channel.

   We do some book-keeping for the replication stream, by recording the LSN
   for the last record that was pushed to `to`."
  [stream to close-signal-chan]
  (loop []
    (let [buffer (.read stream)]
      (if-not buffer
        (when-not (.isClosed stream)
          (recur))
        (let [last-receive-lsn ^LogSequenceNumber (.getLastReceiveLSN stream)
              record (wal-buffer->record buffer)
              put-result (a/alt!! [[to record]] :put
                                  ;; The close signal chan keeps us from
                                  ;; waiting to put on a closed `to` channel
                                  close-signal-chan :closed)]
          (when (and (= put-result :put)
                     (not (.isClosed stream)))
            (.setAppliedLSN stream last-receive-lsn)
            (.setFlushedLSN stream last-receive-lsn)
            (recur)))))))

(defn make-wal-opts [{:keys [wal-chan close-signal-chan
                             ex-handler conn-config slot-name]}]
  {:to wal-chan
   :close-signal-chan close-signal-chan
   :ex-handler ex-handler
   :conn-config conn-config
   :slot-name slot-name
   :shutdown-fn (atom nil)})

(defn set-shutdown-fn [wal-opts shutdown-fn]
  (swap! (:shutdown-fn wal-opts)
         (fn [existing]
           (if existing
             (throw (Exception. "shutdown-fn already set for wal worker"))
             shutdown-fn))))

(defn close-nicely [closeable]
  (when-not (.isClosed closeable)
    (let [close-error (try (.close closeable) (catch Exception e e))]
      (when-not (.isClosed closeable)
        (throw (ex-info "Unable to close" {} close-error))))))

(defn start-worker
  "Starts a logical replication stream and pushes records to
   the given `to` channel.

   Note: Blocks the calling thread. Call with fut-bg.

   Use `shutdown!` to stop the stream and clean up."
  [{:keys [conn-config slot-name to ex-handler close-signal-chan] :as wal-opts}]
  (let [replication-conn (get-pg-replication-conn conn-config)
        {:keys [lsn]} (create-logical-replication-slot! replication-conn
                                                        slot-name
                                                        "wal2json")
        shutdown? (atom false)]
    (loop [replication-conn replication-conn
           stream (create-replication-stream replication-conn slot-name lsn)]
      (tracer/record-info! {:name "wal-worker/start"
                            :attributes {:slot-name slot-name}})
      (set-shutdown-fn wal-opts (fn []
                                  (reset! shutdown? true)
                                  (close-nicely stream)
                                  (drop-logical-replication-slot replication-conn slot-name)
                                  (close-nicely replication-conn)))
      (let [produce-error (try
                            (produce stream to close-signal-chan)
                            (catch Exception e
                              (tracer/with-span! {:name "wal-worker/produce-error"
                                                  :attributes {:exception e}}
                                e)))]
        (when-not @shutdown?
          (tracer/record-exception-span! (Exception. "Wal handler closed unexpectedly, trying to restart")
                                         {:name "wal-worker/unexpected-reconnect"
                                          :escpaing? false})
          (try (close-nicely stream) (catch Exception _e nil))
          (try (close-nicely replication-conn) (catch Exception _e nil))
          (let [new-conn (get-pg-replication-conn conn-config)
                slot (get-logical-replication-slot new-conn slot-name)]
            (if-not slot
              (ex-handler produce-error)
              (do
                (tracer/record-info! {:name "wal-worker/reconnect"
                                      :attributes {:slot-name slot-name
                                                   :produce-error produce-error}})
                (let [stream (create-replication-stream new-conn slot-name (:lsn slot))]
                  (reset! (:shutdown-fn wal-opts) nil)
                  (recur new-conn stream))))))))))

(defn shutdown! [wal-opts]
  (tracer/with-span! {:name "wal-worker/shutdown!"
                      :attributes {:slot-name (:slot-name wal-opts)}}
    (if-let [shutdown-fn @(:shutdown-fn wal-opts)]
      (shutdown-fn)
      (tracer/record-exception-span! (Exception. "Wal worker shutdown before startup")
                                     {:name "wal-worker/shutdown-called-before-startup"
                                      :escaping? false}))))

(defn init-cleanup [conn-pool]
  (def schedule
    (chime-core/chime-at
     (chime-core/periodic-seq (Instant/now) (Duration/ofHours 1))
     (fn [_time]
       ;; First, get any slots that are inactive, then drop them if they're
       ;; still inactive in 5 minutes. This will prevent dropping slots that
       ;; are still being set up.
       (try
         (let [inactive-slots (get-inactive-replication-slots conn-pool)]
           (when (seq inactive-slots)
             (chime-core/chime-at
              [(.plusSeconds (Instant/now) 300)]
              (fn [_time]
                (tracer/with-span! {:name "wal/cleanup-inactive-slots"}
                  (let [slot-names (map :slot_name inactive-slots)
                        removed (cleanup-inactive-replication-slots conn-pool
                                                                    slot-names)
                        cleaned (set (map :slot_name removed))
                        uncleaned (remove #(contains? cleaned %) slot-names)]
                    (tracer/add-data! {:attributes {:cleaned-slot-names cleaned
                                                    :active-uncleaned-slots uncleaned}})))))))
         (catch Exception e
           (tracer/record-exception-span! e {:name "wal/cleanup-error"
                                             :escaping? false})))))))


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
  (sql/execute! conn ["select pg_notify('random-channel', 'payload')"]))
