(ns instant.jdbc.copy
  (:require
   [instant.util.json :as json])
  (:import
   (java.nio ByteBuffer)
   (java.nio.charset StandardCharsets)
   (java.time Instant)
   (java.time.temporal ChronoUnit Temporal)
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

(def ^{:tag Instant} pg-epoch-instant (Instant/parse "2000-01-01T00:00:00Z"))

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

;; ------------
;; Row decoding

;; Docs on binary format
;; https://www.postgresql.org/docs/current/sql-copy.html#id-1.9.3.55.9.4
;; First row includes a header and the first row of data

(def ^{:tag 'bytes} signature-bytes (byte-array [(byte \P)
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
  [^ByteBuffer bb column-count construct-row]
  (let [field-count (.getShort bb)]
    (if (= -1 field-count)
      nil
      (do (when-not (= column-count field-count)
            (throw (ex-info "Invalid number of columns" {:field-count field-count
                                                         :column-count column-count})))
          (construct-row bb)))))

(defn- decode-field* [^ByteBuffer bb decode-field]
  (let [field-length (.getInt bb)]
    (when-not (= -1 field-length)
      (decode-field bb field-length))))

;; Check https://github.com/igrishaev/pg2/tree/master/pg-core/src/java/org/pg/processor
;; for the format when adding a new decoder.
(defn- field-decoder [pgtype handle-json-parse-error]
  (let [decode-field (case pgtype
                       "uuid" bin-decode-uuid
                       "text" bin-decode-text
                       "json" (fn [^ByteBuffer bb ^Integer byte-len]
                                (bin-decode-json bb byte-len handle-json-parse-error))
                       "jsonb" (fn [^ByteBuffer bb ^Integer byte-len]
                                 (bin-decode-jsonb bb byte-len handle-json-parse-error))
                       "timestamptz" bin-decode-timestamptz
                       "boolean" bin-decode-boolean
                       "integer" bin-decode-integer
                       "bigint" bin-decode-bigint
                       "checked_data_type" bin-decode-checked-data-type)]
    (fn [^ByteBuffer bb]
      (decode-field* bb decode-field))))

(defn- construct-map-row-fn [columns field-decoders]
  (let [fields (mapv (fn [{:keys [name]} decode-field]
                       [name decode-field])
                     columns
                     field-decoders)]
    (fn [^ByteBuffer bb]
      (persistent!
       (reduce (fn [m [name decode-field]]
                 (assoc! m name (decode-field bb)))
               (transient {})
               fields)))))

(defmacro ^:private def-construct-row-fn
  "Generates direct positional row constructors for common arities. Wider rows
   fall back to apply below.

   For n=2, generates something like
   (fn [buff]
     (row-fn ((field-decoders 0) buff)
             ((field-decoders 1) buff)))"
  [n]
  (let [row-fn-sym (gensym "row-fn")
        field-decoders-sym (gensym "field-decoders")
        bb-sym (with-meta (gensym "bb") {:tag `ByteBuffer})]
    `(defn ~(symbol (str "construct-row-fn-" n)) [~row-fn-sym ~field-decoders-sym]
       (fn [~bb-sym]
         (~row-fn-sym ~@(map (fn [i]
                               `((~field-decoders-sym ~i) ~bb-sym))
                             (range n)))))))

(def-construct-row-fn 0)
(def-construct-row-fn 1)
(def-construct-row-fn 2)
(def-construct-row-fn 3)
(def-construct-row-fn 4)
(def-construct-row-fn 5)
(def-construct-row-fn 6)
(def-construct-row-fn 7)
(def-construct-row-fn 8)
(def-construct-row-fn 9)
(def-construct-row-fn 10)
(def-construct-row-fn 11)
(def-construct-row-fn 12)

(defn- construct-row-fn-default [row-fn field-decoders]
  (fn [^ByteBuffer bb]
    (apply row-fn
           (mapv (fn [decode-field]
                   (decode-field bb))
                 field-decoders))))

(defn- construct-row-fn [{:keys [handle-json-parse-error row-fn]} columns]
  (let [column-count (count columns)
        field-decoders (mapv (fn [{:keys [pgtype]}]
                               (field-decoder pgtype handle-json-parse-error))
                             columns)]
    (if row-fn
      (case column-count
        0 (construct-row-fn-0 row-fn field-decoders)
        1 (construct-row-fn-1 row-fn field-decoders)
        2 (construct-row-fn-2 row-fn field-decoders)
        3 (construct-row-fn-3 row-fn field-decoders)
        4 (construct-row-fn-4 row-fn field-decoders)
        5 (construct-row-fn-5 row-fn field-decoders)
        6 (construct-row-fn-6 row-fn field-decoders)
        7 (construct-row-fn-7 row-fn field-decoders)
        8 (construct-row-fn-8 row-fn field-decoders)
        9 (construct-row-fn-9 row-fn field-decoders)
        10 (construct-row-fn-10 row-fn field-decoders)
        11 (construct-row-fn-11 row-fn field-decoders)
        12 (construct-row-fn-12 row-fn field-decoders)
        (construct-row-fn-default row-fn field-decoders))
      (construct-map-row-fn columns field-decoders))))

;; -------
;; Reducer

(defn- copy-reduce [^PgConnection conn
                    copy-query
                    columns
                    f
                    init
                    {:keys [handle-json-parse-error
                            row-fn]}]
  (let [out (.copyOut (.getCopyAPI conn) copy-query)
        format (.getFormat out)]
    (when (not= 1 format)
      (throw (ex-info "Expected copy query to be in binary format." {:format format})))
    (let [bb (ByteBuffer/wrap (.readFromCopy out))
          column-count (count columns)
          construct-row (construct-row-fn {:handle-json-parse-error handle-json-parse-error
                                           :row-fn row-fn}
                                          columns)]
      (advance-header bb)
      (loop [init' init
             bb bb]
        (if-let [row (decode-row bb column-count construct-row)]
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
  "Modeled after next-jdbc/plan, returns a reducer.

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
                              parse and should either throw or return a value
     row-fn: function to construct rows from decoded columns in order.
             Without row-fn, rows are returned as maps keyed by column :name.
             For record rows, pass the positional constructor, e.g. ->Triple.
             row-fn is called directly for rows with up to 12 columns; wider
             rows fall back to apply. Make sure your columns order is the same
             as your constructor."
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
                              parse and should either throw or return a value
     row-fn: function to construct rows from decoded columns in order.
             Without row-fn, rows are returned as maps keyed by column :name.
             For record rows, pass the positional constructor, e.g. ->Triple.
             row-fn is called directly for rows with up to 12 columns; wider
             rows fall back to apply. Make sure your columns order is the same
             as your constructor."
  ([^PgConnection conn copy-query columns]
   (copy-seq conn copy-query columns nil))
  ([^PgConnection conn copy-query columns {:keys [handle-json-parse-error
                                                  row-fn]}]
   (let [out (.copyOut (.getCopyAPI conn) copy-query)
         format (.getFormat out)]
     (when (not= 1 format)
       (throw (ex-info "Expected copy query to be in binary format." {:format format})))
     (let [bb (ByteBuffer/wrap (.readFromCopy out))
           _ (advance-header bb)
           column-count (count columns)
           construct-row (construct-row-fn {:handle-json-parse-error handle-json-parse-error
                                            :row-fn row-fn}
                                           columns)
           collect (fn collect [bb]
                     (lazy-seq
                      (if-let [row (decode-row bb column-count construct-row)]
                        (cons row (collect (ByteBuffer/wrap (.readFromCopy out))))
                        (when-not (nil? (.readFromCopy out))
                          (throw (ex-info "readFromCopy returned non-nil after last row." {}))))))]
       (collect bb)))))

;; -------
;; Copy IN

(defn ensure-capacity
  "Returns a buffer with at least `needed` bytes remaining. If `bb` already
   has room, returns it unchanged. Otherwise allocates a larger buffer and
   copies the bytes written so far."
  ^ByteBuffer [^ByteBuffer bb ^long needed]
  (if (>= (.remaining bb) needed)
    bb
    (let [pos (.position bb)
          new-cap (max (+ pos needed)
                       (* 2 (.capacity bb)))
          new-bb (ByteBuffer/allocate new-cap)]
      (.flip bb)
      (.put new-bb bb)
      new-bb)))

(defn encode-row
  "Encodes one row into `bb`, growing the buffer as needed.
   Each variable-length field is encoded exactly once.
   Returns the buffer flipped.
   If you want a json value to be a postgres `null`, you must dissoc the key
   from the map, a nil in the map will be treated as JSON `null`"
  ^ByteBuffer [^ByteBuffer bb columns m]
  (let [n (count columns)
        bb (doto bb .clear)
        bb (doto (ensure-capacity bb 2)
             (ByteBuffer/.putShort n))]
    (loop [i 0
           ^ByteBuffer bb bb]
      (if (< i n)
        (let [col (nth columns i)
              v (get m (:name col) ::missing)
              bb (if (or (and (nil? v)
                              (not= (:pgtype col) "json")
                              (not= (:pgtype col) "jsonb"))
                         (identical? v ::missing))
                   (doto (ensure-capacity bb 4)
                     (ByteBuffer/.putInt -1))
                   (case (:pgtype col)
                     "json"
                     (let [ba (json/->json-bytes v)]
                       (doto (ensure-capacity bb (+ 4 (alength ba)))
                         (ByteBuffer/.putInt (alength ba))
                         (ByteBuffer/.put ba)))

                     "jsonb"
                     ;; jsonb wire format: int32 field-length, byte version (1), then JSON bytes
                     (let [ba (json/->json-bytes v)]
                       (doto (ensure-capacity bb (+ 5 (alength ba)))
                         (ByteBuffer/.putInt (inc (alength ba)))
                         (ByteBuffer/.put (byte 1))
                         (ByteBuffer/.put ba)))

                     "text"
                     (let [ba (.getBytes ^String v StandardCharsets/UTF_8)]
                       (doto (ensure-capacity bb (+ 4 (alength ba)))
                         (ByteBuffer/.putInt (alength ba))
                         (ByteBuffer/.put ba)))

                     "uuid"
                     (let [^UUID v v]
                       (doto (ensure-capacity bb 20)
                         (ByteBuffer/.putInt 16)
                         (ByteBuffer/.putLong (.getMostSignificantBits v))
                         (ByteBuffer/.putLong (.getLeastSignificantBits v))))

                     "timestamptz"
                     (doto (ensure-capacity bb 12)
                       (ByteBuffer/.putInt 8)
                       (ByteBuffer/.putLong (.between ChronoUnit/MICROS pg-epoch-instant ^Temporal v)))

                     "boolean"
                     (doto (ensure-capacity bb 5)
                       (ByteBuffer/.putInt 1)
                       (ByteBuffer/.put (if v (byte 1) (byte 0))))

                     "integer"
                     (doto (ensure-capacity bb 8)
                       (ByteBuffer/.putInt 4)
                       (ByteBuffer/.putInt (int v)))

                     "bigint"
                     (doto (ensure-capacity bb 12)
                       (ByteBuffer/.putInt 8)
                       (ByteBuffer/.putLong (long v)))))]
          (recur (inc i) bb))
        (doto bb .flip)))))

(def ^{:tag 'bytes} write-header (let [bb (ByteBuffer/allocate 19)]
                                   (.put bb signature-bytes)
                                   (.putInt bb 0)
                                   (.putInt bb 0)
                                   (.array bb)))

(def ^{:tag 'bytes} end-of-data (let [bb (ByteBuffer/allocate 2)]
                                  (.putShort bb -1)
                                  (.array bb)))

(defn copy-in-rows
  "If you want a json value to be a postgres `null`, you must dissoc the key
   from the map, a nil in the map will be treated as JSON `null`"
  [^PgConnection conn copy-query columns rows]
  (let [in (.copyIn (.getCopyAPI conn) copy-query)
        format (.getFormat in)]
    (when (not= 1 format)
      (throw (ex-info "Expected copy query to be in binary format." {:format format})))
    (.writeToCopy in write-header 0 (alength write-header))
    (loop [^ByteBuffer bb (ByteBuffer/allocate 0)
           rs (seq rows)]
      (when rs
        (let [bb (encode-row bb columns (first rs))]
          (.writeToCopy in (.array bb) 0 (.limit bb))
          (recur bb (next rs)))))
    (.writeToCopy in end-of-data 0 (alength end-of-data))
    (.endCopy in)))
