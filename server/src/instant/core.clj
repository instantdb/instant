(ns instant.core
  (:require
   [instant.config :as config]
   [clojure.tools.logging :as log]
   [compojure.core :refer [defroutes GET POST routes]]
   [instant.gauges :as gauges]
   [instant.lib.ring.undertow :as undertow-adapter]
   [instant.dash.routes :as dash-routes]
   [instant.runtime.routes :as runtime-routes]
   [instant.admin.routes :as admin-routes]
   [instant.storage.routes :as storage-routes]
   [ring.middleware.cookies :refer [CookieDateTime]]
   [ring.middleware.cors :refer [wrap-cors]]
   [ring.middleware.json :refer [wrap-json-body wrap-json-response]]
   [ring.middleware.keyword-params :refer [wrap-keyword-params]]
   [ring.middleware.multipart-params :refer [wrap-multipart-params]]
   [ring.middleware.params :refer [wrap-params]]
   [instant.jdbc.aurora :as aurora]
   [instant.scripts.analytics :as analytics]
   [instant.nrepl :as nrepl]
   [tool]
   [instant.auth.oauth :as oauth]
   [instant.auth.jwt :as jwt]
   [instant.util.async :as ua]
   [instant.util.tracer :as tracer]
   [instant.reactive.store :as rs]
   [instant.reactive.session :as session]
   [instant.jdbc.wal :as wal]
   [instant.reactive.invalidator :as inv]
   [instant.reactive.ephemeral :as eph]
   [instant.session-counter :as session-counter]
   [instant.util.crypt :as crypt-util]
   [instant.dash.ephemeral-app :as ephemeral-app]
   [instant.stripe :as stripe]
   [instant.honeycomb-api :as honeycomb-api]
   [instant.util.http :as http-util])
  (:import
   (java.util Locale TimeZone)
   (java.text SimpleDateFormat))
  (:gen-class))

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
               storage-routes/routes
               generic-webhook-routes)
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
  (def server (undertow-adapter/run-undertow
               (handler)
               {:host "0.0.0.0"
                :port (config/get-server-port)})))

(defn stop []
  (.stop server))

(defn restart []
  (stop)
  (start))

(defn add-shutdown-hook []
  (.addShutdownHook (Runtime/getRuntime)
                    (Thread. (fn []
                               (tracer/record-info! {:name "shut-down"})
                               (tracer/with-span! {:name "stop-server"}
                                 (stop))
                               (tracer/with-span! {:name "stop-invalidator"}
                                 ;; Hack to get the invalidator to shut down in
                                 ;; dev. Otherwise the stream takes forever to close.
                                 (when (= :dev (config/get-env))
                                   (future
                                     (loop []
                                       (wal/kick-wal aurora/conn-pool)
                                       (Thread/sleep 100)
                                       (recur))))
                                 (inv/stop))))))

(defn -main [& _args]
  (let [{:keys [aead-keyset]} (config/init)]
    (crypt-util/init aead-keyset))

  (tracer/init)

  (tracer/record-info! {:name "uncaught-exception-handler/set"})
  (Thread/setDefaultUncaughtExceptionHandler
   (ua/logging-uncaught-exception-handler))

  (when (= (config/get-env) :dev)
    (tracer/record-info! {:name "humane-test-output/set"})
    (require 'pjstadig.humane-test-output)
    ((resolve 'pjstadig.humane-test-output/activate!)))

  (gauges/start)
  (nrepl/start)
  (oauth/start)
  (jwt/start)
  (aurora/start)
  (rs/start)
  (eph/start)
  (stripe/init)
  (session/start)
  (inv/start)
  (wal/init-cleanup aurora/conn-pool)
  (ephemeral-app/start)
  (session-counter/start)
  (when (= (config/get-env) :prod)
    (log/info "Starting analytics")
    (analytics/start))
  (start)
  (add-shutdown-hook))
