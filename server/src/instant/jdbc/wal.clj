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

(defn get-all-slots
  "Returns a list of all replication slots.

   To learn about the columns, see:
   https://www.postgresql.org/docs/current/view-pg-replication-slots.html"
  [conn]
  (sql/select conn ["SELECT * FROM pg_replication_slots;"]))

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
  [stream to shutdown?]
  (while (not @shutdown?)
    (let [buffer (.readPending stream)]
      (if-not buffer
        (Thread/sleep 10)
        (let [last-receive-lsn ^LogSequenceNumber (.getLastReceiveLSN stream)
              record (wal-buffer->record buffer)]
          (a/>!! to record)
          (.setAppliedLSN stream last-receive-lsn)
          (.setFlushedLSN stream last-receive-lsn))))))

(defn start-worker
  "Starts a logical replication stream and pushes records to
   the given `to` channel.

   Note: Blocks the calling thread. Call with fut-bg.

   Use `shutdown!` to stop the stream and clean up."
  [{:keys [conn-config slot-name to shutdown? ex-handler] :as _opts}]
  (let [replication-conn (get-pg-replication-conn conn-config)
        {:keys [lsn]} (create-temporary-logical-replication-slot!
                       replication-conn slot-name "wal2json")
        stream (create-replication-stream replication-conn slot-name lsn)]
    (tracer/record-info! {:name "wal-worker/start" :slot-name slot-name})
    (try
      (produce stream to shutdown?)
      (catch Exception e
        (ex-handler e)))
    (tracer/record-info! {:name "wal-worker/shutdown-complete" :slot-name slot-name})
    (.close replication-conn)
    (a/close! to)))

(defn shutdown! [{:keys [to shutdown? slot-name] :as _opts}]
  (tracer/record-info! {:name "wal-worker/shutdown!" :slot-name slot-name})
  (reset! shutdown? true)
  (a/close! to)
  ;; The producer has a has a blocking put (>!!) into `to`.
  ;; This means that even when shut down, the producer will be
  ;; parked at that point. If `to` has no takers, the
  ;; producer will get stuck. This one extra take just
  ;; makes sure the producer can exit.
  (a/<!! to))

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
  (shutdown! opts)
  )
