(ns instant.grpc-server
  (:require
   [instant.config :as config]
   [instant.grpc :as grpc]
   [instant.model.app-stream :as app-stream-model]
   [instant.reactive.store :as rs])
  (:import
   (io.grpc Grpc InsecureServerCredentials Server ServerServiceDefinition)
   (io.grpc.stub ServerCalls ServerCalls$ServerStreamingMethod ServerCalls$BidiStreamingMethod StreamObserver)))

(defn instant-stream-service ^ServerServiceDefinition [store]
  (let [subscribe-handler (ServerCalls/asyncBidiStreamingCall
                           (proxy [ServerCalls$BidiStreamingMethod] []
                             (invoke [^StreamObserver observer]
                               (app-stream-model/handle-bidi-subscribe store observer))))
        test-handler (ServerCalls/asyncServerStreamingCall
                      (proxy [ServerCalls$ServerStreamingMethod] []
                        (invoke [req ^StreamObserver observer]
                          (def -req req)
                          (def -observer observer))))]
    (-> (ServerServiceDefinition/builder "InstantStreams")
        (.addMethod grpc/subscribe-method subscribe-handler)
        (.addMethod grpc/test-method test-handler)
        (.build))))

(defn grpc-server ^Server [store port]
  (-> (Grpc/newServerBuilderForPort port (InsecureServerCredentials/create))
      (.addService (instant-stream-service store))
      (.build)))

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
