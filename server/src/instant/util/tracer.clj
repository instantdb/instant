(ns instant.util.tracer
  "Span lib for integrating with Honeycomb"
  (:require
   [clojure.main :as main]
   [instant.util.logging-exporter :as logging-exporter]
   [instant.config :as config]
   [steffan-westcott.clj-otel.api.attributes :as attr])
  (:import
   (io.honeycomb.opentelemetry OpenTelemetryConfiguration)
   (io.opentelemetry.sdk OpenTelemetrySdk)
   (io.opentelemetry.api.trace Span StatusCode)
   (io.opentelemetry.context Context)
   (io.opentelemetry.sdk.trace SdkTracerProvider)
   (io.opentelemetry.semconv.trace.attributes SemanticAttributes)
   (io.opentelemetry.sdk.trace.export SimpleSpanProcessor))
  (:gen-class))

(def ^:dynamic *span* nil)
(def ^:dynamic *skipped* false)

;; Expects an atom with a boolean value if not nil
;; Used to mute `add-exception!` from the outside when the caller expects errors
(def ^:dynamic *silence-exceptions?* nil)

(defonce tracer (atom nil))
(defn get-tracer []
  (if-let [t @tracer]
    t
    (throw (Exception. "Call to trace before initialization."))))

(defn make-log-only-sdk
  "Creates an opentelemetry sdk that logs to the console for use in tests
  and for Open Source when no Honeycomb API key is available."
  []
  (let [trace-provider-builder (SdkTracerProvider/builder)
        sdk-builder (OpenTelemetrySdk/builder)
        log-exporter (SimpleSpanProcessor/create (logging-exporter/create))]
    (.addSpanProcessor trace-provider-builder log-exporter)
    (-> sdk-builder
        (.setTracerProvider (.build trace-provider-builder))
        (.build))))

(defn make-honeycomb-sdk [honeycomb-api-key]
  (let [builder (OpenTelemetryConfiguration/builder)
        log-processor (SimpleSpanProcessor/create (logging-exporter/create))]
    (-> builder
        (.setApiKey honeycomb-api-key)
        (.setDataset "metrics")
        (.setServiceName "instant-server")
        (.addSpanProcessor log-processor)
        (.buildAndRegisterGlobal))))

(defn init []
  (let [sdk (if-let [honeycomb-api-key (config/get-honeycomb-api-key)]
              (make-honeycomb-sdk honeycomb-api-key)
              (make-log-only-sdk))]
    (reset! tracer (.getTracer sdk "instant-server"))))

;; Stores metrics calculated by instant.gauges
;; These metrics are attached to every span.
;; Note: adding columns to spans are free in Honeycomb.
;;       Having metrics on each span is a good way to observe changes.
(defonce last-calculated-metrics (atom {}))

(defn new-span!
  [{span-name :name :keys [attributes source sample-rate] :as params}]
  (when-not span-name
    (throw (Exception. (format "Expected a map with :name key, got %s." params))))
  (let [thread (Thread/currentThread)
        {:keys [code-ns code-line code-file]} source
        default-attributes (cond-> @last-calculated-metrics
                             sample-rate (assoc "sample_rate" sample-rate)
                             true (assoc "host.name" (config/get-hostname))
                             thread (assoc SemanticAttributes/THREAD_NAME
                                           (.getName thread)
                                           SemanticAttributes/THREAD_ID
                                           (.getId thread))
                             code-ns     (assoc SemanticAttributes/CODE_NAMESPACE code-ns)
                             code-line   (assoc SemanticAttributes/CODE_LINENO code-line)
                             code-file   (assoc SemanticAttributes/CODE_FILEPATH code-file))
        attributes'  (merge default-attributes attributes)]
    (-> (get-tracer)
        (.spanBuilder (name span-name))
        (cond->
         *span* (.setParent (-> (Context/current)
                                (.with *span*)))
         :always (.setAllAttributes (attr/->attributes attributes'))
         (not *span*) .setNoParent)
        .startSpan)))

(def ^:private keyword->StatusCode
  {:unset StatusCode/UNSET
   :ok    StatusCode/OK
   :error StatusCode/ERROR})

(defn- add-exception-data!
  [^Span span
   {:keys [exception escaping? attributes]
    :or   {attributes {}}}]
  (let [attrs (cond-> attributes
                escaping? (assoc SemanticAttributes/EXCEPTION_ESCAPED (boolean escaping?)))]
    (.recordException span exception (attr/->attributes attrs))))

(defn add-data!
  ([opts]
   (when *span*
     (add-data! *span* opts)))
  ([^Span span {:keys [attributes status exception-data]}]
   (cond-> span
     status
     (.setStatus (keyword->StatusCode (:code status)) (:description status))

     attributes
     (.setAllAttributes (attr/->attributes attributes))

     exception-data
     (add-exception-data! exception-data))))

(defn add-exception!
  ([exception opts]
   (when *span*
     (add-exception! *span* exception opts)))
  ([^Span span exception {:keys [escaping?]}]
   (let [triage      (main/ex-triage (Throwable->map exception))
         attrs       (into triage (ex-data exception))
         status      {:code        :error
                      :description (main/ex-str triage)}]
     (if (and *silence-exceptions?*
              @*silence-exceptions?*)
       (add-data! span {:attributes
                        {:silenced-exception (main/ex-str triage)}})
       (add-data! span {:status status
                        :exception-data {:exception  exception
                                         :escaping?  escaping?
                                         :attributes attrs}})))))

(defn end-span!
  [^Span span]
  (.end span))

(defmacro with-exceptions-silencer
  "Binds `silencer-param` to a function that accepts true or false. If last
   called with `true`, any calls to `add-exception!` in the current thread
   will be ignored."
  [[silencer-param] & body]
  `(let [silencer# (atom false)
         ~silencer-param (fn [value#]
                           (reset! silencer# value#))]
     (binding [*silence-exceptions?* silencer#]
       ~@body)))

(defmacro with-span!*
  [span-opts & body]
  `(let [source# {:code-line ~(:line (meta &form))
                  :code-file ~*file*
                  :code-ns   ~(str *ns*)}
         sample-rate# (:sample-rate ~span-opts 1.0)
         span-opts# (assoc ~span-opts :source source#)]
     (binding [*span* (new-span! span-opts#)]
       (try
         (do ~@body)
         (catch Throwable t#
           (add-exception! *span* t# {:escaping? true})
           (throw t#))
         (finally
           (end-span! *span*))))))

;; (XXX)
;; Given a `sample-rate`, we will randomly skip spans at that rate 
;; All children of a skipped span will also be skipped.
;; 
;; There are more 'idiomatic' ways to do this:
;; 1. We could use honeycomb's 'refinery'
;;     This is a service that takes a full trace, 
;;     and lets us make a decision about whether to keep it or not. 
;;     For example, if a trace has an error, we 100% keep it 
;;   
;;     The con: This requires us to create a cluster of 'refinery' services.
;;             That's ops overhead
;; 2. Another option is to use a `Sampler` when we set up the SDK. 
;;     
;;     The con: our SDK is a bit out of date, and we didn't want to write more code for this version
;; 
;; Going with some manual clojure macros for now.
(defmacro with-span!
  [span-opts & body]
  `(cond
     *skipped* (do ~@body)
     (> (rand) (:sample-rate ~span-opts 1.0))
     (binding [*skipped* true]
       ~@body)
     :else
     (with-span!* ~span-opts ~@body)))

(comment
  ;; this will always print new-span!
  (with-redefs [new-span! (fn [& args] (println "new-span!" args))
                end-span! (fn [& _] _)]
    (with-span! {:name "foo"}
      (+ 1 1)))
  ;; this will never print new-span!
  (with-redefs [new-span! (fn [& args] (println "new-span!" args))
                end-span! (fn [& _] _)]
    (with-span! {:name "foo" :sample-rate 0}
      (+ 1 1)))
  ;; this will sometimes print new-span!
  (with-redefs [new-span! (fn [& args] (println "new-span!" args))
                end-span! (fn [& _] _)]
    (with-span! {:name "foo" :sample-rate 0.5}
      (+ 1 1)))

  ;; this will never print, since the parent span is skipped 
  (with-redefs [new-span! (fn [& args] (println "new-span!" args))
                end-span! (fn [& _] _)]
    (with-span! {:name "foo" :sample-rate 0}
      (with-span! {:name "foo" :sample-rate 1}
        (+ 1 1)))))

(defn record-info!
  "Analogous to log/info.
  
  Sometimes you want to just log some information, but there is no parent span. 
  
  For example, if you have a long-running process, it wouldn't make sense to have a 
  parent span that encompasses the entire process. 
 
  This function creates a one-off span for you, which you can use to send information 
  to Honeycomb."
  [opts]
  (with-span! opts))

(defn record-exception-span! [exception {:keys [name
                                                escaping?
                                                attributes]}]

  (with-span! {:name name
               :attributes attributes}
    (add-exception! exception {:escaping? escaping?})))

(def team-name "instantdb")

(defn get-env-name []
  (if  (= :prod (config/get-env))
    "prod"
    "test"))

(def dataset-name "instant-server")

(defn span-uri
  ([]
   (when *span*
     (span-uri *span*)))
  ([span]
   (let [ctx (.getSpanContext span)
         trace-id (.getTraceId ctx)
         span-id (.getSpanId ctx)]
     (format
      "https://ui.honeycomb.io/%s/environments/%s/datasets/%s/trace?trace_id=%s&span=%s"
      team-name
      (get-env-name)
      dataset-name
      trace-id
      span-id))))
