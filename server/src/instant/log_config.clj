(ns instant.log-config
  "Programmatically configures logback's root STDOUT appender. The encoder
   choice is driven by `config/use-logfmt?`:

     use-logfmt? → logfmt encoder (machine-parseable; Vector ingests via
                   parse_logfmt!)
     otherwise   → PatternLayoutEncoder with `%msg%n`, matching the original
                   resources/logback.xml so dev output is unchanged.

   Call `(init)` once at process start, before any clojure.tools.logging
   call. The XML config still loads first (logback initializes on its own);
   we replace the encoder right after."
  (:require
   [instant.config :as config]
   [instant.util.logfmt :as logfmt])
  (:import
   (ch.qos.logback.classic Level Logger LoggerContext)
   (ch.qos.logback.classic.encoder PatternLayoutEncoder)
   (ch.qos.logback.classic.jul LevelChangePropagator)
   (ch.qos.logback.classic.spi ILoggingEvent IThrowableProxy StackTraceElementProxy)
   (ch.qos.logback.core ConsoleAppender)
   (ch.qos.logback.core.encoder Encoder EncoderBase)
   (java.nio.charset StandardCharsets)
   (java.time Instant)
   (org.slf4j LoggerFactory)
   (org.slf4j.bridge SLF4JBridgeHandler)))

(set! *warn-on-reflection* true)

;; ------
;; logfmt encoder

(defn append-throwable!
  "Format `t` (and its cause chain) into `sb` Java-style:
   `class: message\\n\\tat frame\\n\\tat frame\\nCaused by: ...`
   `depth` caps the cause chain to guard against pathological self-references."
  [^StringBuilder sb ^IThrowableProxy t ^long depth]
  (when (< depth 10)
    (.append sb (.getClassName t))
    (when-let [msg (.getMessage t)]
      (.append sb ": ")
      (.append sb msg))
    (let [frames (.getStackTraceElementProxyArray t)
          n (alength frames)]
      (dotimes [i n]
        (.append sb "\n\t")
        (.append sb (.getSTEAsString ^StackTraceElementProxy (aget frames i)))))
    (when-let [cause (.getCause t)]
      (.append sb "\nCaused by: ")
      (append-throwable! sb cause (inc depth)))))

(defn ^bytes event->logfmt-bytes [^ILoggingEvent event]
  (let [sb (StringBuilder. 256)]
    (.append sb "level=")
    (.append sb (.toString ^Level (.getLevel event)))
    (.append sb " message=")
    (logfmt/append-logfmt-string sb (.getFormattedMessage event))
    (.append sb " logger=")
    (.append sb (.getLoggerName event))
    (when-let [^IThrowableProxy t (.getThrowableProxy event)]
      ;; Same field set the span exporter emits (it rewrites OTel's
      ;; `exception.*` keys to underscored form via `append-logfmt-key`),
      ;; so Vector / Athena see one schema regardless of source.
      (.append sb " exception_type=")
      (.append sb (.getClassName t))
      (when-let [^String msg (.getMessage t)]
        (.append sb " exception_message=")
        (logfmt/append-logfmt-string sb msg))
      (.append sb " exception_stacktrace=")
      (let [trace-sb (StringBuilder. 1024)]
        (append-throwable! trace-sb t 0)
        (logfmt/append-logfmt-string sb (.toString trace-sb))))
    (.append sb " thread=")
    (logfmt/append-logfmt-string sb (.getThreadName event))
    (.append sb " timestamp=")
    (.append sb (.toString (Instant/ofEpochMilli (.getTimeStamp event))))

    (.append sb \newline)
    (.getBytes (.toString sb) StandardCharsets/UTF_8)))

(defn logfmt-encoder
  "A logback Encoder that emits one logfmt line per event. Stack traces are
   summarized as `exception=<class> exception_message=<msg>` (no frames —
   they'd break line-oriented parsing)."
  ^EncoderBase []
  (proxy [EncoderBase] []
    (encode [^ILoggingEvent event]
      (event->logfmt-bytes event))
    (headerBytes [] (byte-array 0))
    (footerBytes [] (byte-array 0))))

(defn dev-encoder ^PatternLayoutEncoder [^LoggerContext ctx]
  (doto (PatternLayoutEncoder.)
    (.setContext ctx)
    (.setPattern "%msg%n")))

;; ------

(defn install-jul-bridge!
  "Route java.util.logging through slf4j → logback. Caffeine (and a handful
   of older Java libs) log via JUL with no slf4j hook. The LevelChangePropagator
   pushes logback's effective level back to JUL so filtered messages are
   discarded at the source rather than crossing the bridge for nothing."
  [^LoggerContext ctx]
  (let [propagator (doto (LevelChangePropagator.)
                     (.setContext ctx)
                     (.setResetJUL true))]
    (.addListener ctx propagator)
    (.start propagator))
  (SLF4JBridgeHandler/removeHandlersForRootLogger)
  (SLF4JBridgeHandler/install))

(defn init
  "Swap the root STDOUT appender's encoder based on environment, route JUL
   through slf4j, and silence noisy library loggers (Hazelcast's startup
   banner). Call once at process start, before any clojure.tools.logging
   call."
  []
  (let [ctx ^LoggerContext (LoggerFactory/getILoggerFactory)
        root ^Logger (.getLogger ctx Logger/ROOT_LOGGER_NAME)
        appender ^ConsoleAppender (.getAppender root "STDOUT")
        ^Encoder encoder (if config/use-logfmt?
                           (doto (logfmt-encoder)
                             (.setContext ctx))
                           (dev-encoder ctx))]
    (.start encoder)
    (when-let [^Encoder old (.getEncoder appender)]
      (.stop old))
    (.setEncoder appender encoder)
    (install-jul-bridge! ctx)
    ;; Hazelcast prints an ASCII-art banner at startup through this logger.
    (.setLevel ^Logger (.getLogger ctx "com.hazelcast.system.logo")
               Level/OFF)))
