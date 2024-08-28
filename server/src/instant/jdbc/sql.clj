(ns instant.jdbc.sql
  (:require
   [next.jdbc :as next-jdbc]
   [next.jdbc.sql :as sql]
   [next.jdbc.result-set :as rs]
   [next.jdbc.prepare :as p]
   [next.jdbc.connection :as connection]
   [clojure.string :as string]
   [instant.util.json :refer [->json <-json]]
   [instant.util.tracer :as tracer]
   ;; load all pg-ops for hsql
   [honey.sql.pg-ops]
   [instant.util.exception :as ex])
  (:import (org.postgresql.util PGobject PSQLException)
           (java.sql Array PreparedStatement ResultSet ResultSetMetaData)
           (com.zaxxer.hikari HikariDataSource)
           (java.time
            Instant
            LocalDate
            LocalDateTime)
           (clojure.lang
            IPersistentList
            IPersistentVector
            IPersistentMap)))

(defn ->pg-text-array
  "Formats as text[] in pg, i.e. {item-1, item-2, item3}"
  [col]
  (format
   "{%s}"
   (string/join
    ","
    (map (fn [s] (format "\"%s\""
                         ;; Escape quotes (but don't double esc)
                         (string/replace s #"(?<!\\)\"" "\\\"")))
         col))))

(defn ->pgobject
  "Transforms Clojure data to a PGobject that contains the data as
  JSON. PGObject type defaults to `jsonb` but can be changed via
  metadata key `:pgtype`"
  [x]
  (let [pgtype (or (:pgtype (meta x)) "jsonb")
        value (case pgtype
                "text[]" (->pg-text-array x)
                (->json x))]
    (doto (PGobject.)
      (.setType pgtype)
      (.setValue value))))

(defn <-pgobject
  "Transform PGobject containing `json` or `jsonb` value to Clojure data"
  [^PGobject v]
  (let [type (.getType v)
        value (.getValue v)]
    (when-not (nil? value)
      (case type
        ("json" "jsonb") (<-json value)
        "bit" (Long/parseLong value 2)
        value))))

(extend-protocol rs/ReadableColumn
  Array
  (read-column-by-label [^Array v _] (vec (.getArray v)))
  (read-column-by-index [^Array v _2 _3] (vec (.getArray v)))

  PGobject
  (read-column-by-label [^PGobject v _] (<-pgobject v))
  (read-column-by-index [^PGobject v _2 _3] (<-pgobject v)))

(extend-protocol p/SettableParameter
  Instant
  (set-parameter [^java.time.Instant v ^PreparedStatement ps ^long i]
    (.setTimestamp ps i (java.sql.Timestamp/from v)))

  LocalDate
  (set-parameter [^java.time.LocalDate v ^PreparedStatement ps ^long i]
    (.setTimestamp ps i (java.sql.Timestamp/valueOf (.atStartOfDay v))))

  LocalDateTime
  (set-parameter [^java.time.LocalDateTime v ^PreparedStatement ps ^long i]
    (.setTimestamp ps i (java.sql.Timestamp/valueOf v)))

  IPersistentMap
  (set-parameter [m ^PreparedStatement s i]
    (.setObject s i (->pgobject m)))

  IPersistentList
  (set-parameter [l ^PreparedStatement s i]
    (.setObject s i (->pgobject l)))

  IPersistentVector
  (set-parameter [v ^PreparedStatement s i]
    (.setObject s i (->pgobject v))))

(defn get-unqualified-string-column-names
  "Given `ResultSetMetaData`, return a vector of unqualified column names."
  [^ResultSetMetaData rsmeta _]
  (mapv (fn [^Integer i] (.getColumnLabel rsmeta i))
        (range 1 (inc (if rsmeta (.getColumnCount rsmeta) 0)))))

(defn as-string-maps
  "Given a `ResultSet` and options, return a `RowBuilder` / `ResultSetBuilder`
  that produces bare vectors of hash map rows with string keys."
  [^ResultSet rs opts]
  (let [rsmeta (.getMetaData rs)
        cols   (get-unqualified-string-column-names rsmeta opts)]
    (rs/->MapResultSetBuilder rs rsmeta cols)))

(defn span-attrs-from-conn-pool [conn]
  (when (instance? HikariDataSource conn)
    (let [mx-bean (.getHikariPoolMXBean conn)
          pending (.getThreadsAwaitingConnection mx-bean)
          active (.getActiveConnections mx-bean)]
      {:idle-connections (.getIdleConnections mx-bean)
       :active-connections active
       :pending-threads pending})))

(def ^:dynamic *conn-pool-span-stats* nil)

(defmacro with-connection
  "Useful in the rare case that the caller wants to get the connection from
   the pool (e.g. datalog/query batching).
   Binds *conn-pool-span-stats* at call time to be consistent with calling e.g.
   `select` with the conn-pool directly."
  [[conn-name ^HikariDataSource conn-pool] & body]
  `(binding [*conn-pool-span-stats* (span-attrs-from-conn-pool ~conn-pool)]
     (with-open [~conn-name (.getConnection ~conn-pool)]
       ~@body)))

(defn- span-attrs [conn query]
  (let [pool-stats (if (instance? HikariDataSource conn)
                     (span-attrs-from-conn-pool conn)
                     *conn-pool-span-stats*)]
    (merge {:detailed-query (pr-str query)}
           pool-stats)))

(defn select
  [conn query]
  (tracer/with-span! {:name "sql/select"
                      :attributes (span-attrs conn query)}
    (sql/query conn query {:builder-fn rs/as-unqualified-maps})))

(defn select-qualified
  [conn query]
  (tracer/with-span! {:name "sql/select-qualified"
                      :attributes (span-attrs conn query)}
    (sql/query conn query {:builder-fn rs/as-maps})))

(defn select-arrays
  [conn query]
  (tracer/with-span! {:name "sql/select-arrays"
                      :attributes (span-attrs conn query)}
    (sql/query conn query {:builder-fn rs/as-unqualified-arrays})))

(defn select-string-keys
  [conn query]
  (tracer/with-span! {:name "sql/select-string-keys"
                      :attributes (span-attrs conn query)}
    (sql/query conn query {:builder-fn as-string-maps})))

(def select-one (comp first select))

(defmacro with-translating-psql-exceptions
  [& body]
  `(try
     ~@body
     (catch PSQLException e#
       (throw (ex/translate-and-throw-psql-exception! e#)))))

(defn execute!
  [conn query]
  (tracer/with-span! {:name  "sql/execute!"
                      :attributes (span-attrs conn query)}
    (with-translating-psql-exceptions
      (next-jdbc/execute! conn query {:builder-fn rs/as-unqualified-maps
                                      :return-keys true}))))
(defn execute-one!
  [conn query]
  (tracer/with-span! {:name  "sql/execute-one!"
                      :attributes (span-attrs conn query)}
    (with-translating-psql-exceptions
      (next-jdbc/execute-one! conn query {:builder-fn rs/as-unqualified-maps
                                          :return-keys true}))))

(defn do-execute! [conn query]
  (tracer/with-span! {:name  "sql/do-execute!"
                      :attributes (span-attrs conn query)}
    (with-translating-psql-exceptions
      (next-jdbc/execute! conn query {:return-keys false}))))

(defn patch-hikari []
  ;; Hikari will send an extra query to ensure the connection is valid
  ;; if it has been idle for half a second. This raises the limit so
  ;; that it only checks every minute.
  ;; This shouldn't be necessary at all--the connection should be able
  ;; to tell when its closed. But even if it can't tell if it's closed,
  ;; the connection pool should use the query you want to send as the
  ;; validation check. If it gets a retryable error, like connection_closed,
  ;; then it can try again on another connection.
  (System/setProperty "com.zaxxer.hikari.aliveBypassWindowMs" "60000"))

(defn start-pool [config]
  (patch-hikari)
  (let [url (connection/jdbc-url config)
        pool (connection/->pool HikariDataSource (assoc config :jdbcUrl url))]
    (.close (next-jdbc/get-connection pool))
    pool))
