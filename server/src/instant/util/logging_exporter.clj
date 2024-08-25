(ns instant.util.logging-exporter
  "Exporter that logs spans to stdout. In development we also colorize the logs"
  (:require
   [clojure.tools.logging :as log]
   [clojure.string :as string]
   [instant.config :as config])
  (:import [io.opentelemetry.sdk.common CompletableResultCode]
           [io.opentelemetry.sdk.trace.export SpanExporter]
           [java.util.concurrent TimeUnit]
           [java.util.concurrent.atomic AtomicBoolean]))

;; -------
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

(defn- uniq-color [s]
  (let [n (.hashCode s)
        i (mod n (count colors))]
    (format "\033[1;38;5;%dm%s\033[0m" (colors i) s)))

(defn colorize [color-f s]
  (if (= :prod (config/get-env))
    s
    (color-f s)))

(defn duration-ms [span]
  (let [start (.getStartEpochNanos span)
        end   (.getEndEpochNanos span)]
    (.toMillis (TimeUnit/NANOSECONDS)
               (- end start))))

(def exclude-ks #{"SampleRate"
                  "thread.name"
                  "thread.id"
                  "code.lineno"
                  "code.namespace"
                  "code.filepath"
                  "host.name"
                  "detailed_query"
                  "detailed_patterns"
                  "detailed_tx_steps"})

(defn exclude? [[k]]
  (or (exclude-ks k)
      ;; `detailed_` columns in our logs are just
      ;; too noisy. It's still nice to have in honeycomb,
      ;; but it distracts in stdout.
      (string/starts-with? k "detailed_")
      ;; `jvm.` columns are used to associate metrics to
      ;; every span. This is too noisy for stdout
      (string/starts-with? k "jvm.")
      ;; gauge metrics for a namespace
      (string/starts-with? k "instant.")))

(defn attr-str [attrs]
  (->>  attrs
        (map (fn [[k v]] [(str k) v]))
        (remove exclude?)
        (map (fn [[k v]]
               (format "%s=%s"
                       (if (= k "exception.message")
                         (colorize error-color k)
                         k)
                       v)))
        (interpose " ")
        string/join))

(defn event-str [span-event]
  (attr-str (.asMap (.getAttributes span-event))))

(defn friendly-trace [trace-id]
  (if (seq trace-id)
    (subs trace-id 0 4)
    "unk"))

(defn span-str [span]
  (let [attr-str (attr-str (.getAttributes span))
        event-strs (map event-str (.getEvents span))
        data-str (string/join
                  " "
                  (into [attr-str] event-strs))]
    (format "[%s] %sms [%s] %s"
            (colorize uniq-color (friendly-trace (.getTraceId span)))
            (duration-ms span)
            (colorize uniq-color (.getName span))
            data-str)))

(defn log-spans [spans]
  (doseq [span spans]
    (log/info (span-str span))))

(defn export [shutdown? spans]
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
