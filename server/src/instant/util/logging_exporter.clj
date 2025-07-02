(ns instant.util.logging-exporter
  "Exporter that logs spans to stdout. In development we also colorize the logs"
  (:require
   [clojure.string :as string]
   [clojure.tools.logging :as log]
   [instant.config :as config]
   [instant.flags :as flags]
   [instant.util.coll :as ucoll])
  (:import
   (instant SpanTrackException)
   (io.opentelemetry.api.common AttributeKey)
   (io.opentelemetry.api.trace Span SpanId)
   (io.opentelemetry.sdk.common CompletableResultCode)
   (io.opentelemetry.sdk.trace.data SpanData
                                    EventData
                                    ExceptionEventData)
   (io.opentelemetry.sdk.trace.export SpanExporter)
   (java.util.concurrent TimeUnit)
   (java.util.concurrent.atomic AtomicBoolean)))

(set! *warn-on-reflection* true)

;; ------
;; Colors

(def colors
  "All ansi color codes that look good against black"
  [9, 10, 11, 12, 13, 14, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43,
   44, 45, 46, 47, 48, 49, 50, 51, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83,
   84, 85, 86, 87, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112,
   113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127, 128, 129, 130, 131, 132, 133, 134, 135,
   136, 137, 138, 139, 140, 141, 142, 143, 144, 146, 147, 148, 149, 150, 151, 152, 153, 154, 155, 156, 157, 158,
   59, 160, 161, 162, 163, 164, 165, 166, 167, 168, 169, 170, 171, 172, 173, 174, 175, 176, 177, 178, 179, 180, 181,
   182, 183, 184, 185, 186, 187, 188, 189, 190, 191, 192, 193, 194, 195, 196, 197, 198, 199, 200, 201, 202, 203, 204,
   205, 206, 207, 208, 209, 210, 211, 212, 213, 214, 215, 216, 217, 218, 219, 220, 221, 222, 223, 224, 225, 226, 227,
   228, 229, 230, 231])

(defn- error-color [s]
  (format "\033[1;37;41m%s\033[0m" s))

(defn- uniq-color [^String s]
  (let [n (.hashCode s)
        i (mod n (count colors))]
    (format "\033[1;38;5;%dm%s\033[0m" (colors i) s)))

(defn colorize [color-f s]
  (if (config/aws-env?)
    s
    (color-f s)))

(defn duration-ms [^SpanData span]
  (let [start (.getStartEpochNanos span)
        end   (.getEndEpochNanos span)]
    (.toMillis TimeUnit/NANOSECONDS
               (- end start))))

(defn exclude? [k]
  (case k
    ("SampleRate"
     "thread.name"
     "thread.id"
     "code.lineno"
     "code.namespace"
     "code.filepath"
     "host.name"
     "detailed_query"
     "detailed_patterns"
     "detailed_tx_steps"
     "process_id"
     "instance_id"
     "query"
     "fewer_vfutures") true
    false))

(defn format-attr-value
  "Formats attr values for logs."
  [v]
  (condp identical? (type v)
    ;; format will print e.g. "clojure.lang.LazySeq@7861"
    clojure.lang.LazySeq (pr-str v)
    v))

(defn- append-attr [^StringBuilder sb [k v]]
  (let [k (str k)]
    (when-not (exclude? k)
      (.append sb (if (and (= k "exception.message")
                           (not (config/aws-env?)))
                    (colorize error-color k)
                    k))
      (.append sb "=")
      (.append sb (format-attr-value v))
      (.append sb " "))))

(defn add-span-tracker-to-exception [^Span span ^Throwable t]
  (when-not (ucoll/exists?
             (fn [s] (instance? SpanTrackException s))
             (.getSuppressed t))
    (.addSuppressed t (SpanTrackException. (-> span
                                               (.getSpanContext)
                                               (.getSpanId))))))

(defn exception-belongs-to-span? [^Throwable t ^SpanId spanId]
  (ucoll/exists?
   (fn [t]
     (and (instance? SpanTrackException t)
          (= spanId (.getMessage ^SpanTrackException t))))
   (some-> t .getSuppressed)))

(defn exception-belongs-to-child-span? [^Throwable t ^SpanId spanId]
  (ucoll/exists?
   (fn [t]
     (and (instance? SpanTrackException t)
          (not= spanId (.getMessage ^SpanTrackException t))))
   (some-> t .getSuppressed)))

(defn attr-str [^SpanData span]
  (let [sb (StringBuilder.)]
    (doseq [attr (.asMap (.getAttributes span))]
      (append-attr sb attr))
    (doseq [^EventData event (.getEvents span)]
      (if (and (instance? ExceptionEventData event)
               (exception-belongs-to-child-span? (.getException ^ExceptionEventData event) (.getSpanId span)))
        (append-attr sb ["child-threw-exception" true])
        (doseq [attr (.asMap (.getAttributes event))]
          (append-attr sb attr))))
    (.toString sb)))

(defn friendly-trace [trace-id]
  (if (seq trace-id)
    (if (config/aws-env?)
      trace-id
      (subs trace-id 0 4))
    "unk"))

(defn escape-newlines [^String s]
  (.replace s "\n" "\\\\n"))

(def span-str
  (if (config/aws-env?)
    (fn [^SpanData span]
      (let [attr-str (attr-str span)]
        (format "[%s/%s] %sms [%s] %s"
                (.getTraceId span)
                (.getSpanId span)
                (duration-ms span)
                (.getName span)
                (escape-newlines attr-str))))
    (fn [^SpanData span]
      (let [attr-str (attr-str span)]
        (format "[%s] %sms [%s] %s"
                (colorize uniq-color (friendly-trace (.getTraceId span)))
                (duration-ms span)
                (colorize uniq-color (.getName span))
                attr-str)))))

(def op-attr-key (AttributeKey/stringKey "op"))
(def app-id-attr-key (AttributeKey/stringKey "app_id"))

(def exclude-span?
  (if (config/aws-env?)
    (fn [^SpanData span]
      (let [n (.getName span)]
        (case n
          ("aurora/get-connection"
           "gc"
           "gauges"
           "ws/send-json!"
           "handle-refresh/send-event!"
           "store/record-datalog-query-finish!"
           "store/record-datalog-query-start!"
           "store/swap-datalog-cache!"
           "store/bump-instaql-version!"
           "store/add-instaql-query!"
           "store/mark-datalog-queries-stale!"
           "store/remove-query!"
           "store/assoc-session!"
           "store/remove-session!"
           "store/remove-session-data!"
           "store/upsert-datalog-loader!"
           "instaql/get-eid-check-result!"
           "extract-permission-helpers"
           "instaql/map-permissioned-node"
           "datalog-query-reactive!"
           "instaql/preload-entity-maps"
           "datalog/send-query-nested") true

          ("receive-worker/handle-event"
           "receive-worker/handle-receive")
          (case (-> (.getAttributes span)
                    (.get op-attr-key))
            (":set-presence"
             ":refresh-presence"
             ":server-broadcast"
             ":client-broadcast") true

            false)

          (string/starts-with? n "e2e"))))
    (fn [^SpanData span]
      (let [n (.getName span)]
        (case n
          ("gc"
           "gauges") true

          (string/starts-with? n "e2e"))))))

(defn include-span? [^SpanData span]
  (let [name (.getName span)]
    (= "postmark/send-disabled" name)))

(def log-spans?
  (not= "false" (System/getenv "INSTANT_LOG_SPANS")))

(defn should-log? [^SpanData span]
  (if-let [app-id (-> span .getAttributes (.get app-id-attr-key))]
    (if-let [sample-rate (flags/log-sampled-apps app-id)]
      (<= (rand) sample-rate)
      true)  ; App ID not in config, always log
    true))  ; No app ID, always log

(defn log-spans [spans]
  (doseq [span spans
          :when (or (include-span? span)
                    (and log-spans?
                         (should-log? span)
                         (not (exclude-span? span))))]
    (log/info (span-str span))))

(defn export [^AtomicBoolean shutdown? spans]
  (if (.get shutdown?)
    (CompletableResultCode/ofFailure)
    (do (log-spans spans)
        (CompletableResultCode/ofSuccess))))

(defn create []
  (let [shutdown? (AtomicBoolean. false)]
    (reify SpanExporter
      (export [_this spans]
        (export shutdown? spans))
      (flush [_this]
        (CompletableResultCode/ofSuccess))
      (shutdown [_this]
        (when-not (.compareAndSet shutdown? false true)
          (log/info "Calling shutdown() multiple times."))
        (CompletableResultCode/ofSuccess))
      (toString [_this] "InstantLoggingExporter"))))
