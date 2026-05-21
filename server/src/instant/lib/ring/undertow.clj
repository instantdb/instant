(ns instant.lib.ring.undertow
  "This is a modified version of luminus/ring-undertow-adapter.
   
   We needed to enhance websocket support, so wrote a custom
   instant.lib.ring.websocket namespace"
  (:require
   [ring.adapter.undertow.request :refer [build-exchange-map]]
   [ring.adapter.undertow.response :refer [set-exchange-response]]
   [ring.adapter.undertow.ssl :refer [keystore->ssl-context]]
   [instant.lib.ring.websocket :as ws]
   [instant.lib.ring.sse :as sse]
   [instant.util.deftype :refer [deftype-once]])
  (:import
   [io.undertow Undertow Undertow$Builder UndertowOptions]
   [org.xnio Options SslClientAuthMode]
   [io.undertow.server HttpHandler]
   [io.undertow.server.handlers BlockingHandler GracefulShutdownHandler]
   [io.undertow.server.session SessionAttachmentHandler
    SessionCookieConfig
    SessionManager InMemorySessionManager]))

(defprotocol ServerImpl
  (stop [_])
  (shutdownGracefully [_])
  (awaitShutdown [_ ^long ms])
  (getListenerInfo [_]))

;; Wrapper over the undertow server that exposes gracefulShutdown helpers
(deftype-once Server [^Undertow server ^GracefulShutdownHandler graceful-shutdown-handler]
  ServerImpl
  (stop [_]
    (.stop server))
  (getListenerInfo [_]
    (.getListenerInfo server))
  (shutdownGracefully [_]
    (if-not graceful-shutdown-handler
      (throw (Exception. "Server was created without graceful shutdown enabled."))
      (.shutdown graceful-shutdown-handler)))
  (awaitShutdown [_ ms]
    (if-not graceful-shutdown-handler
      (throw (Exception. "Server was created without graceful shutdown enabled."))
      (.awaitShutdown graceful-shutdown-handler ms))))

(set! *warn-on-reflection* true)

(defn handle-request [websocket? exchange response-map]
  (if-let [sse-config (:undertow/sse response-map)]
    (->> sse-config (sse/sse-callback) (sse/sse-request exchange (:headers response-map)))
    (if websocket?
      (if-let [ws-config (:undertow/websocket response-map)]
        (->> ws-config (ws/ws-callback) (ws/ws-request exchange (:headers response-map)))
        (set-exchange-response exchange response-map))
      (set-exchange-response exchange response-map))))

(defn wrap-with-session-handler
  [^SessionManager session-manager ^HttpHandler handler]
  (SessionAttachmentHandler. handler session-manager (SessionCookieConfig.)))

(defn ^:no-doc undertow-handler
  "Returns an function that returns Undertow HttpHandler implementation for the given Ring handler."
  [{:keys [dispatch? websocket?]
    :or   {dispatch?  true
           websocket? true}}]
  (fn [handler]
    (reify HttpHandler
      (handleRequest [_ exchange]
        (when-not dispatch? (.startBlocking exchange))
        (let [request-map  (build-exchange-map exchange)
              response-map (handler request-map)]
          (handle-request websocket? exchange response-map))))))

(defn ^:no-doc async-undertow-handler
  [{:keys [websocket?]
    :or   {websocket? true}}]
  (fn [handler]
    (reify HttpHandler
      (handleRequest [_ exchange]
        (.dispatch exchange
                   ^Runnable
                   (fn []
                     (handler
                      (build-exchange-map exchange)
                      (fn [response-map]
                        (handle-request websocket? exchange response-map))
                      (fn [^Throwable exception]
                        (set-exchange-response exchange {:status 500
                                                         :body   (.getMessage exception)})))))))))

#_{:clj-kondo/ignore [:unused-binding]}
(defn ^:no-doc handler!
  [handler ^Undertow$Builder builder {:keys [dispatch? handler-proxy websocket? async? session-manager?
                                             max-sessions server-name custom-manager
                                             graceful-shutdown?]
                                      :or   {dispatch?        true
                                             websocket?       true
                                             async?           false
                                             session-manager? true
                                             max-sessions     -1
                                             server-name      "ring-undertow"}
                                      :as   options}]
  (let [target-handler-proxy (cond
                               (some? handler-proxy) handler-proxy
                               async? (async-undertow-handler options)
                               :else (undertow-handler options))
        http-handler (cond->> (target-handler-proxy handler)

                       session-manager?
                       (wrap-with-session-handler (or custom-manager
                                                      (InMemorySessionManager. (str server-name "-session-manager") max-sessions)))

                       (and (nil? handler-proxy)
                            dispatch?)
                       (BlockingHandler.))
        graceful-shutdown-handler (when graceful-shutdown?
                                    (GracefulShutdownHandler. http-handler))]
    (.setHandler builder (or graceful-shutdown-handler
                             http-handler))
    graceful-shutdown-handler))

(defn ^:no-doc tune!
  [^Undertow$Builder builder {:keys [io-threads worker-threads buffer-size direct-buffers? max-entity-size]}]
  (cond-> builder
    max-entity-size (.setServerOption UndertowOptions/MAX_ENTITY_SIZE (long max-entity-size))
    max-entity-size (.setServerOption UndertowOptions/MULTIPART_MAX_ENTITY_SIZE (long max-entity-size))
    io-threads (.setIoThreads io-threads)
    worker-threads (.setWorkerThreads worker-threads)
    buffer-size (.setBufferSize buffer-size)
    (not (nil? direct-buffers?)) (.setDirectBuffers direct-buffers?)))

(defn ^:no-doc listen!
  [^Undertow$Builder builder {:keys [host port ssl-port ssl-context key-managers trust-managers http?]
                              :as   options
                              :or   {host "localhost"
                                     http? true
                                     port 80}}]
  (let [ssl-context (or ssl-context (keystore->ssl-context options))]
    (cond-> builder
      (and ssl-port ssl-context) (.addHttpsListener ssl-port host ssl-context)
      (and ssl-port (not ssl-context)) (.addHttpsListener ^int ssl-port ^String host ^"[Ljavax.net.ssl.KeyManager;" key-managers ^"[Ljavax.net.ssl.TrustManager;" trust-managers)
      (and http? port) (.addHttpListener port host))))

(defn ^:no-doc client-auth! [^Undertow$Builder builder {:keys [client-auth]}]
  (when client-auth
    (case client-auth
      (:want :requested)
      (.setSocketOption builder Options/SSL_CLIENT_AUTH_MODE SslClientAuthMode/REQUESTED)
      (:need :required)
      (.setSocketOption builder Options/SSL_CLIENT_AUTH_MODE SslClientAuthMode/REQUIRED))))

(defn ^:no-doc http2! [^Undertow$Builder builder {:keys [http2?]}]
  (when http2?
    (.setServerOption builder UndertowOptions/ENABLE_HTTP2 true)
    (.setServerOption builder UndertowOptions/ENABLE_SPDY true)))

(defn run-undertow
  "Start an Undertow webserver using given handler and the supplied options:

  :configurator     - a function called with the Undertow Builder instance
  :host             - the hostname to listen on
  :http?            - flag to enable http (defaults to true)
  :port             - the port to listen on (defaults to 80)
  :ssl-port         - a number, requires either :ssl-context, :keystore, or :key-managers
  :keystore         - the filepath (a String) to the keystore
  :key-password     - the password for the keystore
  :truststore       - if separate from the keystore
  :trust-password   - if :truststore passed
  :ssl-context      - a valid javax.net.ssl.SSLContext
  :key-managers     - a valid javax.net.ssl.KeyManager []
  :trust-managers   - a valid javax.net.ssl.TrustManager []
  :http2?           - flag to enable http2
  :io-threads       - # threads handling IO, defaults to available processors
  :worker-threads   - # threads invoking handlers, defaults to (* io-threads 8)
  :buffer-size      - a number, defaults to 16k for modern servers
  :direct-buffers?  - boolean, defaults to true
  :dispatch?        - dispatch handlers off the I/O threads (default: true)
  :websocket?       - built-in handler support for websocket callbacks
  :async?           - ring async flag. When true, expect a ring async three arity handler function
  :handler-proxy    - an optional custom handler proxy function taking handler as single argument
  :max-entity-size  - maximum size of a request entity
  :session-manager? - initialize undertow session manager (default: true)
  :custom-manager   - custom implementation that extends the io.undertow.server.session.SessionManager interface
  :max-sessions     - maximum number of undertow session, for use with InMemorySessionManager (default: -1)
  :server-name      - for use in session manager, for use with InMemorySessionManager (default: \"ring-undertow\")
  :graceful-shutdown? - If true, wraps the handler in a GracefulShutdownHandler, close with (.shutdown), then (.awaitShutdown)
  Returns an Undertow server instance. To stop call (.stop server)."
  ^Server [handler options]
  (let [^Undertow$Builder builder (Undertow/builder)
        graceful-shutdown-handler (handler! handler builder options)]
    (tune! builder options)
    (http2! builder options)
    (client-auth! builder options)
    (listen! builder options)

    (when-some [configurator (:configurator options)]
      (configurator builder))

    (let [^Undertow server (.build builder)]
      (try
        (.start server)
        (Server. server graceful-shutdown-handler)
        (catch Exception ex
          (.stop server)
          (throw ex))))))
