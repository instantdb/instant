(ns instant.core
  (:gen-class)
  (:require
   [tool]
   [clojure.java.io :as io]
   [clojure.tools.logging :as log]
   [compojure.core :refer [defroutes GET POST routes wrap-routes]]
   [instant.admin.routes :as admin-routes]
   [instant.auth.jwt :as jwt]
   [instant.auth.oauth :as oauth]
   [instant.config :as config]
   [instant.dash.ephemeral-app :as ephemeral-app]
   [instant.dash.routes :as dash-routes]
   [instant.db.indexing-jobs :as indexing-jobs]
   [instant.db.rule-where-testing :as rule-where-testing]
   [instant.storage.sweeper :as storage-sweeper]
   [instant.flags :as flags]
   [instant.flags-impl :as flags-impl]
   [instant.gauges :as gauges]
   [instant.health :as health]
   [instant.honeycomb-api :as honeycomb-api]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.wal :as wal]
   [instant.lib.ring.undertow :as undertow-adapter]
   [instant.machine-summaries]
   [instant.nrepl :as nrepl]
   [instant.oauth-apps.routes :as oauth-app-routes]
   [instant.reactive.ephemeral :as eph]
   [instant.reactive.invalidator :as inv]
   [instant.reactive.session :as session]
   [instant.reactive.store :as rs]
   [instant.runtime.routes :as runtime-routes]
   [instant.scripts.analytics :as analytics]
   [instant.scripts.daily-metrics :as daily-metrics]
   [instant.scripts.welcome-email :as welcome-email]
   [instant.session-counter :as session-counter]
   [instant.storage.routes :as storage-routes]
   [instant.stripe :as stripe]
   [instant.superadmin.routes :as superadmin-routes]
   [instant.system-catalog-migration :refer [ensure-attrs-on-system-catalog-app]]
   [instant.util.async :as ua]
   [instant.util.crypt :as crypt-util]
   [instant.util.http :as http-util]
   [instant.util.lang :as lang]
   [instant.util.tracer :as tracer]
   [instant.app-deletion-sweeper :as app-deletion-sweeper]
   [ring.middleware.cookies :refer [CookieDateTime]]
   [ring.middleware.cors :refer [wrap-cors preflight?]]
   [ring.middleware.json :refer [wrap-json-body wrap-json-response]]
   [ring.middleware.keyword-params :refer [wrap-keyword-params]]
   [ring.middleware.multipart-params :refer [wrap-multipart-params]]
   [ring.middleware.params :refer [wrap-params]]
   [ring.util.http-response :as response])
  (:import
   (clojure.lang IFn)
   (io.undertow Undertow UndertowOptions Undertow$Builder Undertow$ListenerInfo)
   (java.text SimpleDateFormat)
   (java.util Locale TimeZone)))

;; --------
;; Middleware

(defn wrap-json-body-except [handler method-paths]
  (fn [request]
    (if (some (fn [[method pattern]]
                (and (= method (:request-method request))
                     (re-matches pattern (:uri request))))
              method-paths)
      (handler request)
      ((wrap-json-body handler {:keywords? true}) request))))

;; --------
;; Wrappers

(defn get-index [& _args]
  "<code>Welcome to Instant's Backend!</code>")

(defroutes home-routes
  (GET "/" [] get-index))

;; Makes java.util.Date play nicely with ring's cookie middleware
(let [rfc822Formatter (SimpleDateFormat. "EEE, dd MMM yyyy HH:mm:ss Z" Locale/US)]
  (.setTimeZone rfc822Formatter (TimeZone/getTimeZone "GMT"))
  (extend java.util.Date
    CookieDateTime
    {:rfc822-format
     (fn [date]
       (.format rfc822Formatter date))}))

(defroutes stripe-webhook-routes
  (POST "/hooks/stripe" [] stripe/webhook))

(defroutes generic-webhook-routes
  (POST "/hooks/honeycomb/exceptions" [] honeycomb-api/webhook))

(defn req-origin [req]
  (get-in req [:headers "origin"]))

(defn allow-cors-origin? [req]
  (case (:uri req)
    ("/platform/oauth/start"
     "/platform/oauth/grant") false
    "/platform/oauth/claim" (= (req-origin req)
                               (config/dashboard-origin))

    true))

(defn wrap-options-cache-control [handler]
  (fn [request]
    (let [response (handler request)]
      (if (or (not (preflight? request))
              (not (allow-cors-origin? request))
              (flags/toggled? :disable-preflight-caching))
        response
        ;; If we allowed the CORs origin, add cache control headers
        (let [max-age (or (str (flags/flag :cors-max-age))
                          "600")]
          (update response :headers merge {"Vary" "origin, Access-Control-Request-Headers"
                                           "Access-Control-Max-Age" max-age
                                           "Cache-Control" (str "public, max-age=" max-age)}))))))


(defn not-found [_req]
  (response/not-found {:message "Oops! We couldn't match this route."}))

(defn handler []
  (routes (-> stripe-webhook-routes
              (wrap-routes http-util/tracer-record-route)
              (wrap-routes http-util/wrap-errors)
              (wrap-routes wrap-json-response)
              (wrap-routes http-util/tracer-wrap-span))
          (-> (routes home-routes
                      dash-routes/routes
                      runtime-routes/routes
                      admin-routes/routes
                      superadmin-routes/routes
                      storage-routes/routes
                      generic-webhook-routes
                      stripe-webhook-routes
                      health/routes
                      oauth-app-routes/routes)
              (wrap-routes http-util/tracer-record-route)
              http-util/tracer-record-attrs
              wrap-keyword-params
              wrap-params
              wrap-multipart-params
              (wrap-json-body-except #{[:put #"/dash/apps/.*/storage/upload"]
                                       [:put #"/storage/upload"]
                                       [:put #"/admin/storage/upload"]})

              http-util/wrap-errors

              wrap-json-response
              (wrap-cors :access-control-allow-origin allow-cors-origin?
                         :access-control-allow-methods [:get :put :post :delete])
              wrap-options-cache-control
              (http-util/tracer-wrap-span))
          (wrap-json-response not-found)))

(defonce ^Undertow server
  nil)

(defonce stop-gauge
  nil)

(defn start []
  (tracer/record-info! {:name "server/start" :attributes {:port (config/get-server-port)}})
  (lang/set-var! server
                 (undertow-adapter/run-undertow
                  (handler)
                  (merge
                   {:host "0.0.0.0"
                    :port (config/get-server-port)
                    :configurator (fn [^Undertow$Builder builder]
                                    (.setServerOption builder UndertowOptions/ENABLE_STATISTICS true))}
                   (when (.exists (io/file "dev-resources/certs/dev.jks"))
                     {:ssl-port 8889
                      :keystore "dev-resources/certs/dev.jks"
                      :key-password "changeit"}))))
  (lang/set-var! stop-gauge
                 (gauges/add-gauge-metrics-fn
                  (fn [_]
                    (let [^Undertow server server
                          ^Undertow$ListenerInfo listener (some-> server
                                                                  (.getListenerInfo)
                                                                  first)]
                      (when-let [stats (some-> listener
                                               (.getConnectorStatistics))]
                        [{:path "instant.server.active-connections"
                          :value (.getActiveConnections stats)}
                         {:path "instant.server.active-requests"
                          :value (.getActiveRequests stats)}
                         {:path "instant.server.max-active-connections"
                          :value (.getMaxActiveConnections stats)}
                         {:path "instant.server.max-active-requests"
                          :value (.getMaxActiveRequests stats)}
                         {:path "instant.server.max-processing-time"
                          :value (.getMaxProcessingTime stats)}]))))))

(defn stop []
  (lang/clear-var! server Undertow/.stop)
  (lang/clear-var! stop-gauge IFn/.invoke))

(defn restart []
  (stop)
  (start))

(defn shutdown-hook []
  (tracer/record-info! {:name "shut-down.start"})
  (tracer/with-span! {:name "shut-down"}
    (tracer/with-span! {:name "stop-server"}
      (stop))
    @(ua/all-of
      (future
        (tracer/with-span! {:name "stop-invalidator"}
          (inv/stop-global)))
      (future
        (tracer/with-span! {:name "stop-ephemeral"}
          (eph/stop)))
      (future
        (tracer/with-span! {:name "stop-indexing-jobs"}
          (indexing-jobs/stop)))))
  (tracer/shutdown))

(defn add-shutdown-hook []
  (.addShutdownHook
   (Runtime/getRuntime)
   (Thread.
    (fn []
      (@(resolve 'instant.core/shutdown-hook))))))

(defmacro with-log-init [operation & body]
  `(do
     (tracer/record-info! {:name (format "init.start.%s" (name ~operation))})
     (tracer/with-span! {:name (format "init.finish.%s" (name ~operation))}
       ;; Don't let ourselves be the parent of any child spans
       (binding [tracer/*span* nil]
         ~@body))))

(defn -main [& _args]
  (binding [*print-namespace-maps* false]
    (log/info "Initializing...")
    (let [{:keys [aead-keyset]} (config/init)]
      (crypt-util/init aead-keyset))

    (tracer/init)

    (with-log-init :uncaught-exception-handler
      (Thread/setDefaultUncaughtExceptionHandler
       (ua/logging-uncaught-exception-handler)))

    (with-log-init :gauges
      (gauges/start))
    (with-log-init :nrepl
      (nrepl/start))
    (with-log-init :oauth
      (oauth/start))
    (with-log-init :jwt
      (jwt/start))
    (with-log-init :aurora
      (aurora/start))
    (with-log-init :system-catalog
      (ensure-attrs-on-system-catalog-app))
    (with-log-init :reactive-store
      (rs/start))
    (with-log-init :ephemeral
      (eph/start))
    (with-log-init :stripe
      (stripe/init))
    (with-log-init :session
      (session/start))
    (with-log-init :invalidator
      (inv/start-global))
    (with-log-init :wal
      (wal/start))

    (when-let [config-app-id (config/instant-config-app-id)]
      (with-log-init :flags
        (flags-impl/init config-app-id
                         flags/queries
                         flags/query-results)))

    (with-log-init :ephemeral-app
      (ephemeral-app/start))
    (with-log-init :session-counter
      (session-counter/start))
    (with-log-init :indexing-jobs
      (indexing-jobs/start))
    (with-log-init :storage-sweeper
      (storage-sweeper/start))
    (with-log-init :app-deletion-sweeper
      (app-deletion-sweeper/start))
    (when (= (config/get-env) :prod)
      (with-log-init :analytics
        (analytics/start)))
    (when (= (config/get-env) :prod)
      (with-log-init :daily-metrics
        (daily-metrics/start)))
    (when (= (config/get-env) :prod)
      (with-log-init :welcome-email
        (welcome-email/start)))

    (with-log-init :rule-where-testing
      (rule-where-testing/start))
    (with-log-init :web-server
      (start))
    (with-log-init :shutdown-hook
      (add-shutdown-hook))
    (log/info "Finished initializing")))

(defn before-ns-unload []
  (stop))

(defn after-ns-reload []
  (start))
