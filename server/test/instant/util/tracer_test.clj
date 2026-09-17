(ns instant.util.tracer-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [instant.flags :as flags]
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

(defn exported-span-names
  "Records an ok span, an error span and a span with a silenced exception,
   and returns the names of the spans that reached the wrapped exporter."
  []
  (let [exported (atom [])
        provider (-> (SdkTracerProvider/builder)
                     (.addSpanProcessor (SimpleSpanProcessor/create
                                         (tracer/make-honeycomb-exporter
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

      @exported
      (finally
        (.close provider)))))

(deftest honeycomb-exporter-respects-error-spans-only-toggle
  (testing "exports every span by default"
    (binding [flags/*toggle-overrides* {:honeycomb-error-spans-only? false}]
      (is (= ["ok" "error" "silenced"] (exported-span-names)))))

  (testing "only exports error spans when the toggle is on"
    (binding [flags/*toggle-overrides* {:honeycomb-error-spans-only? true}]
      (is (= ["error"] (exported-span-names))))))
