(ns instant.lib.ring.websocket
  "This is a modified version of luminus/ring-undertow-adapter.

   Main changes: 
    1. Add per-message-deflate support 
    2. Include the `exchange` object in the `on-open` callback 
    3. Supports the `on-close` callback.
    3. Supports a thread-safe `send-json!`
    4. Removed the `send` functions that would swallow errors."
  (:refer-clojure :exclude [send])
  (:require [ring.adapter.undertow.headers :refer [set-headers]]
            [instant.util.json :refer [->json]]
            [instant.util.tracer :as tracer]
            [instant.util.delay :as delay])
  (:import
   [io.undertow.server HttpServerExchange]
   [io.undertow.websockets
    WebSocketConnectionCallback
    WebSocketProtocolHandshakeHandler]
   [io.undertow.websockets.core
    AbstractReceiveListener
    BufferedBinaryMessage
    BufferedTextMessage
    CloseMessage
    StreamSourceFrameChannel WebSocketChannel
    WebSockets
    WebSocketCallback]
   [io.undertow.websockets.spi WebSocketHttpExchange]
   [org.xnio ChannelListener]
   [ring.adapter.undertow Util]
   [clojure.lang IPersistentMap]
   [io.undertow.websockets.extensions PerMessageDeflateHandshake]
   [java.util.concurrent.locks ReentrantLock]
   [java.util.concurrent.atomic AtomicLong]
   [java.io IOException]
   [java.nio ByteBuffer]
   [java.nio.channels ClosedChannelException]
   [org.xnio IoUtils]))

(defn ws-listener
  "Creates an `AbstractReceiveListener`. This relays calls to 
   `on-message`, `on-close-message`, and `on-error` callbacks. 
   
   See `ws-callback` for more details."
  [{:keys [on-message on-close-message on-error channel-wrapper atomic-last-received-at]}]
  (let [on-message       (or on-message (constantly nil))
        on-error         (or on-error (constantly nil))
        on-close-message (or on-close-message (constantly nil))]
    (proxy [AbstractReceiveListener] []
      (onFullTextMessage [^WebSocketChannel channel ^BufferedTextMessage message]

        (.set atomic-last-received-at (System/currentTimeMillis))
        (on-message {:channel (channel-wrapper channel)
                     :data    (.getData message)}))
      (onFullBinaryMessage [^WebSocketChannel channel ^BufferedBinaryMessage message]
        (.set atomic-last-received-at (System/currentTimeMillis))
        (let [pooled (.getData message)]
          (try
            (let [payload (.getResource pooled)]
              (on-message {:channel (channel-wrapper channel)
                           :data    (Util/toArray payload)}))
            (finally (.free pooled)))))
      (onPong [^WebSocketChannel channel ^StreamSourceFrameChannel channel]
        (.set atomic-last-received-at (System/currentTimeMillis)))
      (onCloseMessage [^CloseMessage message ^WebSocketChannel channel]
        (on-close-message {:channel (channel-wrapper  channel)
                           :message message}))
      (onError [^WebSocketChannel channel ^Throwable error]
        (on-error {:channel (channel-wrapper channel)
                   :error   error})))))

(defonce ping-pool (delay/make-pool!))

(defn try-send-ping-blocking
  "Tries to send a ping-message. Ignores closed channel exceptions."
  [channel]
  (try
    (WebSockets/sendPingBlocking
     (ByteBuffer/allocate 0)
     channel)
    (catch ClosedChannelException _)
    (catch IOException e
      (when-not (= (.getMessage e) "UT002002: Channel is closed")
        (throw e)))))

(defn straight-jacket-run-ping-job [^WebSocketChannel channel
                                    ^AtomicLong atomic-last-received-at
                                    idle-timeout-ms]
  (try
    (let [now (System/currentTimeMillis)
          last-received-at (.get atomic-last-received-at)
          ms-since-last-message (- now last-received-at)]
      (if (> ms-since-last-message idle-timeout-ms)
        (tracer/with-span! {:name "socket/close-inactive"}
          (IoUtils/safeClose channel))
        (try-send-ping-blocking channel)))
    (catch Exception e
      (tracer/record-exception-span! e {:name "socket/ping-err"
                                        :escaping? false}))))

(defn ws-callback
  "Creates a `WebsocketConnectionCallback`. This relays data to the 
   following callbacks: 

   on-open: Called when the websocket connection is opened. 
     :exchange - The underlying `WebSocketHttpExchange` object 
     :channel - The `WebSocketChannel` object 
  
   Note: `exchange` is useful when you want to extract information 
         from the underlying http request. i.e: headers, params, etc 
   
   on-message: Called when the client sends us a message 
     :channel - The `WebSocketChannel` object 
     :data - The message data             
   
   on-close-message: Called when the client closes the connection 
     :channel - The `WebSocketChannel` object 
     :message - The `CloseMessage` object 
   
     Note: on-close-message isn't _always_ called. If you want a 
           _guaranteed_ `close` callback, use `on-close` instead 

   on-close: Called when the connection is closed. 
    :channel - The `WebSocketChannel` object  

   on-error: Called when the server encounters an error sending a message 
     :channel - The `WebSocketChannel` object 
     :error - The error Throwable
     
   We also kick off a ping worker. It sends a `ping` message every 
   `ping-interval-ms`. If the client doesn't send any message for 
   `idle-timeout-ms`, we close the connection.  
   "
  [{:keys [on-open on-close listener ping-interval-ms idle-timeout-ms]
    :or   {on-open (constantly nil)
           on-close (constantly nil)
           ping-interval-ms 5000
           idle-timeout-ms 15000}
    :as   ws-opts}]
  (let [send-lock (ReentrantLock.)
        atomic-last-received-at (AtomicLong. (System/currentTimeMillis))
        channel-wrapper (fn [ch]
                          {:undertow-websocket ch
                           :send-lock send-lock})
        listener (if (instance? ChannelListener listener)
                   listener
                   (ws-listener (assoc ws-opts
                                       :channel-wrapper channel-wrapper
                                       :atomic-last-received-at atomic-last-received-at)))]

    (reify WebSocketConnectionCallback
      (^void onConnect [_ ^WebSocketHttpExchange exchange ^WebSocketChannel channel]
        (let [ping-job (delay/repeat-fn
                        ping-pool
                        ping-interval-ms
                        (fn []
                          (straight-jacket-run-ping-job channel
                                                        atomic-last-received-at
                                                        idle-timeout-ms)))

              close-task (reify ChannelListener
                           (handleEvent [_this channel]
                             (.cancel ping-job false)
                             (on-close (channel-wrapper channel))))]
          (.set atomic-last-received-at (System/currentTimeMillis))
          (on-open {:exchange exchange
                    :channel (channel-wrapper channel)})
          (.addCloseTask channel close-task)
          (.set (.getReceiveSetter channel) listener)
          (.resumeReceives channel))))))

(defn ws-request [^HttpServerExchange exchange ^IPersistentMap headers ^WebSocketConnectionCallback callback]
  (let [handler (->  (WebSocketProtocolHandshakeHandler. callback)
                     (.addExtension (PerMessageDeflateHandshake. true 6)))]
    (when headers
      (set-headers (.getResponseHeaders exchange) headers))
    (.handleRequest handler exchange)))

(defn send-json!
  "Serializes `obj` to json, and sends over a websocket."
  [obj {:keys [undertow-websocket send-lock]}]
  ;; Websockets/sendText _should_ be thread-safe 
  ;; But, t becomes thread-unsafe when we use per-message-deflate 
  ;; Using a `send-lock` to make `send-json!` thread-safe 
  (let [obj-json (->json obj)
        p (promise)
        _ (try
            (tracer/add-data!
             {:attributes
              {:send-lock.queue-length (.getQueueLength send-lock)
               :send-lock.is-locked (.isLocked send-lock)
               :send-lock.held-by-current-thread (.isHeldByCurrentThread send-lock)}})
            (.lock send-lock)
            (WebSockets/sendText
             ^String obj-json
             ^WebSocketChannel undertow-websocket
             (proxy [WebSocketCallback] []
               (complete [ws-conn context]
                 (deliver p nil))
               (onError [ws-conn context throwable]
                 (deliver p throwable))))
            (finally
              (.unlock send-lock)))
        ret @p]
    (when (instance? Throwable ret)
      (throw ret))))
