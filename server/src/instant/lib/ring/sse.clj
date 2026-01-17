(ns instant.lib.ring.sse
  (:refer-clojure :exclude [send])
  (:require
   [instant.lib.ring.websocket :refer [ping-pool]]
   [instant.util.delay :as delay]
   [instant.util.e2e-tracer :as e2e-tracer]
   [instant.util.json :refer [->json]]
   [instant.util.tracer :as tracer]
   [ring.adapter.undertow.headers :refer [set-headers]])
  (:import
   (clojure.lang IPersistentMap)
   (io.undertow.server HttpServerExchange)
   (io.undertow.server.handlers.sse ServerSentEventConnection ServerSentEventConnection$EventCallback ServerSentEventConnectionCallback ServerSentEventHandler)
   (io.undertow.util Headers)
   (org.xnio ChannelListener)))

(defn sse-callback [{:keys [on-open on-close]}]
  (reify ServerSentEventConnectionCallback
    (^void connected [_ ^ServerSentEventConnection conn ^String _last-event-id]
      (let [keep-alive-ms (* 1000 15)
            _ (.setKeepAliveTime conn keep-alive-ms)
            ;; undertow will send a message every keep-alive-ms and notice when
            ;; the connection is closed, but it won't always run the close task.
            ;; We use this ping job to run `on-close` ourselves eventually.
            ping-job (delay/repeat-fn ping-pool
                                      keep-alive-ms
                                      (fn []
                                        (when-not (.isOpen conn)
                                          (on-close conn)
                                          ;; Throw an exception to stop the job
                                          (throw (ex-info "stop ping" {})))))
            close-task (reify ChannelListener
                         (handleEvent [_this channel]
                           (when-not (.isDone ping-job)
                             (.cancel ping-job false))
                           (on-close channel)))]
        (.addCloseTask conn close-task)
        (on-open {:exchange conn
                  :channel conn})))))

(defn sse-request [^HttpServerExchange exchange ^IPersistentMap headers ^ServerSentEventConnectionCallback callback]
  (let [handler (-> (ServerSentEventHandler. callback))]
    (when headers
      (set-headers (.getResponseHeaders exchange) headers))
    (.put (.getResponseHeaders exchange) Headers/CACHE_CONTROL "nocache")
    (.handleRequest handler exchange)))

(defn send-json!
  "Serializes `obj` to json, and sends over the SSE connection."
  [app-id obj {:keys [stub ^ServerSentEventConnection conn]}]
  (if stub
    (stub obj)
    (let [obj-json (->json obj)
          p (promise)]
      (tracer/with-span! {:name "sse/send-json!"
                          :attributes {:app-id app-id
                                       :size (count obj-json)}}
        (.send conn
               ^String obj-json
               (proxy [ServerSentEventConnection$EventCallback] []
                 (done [_conn _data _event _id]
                   (deliver p nil))
                 (failed [_conn _data _event _id e]
                   (deliver p e))))
        (let [ret @p]
          (when-let [tx-id (-> obj meta :tx-id)]
            (let [tx-created-at (-> obj meta :tx-created-at)]
              (when-let [latency-ms (e2e-tracer/tx-latency-ms tx-created-at)]
                (tracer/add-data! {:attributes {:tx-latency-ms latency-ms}}))
              (e2e-tracer/invalidator-tracking-step!
                {:tx-id tx-id
                 :tx-created-at tx-created-at
                 :name "sse/send-json-delivered"
                 :attributes {:session-id (-> obj meta :session-id)}})))
          (when (instance? Throwable ret)
            (throw ret)))))))

(defn set-retry-interval!
  "Instructs the client how long to wait to retry after a connection error."
  [app-id ^Long interval-ms {:keys [stub ^ServerSentEventConnection conn]}]
  (if stub
    nil
    (tracer/with-span! {:name "sse/set-retry!"
                        :attributes {:app-id app-id
                                     :interval-ms interval-ms}}
      (.sendRetry conn
                  interval-ms))))
