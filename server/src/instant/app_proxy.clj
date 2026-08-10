(ns instant.app-proxy
  "Routes requests for selected apps to alternate Instant backends.

   This handler runs directly on Undertow, before Ring and Compojure, so it can
   proxy WebSocket upgrades and stream HTTP request bodies without first
   converting them to Ring requests. Targets come from the app-proxy-targets
   config flag and can change while the server is running.

   Routing keys off client-supplied request data: headers, query params, the
   path, and small bodies. That is safe because both backends authenticate
   every request themselves. A client that omits its app id lands on the local
   handler, so migration correctness ultimately depends on the old backend no
   longer serving a migrated app's data."
  (:require
   [clojure.string :as string]
   [clojure.tools.logging :as log]
   [instant.flags :as flags]
   [instant.lib.ring.undertow :as undertow]
   [instant.reactive.store :as rs]
   [instant.util.async :as ua]
   [instant.util.json :as json]
   [instant.util.uuid :as uuid-util]
   [ring.util.codec :as codec])
  (:import
   (io.undertow.connector PooledByteBuffer)
   (io.undertow.io Receiver$ErrorCallback Receiver$FullBytesCallback Receiver$RequestToLargeException)
   (io.undertow.protocols.ssl UndertowXnioSsl)
   (io.undertow.server Connectors HttpHandler HttpServerExchange ServerConnection ServerConnection$CloseListener)
   (io.undertow.server.handlers BlockingHandler)
   (io.undertow.server.handlers.proxy LoadBalancingProxyClient ProxyHandler)
   (io.undertow.util ImmediatePooledByteBuffer StatusCodes)
   (java.io IOException)
   (java.net URI)
   (java.nio ByteBuffer)
   (java.nio.charset StandardCharsets)
   (java.util Deque)
   (org.xnio IoUtils OptionMap Xnio)
   (org.xnio.ssl XnioSsl)))

(set! *warn-on-reflection* true)

(def ^:private uuid-pattern
  #"(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")

;; Requests read the routing table straight from the flag; this atom only
;; remembers the last table the connection drainer acted on so a config change
;; can diff the two and drain the affected connections. WebSocket connections
;; are tracked separately so that drain can reach proxied sockets.
(defonce ^:private targets (atom {}))
(defonce ^:private proxied-websockets (atom {}))
(defonce ^:private clear-target-listener (atom nil))

;; HTTP targets do not need an SSL provider, so avoid creating one unless an
;; HTTPS target is actually configured.
(defonce ^:private ssl-provider
  (delay (UndertowXnioSsl. (Xnio/getInstance) OptionMap/EMPTY)))

(defn- state->app-id [state]
  ;; Runtime OAuth state is the app UUID followed by a random UUID. The
  ;; callback has no other app identifier available before we route it.
  (when (and (string? state)
             (<= 36 (count state)))
    (uuid-util/coerce (subs state 0 36))))

;; ----------
;; App id extraction

(defn- first-query-param [^HttpServerExchange exchange name]
  (when-let [^Deque values (.get (.getQueryParameters exchange) name)]
    (.peekFirst values)))

(defn request-app-id
  "Returns the app id to route by from request metadata that is available
   without consuming the body. When a request carries several candidate UUIDs,
   the first one with a configured target wins so an unrelated id earlier in
   the path cannot shadow the app id."
  [^HttpServerExchange exchange table]
  (let [headers (.getRequestHeaders exchange)
        ;; Client generations and endpoints use both hyphenated and underscored
        ;; spellings, in either a header or query parameter. Runtime OAuth
        ;; callbacks only identify the app in state, and routes such as
        ;; /runtime/:app_id/.well-known/openid-configuration encode the app id
        ;; in the path.
        candidates (concat
                    (keep uuid-util/coerce
                          [(.getFirst headers "app-id")
                           (.getFirst headers "app_id")
                           (first-query-param exchange "app_id")
                           (first-query-param exchange "app-id")])
                    (when-let [app-id (state->app-id (first-query-param exchange "state"))]
                      [app-id])
                    (keep uuid-util/coerce
                          (re-seq uuid-pattern (.getRequestPath exchange))))]
    (or (some #(when (contains? table %) %) candidates)
        (first candidates))))

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
      (or (uuid-util/coerce (get params "app-id"))
          (uuid-util/coerce (get params "app_id"))
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

;; Clients reconnect as soon as they are closed, so the drain only needs to be
;; long enough to spread the reconnect herd.
(def ^:private connection-drain-opts
  {:total-ms (* 60 1000)
   :max-gap-ms 10})

(defn- connection-channels-for-app [app-id]
  (into (vec (get @proxied-websockets app-id))
        (rs/local-connection-channels-for-app rs/store app-id)))

(defn- drain-connections-for-app! [app-id channels]
  ;; Sleeping on a background virtual thread lets the config listener return
  ;; immediately while clients move to the new backend over the drain window.
  (when (seq channels)
    (ua/vfut-bg
     (rs/close-connections-for-app app-id channels connection-drain-opts))))

(defn drain-proxied-connections!
  "Closes every proxied WebSocket at a steady rate. Proxied connections never
   enter the local session store, so the deploy-time drains must close them
   through this alongside rs/close-connections."
  [opts]
  (rs/close-channels "app-proxy/drain-proxied-connections"
                     {}
                     (into [] cat (vals @proxied-websockets))
                     opts))

(defn local-proxied-connections
  "Summarizes the WebSocket connections this instance is currently proxying to
   another backend, keyed by app id. The target comes from the live routing
   table so it reflects the current config."
  []
  (let [table (flags/app-proxy-targets)]
    (reduce-kv
     (fn [acc app-id connections]
       (assoc acc app-id {:count (count connections)
                          :target (some-> ^URI (get table app-id) str)}))
     {}
     @proxied-websockets)))

(defn- changed-app-ids [old-targets new-targets]
  ;; Includes apps that were added or removed as well as apps whose target
  ;; origin changed.
  (into #{}
        (filter #(not= (get old-targets %)
                       (get new-targets %)))
        (into (set (keys old-targets))
              (keys new-targets))))

(defn- update-targets! [new-targets]
  ;; Snapshot connections before swapping the routing table so the drain only
  ;; closes connections established under the old table. The table is swapped
  ;; first, then the snapshot is closed gradually so reconnects reach the new
  ;; backend without arriving as a single herd.
  (let [old-targets @targets
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
  (update-targets! (flags/app-proxy-targets))
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

(defn- dashboard-path? [path]
  (or (= "/dash" path)
      (string/starts-with? path "/dash/")))

(def ^:private target-unavailable-handler
  ;; ProxyHandler falls through to this handler when its target has no
  ;; connectable host. Failing closed matters here: falling back to the local
  ;; handler would silently serve a migrated app from this backend's data.
  (reify HttpHandler
    (handleRequest [_ exchange]
      (.setStatusCode exchange StatusCodes/SERVICE_UNAVAILABLE)
      (.endExchange exchange))))

(defn- make-proxy-handler [^URI target]
  (let [client (LoadBalancingProxyClient.)]
    ;; A single-host proxy client handles regular HTTP requests and WebSocket
    ;; upgrades. HTTPS targets need an XNIO SSL provider for the upstream side.
    (if (= "https" (.getScheme target))
      (.addHost client target ^XnioSsl @ssl-provider)
      (.addHost client target))
    ;; No max request time: proxied uploads and WebSockets outlive any
    ;; reasonable fixed deadline.
    (doto (ProxyHandler. client -1 target-unavailable-handler)
      ;; Send the target's Host header rather than api.instantdb.com.
      (.setRewriteHostHeader true))))

(defn- proxy-handler-for
  ;; Proxy handlers own the upstream connection machinery, so reuse one per
  ;; target. Creation only happens after a config change, so that is also when
  ;; handlers for dropped targets are evicted.
  [cache table target]
  (or (get @cache target)
      (get (swap! cache
                  (fn [handlers]
                    (let [handlers (select-keys handlers (vals table))]
                      (if (contains? handlers target)
                        handlers
                        (assoc handlers target (make-proxy-handler target))))))
           target)))

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

(defn handler-proxy
  "Wraps the Ring handler with the Undertow-level app router. Requests route
   from metadata when possible so the body remains streaming; only known
   body-inspection-paths take the bounded buffering fallback. The Ring adapter
   handles every request without a configured proxy target."
  ([ring-handler]
   (handler-proxy ring-handler flags/app-proxy-targets))
  ([ring-handler current-targets]
   (let [local-handler (BlockingHandler.
                        ((undertow/undertow-handler {:dispatch? true
                                                     :websocket? true})
                         ring-handler))
         proxy-handlers (atom {})
         route! (fn [^HttpServerExchange exchange table app-id]
                  (if-let [target (get table app-id)]
                    (do
                      (when (websocket-upgrade? exchange)
                        (register-proxied-websocket! app-id (.getConnection exchange)))
                      (.handleRequest ^HttpHandler (proxy-handler-for proxy-handlers table target)
                                      exchange))
                    (.handleRequest local-handler exchange)))
         ;; Buffers a request whose app id is only encoded in the body,
         ;; restores the body, then routes it. The size limit keeps this
         ;; fallback from making an unbounded allocation.
         inspect-body! (fn [^HttpServerExchange exchange table]
                         (let [content-type (or (.getFirst (.getRequestHeaders exchange) "content-type")
                                                "")]
                           (.setMaxBufferSize (.getRequestReceiver exchange) max-inspected-body-size)
                           (.receiveFullBytes
                            (.getRequestReceiver exchange)
                            (reify Receiver$FullBytesCallback
                              (handle [_ callback-exchange body]
                                (restore-request-body! callback-exchange body)
                                (route! callback-exchange table (body-app-id content-type body))))
                            (reify Receiver$ErrorCallback
                              (error [_ callback-exchange error]
                                (log/warn ^IOException error "Unable to inspect request body for app proxy routing")
                                (.setStatusCode callback-exchange
                                                (if (instance? Receiver$RequestToLargeException error)
                                                  StatusCodes/REQUEST_ENTITY_TOO_LARGE
                                                  StatusCodes/INTERNAL_SERVER_ERROR))
                                (.endExchange callback-exchange))))))]
     (reify HttpHandler
       (handleRequest [_ exchange]
         (let [table (current-targets)
               path (.getRequestPath exchange)]
           (if (or (empty? table)
                   (dashboard-path? path))
             ;; Empty routing tables and dashboard control-plane requests stay
             ;; out of the proxy entirely.
             (.handleRequest local-handler exchange)
             (if-let [app-id (request-app-id exchange table)]
               (route! exchange table app-id)
               (if (contains? body-inspection-paths path)
                 (inspect-body! exchange table)
                 (.handleRequest local-handler exchange))))))))))

;; ----------
;; Local fail-closed guard

(defn- params-app-id [params]
  (when (map? params)
    (or (uuid-util/coerce (:app-id params))
        (uuid-util/coerce (:app_id params))
        (state->app-id (:state params)))))

(defn- ring-app-id-candidates
  "App ids a locally executing Ring request carries: the metadata the
   Undertow router reads plus the parsed params and body it cannot see."
  [{:keys [headers params body uri]}]
  (concat
   (keep uuid-util/coerce
         [(get headers "app-id")
          (get headers "app_id")])
   (keep params-app-id [params body])
   (keep uuid-util/coerce (re-seq uuid-pattern (or uri "")))))

(defn wrap-proxied-app-guard
  "Fails closed if a request for a proxied app reaches the local Ring
   handler. The Undertow router runs first, so this only fires when routing
   missed the request, such as an endpoint carrying its app id somewhere the
   router does not look. Refusing loudly beats silently serving a migrated
   app from this backend's data."
  ([handler]
   (wrap-proxied-app-guard handler flags/app-proxy-targets))
  ([handler current-targets]
   (fn [request]
     (let [table (current-targets)
           app-id (when (and (seq table)
                             (not (dashboard-path? (:uri request))))
                    (some #(when (contains? table %) %)
                          (ring-app-id-candidates request)))]
       (if-not app-id
         (handler request)
         (do
           (log/error "App proxy routing missed a request for a proxied app"
                      {:app-id app-id
                       :uri (:uri request)})
           {:status 503
            :body {:message "This app is served by a different backend."}}))))))
