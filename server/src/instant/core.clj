(ns instant.core
  (:gen-class)
  (:require
   [tool]
   [clojure.java.io :as io]
   [clojure.tools.logging :as log]
   [compojure.core :refer [defroutes GET POST routes]]
   [instant.admin.routes :as admin-routes]
   [instant.auth.jwt :as jwt]
   [instant.auth.oauth :as oauth]
   [instant.config :as config]
   [instant.dash.ephemeral-app :as ephemeral-app]
   [instant.dash.routes :as dash-routes]
   [instant.db.indexing-jobs :as indexing-jobs]
   [instant.flags :as flags]
   [instant.flags-impl :as flags-impl]
   [instant.gauges :as gauges]
   [instant.health :as health]
   [instant.honeycomb-api :as honeycomb-api]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.wal :as wal]
   [instant.lib.ring.undertow :as undertow-adapter]
   [instant.nrepl :as nrepl]
   [instant.reactive.ephemeral :as eph]
   [instant.reactive.invalidator :as inv]
   [instant.reactive.session :as session]
   [instant.reactive.store :as rs]
   [instant.runtime.routes :as runtime-routes]
   [instant.scripts.analytics :as analytics]
   [instant.scripts.daily-metrics :as daily-metrics]
   [instant.session-counter :as session-counter]
   [instant.storage.routes :as storage-routes]
   [instant.stripe :as stripe]
   [instant.superadmin.routes :as superadmin-routes]
   [instant.system-catalog-migration :refer [ensure-attrs-on-system-catalog-app]]
   [instant.util.async :as ua]
   [instant.util.crypt :as crypt-util]
   [instant.util.http :as http-util]
   [instant.util.tracer :as tracer]
   [ring.middleware.cookies :refer [CookieDateTime]]
   [ring.middleware.cors :refer [wrap-cors]]
   [ring.middleware.json :refer [wrap-json-body wrap-json-response]]
   [ring.middleware.keyword-params :refer [wrap-keyword-params]]
   [ring.middleware.multipart-params :refer [wrap-multipart-params]]
   [ring.middleware.params :refer [wrap-params]])
  (:import
   (io.undertow Undertow UndertowOptions Undertow$Builder Undertow$ListenerInfo)
   (java.text SimpleDateFormat)
   (java.util Locale TimeZone)))

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

(defn handler []
  (routes
   (-> stripe-webhook-routes

       http-util/wrap-errors

       wrap-json-response
       (wrap-cors :access-control-allow-origin [#".*"]
                  :access-control-allow-methods [:get :put :post :delete])
       http-util/tracer-wrap-span)
   (-> (routes home-routes
               dash-routes/routes
               runtime-routes/routes
               admin-routes/routes
               superadmin-routes/routes
               storage-routes/routes
               generic-webhook-routes
               health/routes)
       http-util/tracer-record-attrs
       wrap-keyword-params
       wrap-params
       wrap-multipart-params
       (wrap-json-body {:keywords? true})

       http-util/wrap-errors

       wrap-json-response
       (wrap-cors :access-control-allow-origin [#".*"]
                  :access-control-allow-methods [:get :put :post :delete])
       http-util/tracer-wrap-span)))

(defn start []
  (tracer/record-info! {:name "server/start" :attributes {:port (config/get-server-port)}})
  (def server ^Undertow (undertow-adapter/run-undertow
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
  (def stop-gauge (gauges/add-gauge-metrics-fn
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
  (when (bound? #'server)
    (.stop ^Undertow server))
  (when (bound? #'stop-gauge)
    (stop-gauge)))

(defn restart []
  (stop)
  (start))

(defn add-shutdown-hook []
  (.addShutdownHook (Runtime/getRuntime)
                    (Thread. (fn []
                               (tracer/record-info! {:name "shut-down"})
                               (tracer/with-span! {:name "stop-server"}
                                 (stop))
                               (doseq [fut [(future (tracer/with-span! {:name "stop-invalidator"}
                                                      (inv/stop-global)))
                                            (future (tracer/with-span! {:name "stop-ephemeral"}
                                                      (eph/stop)))
                                            (future (tracer/with-span! {:name "stop-indexing-jobs"}
                                                      (indexing-jobs/stop)))]]
                                 (deref fut))))))

(defn -main [& _args]
  (let [{:keys [aead-keyset]} (config/init)]
    (crypt-util/init aead-keyset))

  (tracer/init)

  (tracer/record-info! {:name "uncaught-exception-handler/set"})
  (Thread/setDefaultUncaughtExceptionHandler
   (ua/logging-uncaught-exception-handler))

  (gauges/start)
  (nrepl/start)
  (oauth/start)
  (jwt/start)
  (aurora/start)
  (ensure-attrs-on-system-catalog-app)
  (rs/start)
  (eph/start)
  (stripe/init)
  (session/start)
  (inv/start-global)
  (wal/init-cleanup)

  (when-let [config-app-id (config/instant-config-app-id)]
    (flags-impl/init config-app-id
                     flags/queries
                     flags/query-results))

  (ephemeral-app/start)
  (session-counter/start)
  (indexing-jobs/start)
  (when (= (config/get-env) :prod)
    (log/info "Starting analytics")
    (analytics/start))
  (when (= (config/get-env) :prod)
    (log/info "Starting daily metrics")
    (daily-metrics/start))
  (start)
  (add-shutdown-hook))

(defn before-ns-unload []
  (stop))

(defn after-ns-reload []
  (start))