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
            [instant.util.tracer :as tracer])
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
    WebSocketChannel
    WebSockets
    WebSocketCallback]
   [io.undertow.websockets.spi WebSocketHttpExchange]
   [org.xnio ChannelListener]
   [ring.adapter.undertow Util]
   [clojure.lang IPersistentMap]
   [io.undertow.websockets.extensions PerMessageDeflateHandshake]
   [java.util.concurrent.locks ReentrantLock]))

(defn ws-listener
  "Creates an `AbstractReceiveListener`. This relays calls to 
   `on-message`, `on-close-message`, and `on-error` callbacks. 
   
   See `ws-callback` for more details."
  [{:keys [on-message on-close-message on-error channel-wrapper]}]
  (let [on-message       (or on-message (constantly nil))
        on-error         (or on-error (constantly nil))
        on-close-message (or on-close-message (constantly nil))]
    (proxy [AbstractReceiveListener] []
      (onFullTextMessage [^WebSocketChannel channel ^BufferedTextMessage message]
        (on-message {:channel (channel-wrapper channel)
                     :data    (.getData message)}))
      (onFullBinaryMessage [^WebSocketChannel channel ^BufferedBinaryMessage message]
        (let [pooled (.getData message)]
          (try
            (let [payload (.getResource pooled)]
              (on-message {:channel (channel-wrapper channel)
                           :data    (Util/toArray payload)}))
            (finally (.free pooled)))))
      (onCloseMessage [^CloseMessage message ^WebSocketChannel channel]
        (on-close-message {:channel (channel-wrapper  channel)
                           :message message}))
      (onError [^WebSocketChannel channel ^Throwable error]
        (on-error {:channel (channel-wrapper channel)
                   :error   error})))))

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
     :error - The error Throwable"
  [{:keys [on-open on-close listener]
    :or   {on-open (constantly nil) on-close (constantly nil)}
    :as   ws-opts}]
  (let [send-lock (ReentrantLock.)
        channel-wrapper (fn [ch]
                          {:undertow-websocket ch
                           :send-lock send-lock})
        listener (if (instance? ChannelListener listener)
                   listener
                   (ws-listener (assoc ws-opts :channel-wrapper channel-wrapper)))
        close-task (reify ChannelListener
                     (handleEvent [_this channel]
                       (on-close (channel-wrapper channel))))]
    (reify WebSocketConnectionCallback
      (^void onConnect [_ ^WebSocketHttpExchange exchange ^WebSocketChannel channel]
        (on-open {:exchange exchange :channel (channel-wrapper channel)})
        (.addCloseTask channel close-task)
        (.set (.getReceiveSetter channel) listener)
        (.resumeReceives channel)))))

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
