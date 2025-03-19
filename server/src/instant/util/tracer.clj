(ns instant.util.tracer
  "Span lib for integrating with Honeycomb"
  (:gen-class)
  (:require
   [clojure.main :as main]
   [instant.config :as config]
   [instant.util.logging-exporter :as logging-exporter]
   [steffan-westcott.clj-otel.api.attributes :as attr])
  (:import
   (io.opentelemetry.api.common AttributeKey Attributes)
   (io.opentelemetry.api.trace Span StatusCode)
   (io.opentelemetry.context Context)
   (io.opentelemetry.exporter.otlp.trace OtlpGrpcSpanExporter)
   (io.opentelemetry.sdk OpenTelemetrySdk)
   (io.opentelemetry.sdk.resources Resource)
   (io.opentelemetry.sdk.trace SdkTracer SdkTracerProvider)
   (io.opentelemetry.sdk.trace.export BatchSpanProcessor SimpleSpanProcessor)
   (java.util.concurrent TimeUnit)))

(def ^:dynamic *span* nil)

;; Expects an atom with a boolean value if not nil
;; Used to mute `add-exception!` from the outside when the caller expects errors
(def ^:dynamic *silence-exceptions?* nil)

(defonce tracer (atom nil))
(defn get-tracer ^SdkTracer []
  (if-let [t @tracer]
    t
    (throw (Exception. "Call to trace before initialization."))))

(defn make-log-only-sdk
  "Creates an opentelemetry sdk that logs to the console for use in tests
  and for Open Source when no Honeycomb API key is available."
  ^OpenTelemetrySdk
  []
  (let [trace-provider-builder (SdkTracerProvider/builder)
        sdk-builder (OpenTelemetrySdk/builder)
        log-exporter (SimpleSpanProcessor/create (logging-exporter/create))]
    (.addSpanProcessor trace-provider-builder log-exporter)
    (-> sdk-builder
        (.setTracerProvider (.build trace-provider-builder))
        (.build))))

(defn make-honeycomb-sdk
  ^OpenTelemetrySdk
  [honeycomb-api-key]
  (let [trace-provider-builder (SdkTracerProvider/builder)
        sdk-builder (OpenTelemetrySdk/builder)
        log-processor (if (= :prod (config/get-env))
                        (let [builder (BatchSpanProcessor/builder (logging-exporter/create))]
                          (.setScheduleDelay builder 500 TimeUnit/MILLISECONDS)
                          (.build builder))
                        (SimpleSpanProcessor/create (logging-exporter/create)))
        otlp-builder (OtlpGrpcSpanExporter/builder)
        resource (.merge (Resource/getDefault)
                         (Resource/create (Attributes/of (AttributeKey/stringKey "service.name")
                                                         "instant-server")))]

    (.setResource trace-provider-builder resource)
    (.setCompression otlp-builder "gzip")

    (.setEndpoint otlp-builder (config/get-honeycomb-endpoint))
    (.addHeader otlp-builder "x-honeycomb-team" honeycomb-api-key)

    (.addSpanProcessor trace-provider-builder
                       (.build (BatchSpanProcessor/builder (.build otlp-builder))))

    (.addSpanProcessor trace-provider-builder log-processor)

    (-> sdk-builder
        (.setTracerProvider (.build trace-provider-builder))
        (.build))))

(defn init []
  (let [sdk (if-let [honeycomb-api-key (config/get-honeycomb-api-key)]
              (make-honeycomb-sdk honeycomb-api-key)
              (make-log-only-sdk))]
    (reset! tracer (.getTracer sdk "instant-server"))))

(defn new-span!
  [{span-name :name :keys [attributes source] :as params}]
  (when-not span-name
    (throw (Exception. (format "Expected a map with :name key, got %s." params))))
  (let [thread (Thread/currentThread)
        {:keys [code-ns code-line code-file]} source
        default-attributes (cond-> {"host.name" @config/hostname
                                    "process-id" @config/process-id
                                    "instance-id" @config/instance-id
                                    "fewer-vfutures" config/fewer-vfutures?}
                             thread (assoc "thread.name"
                                           (.getName thread)
                                           "thread.id"
                                           (.getId thread))
                             code-ns     (assoc "code.namespace" code-ns)
                             code-line   (assoc "code.lineno" code-line)
                             code-file   (assoc "code.filepath" code-file))
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
                escaping? (assoc "exception.escaped" (boolean escaping?)))]
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

(defmacro with-span!
  [span-opts & body]
  `(let [source# {:code-line ~(:line (meta &form))
                  :code-file ~*file*
                  :code-ns   ~(str *ns*)}
         span-opts# (assoc ~span-opts :source source#)]
     (binding [*span* (new-span! span-opts#)]
       (try
         (do ~@body)
         (catch Throwable t#
           (add-exception! *span* t# {:escaping? true})
           (throw t#))
         (finally
           (end-span! *span*))))))

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
  (when-not logging-exporter/log-spans?
    (println exception))
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
  ([^Span span]
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

(defn current-span-ids []
  (when-let [^Span span *span*]
    {:span-id (-> span
                  (.getSpanContext)
                  (.getSpanId))
     :trace-id (-> span
                   (.getSpanContext)
                   (.getTraceId))}))
