(ns instant.lib.ring.sse
  (:refer-clojure :exclude [send])
  (:require
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
      (let [close-task (reify ChannelListener
                         (handleEvent [_this channel]
                           (on-close channel)))]
        (.addCloseTask conn close-task)
        (.setKeepAliveTime conn 5000)
        (on-open {:exchange conn
                  :channel conn})))))

(defn sse-request [^HttpServerExchange exchange ^IPersistentMap headers ^ServerSentEventConnectionCallback callback]
  (let [handler (-> (ServerSentEventHandler. callback))]
    (when headers
      (set-headers (.getResponseHeaders exchange) headers))
    (.put (.getResponseHeaders exchange) Headers/CACHE_CONTROL "nocache")
    (.handleRequest handler exchange)))

;; XXX
(defn send-json!
  "Serializes `obj` to json, and sends over a websocket."
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
                 (onError [_conn _data _event _id e]
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
