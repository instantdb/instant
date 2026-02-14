(ns instant.grpc-server
  (:require
   [instant.config :as config]
   [instant.grpc :as grpc]
   [instant.model.app-stream :as app-stream-model]
   [instant.reactive.store :as rs]
   [instant.util.tracer :as tracer])
  (:import
   (io.grpc Grpc InsecureServerCredentials Server ServerServiceDefinition)
   (io.grpc.services AdminInterface)
   (io.grpc.stub ServerCalls ServerCalls$BidiStreamingMethod ServerCalls$ServerStreamingMethod StreamObserver)))

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

(defn grpc-server ^Server [store port]
  (tracer/with-span! {:name "grpc-server/start"
                      :attributes {:port port}}
    (-> (Grpc/newServerBuilderForPort port (InsecureServerCredentials/create))
        (.addService (instant-stream-service store))
        (.addService (instant-test-service))
        (.addServices (AdminInterface/getStandardServices))
        (.build))))

(declare global-server)

(defn start [store port]
  (let [server (grpc-server store port)]
    (.start server)
    server))

(defn stop [^Server server]
  (.shutdownNow server))

(defn start-global []
  (def global-server (start rs/store (config/get-grpc-server-port))))

(defn stop-global []
  (when (bound? #'global-server)
    (stop global-server)))

(defn restart []
  (stop-global)
  (start-global))
