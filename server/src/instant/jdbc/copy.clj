(ns instant.jdbc.copy
  (:require
   [instant.util.json :as json])
  (:import
   (java.nio ByteBuffer)
   (java.time Instant)
   (java.time.temporal ChronoUnit)
   (java.util UUID)
   (org.postgresql.jdbc PgConnection)))

;; ------------------
;; Decoders for types

;; binary decoders that consume the input

(defn- advance-buf [^ByteBuffer bb ^Integer len]
  (.position bb (int (+ (.position bb) len))))

(defn- bin-decode-uuid [^ByteBuffer bb ^Integer byte-len]
  (when (not= byte-len 16)
    (throw (ex-info "Invalid byte length for uuid" {:byte-len byte-len})))
  (UUID. (.getLong bb) (.getLong bb)))

(defn- bin-decode-text [^ByteBuffer bb ^Integer byte-len]
  (let [res (String. (.array bb) (.position bb) byte-len "UTF-8")]
    (advance-buf bb byte-len)
    res))

(defn- bin-decode-json [^ByteBuffer bb ^Integer byte-len handle-json-parse-error]
  (let [res (if handle-json-parse-error
              (try (json/parse-bytes (.array bb) (.position bb) byte-len)
                   (catch Exception e
                     (handle-json-parse-error e {:value (String. (.array bb) (.position bb) byte-len "UTF-8")})))
              (json/parse-bytes (.array bb) (.position bb) byte-len))]
    (advance-buf bb byte-len)
    res))

(defn- bin-decode-jsonb [^ByteBuffer bb ^Integer byte-len handle-json-parse-error]
  ;; jsonb starts with a version byte, then the data comes after
  (let [version (.get bb)]
    (when (not= 1 version)
      (throw (ex-info "Invalid version byte for jsonb" {:version version}))))
  (bin-decode-json bb (dec byte-len) handle-json-parse-error))

(def pg-epoch-instant (Instant/parse "2000-01-01T00:00:00Z"))

(defn- bin-decode-timestamptz [^ByteBuffer bb ^Integer byte-len]
  (when (not= byte-len 8)
    (throw (ex-info "Invalid byte length for timestamptz" {:byte-len byte-len})))
  (let [micros-from-pg-epoch (.getLong bb)]
    (.plus ^Instant pg-epoch-instant
           micros-from-pg-epoch
           ChronoUnit/MICROS)))

(defn- bin-decode-boolean [^ByteBuffer bb ^Integer byte-len]
  (when (not= byte-len 1)
    (throw (ex-info "Invalid byte length for boolean" {:byte-len byte-len})))
  (case (.get bb)
    0 false
    1 true))

(defn- bin-decode-integer [^ByteBuffer bb ^Integer byte-len]
  (when (not= byte-len 4)
    (throw (ex-info "Invalid byte length for integer" {:byte-len byte-len})))
  (.getInt bb))

(defn- bin-decode-bigint [^ByteBuffer bb ^Integer byte-len]
  (when (not= byte-len 8)
    (throw (ex-info "Invalid byte length for bigint" {:byte-len byte-len})))
  (.getLong bb))

(defn- bin-decode-checked-data-type [^ByteBuffer bb ^Integer byte-len]
  (keyword (bin-decode-text bb byte-len)))

;; Check https://github.com/igrishaev/pg2/tree/master/pg-core/src/java/org/pg/processor
;; for the format when adding a new decoder.
(defn- bin-decode [^ByteBuffer bb pgtype ^Integer byte-len handle-json-parse-error]
  (case pgtype
    "uuid" (bin-decode-uuid bb byte-len)
    "text" (bin-decode-text bb byte-len)
    "json" (bin-decode-json bb byte-len handle-json-parse-error)
    "jsonb" (bin-decode-jsonb bb byte-len handle-json-parse-error)
    "timestamptz" (bin-decode-timestamptz bb byte-len)
    "boolean" (bin-decode-boolean bb byte-len)
    "integer" (bin-decode-integer bb byte-len)
    "bigint" (bin-decode-bigint bb byte-len)
    "checked_data_type" (bin-decode-checked-data-type bb byte-len)))

;; ------------
;; Row decoding

;; Docs on binary format
;; https://www.postgresql.org/docs/current/sql-copy.html#id-1.9.3.55.9.4
;; First row includes a header and the first row of data

(def signature-bytes (byte-array [(byte \P)
                                  (byte \G)
                                  (byte \C)
                                  (byte \O)
                                  (byte \P)
                                  (byte \Y)
                                  (byte \newline)
                                  -1
                                  (byte \return)
                                  (byte \newline)
                                  0]))

(defn- advance-header
  "Consumes the header from the first row, throwing if it encounters anything
   unexpected."
  [^ByteBuffer bb]
  (doseq [expected signature-bytes
          :let [actual (.get bb)]]
    (when (not= expected actual)
      (throw (ex-info "Invalid signature byte" {:expected expected
                                                :actual actual}))))

  (let [flags (.getInt bb)]
    (when (not= 0 flags)
      (throw (ex-info "Invalid flags field" {:expected 0
                                             :actual flags}))))

  (let [extension-length (.getInt bb)]
    (.position bb (+ (.position bb) extension-length))))

(defn- decode-row
  "Decodes a single row from the input, consumes the input."
  [^ByteBuffer bb columns handle-json-parse-error]
  (let [field-count (.getShort bb)]
    (if (= -1 field-count)
      nil
      (do (when-not (= (count columns) field-count)
            (throw (ex-info "Invalid number of columns" {:field-count field-count
                                                         :column-count (count columns)})))
          (persistent!
            (reduce (fn [m {:keys [name pgtype]}]
                      (let [field-length (.getInt bb)]
                        (if (= -1 field-length)
                          (assoc! m name nil)
                          (assoc! m name (bin-decode bb
                                                     pgtype
                                                     field-length
                                                     handle-json-parse-error)))))
                    (transient {})
                    columns))))))

;; -------
;; Reducer

(defn- copy-reduce [^PgConnection conn
                    copy-query
                    columns
                    f
                    init
                    {:keys [handle-json-parse-error]}]
  (let [out (.copyOut (.getCopyAPI conn) copy-query)
        format (.getFormat out)]
    (when (not= 1 format)
      (throw (ex-info "Expected copy query to be in binary format." {:format format})))
    (let [bb (ByteBuffer/wrap (.readFromCopy out))]
      (advance-header bb)
      (loop [init' init
             bb bb]
        (if-let [row (decode-row bb columns handle-json-parse-error)]
          (let [result (f init' row)]
            (if (reduced? result)
              @result
              (if-let [next-read (.readFromCopy out)]
                (recur result (ByteBuffer/wrap next-read))
                result)))
          ;; We got -1 to indicate end of stream,
          ;; next-read should be nil
          (if-let [next-read (.readFromCopy out)]
            (recur init' (ByteBuffer/wrap next-read))
            init'))))))

(defn copy-reducer
  "Modeleted after next-jdbc/plan, returns a reducer.

   copy-query must be in format:
     `copy table to stdout with (format binary)`
   You can do a select with:
     `copy (select id, field from table) to stdout with (format binary)`

   Columns should be a list of {:name, :pgtype} maps and must be in the same
   order as the data that the query returns.
   See bin-decode for the list of supported types.

   Open a new connection to be used with copy and close it afterwards.
   Don't use one from the Hikari pool. The connection might be left in
   an invalid state if the copy operation ends prematurely.

   Takes optional opts:
     handle-json-parse-error: function that receives an exception during json
                              parse and should either throw or return a value"
  ([^PgConnection conn copy-query columns]
   (copy-reducer conn copy-query columns nil))
  ([^PgConnection conn copy-query columns opts]
   (reify
     clojure.lang.IReduceInit
     (reduce [_ f init]
       (copy-reduce conn copy-query columns f init opts)))))

(defn copy-seq
  "copy-query must be in format:
     `copy table to stdout with (format binary)`
   You can do a select with:
     `copy (select id, field from table) to stdout with (format binary)`

   Columns should be a list of {:name, :pgtype} maps and must be in the same
   order as the data that the query returns.
   See bin-decode for the list of supported types.

   Open a new connection to be used with copy and close it afterwards.
   Don't use one from the Hikari pool. The connection might be left in
   an invalid state if the copy operation ends prematurely.

   Takes optional opts:
     handle-json-parse-error: function that receives an exception during json
                              parse and should either throw or return a value"
  ([^PgConnection conn copy-query columns]
   (copy-seq conn copy-query columns nil))
  ([^PgConnection conn copy-query columns {:keys [handle-json-parse-error]}]
   (let [out (.copyOut (.getCopyAPI conn) copy-query)
         format (.getFormat out)]
     (when (not= 1 format)
       (throw (ex-info "Expected copy query to be in binary format." {:format format})))
     (let [bb (ByteBuffer/wrap (.readFromCopy out))
           _ (advance-header bb)
           collect (fn collect [bb]
                     (lazy-seq
                      (if-let [row (decode-row bb columns handle-json-parse-error)]
                        (cons row (collect (ByteBuffer/wrap (.readFromCopy out))))
                        (when-not (nil? (.readFromCopy out))
                          (throw (ex-info "readFromCopy returned non-nil after last row." {}))))))]
       (collect bb)))))
