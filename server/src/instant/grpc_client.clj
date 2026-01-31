(ns instant.grpc-client
  (:require
   [instant.config :as config]
   [instant.grpc :as grpc]
   [instant.reactive.ephemeral :as eph]
   [instant.util.tracer :as tracer])
  (:import
   (com.google.common.collect MapMaker)
   (com.hazelcast.cluster Member)
   (io.grpc CallOptions ConnectivityState Grpc InsecureChannelCredentials ManagedChannel)
   (io.grpc.stub ClientCalls StreamObserver)
   (java.util Map)))

;; WeakMap to store hazelcast-member -> grpc client
;; Autoevicts when the member is GC'd
(defonce grpc-client-map (-> (MapMaker.)
                             (.weakKeys)
                             (.makeMap)))

(defn grpc-client [host port]
  (-> (Grpc/newChannelBuilderForAddress host port (InsecureChannelCredentials/create))
      (.build)))

(defn grpc-client-for-hazelcast-member [^Member member]
  (let [address (.getAddress member)
        hz-port (.getPort address)
        grpc-port (+ hz-port config/grpc-port-offset)
        ip (.getHostAddress (.getInetAddress address))]
    (grpc-client ip grpc-port)))

(defn remove-client-on-shutdown
  ([^ManagedChannel client member machine-id]
   (remove-client-on-shutdown client member machine-id (System/currentTimeMillis)))
  ([^ManagedChannel client member machine-id last-update]
   (let [state (.getState client false)]
     (if (= state ConnectivityState/SHUTDOWN)
       (tracer/with-span! {:name "grpc/remove-member"
                           :attributes {:state state
                                        :machine-id machine-id
                                        :member (str member)}}
         (Map/.remove grpc-client-map member))
       (.notifyWhenStateChanged
         client
         state
         (reify Runnable
           (run [_]
             (let [now (System/currentTimeMillis)]
               (tracer/with-new-trace-root
                 (tracer/record-info! {:name "grpc/client-state-change"
                                       :attributes {:state-before state
                                                    :state-after (.getState client false)
                                                    :machine-id machine-id
                                                    :member (str member)
                                                    :ms-since-update (- now last-update)}}))
               ;; XXX: stack overflow??
               (remove-client-on-shutdown client member machine-id now)))))))))

(defn grpc-client-for-machine-id [machine-id]
  (when-let [member (get eph/hz-member-by-machine-id-cache machine-id)]
    (let [client (Map/.computeIfAbsent grpc-client-map
                                       member
                                       (fn [_]
                                         (tracer/with-span! {:name "grpc/create-client"
                                                             :attributes {:machine-id machine-id
                                                                          :member (str member)}}
                                           (let [client (grpc-client-for-hazelcast-member member)]
                                             (remove-client-on-shutdown client member machine-id)
                                             client))))]

      client)))

;; XXX: should probably use a ClientCallStreamObserver or ServerCallStreamObserver
(defn subscribe-to-instant-stream [^ManagedChannel channel app-id stream-id ^StreamObserver observer]
  (let [req (grpc/->StreamRequest app-id stream-id)
        call (.newCall channel grpc/subscribe-method CallOptions/DEFAULT)]
    (ClientCalls/asyncServerStreamingCall call req observer)
    {:cancel (fn [^String reason]
               (.cancel call reason (Exception. reason)))}))
