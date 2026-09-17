(ns instant.util.tracer-test
  (:require
   [clojure.test :refer [deftest is]]
   [instant.util.tracer :as tracer])
  (:import
   (io.opentelemetry.api.trace Span Tracer)
   (io.opentelemetry.sdk.common CompletableResultCode)
   (io.opentelemetry.sdk.trace SdkTracerProvider)
   (io.opentelemetry.sdk.trace.data SpanData)
   (io.opentelemetry.sdk.trace.export SimpleSpanProcessor SpanExporter)))

(defn capturing-exporter ^SpanExporter [exported]
  (reify SpanExporter
    (export [_this spans]
      (swap! exported into (map (fn [^SpanData span] (.getName span)) spans))
      (CompletableResultCode/ofSuccess))
    (flush [_this]
      (CompletableResultCode/ofSuccess))
    (shutdown [_this]
      (CompletableResultCode/ofSuccess))))

(defn start-span ^Span [^Tracer otel-tracer ^String span-name]
  (.startSpan (.spanBuilder otel-tracer span-name)))

(deftest error-only-exporter-only-exports-error-spans
  (let [exported (atom [])
        provider (-> (SdkTracerProvider/builder)
                     (.addSpanProcessor (SimpleSpanProcessor/create
                                         (tracer/make-error-only-exporter
                                          (capturing-exporter exported))))
                     (.build))
        otel-tracer (.get provider "test")]
    (try
      (.end (start-span otel-tracer "ok"))

      (let [span (start-span otel-tracer "error")]
        (tracer/add-exception! span (Exception. "oops") {:escaping? false})
        (.end span))

      (let [span (start-span otel-tracer "silenced")]
        (tracer/with-exceptions-silencer [silence!]
          (silence! true)
          (tracer/add-exception! span (Exception. "oops") {:escaping? false}))
        (.end span))

      (is (= ["error"] @exported))
      (finally
        (.close provider)))))
