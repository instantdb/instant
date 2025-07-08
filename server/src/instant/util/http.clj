(ns instant.util.http
  (:require
   [clojure.string :as string]
   [instant.util.exception :as ex]
   [instant.util.token :as token-util]
   [instant.util.tracer :as tracer]
   [ring.util.http-response :as response]
   [ring.middleware.cors :as cors]))

(defn coerce-bearer-token [bearer-token]
  (some-> bearer-token
          (string/split #"Bearer ")
          last
          string/trim
          token-util/coerce-token-from-string))

(defn req->bearer-token! [req]
  (ex/get-param! req
                 [:headers "authorization"]
                 coerce-bearer-token))


(defn req->bearer-token [req]
  (if-let [header (get-in req [:headers "authorization"])]
    (coerce-bearer-token header)
    nil))

;; ----------
;; Middleware

(defn tracer-record-attrs [handler]
  (fn [request]
    (let [{:keys [uri request-method headers query-params]} request
          app-id (or (get headers "app-id")
                     (get query-params "app-id")
                     (get query-params "app_id")
                     (get query-params :app-id)
                     (get query-params :app_id))
          cli-version (get headers "instant-cli-version")
          core-version (get headers "instant-core-version")
          admin-version (get headers "instant-admin-version")
          origin (get headers "origin")
          attrs {:request-uri uri
                 :request-method request-method
                 :method request-method
                 :origin origin
                 :app-id app-id
                 :cli-version cli-version
                 :core-version core-version
                 :admin-version admin-version
                 ;; cloudflare tracking id
                 :cf-ray-id (get headers "cf-ray")
                 ;; cloudfront tracking id
                 :amz-cf-id (get headers "x-amz-cf-id")
                 ;; amazon load balancer trace id
                 :amzn-trace-id (get headers "x-amzn-trace-id")}]
      (tracer/add-data! {:attributes attrs})
      (handler request))))

(defn tracer-record-route
  "Use with compojure.core/wrap-routes so that the route is added to the
   request when we get it."
  [handler]
  (fn [request]
    (when-let [route (-> request
                         :compojure/route
                         second)]
      (let [app-id (or (:app_id (:params request))
                       (:app-id (:params request)))]
        (tracer/add-data! {:attributes (cond-> {:route route}
                                         app-id (assoc :app-id app-id))})))
    (handler request)))

(defn tracer-wrap-span
  "Wraps standard http requests within a span."
  [handler]
  (fn [request]
    (if (or (:websocket? request)
            (cors/preflight? request))
      ;; We skip websocket requests;
      ;; Because websockets are long-lived,
      ;; a parent-span doesn't make sense.
      (handler request)
      (tracer/with-span! {:name "http-req"}
        (let [{:keys [status] :as response}  (handler request)]
          (tracer/add-data! {:attributes {:status status}})
          response)))))

(defn- instant-ex->bad-request [instant-ex]
  (let [{:keys [::ex/type ::ex/message ::ex/hint ::ex/trace-id]} (ex-data instant-ex)]
    (condp contains? type
      ex/bad-request-types
      (cond-> {:type (keyword (name type))
               :message message
               :hint hint}
        trace-id (assoc :trace-id trace-id))

      ;; Oauth providers expect an `error` key
      #{::ex/oauth-error}
      {:type (keyword (name type))
       :error message}

      nil)))

(defn wrap-errors
  "Captures exceptions thrown by the handler. We: 
    1. Log the exception 
    2. Return an appropriate HTTP response 

   Some `instant-ex` exceptions are converted to bad-requests."
  [handler]
  (fn [request]
    (try
      (handler request)
      (catch Exception e
        (let [instant-ex (ex/find-instant-exception e)
              {::ex/keys [type message hint trace-id]} (ex-data instant-ex)
              bad-request (when instant-ex
                            (instant-ex->bad-request instant-ex))]
          (cond
            bad-request (cond (-> bad-request :hint :args first :auth?)
                              (do (tracer/record-exception-span! e {:name "instant-ex/unauthorized"})
                                  (response/unauthorized bad-request))

                              (= type ::ex/timeout)
                              (do (tracer/record-exception-span! e {:name "instant-ex/timeout"})
                                  (response/too-many-requests bad-request))

                              (= type ::ex/rate-limited)
                              (do
                                ;; Don't throw an error or we'll overwhelm honeycomb
                                (tracer/add-data! {:attributes {:rate-limited? true}})
                                (response/too-many-requests bad-request))

                              :else
                              (do (tracer/record-exception-span! e {:name "instant-ex/bad-request"})
                                  (response/bad-request bad-request)))

            instant-ex (do (tracer/add-exception! instant-ex {:escaping? false})
                           (response/internal-server-error
                            (cond-> {:type (keyword (name type))
                                     :message message
                                     :hint (assoc hint :debug-uri (tracer/span-uri))}
                              trace-id (assoc :trace-id trace-id))))
            :else (do  (tracer/add-exception! e {:escaping? false})
                       (response/internal-server-error
                        (cond-> {:type :unknown
                                 :message "Something went wrong. Please ping `debug-uri` in #bug-and-questions, and we'll take a look. Sorry about this!"
                                 :hint {:debug-uri (tracer/span-uri)}}
                          trace-id (assoc :trace-id trace-id))))))))))
