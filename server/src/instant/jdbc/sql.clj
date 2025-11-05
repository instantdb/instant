(ns instant.jdbc.sql
  (:refer-clojure :exclude [format])
  (:require
   [clojure.string :as string]
   ;; load all pg-ops for hsql
   [honey.sql :as hsql]
   [honey.sql.pg-ops]
   [instant.jdbc.socket-track :as socket-track]
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
   (clojure.lang IPersistentList IPersistentMap IPersistentSet IPersistentVector ISeq)
   (com.zaxxer.hikari HikariDataSource)
   (java.sql Array Connection PreparedStatement ResultSet ResultSetMetaData)
   (java.time Instant LocalDate LocalDateTime)
   (javax.sql DataSource)
   (org.postgresql.util PGobject PSQLException)
   (org.postgresql.replication LogSequenceNumber)))

(set! *warn-on-reflection* true)

(defn <-pgobject
  "Transform PGobject containing `json` or `jsonb` value to Clojure data"
  [^PGobject v]
  (let [type (.getType v)
        value (.getValue v)]
    (when-not (nil? value)
      (case type
        ("json" "jsonb") (<-json value)
        "bit" (Long/parseLong value 2)
        "pg_lsn" (LogSequenceNumber/valueOf value)
        value))))

(defn <-array [^Array a]
  (let [type (.getBaseTypeName a)
        vs (.getArray a)]
    (case type
      ("json" "jsonb") (mapv <-json vs)
      (vec vs))))

(defn- create-pg-array [^PreparedStatement s pgtype clazz vs]
  (.createArrayOf (.getConnection s) pgtype (into-array clazz vs)))

(defn- create-2d-pg-array [^PreparedStatement s pgtype clazz vs]
  (.createArrayOf (.getConnection s) pgtype (into-array (map (fn [v1]
                                                               (into-array clazz v1))
                                                             vs))))

(def byte-class (Class/forName "[B"))

(defn set-param
  "Transform PGobject containing `json` or `jsonb` value to Clojure data"
  [^PreparedStatement s i v]
  (let [pgtype (or (:pgtype (meta v)) "jsonb")]
    (case pgtype
      "text[]" (.setArray s i (create-pg-array s "text" String v))
      "text[][]" (.setArray s i (create-2d-pg-array s "text" String v))
      "uuid[]" (.setArray s i (create-pg-array s "uuid" String (map str v)))
      "jsonb[]" (.setArray s i (create-pg-array s "jsonb" String (map ->json v)))
      "jsonb[][]" (let [vs (map #(map ->json %) v)]
                    (.setArray s i (create-2d-pg-array s "jsonb" String vs)))
      "timestamptz[]" (.setArray s i (create-pg-array s "timestamptz" Instant v))
      "float8[]" (.setArray s i (create-pg-array s "float8" Number v))
      "boolean[]" (.setArray s i (create-pg-array s "boolean" Boolean v))
      "integer[]" (.setArray s i (create-pg-array s "integer" Integer v))
      "bigint[]" (.setArray s i (create-pg-array s "bigint" Long v))
      "bigint[][]" (.setArray s i (create-2d-pg-array s "bigint" Long v))
      "bytea[]" (.setArray s i (create-pg-array s "bytea" byte-class v))
      "bytea[][]" (.setArray s i (create-2d-pg-array s "bytea" byte-class v))
      (.setObject s i (doto (PGobject.)
                        (.setType pgtype)
                        (.setValue (->json v)))))))


(extend-protocol rs/ReadableColumn
  Array
  (read-column-by-label [^Array v _] (<-array v))
  (read-column-by-index [^Array v _2 _3] (<-array v))

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

  LogSequenceNumber
  (set-parameter [^LogSequenceNumber v ^PreparedStatement ps ^long i]
    (.setObject ps i (doto (PGobject.)
                       (.setType "pg_lsn")
                       (.setValue (.asString v)))))

  IPersistentMap
  (set-parameter [m ^PreparedStatement s i]
    (set-param s i m))

  IPersistentList
  (set-parameter [l ^PreparedStatement s i]
    (set-param s i l))

  IPersistentVector
  (set-parameter [v ^PreparedStatement s i]
    (set-param s i v))

  IPersistentSet
  (set-parameter [v ^PreparedStatement s i]
    (set-param s i v))

  ISeq
  (set-parameter [v ^PreparedStatement s i]
    (set-param s i v)))

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

(defn elementset
  "A way to pass sequence as an input to honeysql.

   Given:

     (def xs
       [1 2 3])

   One can use:

     (hsql/format
      (elementset xs {:as 'id, :type :int}))

   To get to:

     SELECT CAST(elem AS INT) AS id
       FROM JSONB_ARRAY_ELEMENTS_TEXT(CAST(? AS JSONB)) AS elem

   This is better than passing arrays as argument with ARRAY and UNNEST
   because it always generates one input paramter (does not depend on a length
   of the input array, `?` vs `?, ?, ?, ...`) and handles empty arrays the same
   way in handles non-empty ones."
  [xs {:keys [as type]}]
  {:select
   [[[:cast 'elem (or type :text)] as]]
   :from [[[:jsonb_array_elements_text [:cast (->json xs) :jsonb]] 'elem]]})

(defn tupleset
  "A way to pass seq-of-tuples as an input to honeysql.

   Given:

     (def ts
       [[1 \"Ivan\" 85]
        [2 \"Oleg\" 92]
        [3 \"Petr\" 68]])

   One can use:

     (hsql/format
      (tupleset ts
                [{:as 'id, :type :int}
                 {:as 'full-name}
                 {:as 'score, :type :int}]))

   To get to:

     SELECT CAST(elem ->> 0 AS INT) AS id,
            CAST(elem ->> 1 AS TEXT) AS full_name,
            CAST(elem ->> 2 AS INT) AS score
       FROM JSONB_ARRAY_ELEMENTS(CAST(? AS JSONB)) AS elem"
  [ts cols]
  {:select
   (for [[idx {:keys [type as]}] (map vector (range) cols)]
     [[:cast [:->> 'elem [:inline idx]] (or type :text)] as])
   :from
   [[[:jsonb_array_elements [:cast (->json ts) :jsonb]] 'elem]]})

(defn recordset
  "A way to pass seq-of-maps as an input to honeysql.

   Given:

     (def rs
       [{:id 1, :name \"Ivan\", :score 85}
        {:id 2, :name \"Oleg\", :score 92}
        {:id 3, :name \"Petr\", :score 68}])

   One can use:

     (hsql/format
      (recordset rs
                 {'id    {:type :int}
                  'name  {:as 'full-name}
                  'score {:type :int}}))

   To get to:

     SELECT id, name AS full_name, score
       FROM JSONB_TO_RECORDSET(CAST(? AS JSONB))
         AS (id int, name text, score int)"
  [rs cols]
  {:select (for [[col-name {:keys [as]}] cols]
             (if as
               [col-name as]
               col-name))
   :from   [[[:jsonb_to_recordset [:cast (->json rs) :jsonb]]
             [[:raw (str "("
                         (string/join ", "
                                      (for [[col-name {:keys [type]}] cols]
                                        (str (name col-name) " " (name (or type "text")))))
                         ")")]]]]})

(defn format-preprocess [sql]
  (let [re   #"\?[\p{Alpha}*!_?$%&=<>.|''\-+#0-9]+"
        args (re-seq re sql)]
    [(string/replace sql re "?") args]))

(defn format-get [params name]
  (or
   (get params name)
   (throw (ex-info (str "Missing parameter: " name) {:params params}))))

(defmacro format
  "Given SQL string with named placeholders (\"?symbol\") and map of values,
   returns [query params...] with positional placeholders.

     (sql/format
       \"SELECT * FROM triples
          WHERE attr_id = ?attr-id
            AND app_id  = ?app-id\"
       {\"?attr-id\" #uuid ...
        \"?app-id\"  #uuid ...})

    => [\"SELECT * FROM triples WHERE attr_id = ? and app_id = ?\" #uuid ... #uuid ...]"
  [sql params]
  (if (string? sql)
    ;; if string is statically known, we can preprocess it
    (let [[sql' param-names] (format-preprocess sql)
          params-sym (gensym "params")]
      `(let [~params-sym ~params]
         [~sql' ~@(map #(list `format-get params-sym %) param-names)]))
    `(let [params# ~params
           [sql'# param-names#] (format-preprocess ~sql)]
       (into [sql'#] (map #(format-get params# %) param-names#)))))

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
  [[conn-name ^DataSource conn-pool] & body]
  `(binding [*conn-pool-span-stats* (span-attrs-from-conn-pool ~conn-pool)]
     (io/tag-io
       (with-open [~conn-name (.getConnection ~conn-pool)]
         ~@body))))

(defn- postgres-config-span-attrs [postgres-config]
  (reduce (fn [acc {:keys [setting value]}]
            (assoc acc (str "postgres-config." setting) value))
          {}
          postgres-config))

(defn- span-attrs [conn query tag additional-opts]
  (let [pool-stats (if (instance? HikariDataSource conn)
                     (span-attrs-from-conn-pool conn)
                     *conn-pool-span-stats*)]
    (merge {:detailed-query (pr-str (if (:skip-log-params additional-opts)
                                      (take 1 query)
                                      query))}
           pool-stats
           (postgres-config-span-attrs (:postgres-config additional-opts))
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
                         (try
                           (.cancel stmt)
                           ;; Don't close the connection we opened b/c
                           ;; it seems to cause thread pinning when you
                           ;; close from a different thread and it will
                           ;; get closed in the `finally` clause
                           ;; below. We have to close connections we
                           ;; were passed to make sure transactions are
                           ;; rolled back.
                           (when-not created-connection?
                             (.close conn))
                           (catch java.sql.SQLException e
                             (when (not= "Connection is closed" (.getMessage e))
                               (throw e))))))]
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
                      (let [debug-info (str "-- trace-id=" trace-id
                                            ", span-id=" span-id
                                            "\n")]
                        (if-not (string/starts-with? s "/*+")
                          (str debug-info s)
                          (let [end-comment (or (when-let [i (string/index-of s "*/")]
                                                  (+ i 2))
                                                (count s))]
                            (str (subs s 0 end-comment)
                                 debug-info
                                 (subs s end-comment)))))))
    query))

(defn apply-postgres-config [postgres-config created-connection? ^Connection c]
  (when (seq postgres-config)
    (cond (not created-connection?)
          (tracer/record-exception-span!
           (Exception. "Tried to provide postgres-config for a connection we didn't create")
           {:name "sql/apply-postgres-config-error"
            :attributes (postgres-config-span-attrs postgres-config)})

          (.getAutoCommit c)
          (tracer/record-exception-span!
           (Exception. "Tried to provide postgres-config for a connection with auto-commit = on")
           {:name "sql/apply-postgres-config-error"
            :attributes (postgres-config-span-attrs postgres-config)})

          :else
          (try
            (tracer/with-span! {:name "sql/apply-postgres-config"
                                :attributes (postgres-config-span-attrs postgres-config)}
              (next-jdbc/execute!
               c
               (hsql/format {:with [[[:t {:columns [:setting :value]}]
                                     {:values (map (fn [{:keys [setting value]}]
                                                     [setting value])
                                                   postgres-config)}]]
                             :select [[[:set_config :t.setting :t.value true]]]
                             :from :t})))
            (catch Exception _ nil)))))

(defn annotate-update-count [^PreparedStatement ps]
  (try
    (let [update-count (.getUpdateCount ps)]
      (when (not= -1 update-count)
        (tracer/add-data! {:attributes
                           {:update-count update-count}})))
    (catch Throwable _e nil)))

(defmacro defsql [name query-fn rw opts]
  (let [span-name (clojure.core/format "sql/%s" name)]
    `(defn ~name
       ([~'conn ~'query]
        (~name nil ~'conn ~'query nil))
       ([~'tag ~'conn ~'query]
        (~name ~'tag ~'conn ~'query nil))
       ([~'tag ~'conn ~'query ~'additional-opts]
        (tracer/with-span! {:name ~span-name
                            :attributes (span-attrs ~'conn ~'query ~'tag ~'additional-opts)}
          ;; Uncomment to send sql queries to portal
          ;; (tap> (with-meta ~'query
          ;;         {:portal.viewer/default :tool/sql-query}))
          (try
            (io/tag-io
              (let [postgres-config# (:postgres-config ~'additional-opts)
                    create-connection?# (not (instance? Connection ~'conn))
                    opts# (merge ~opts
                                 (dissoc ~'additional-opts
                                         :postgres-config
                                         :skip-log-params)
                                 {:timeout *query-timeout-seconds*})
                    ^Connection c# (if create-connection?#
                                     (next-jdbc/get-connection ~'conn)
                                     ~'conn)

                    query# (annotate-query-with-debug-info ~'query)
                    bytes-before# (socket-track/bytes-transferred c#)]
                (try
                  (apply-postgres-config postgres-config# create-connection?# c#)
                  (with-open [ps# (next-jdbc/prepare c# query# opts#)
                              _cleanup# (register-in-progress create-connection?# ~rw c# ps#)]
                    (let [res# (~query-fn ps# nil opts#)
                          bytes-after# (when bytes-before#
                                         (socket-track/bytes-transferred c#))
                          bytes-meta# (when bytes-after#
                                        {:bytes-read (- (:read bytes-after#)
                                                        (:read bytes-before#))
                                         :bytes-written (- (:write bytes-after#)
                                                           (:write bytes-before#))})]
                      (when bytes-meta#
                        (tracer/add-data! {:attributes bytes-meta#}))
                      (annotate-update-count ps#)
                      (when res#
                        (if (:attach-warnings? opts#)
                          (with-meta res# (merge {:warnings (.getWarnings ps#)}
                                                 bytes-meta#))
                          (with-meta res# bytes-meta#)))))
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

(defn- plan-reduce*
  "Wrapper for plan that executes the reduce inside of defsql.
   This lets our query cancel logic work.
   The following query with plan:
   (reduce (fn [acc x] (conj acc x))
           []
           (plan query opts))
   Looks like this with plan-reduce:
   (plan-reduce ::tag conn query {:reducer (fn [acc x] (conj acc x))
                                  :init []
                                  :fetch-size 100})

   Note that cancel-in-progress is hit-or-miss for plan-reduce* because
   the cancel might come when the preparedstatement is not active. future-cancel
   will cancel the query, though."
  [ps _ {:keys [reducer init fetch-size] :as opts}]
  (reduce reducer
          init
          (next-jdbc/plan ps
                          (merge {:fetch-size fetch-size
                                  :concurrency :read-only
                                  :cursors :close
                                  :result-type :forward-only}
                                 (dissoc opts :reducer :init :fetch-size)))))

(defsql plan-reduce plan-reduce* :read {})

(defn analyze [conn query]
  (-> query
      (update 0 #(str "EXPLAIN ANALYZE " %))
      (->> (execute! conn)
           (mapcat vals)
           (string/join "\n"))))

(defn start-pool ^HikariDataSource [config]
  (let [url (connection/jdbc-url config)
        pool (connection/->pool HikariDataSource (assoc config :jdbcUrl url))]
    (.close (next-jdbc/get-connection pool))
    pool))
