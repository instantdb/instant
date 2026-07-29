(ns instant.app-proxy
  (:require
   [clojure.string :as string]
   [clojure.tools.logging :as log]
   [instant.flags :as flags]
   [instant.lib.ring.undertow :as undertow]
   [instant.reactive.store :as rs]
   [instant.util.json :as json]
   [ring.util.codec :as codec])
  (:import
   (io.undertow.connector PooledByteBuffer)
   (io.undertow.io Receiver$ErrorCallback Receiver$FullBytesCallback)
   (io.undertow.protocols.ssl UndertowXnioSsl)
   (io.undertow.server Connectors HttpHandler HttpServerExchange ServerConnection ServerConnection$CloseListener)
   (io.undertow.server.handlers BlockingHandler)
   (io.undertow.server.handlers.proxy LoadBalancingProxyClient ProxyHandler)
   (io.undertow.util ImmediatePooledByteBuffer StatusCodes)
   (java.io IOException)
   (java.net URI)
   (java.nio ByteBuffer)
   (java.nio.charset StandardCharsets)
   (java.util Deque UUID)
   (org.xnio IoUtils OptionMap Xnio)
   (org.xnio.ssl XnioSsl)))

(set! *warn-on-reflection* true)

(def ^:private uuid-pattern
  #"(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")

(def ^:private body-inspection-paths
  #{"/runtime/auth/send_magic_code"
    "/runtime/auth/verify_magic_code"
    "/runtime/auth/verify_refresh_token"
    "/runtime/auth/sign_in_guest"
    "/runtime/oauth/callback"
    "/runtime/oauth/id_token"
    "/runtime/oauth/token"
    "/runtime/signout"
    "/storage/signed-upload-url"})

(def ^:private max-inspected-body-size (* 256 1024))
(def ^:private max-proxy-request-time-ms 30000)

(defonce ^:private targets (atom {}))
(defonce ^:private proxied-websockets (atom {}))
(defonce ^:private clear-target-listener (atom nil))
(defonce ^:private ssl-provider
  (delay (UndertowXnioSsl. (Xnio/getInstance) OptionMap/EMPTY)))

(defn- parse-app-id [v]
  (try
    (cond
      (uuid? v) v
      (string? v) (UUID/fromString v)
      :else nil)
    (catch IllegalArgumentException _
      nil)))

(defn- state->app-id [state]
  (when (and (string? state)
             (<= 36 (count state)))
    (parse-app-id (subs state 0 36))))

(defn- normalize-target [target]
  (when (string? target)
    (try
      (let [uri (URI. target)
            scheme (some-> (.getScheme uri) string/lower-case)
            path (.getPath uri)]
        (when (and (#{"http" "https"} scheme)
                   (.getHost uri)
                   (nil? (.getUserInfo uri))
                   (nil? (.getQuery uri))
                   (nil? (.getFragment uri))
                   (or (string/blank? path)
                       (= "/" path)))
          (URI. scheme nil (.getHost uri) (.getPort uri) nil nil nil)))
      (catch Exception _
        nil))))

(defn parse-targets [config]
  (if-not (map? config)
    {}
    (reduce-kv
     (fn [acc app-id-value target-value]
       (if-let [app-id (parse-app-id app-id-value)]
         (if-let [target (normalize-target target-value)]
           (assoc acc app-id target)
           (do
             (log/error "Ignoring invalid app proxy target" {:app-id app-id-value})
             acc))
         (do
           (log/error "Ignoring invalid app proxy app id" {:app-id app-id-value})
           acc)))
     {}
     config)))

(defn- first-query-param [^HttpServerExchange exchange name]
  (when-let [^Deque values (.get (.getQueryParameters exchange) name)]
    (.peekFirst values)))

(defn request-app-id
  "Returns the app id encoded in request metadata that is available without
   consuming the body."
  [^HttpServerExchange exchange]
  (let [headers (.getRequestHeaders exchange)
        direct-candidates [(.getFirst headers "app-id")
                           (.getFirst headers "app_id")
                           (first-query-param exchange "app_id")
                           (first-query-param exchange "app-id")]
        state-app-id (state->app-id (first-query-param exchange "state"))
        path-app-ids (map parse-app-id
                          (re-seq uuid-pattern (.getRequestPath exchange)))]
    (or (some parse-app-id direct-candidates)
        state-app-id
        (some identity path-app-ids))))

(defn body-app-id [content-type ^bytes body]
  (try
    (let [params (cond
                   (string/starts-with? content-type "application/json")
                   (json/<-json (String. body StandardCharsets/UTF_8))

                   (string/starts-with? content-type "application/x-www-form-urlencoded")
                   (codec/form-decode (String. body StandardCharsets/UTF_8))

                   :else nil)]
      (or (parse-app-id (get params "app-id"))
          (parse-app-id (get params "app_id"))
          (state->app-id (get params "state"))))
    (catch Exception _
      nil)))

(defn- websocket-upgrade? [^HttpServerExchange exchange]
  (some-> (.getFirst (.getRequestHeaders exchange) "upgrade")
          (.equalsIgnoreCase "websocket")))

(defn- remove-proxied-websocket! [app-id connection]
  (swap! proxied-websockets
         (fn [connections-by-app]
           (let [next-connections (disj (get connections-by-app app-id) connection)]
             (if (seq next-connections)
               (assoc connections-by-app app-id next-connections)
               (dissoc connections-by-app app-id))))))

(defn- register-proxied-websocket! [app-id ^ServerConnection connection]
  (swap! proxied-websockets update app-id (fnil conj #{}) connection)
  (.addCloseListener
   connection
   (reify ServerConnection$CloseListener
     (closed [_ closed-connection]
       (remove-proxied-websocket! app-id closed-connection)))))

(defn- close-proxied-websockets! [app-ids]
  (doseq [app-id app-ids
          connection (get @proxied-websockets app-id)]
    (IoUtils/safeClose ^ServerConnection connection)))

(defn- changed-app-ids [old-targets new-targets]
  (into #{}
        (filter #(not= (get old-targets %)
                       (get new-targets %)))
        (into (set (keys old-targets))
              (keys new-targets))))

(defn- update-targets! [new-config]
  (let [old-targets @targets
        new-targets (parse-targets new-config)
        changed (changed-app-ids old-targets new-targets)]
    (reset! targets new-targets)
    (close-proxied-websockets! changed)
    (doseq [app-id changed]
      (rs/close-connections-for-app rs/store app-id))))

(defn start []
  (when-let [clear-listener @clear-target-listener]
    (clear-listener))
  (update-targets! (flags/flag :app-proxy-targets {}))
  (reset! clear-target-listener
          (flags/add-flag-listener
           :app-proxy-targets
           (fn [_path _old-value new-value]
             (update-targets! new-value)))))

(defn stop []
  (when-let [clear-listener @clear-target-listener]
    (clear-listener)
    (reset! clear-target-listener nil))
  (close-proxied-websockets! (keys @proxied-websockets))
  (reset! proxied-websockets {})
  (reset! targets {}))

(defn- make-proxy-handler [^HttpHandler local-handler ^URI target]
  (let [client (LoadBalancingProxyClient.)]
    (if (= "https" (.getScheme target))
      (.addHost client target ^XnioSsl @ssl-provider)
      (.addHost client target))
    (doto (ProxyHandler. client max-proxy-request-time-ms local-handler)
      (.setRewriteHostHeader true))))

(defn- proxy-handler-for [cache local-handler target]
  (or (get @cache target)
      (get (swap! cache
                  #(if (contains? % target)
                     %
                     (assoc % target (make-proxy-handler local-handler target))))
           target)))

(defn- route-request!
  [target-fn cache ^HttpHandler local-handler ^HttpServerExchange exchange app-id]
  (if-let [target (target-fn app-id)]
    (do
      (when (websocket-upgrade? exchange)
        (register-proxied-websocket! app-id (.getConnection exchange)))
      (.handleRequest ^HttpHandler
                      (proxy-handler-for cache local-handler target)
                      exchange))
    (.handleRequest local-handler exchange)))

(defn- restore-request-body! [^HttpServerExchange exchange ^bytes body]
  (Connectors/ungetRequestBytes
   exchange
   (into-array
    PooledByteBuffer
    [(ImmediatePooledByteBuffer. (ByteBuffer/wrap body))]))
  (Connectors/resetRequestChannel exchange))

(defn- inspect-body-and-route!
  [target-fn cache ^HttpHandler local-handler ^HttpServerExchange exchange]
  (let [content-type (or (.getFirst (.getRequestHeaders exchange) "content-type")
                         "")]
    (.setMaxBufferSize (.getRequestReceiver exchange) max-inspected-body-size)
    (.receiveFullBytes
     (.getRequestReceiver exchange)
     (reify Receiver$FullBytesCallback
       (handle [_ callback-exchange body]
         (restore-request-body! callback-exchange body)
         (route-request! target-fn
                         cache
                         local-handler
                         callback-exchange
                         (body-app-id content-type body))))
     (reify Receiver$ErrorCallback
       (error [_ callback-exchange error]
         (log/warn ^IOException error "Unable to inspect request body for app proxy routing")
         (.setStatusCode callback-exchange StatusCodes/REQUEST_ENTITY_TOO_LARGE)
         (.endExchange callback-exchange))))))

(defn routing-handler
  ([local-handler]
   (routing-handler local-handler #(get @targets %)))
  ([^HttpHandler local-handler target-fn]
   (let [proxy-handlers (atom {})]
     (reify HttpHandler
       (handleRequest [_ exchange]
         (if-let [app-id (request-app-id exchange)]
           (route-request! target-fn proxy-handlers local-handler exchange app-id)
           (if (contains? body-inspection-paths (.getRequestPath exchange))
             (inspect-body-and-route! target-fn proxy-handlers local-handler exchange)
             (.handleRequest local-handler exchange))))))))

(defn handler-proxy
  ([ring-handler]
   (handler-proxy ring-handler #(get @targets %)))
  ([ring-handler target-fn]
   (let [local-handler (BlockingHandler.
                        ((undertow/undertow-handler {:dispatch? true
                                                    :websocket? true})
                         ring-handler))]
     (routing-handler local-handler target-fn))))
