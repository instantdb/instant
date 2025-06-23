(ns instant.jdbc.sql
  (:refer-clojure :exclude [format])
  (:require
   [clojure.string :as string]
   ;; load all pg-ops for hsql
   [honey.sql :as hsql]
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
   (clojure.lang IPersistentList IPersistentMap IPersistentSet IPersistentVector)
   (com.zaxxer.hikari HikariDataSource)
   (java.sql Array Connection PreparedStatement ResultSet ResultSetMetaData)
   (java.time Instant LocalDate LocalDateTime)
   (java.util UUID)
   (javax.sql DataSource)
   (org.postgresql.util PGobject PSQLException)))

(set! *warn-on-reflection* true)

(defn ->pg-text-array
  "Formats as text[] in pg, i.e. {item-1, item-2, item3}"
  [col]
  (clojure.core/format
   "{%s}"
   (string/join
    ","
    (map (fn [s] (clojure.core/format "\"%s\""
                                      ;; Escape quotes (but don't double esc)
                                      (string/replace s #"(?<!\\)\"" "\\\"")))
         col))))

(defn ->pg-uuid-array
  "Formats as uuid[] in pg, i.e. {item-1, item-2, item3}"
  [uuids]
  (let [s (StringBuilder. "{")]
    (doseq [^UUID uuid uuids]
      (when (not= 1 (.length s))
        (.append s \,))
      (.append s (.toString uuid)))
    (.append s "}")
    (.toString s)))

(defn ->pgobject
  "Transforms Clojure data to a PGobject that contains the data as
  JSON. PGObject type defaults to `jsonb` but can be changed via
  metadata key `:pgtype`"
  ^PGobject [x]
  (let [pgtype (or (:pgtype (meta x)) "jsonb")
        value (case pgtype
                "text[]" (->pg-text-array x)
                "uuid[]" (->pg-uuid-array x)
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
    (.setObject s i (->pgobject v)))

  IPersistentSet
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
  (let [re   #"\?[\p{Alpha}*!_?$%&=<>.|''\-+#:0-9]+"
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
    (merge {:detailed-query (pr-str query)}
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
                      (let [debug-info (str "-- trace-id=" trace-id
                                            ", span-id=" span-id
                                            "\n")]
                        (if-not (string/starts-with? s "/*+")
                          (str debug-info s)
                          (let [end-comment (or (when-let [i (string/index-of s "*/")]
                                                  (+ i 2))
                                                (count s))]
                            (str (subs s 0 end-comment)
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
                                 (dissoc ~'additional-opts :postgres-config)
                                 {:timeout *query-timeout-seconds*})
                    ^Connection c# (if create-connection?#
                                     (next-jdbc/get-connection ~'conn)
                                     ~'conn)

                    query# (annotate-query-with-debug-info ~'query)]
                (try
                  (apply-postgres-config postgres-config# create-connection?# c#)
                  (with-open [ps# (next-jdbc/prepare c# query# opts#)
                              _cleanup# (register-in-progress create-connection?# ~rw c# ps#)]
                    (let [res# (~query-fn ps# nil opts#)]
                      (annotate-update-count ps#)
                      (if (:attach-warnings? opts#)
                        (with-meta res# {:warnings (.getWarnings ps#)})
                        res#)))
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
