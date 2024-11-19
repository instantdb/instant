(ns instant.jdbc.sql
  (:require
   [clojure.string :as string]
   ;; load all pg-ops for hsql
   [honey.sql.pg-ops]
   [instant.util.exception :as ex]
   [instant.util.io :as io]
   [instant.util.json :refer [->json <-json]]
   [instant.util.tracer :as tracer]
   [next.jdbc :as next-jdbc]
   [next.jdbc.connection :as connection]
   [next.jdbc.prepare :as p]
   [next.jdbc.result-set :as rs]
   [next.jdbc.sql :as sql])
  (:import
   (clojure.lang IPersistentList IPersistentMap IPersistentVector)
   (com.zaxxer.hikari HikariDataSource)
   (java.sql Array Connection PreparedStatement ResultSet ResultSetMetaData)
   (java.time Instant LocalDate LocalDateTime)
   (org.postgresql.util PGobject PSQLException)))

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
    (let [mx-bean (.getHikariPoolMXBean ^HikariDataSource conn)
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
     (io/tag-io
       (with-open [~conn-name (.getConnection ~conn-pool)]
         ~@body))))

(defn- span-attrs [conn query tag]
  (let [pool-stats (if (instance? HikariDataSource conn)
                     (span-attrs-from-conn-pool conn)
                     *conn-pool-span-stats*)]
    (merge {:detailed-query (pr-str query)}
           pool-stats
           (when tag
             {:query-tag tag}))))

(def ^:dynamic *query-timeout-seconds* 30)

(def ^:dynamic *in-progress-stmts* nil)

(defprotocol Cancelable
  (cancel [this]))

(defn cancel-in-progress [stmts]
  (doseq [stmt stmts]
    (cancel stmt)))

(defn register-in-progress
  "Registers the statement in the in-progress set (if we're tracking it)
  and returns a closeable that will remove the statement from the set at
  the end of the query."
  ^java.lang.AutoCloseable
  [created-connection? ^Connection conn ^PreparedStatement stmt]
  (if-let [in-progress *in-progress-stmts*]
    (let [cancelable (reify Cancelable
                       (cancel [_]
                         (.cancel stmt)
                         ;; Don't close the connection we opened b/c
                         ;; it seems to cause thread pinning when you
                         ;; close from a different thread and it will
                         ;; get closed in the `finally` clause
                         ;; below. We have to close connections we
                         ;; were passed to make sure transactions are
                         ;; rolled back.
                         (when-not created-connection?
                           (.close conn))))]
      (swap! in-progress conj cancelable)
      (reify java.lang.AutoCloseable
        (close [_]
          (swap! in-progress disj cancelable))))
    (reify java.lang.AutoCloseable
      (close [_]
        nil))))

(defmacro defsql [name query-fn opts]
  (let [span-name (format "sql/%s" name)]
    `(defn ~name
       ([~'conn ~'query]
        (~name nil ~'conn ~'query))
       ([~'tag ~'conn ~'query]
        (tracer/with-span! {:name ~span-name
                            :attributes (span-attrs ~'conn ~'query ~'tag)}
          (try
            (io/tag-io
              (let [create-connection?# (not (instance? Connection ~'conn))
                    opts# (merge ~opts
                                 {:timeout *query-timeout-seconds*})
                    ^Connection c# (if create-connection?#
                                     (next-jdbc/get-connection ~'conn)
                                     ~'conn)]
                (try
                  (with-open [ps# (next-jdbc/prepare c# ~'query opts#)
                              _cleanup# (register-in-progress create-connection?# c# ps#)]
                    (~query-fn ps# nil opts#))
                  (finally
                    ;; Don't close the connection if a java.sql.Connection was
                    ;; passed in, or we'll end transactions before they're done.
                    (when create-connection?#
                      (.close c#))))))
            (catch PSQLException e#
              (throw (ex/translate-and-throw-psql-exception! e#)))))))))

(defsql select sql/query {:builder-fn rs/as-unqualified-maps})
(defsql select-qualified sql/query {:builder-fn rs/as-maps})
(defsql select-arrays sql/query {:builder-fn rs/as-unqualified-arrays})
(defsql select-string-keys sql/query {:builder-fn as-string-maps})
(def select-one (comp first select))
(defsql execute! next-jdbc/execute! {:builder-fn rs/as-unqualified-maps
                                     :return-keys true})
(defsql execute-one! next-jdbc/execute-one! {:builder-fn rs/as-unqualified-maps
                                             :return-keys true})
(defsql do-execute! next-jdbc/execute! {:return-keys false})

(defn patch-hikari []
  ;; Hikari will send an extra query to ensure the connection is valid
  ;; if it has been idle for half a second. This raises the limit so
  ;; that it only checks every minute.
  ;; This shouldn't be necessary at all--the connection should be able
  ;; to tell when it's closed. But even if it can't tell if it's closed,
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
