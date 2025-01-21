(ns instant.jdbc.sql
  (:require
   [clojure.string :as string]
   ;; load all pg-ops for hsql
   [honey.sql.pg-ops]
   [honey.sql]
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

(defn format-match-cond [expr]
  (let [[sql & params] (honey.sql/format-expr expr)]
    (when-not (string/blank? sql)
      (into [(str "AND " sql)] params))))

(defn matched-merge-action? [x]
  (case x
    :do-nothing :do-nothing
    :delete :delete
    (and (map? x)
         (or (:update x)
             (:insert x)))))

(defn format-matched-merge-action [x]
  (case x
    :do-nothing ["DO NOTHING"]
    :delete ["DELETE"]
    (cond (:update x)
          (let [[sql & params] (honey.sql/format-dsl (:update x))]
            (into [(str "UPDATE " sql)] params))

          (:insert x)
          (let [[sql & params] (honey.sql/format-dsl (:insert x))]
            (into [(str "INSERT " sql)] params)))))

(defn matched-cases [exp]
  (cond
    ;; just a single action with no condition
    (matched-merge-action? exp)
    [exp]

    ;; single action with condition
    (and (vector? exp)
         (= 2 (count exp))
         (not (vector? (first exp)))
         (not (matched-merge-action? (first exp)))
         (matched-merge-action? (second exp)))
    [exp]

    ;; A list of condition+action
    (vector? exp)
    (do (println "vec")
        exp)

    :else
    (throw (Exception. "Unknown match clauses for :when-matched/:when-not-matched"))))

(honey.sql/register-clause!
 :when-not-matched
 (fn [clause exp]
   (let [exprs (matched-cases exp)]
     (reduce (fn [[sql & params] expr]
               (if (matched-merge-action? expr)
                 (let [[expr-sql & expr-params] (format-matched-merge-action expr)]
                   (into [(str sql " WHEN NOT MATCHED THEN " expr-sql)]
                         (into params expr-params)))
                 (do
                   (assert (and (vector? expr)
                                (matched-merge-action? (second expr)))
                           "Invalid match clause for :when-not-matched")
                   (let [[cond-expr action-expr] expr]
                     (let [[case-sql & case-params] (format-matched-cond cond-expr)
                           [expr-sql & expr-params] (format-matched-merge-action action-expr)]
                       (into [(str sql " WHEN NOT MATCHED " case-sql " THEN " expr-sql)]
                             (concat params case-params expr-params)))))

                 ))
             [""]
             exprs)))
 ;; Get behind of :using
 :join-by)

(honey.sql/register-clause!
 :when-matched
 (fn [clause exp]
   (let [exprs (matched-cases exp)]
     (reduce (fn [[sql & params] expr]
               (if (matched-merge-action? expr)
                 (let [[expr-sql & expr-params] (format-matched-merge-action expr)]
                   (into [(str sql " WHEN MATCHED THEN " expr-sql)]
                         (into params expr-params)))
                 (do
                   (assert (and (vector? expr)
                                (matched-merge-action? (second expr)))
                           "Invalid match clause for :when-matched")
                   (let [[cond-expr action-expr] expr]
                     (let [[case-sql & case-params] (format-matched-cond cond-expr)
                           [expr-sql & expr-params] (format-matched-merge-action action-expr)]
                       (into [(str sql " WHEN MATCHED " case-sql " THEN " expr-sql)]
                             (concat params case-params expr-params)))))

                 ))
             [""]
             exprs)))
 :when-not-matched)

(honey.sql/register-clause!
 :on
 (fn [clause expr]
   (let [[sql & params] (honey.sql/format-expr expr)]
     (into [(str "ON " sql)] params)))
 :when-matched)

(honey.sql/register-clause!
 :merge-into
 (fn [clause tbl]
   [(str "MERGE INTO " (honey.sql/format-entity tbl))])
 :using)

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

(defprotocol Cancelable
  (cancel [this]))

;; Tracks write statements so that we can wait for them to
;; complete or cancel them on failover
(defonce default-statement-tracker
  (let [stmts (atom #{})]
    {:add (fn [rw cancelable]
            (when (= rw :write)
              (swap! stmts conj cancelable)))
     :remove (fn [rw cancelable]
               (when (= rw :write)
                 (swap! stmts disj cancelable)))
     :stmts stmts}))

(def ^:dynamic *in-progress-stmts* default-statement-tracker)

(defn make-statement-tracker
  "Creates a statement tracker that allows nesting of statement
   tracking."
  []
  (let [{:keys [add remove]} *in-progress-stmts*
        stmts (atom #{})]
    {:add (fn [rw cancelable]
            (swap! stmts conj cancelable)
            (when add (add rw cancelable)))
     :remove (fn [rw cancelable]
               (swap! stmts disj cancelable)
               (when remove (remove rw cancelable)))
     :stmts stmts}))

(defn make-top-level-statement-tracker
  "Creates a statement tracker that ignores all intermediate trackers, except
   for the top-level default tracker."
  []
  (let [{:keys [add remove]} default-statement-tracker
        stmts (atom #{})]
    {:add (fn [rw cancelable]
            (swap! stmts conj cancelable)
            (when add (add rw cancelable)))
     :remove (fn [rw cancelable]
               (swap! stmts disj cancelable)
               (when remove (remove rw cancelable)))
     :stmts stmts}))

(defn cancel-in-progress [{:keys [stmts]}]
  (doseq [stmt @stmts]
    (cancel stmt)))

(defn register-in-progress
  "Registers the statement in the in-progress set (if we're tracking it)
  and returns a closeable that will remove the statement from the set at
  the end of the query."
  ^java.lang.AutoCloseable
  [created-connection? rw ^Connection conn ^PreparedStatement stmt]
  (if-let [{:keys [add remove]} *in-progress-stmts*]
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
      (add rw cancelable)
      (reify java.lang.AutoCloseable
        (close [_]
          (remove rw cancelable))))
    (reify java.lang.AutoCloseable
      (close [_]
        nil))))

(defn annotate-query-with-debug-info [query]
  (if-let [{:keys [span-id trace-id]} (tracer/current-span-ids)]
    (update query 0 (fn [s]
                      (format "-- trace-id=%s, span-id=%s\n%s" trace-id span-id s)))
    query))

(defmacro defsql [name query-fn rw opts]
  (let [span-name (format "sql/%s" name)]
    `(defn ~name
       ([~'conn ~'query]
        (~name nil ~'conn ~'query))
       ([~'tag ~'conn ~'query]
        (~name nil ~'conn ~'query nil))
       ([~'tag ~'conn ~'query ~'additional-opts]
        (tracer/with-span! {:name ~span-name
                            :attributes (span-attrs ~'conn ~'query ~'tag)}
          (try
            (io/tag-io
              (let [create-connection?# (not (instance? Connection ~'conn))
                    opts# (merge ~opts
                                 ~'additional-opts
                                 {:timeout *query-timeout-seconds*})
                    ^Connection c# (if create-connection?#
                                     (next-jdbc/get-connection ~'conn)
                                     ~'conn)

                    query# (annotate-query-with-debug-info ~'query)]
                (try
                  (with-open [ps# (next-jdbc/prepare c# query# opts#)
                              _cleanup# (register-in-progress create-connection?# ~rw c# ps#)]
                    (~query-fn ps# nil opts#))
                  (finally
                    ;; Don't close the connection if a java.sql.Connection was
                    ;; passed in, or we'll end transactions before they're done.
                    (when create-connection?#
                      (.close c#))))))
            (catch PSQLException e#
              (throw (ex/translate-and-throw-psql-exception! e#)))))))))

(defsql select sql/query :read {:builder-fn rs/as-unqualified-maps})
(defsql select-qualified sql/query :read {:builder-fn rs/as-maps})
(defsql select-arrays sql/query :read {:builder-fn rs/as-unqualified-arrays})
(defsql select-string-keys sql/query :read {:builder-fn as-string-maps})
(def select-one (comp first select))
(defsql execute! next-jdbc/execute! :write {:builder-fn rs/as-unqualified-maps
                                            :return-keys true})
(defsql execute-one! next-jdbc/execute-one! :write {:builder-fn rs/as-unqualified-maps
                                                    :return-keys true})
(defsql do-execute! next-jdbc/execute! :write {:return-keys false})

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
