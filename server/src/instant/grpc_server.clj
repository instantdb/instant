(ns instant.grpc-server
  (:require
   [clojure.string :as str]
   [instant.config :as config]
   [instant.gauges :as gauges]
   [instant.grpc :as grpc]
   [instant.model.app-stream :as app-stream-model]
   [instant.reactive.invalidator :as invalidator]
   [instant.reactive.store :as rs]
   [instant.util.tracer :as tracer])
  (:import
   (io.grpc ConnectivityState Grpc InsecureServerCredentials InternalChannelz
            InternalChannelz$ChannelStats InternalChannelz$ServerStats
            InternalInstrumented Server ServerCallExecutorSupplier
            ServerServiceDefinition)
   (io.grpc.services AdminInterface)
   (io.grpc.stub ServerCalls ServerCalls$BidiStreamingMethod ServerCalls$ServerStreamingMethod StreamObserver)
   (java.util.concurrent TimeUnit)))

(defn instant-test-service ^ServerServiceDefinition []
  (let [test-handler (ServerCalls/asyncServerStreamingCall
                      (proxy [ServerCalls$ServerStreamingMethod] []
                        (invoke [req ^StreamObserver observer]
                          (def -req req)
                          (def -observer observer))))]
    (-> (ServerServiceDefinition/builder "InstantTesting")
        (.addMethod grpc/test-method test-handler)
        (.build))))

(defn instant-stream-service ^ServerServiceDefinition [store]
  (let [subscribe-handler (ServerCalls/asyncBidiStreamingCall
                           (proxy [ServerCalls$BidiStreamingMethod] []
                             (invoke [^StreamObserver observer]
                               (app-stream-model/handle-bidi-subscribe store observer))))]
    (-> (ServerServiceDefinition/builder "InstantStreams")
        (.addMethod grpc/subscribe-method subscribe-handler)
        (.build))))

(defn instant-invalidator-service ^ServerServiceDefinition []
  (let [subscribe-handler (ServerCalls/asyncServerStreamingCall
                           (proxy [ServerCalls$ServerStreamingMethod] []
                             (invoke [req ^StreamObserver observer]
                               (invalidator/handle-grpc-subscribe req observer))))]
    (-> (ServerServiceDefinition/builder "Invalidator")
        (.addMethod grpc/invalidator-method subscribe-handler)
        (.build))))

(def call-executor
  (reify ServerCallExecutorSupplier
    (getExecutor [_ server-call _metadata]
      (when (= (.getServiceName (.getMethodDescriptor server-call))
               "Invalidator")
        grpc/invalidator-thread-pool))))

(defn grpc-server ^Server [store port]
  (tracer/with-span! {:name "grpc-server/start"
                      :attributes {:port port}}
    (-> (Grpc/newServerBuilderForPort port (InsecureServerCredentials/create))
        (.addService (instant-stream-service store))
        (.addService (instant-test-service))
        (.addService (instant-invalidator-service))
        (.addServices (AdminInterface/getStandardServices))
        (.callExecutor call-executor)
        (.build))))

(declare global-server)

(defn start [store port]
  (let [server (grpc-server store port)]
    (.start server)
    server))

(defn stop [^Server server]
  (.shutdownNow server))

;; Gauges derived from io.grpc.InternalChannelz — the same registry that
;; powers AdminInterface/Channelz. Every ManagedChannel we build and every
;; Server we start registers with the singleton automatically, so we get
;; server-side and client-side counters without any custom instrumentation.

(def ^:private channelz-page-size 100)

(defn- instrumented-stats [^InternalInstrumented x]
  (try
    (.. x getStats (get 100 TimeUnit/MILLISECONDS))
    (catch Throwable _ nil)))

(defn- all-servers [^InternalChannelz channelz]
  (loop [acc []
         start-id 0]
    (let [page (.getServers channelz start-id channelz-page-size)
          servers (.servers page)]
      (if (or (.end page) (empty? servers))
        (into acc servers)
        (recur (into acc servers)
               (inc (InternalChannelz/id (last servers))))))))

(defn- all-root-channels [^InternalChannelz channelz]
  (loop [acc []
         start-id 0]
    (let [page (.getRootChannels channelz start-id channelz-page-size)
          channels (.channels page)]
      (if (or (.end page) (empty? channels))
        (into acc channels)
        (recur (into acc channels)
               (inc (InternalChannelz/id (last channels))))))))

(defn- server-metrics [^InternalChannelz channelz]
  (let [stats (keep instrumented-stats (all-servers channelz))
        started (reduce + 0 (map #(.callsStarted ^InternalChannelz$ServerStats %) stats))
        succeeded (reduce + 0 (map #(.callsSucceeded ^InternalChannelz$ServerStats %) stats))
        failed (reduce + 0 (map #(.callsFailed ^InternalChannelz$ServerStats %) stats))]
    [{:path "instant.grpc.server.count"
      :value (count stats)}
     {:path "instant.grpc.server.calls.started"
      :value started}
     {:path "instant.grpc.server.calls.succeeded"
      :value succeeded}
     {:path "instant.grpc.server.calls.failed"
      :value failed}
     {:path "instant.grpc.server.calls.active"
      :value (- started succeeded failed)}]))

(defn- client-metrics [^InternalChannelz channelz]
  (let [stats (keep instrumented-stats (all-root-channels channelz))
        by-state (frequencies (map #(.state ^InternalChannelz$ChannelStats %) stats))
        started (reduce + 0 (map #(.callsStarted ^InternalChannelz$ChannelStats %) stats))
        succeeded (reduce + 0 (map #(.callsSucceeded ^InternalChannelz$ChannelStats %) stats))
        failed (reduce + 0 (map #(.callsFailed ^InternalChannelz$ChannelStats %) stats))]
    (into [{:path "instant.grpc.client.channels.count"
            :value (count stats)}
           {:path "instant.grpc.client.calls.started"
            :value started}
           {:path "instant.grpc.client.calls.succeeded"
            :value succeeded}
           {:path "instant.grpc.client.calls.failed"
            :value failed}
           {:path "instant.grpc.client.calls.active"
            :value (- started succeeded failed)}]
          (for [^ConnectivityState state (ConnectivityState/values)]
            {:path (str "instant.grpc.client.channels." (str/lower-case (.name state)) ".count")
             :value (get by-state state 0)}))))

(defn channelz-metrics-fn
  "Gauge fn that reads gRPC server + client stats from InternalChannelz.
   Every ManagedChannel and Server registers with the singleton automatically."
  [_]
  (let [channelz (InternalChannelz/instance)]
    (concat (server-metrics channelz)
            (client-metrics channelz))))

(declare stop-metrics-gauge)

(defn start-global []
  (def global-server (start rs/store (config/get-grpc-server-port)))
  (def stop-metrics-gauge (gauges/add-gauge-metrics-fn #'channelz-metrics-fn)))

(defn stop-global []
  (when (bound? #'stop-metrics-gauge)
    (stop-metrics-gauge))
  (when (bound? #'global-server)
    (stop global-server)))

(defn restart []
  (stop-global)
  (start-global))
