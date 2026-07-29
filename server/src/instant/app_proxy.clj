(ns instant.app-proxy
  "Routes requests for selected apps to alternate Instant backends.

   This handler runs directly on Undertow, before Ring and Compojure, so it can
   proxy WebSocket upgrades and stream HTTP request bodies without first
   converting them to Ring requests. Targets come from the app-proxy-targets
   config flag and can change while the server is running."
  (:require
   [clojure.string :as string]
   [clojure.tools.logging :as log]
   [instant.config :as config]
   [instant.flags :as flags]
   [instant.lib.ring.undertow :as undertow]
   [instant.reactive.store :as rs]
   [instant.util.async :as ua]
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

(def ^:private max-proxy-request-time-ms 30000)

;; The current routing table is shared by every request handler. WebSocket
;; connections are tracked separately so a config change can make clients
;; reconnect and pick up their app's new target.
(defonce ^:private targets (atom {}))
(defonce ^:private proxied-websockets (atom {}))
(defonce ^:private clear-target-listener (atom nil))

;; HTTP targets do not need an SSL provider, so avoid creating one unless an
;; HTTPS target is actually configured.
(defonce ^:private ssl-provider
  (delay (UndertowXnioSsl. (Xnio/getInstance) OptionMap/EMPTY)))

;; ----------
;; Target config

(defn- parse-app-id [v]
  (try
    (cond
      (uuid? v) v
      (string? v) (UUID/fromString v)
      :else nil)
    (catch IllegalArgumentException _
      nil)))

(defn- state->app-id [state]
  ;; Runtime OAuth state is the app UUID followed by a random UUID. The
  ;; callback has no other app identifier available before we route it.
  (when (and (string? state)
             (<= 36 (count state)))
    (parse-app-id (subs state 0 36))))

(defn- normalize-target [target]
  ;; Targets are origins rather than base URLs. Keeping paths and query strings
  ;; out of config means the incoming request path can be forwarded unchanged.
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

(defn parse-targets
  "Converts the config map to app UUIDs and origin URIs. Invalid entries are
   skipped so one bad target cannot disable routing for every configured app."
  [config]
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

;; ----------
;; App id extraction

(defn- first-query-param [^HttpServerExchange exchange name]
  (when-let [^Deque values (.get (.getQueryParameters exchange) name)]
    (.peekFirst values)))

(defn request-app-id
  "Returns the app id encoded in request metadata that is available without
   consuming the body."
  [^HttpServerExchange exchange]
  (let [headers (.getRequestHeaders exchange)
        ;; Client generations and endpoints use both hyphenated and underscored
        ;; spellings, in either a header or query parameter.
        direct-candidates [(.getFirst headers "app-id")
                           (.getFirst headers "app_id")
                           (first-query-param exchange "app_id")
                           (first-query-param exchange "app-id")]
        state-app-id (state->app-id (first-query-param exchange "state"))
        ;; Supports routes that encode the app id in the path, such as
        ;; /runtime/:app_id/.well-known/openid-configuration. UUIDs found here
        ;; are only used when they match an app id with a configured target.
        path-app-ids (map parse-app-id
                          (re-seq uuid-pattern (.getRequestPath exchange)))]
    (or (some parse-app-id direct-candidates)
        state-app-id
        (some identity path-app-ids))))

(defn body-app-id
  "Extracts the app id from the small JSON and form bodies used by auth, OAuth,
   sign-out, and the deprecated signed upload URL endpoint."
  [content-type ^bytes body]
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
      ;; App id extraction is best effort. The normal request handler remains
      ;; responsible for reporting malformed input.
      nil)))

;; ----------
;; Connection draining

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
  ;; This is the client-facing connection. Closing it also tears down the
  ;; WebSocket that ProxyHandler opened to the target.
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

(defn- connection-drain-opts []
  ;; Production uses the same gradual window as load balancer deregistration.
  ;; Keep development short so routing changes remain quick to exercise.
  {:total-ms (if (config/dev?)
               1000
               (flags/deregister-targets-drain-ms))
   :max-gap-ms (if (config/dev?)
                 100
                 1000)})

(defn- connection-channels-for-app [app-id]
  (into (vec (get @proxied-websockets app-id))
        (rs/local-connection-channels-for-app rs/store app-id)))

(defn- drain-connections-for-app! [app-id channels]
  ;; Sleeping on a background virtual thread lets the config listener return
  ;; immediately while clients move to the new backend over the drain window.
  (when (seq channels)
    (ua/vfut-bg
     (rs/close-connections-for-app app-id channels (connection-drain-opts)))))

(defn- changed-app-ids [old-targets new-targets]
  ;; Includes apps that were added or removed as well as apps whose target
  ;; origin changed.
  (into #{}
        (filter #(not= (get old-targets %)
                       (get new-targets %)))
        (into (set (keys old-targets))
              (keys new-targets))))

(defn- update-targets! [new-config]
  ;; Snapshot connections before swapping the routing table so the drain only
  ;; closes connections established under the old table. The table is swapped
  ;; first, then the snapshot is closed gradually so reconnects reach the new
  ;; backend without arriving as a single herd.
  (let [old-targets @targets
        new-targets (parse-targets new-config)
        changed (changed-app-ids old-targets new-targets)
        channels-by-app (into {}
                              (map (juxt identity connection-channels-for-app))
                              changed)]
    (reset! targets new-targets)
    (doseq [[app-id channels] channels-by-app]
      (drain-connections-for-app! app-id channels))))

(defn start []
  ;; start may run more than once during development, so replace the old
  ;; listener rather than registering duplicate config watches.
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

;; ----------
;; Request routing

(defn- make-proxy-handler [^HttpHandler local-handler ^URI target]
  (let [client (LoadBalancingProxyClient.)]
    ;; A single-host proxy client handles regular HTTP requests and WebSocket
    ;; upgrades. HTTPS targets need an XNIO SSL provider for the upstream side.
    (if (= "https" (.getScheme target))
      (.addHost client target ^XnioSsl @ssl-provider)
      (.addHost client target))
    (doto (ProxyHandler. client max-proxy-request-time-ms local-handler)
      ;; Send the target's Host header rather than api.instantdb.com.
      (.setRewriteHostHeader true))))

(defn- proxy-handler-for [cache local-handler target]
  ;; Proxy handlers own the upstream connection machinery, so reuse one for
  ;; each target rather than rebuilding it for every request.
  (or (get @cache target)
      (get (swap! cache
                  #(if (contains? % target)
                     %
                     (assoc % target (make-proxy-handler local-handler target))))
           target)))

(defn- route-request!
  [target-fn cache ^HttpHandler local-handler ^HttpServerExchange exchange app-id]
  ;; Extracted UUIDs are only routing candidates. Requests stay local unless
  ;; the UUID has an explicit target in the current config.
  (if-let [target (target-fn app-id)]
    (do
      (when (websocket-upgrade? exchange)
        (register-proxied-websocket! app-id (.getConnection exchange)))
      (.handleRequest ^HttpHandler
                      (proxy-handler-for cache local-handler target)
                      exchange))
    (.handleRequest local-handler exchange)))

(defn- restore-request-body! [^HttpServerExchange exchange ^bytes body]
  ;; receiveFullBytes consumes Undertow's request channel. Push the bytes back
  ;; and reset the channel so the proxy or Ring handler can read the body.
  (Connectors/ungetRequestBytes
   exchange
   (into-array
    PooledByteBuffer
    [(ImmediatePooledByteBuffer. (ByteBuffer/wrap body))]))
  (Connectors/resetRequestChannel exchange))

(def ^:private max-inspected-body-size (* 256 1024))

;; These endpoints can carry the app id only in a JSON or form body. They are
;; expected to be small; uploads identify the app in a header and never take
;; this buffering path.
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

(defn- inspect-body-and-route!
  "Buffers requests on body-inspection-paths when their app id is only encoded
   in the body, restores the body, then routes them to the configured target.
   The size limit keeps this fallback from making an unbounded allocation."
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
  "Routes from request metadata when possible so the body remains streaming.
   Only known body-inspection-paths take the bounded buffering fallback."
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
  "Wraps the Ring handler with the Undertow-level app router. The Ring adapter
   remains the fallback for requests without a configured proxy target."
  ([ring-handler]
   (handler-proxy ring-handler #(get @targets %)))
  ([ring-handler target-fn]
   (let [local-handler (BlockingHandler.
                        ((undertow/undertow-handler {:dispatch? true
                                                    :websocket? true})
                         ring-handler))]
     (routing-handler local-handler target-fn))))
