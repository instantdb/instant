(ns instant.util.e2e-tracer
  (:require [instant.util.tracer :as tracer]
            [instant.flags :as flags])
  (:import
   (io.opentelemetry.api.trace SpanContext)
   (io.opentelemetry.sdk.trace SdkSpan)
   (java.lang.reflect Field)
   (java.nio ByteBuffer)
   (java.time Duration Instant)
   (org.apache.commons.codec.binary Hex)))

;; Starts the trace-id with a1 so that it's easy to spot
(def tx-id-magic-prefix ^byte (byte -95))

(defn tx-id->trace-id
  "Creates a stable trace id for a given tx-id so that we can attach
   a series of spans executing on different machines to the same parent."
  [^Long tx-id]
  (-> (ByteBuffer/allocate 16) ;; 16 bytes for the traceid
      (.put ^byte tx-id-magic-prefix)
      (.putLong tx-id)
      (.array)
      (Hex/encodeHexString)))

(defn tx-id->span-id
  "Creates a stable span id for a given tx-id so that we can attach
   a series of spans executing on different machines to the same parent."
  [^Long tx-id]
  (-> (ByteBuffer/allocate 8) ;; 16 bytes for the spanId
      (.putLong tx-id)
      (.array)
      (Hex/encodeHexString)))

(defn get-field
  "Gets a private field from a class instance using reflection."
  [^Class cls ^String field-name]
  (doto (.getDeclaredField cls field-name)
    (.setAccessible true)))

(def context-field ^Field (get-field SdkSpan "context"))

(defn make-invalidator-tracking-span [^Long tx-id attrs]
  (let [span (binding [tracer/*span* nil] ;; make sure this is a top-level span
               (tracer/new-span! {:name "e2e/invalidator/tracking-span"
                                  :attributes (merge {:tx-id tx-id}
                                                     attrs)}))
        context (.getSpanContext ^SdkSpan span)
        modified-context (SpanContext/create (tx-id->trace-id tx-id)
                                             (tx-id->span-id tx-id)
                                             (.getTraceFlags context)
                                             (.getTraceState context))]
    (.set ^Field context-field span modified-context)
    span))

(defn start-invalidator-tracking! [{:keys [^Long tx-id app-id]}]
  (when (flags/e2e-should-honeycomb-publish? tx-id)
    (let [span (make-invalidator-tracking-span tx-id {:app-id app-id
                                                      ;; encourage honeycomb not
                                                      ;; to skip this span
                                                      :entropy tx-id})]
      (tracer/end-span! span))))

(defn tx-latency-ms [^Instant tx-created-at]
  (when tx-created-at
    (.toMillis (Duration/between tx-created-at (Instant/now)))))

(defn invalidator-tracking-step! [{:keys [^Long tx-id tx-created-at] :as span-opts}]
  ;; Create a new span with a stable trace-id and span-id for the parent
  (when (flags/e2e-should-honeycomb-publish? tx-id)
    (binding [tracer/*span* (make-invalidator-tracking-span tx-id nil)]
      (tracer/record-info!
       (-> span-opts
           (update :name (fn [s] (format "e2e/invalidator/%s" s)))
           (update :attributes (fn [a]
                                 (merge a
                                        {:tx-id tx-id
                                         ;; encourage honeycomb not
                                         ;; to skip this span
                                         :entropy tx-id}
                                        (when-let [latency-ms (tx-latency-ms tx-created-at)]
                                          {:tx-latency-ms latency-ms})))))))))
