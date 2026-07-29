(ns instant.app-proxy-test
  (:require
   [clj-http.client :as http]
   [clojure.test :refer [deftest is testing]]
   [instant.app-proxy :as app-proxy]
   [instant.lib.ring.undertow :as undertow]
   [instant.lib.ring.websocket :as ws]
   [instant.util.json :as json])
  (:import
   (instant.lib.ring.undertow Server)
   (io.undertow Undertow$ListenerInfo)
   (java.net InetSocketAddress ServerSocket URI)
   (java.net.http HttpClient WebSocket WebSocket$Listener)
   (java.util.concurrent CompletableFuture TimeUnit)))

(defn listener-port [server]
  (let [^Undertow$ListenerInfo info (first (Server/.getListenerInfo server))
        ^InetSocketAddress address (.getAddress info)]
    (.getPort address)))

(defn upstream-handler [req]
  (if (= "/runtime/session" (:uri req))
    {:undertow/websocket
     {:on-message (fn [{:keys [channel data]}]
                    (ws/send-json! nil {:echo data} channel))}}
    {:status 200
     :headers {"content-type" "application/json"}
     :body (json/->json
            {:method (name (:request-method req))
             :uri (:uri req)
             :query-string (:query-string req)
             :host (get-in req [:headers "host"])
             :body (slurp (:body req))})}))

(defn local-handler [_req]
  {:status 418
   :body "local"})

(deftest extracts-app-id-from-body
  (let [app-id (random-uuid)
        json-body (.getBytes (json/->json {:app-id app-id}) "UTF-8")
        form-body (.getBytes (str "app_id=" app-id) "UTF-8")
        oauth-state (.getBytes (str "state=" app-id (random-uuid)) "UTF-8")]
    (is (= app-id (app-proxy/body-app-id "application/json" json-body)))
    (is (= app-id (app-proxy/body-app-id
                   "application/x-www-form-urlencoded"
                   form-body)))
    (is (= app-id (app-proxy/body-app-id
                   "application/x-www-form-urlencoded"
                   oauth-state)))))

(deftest proxies-http-and-websocket-requests
  (let [app-id (random-uuid)
        upstream (undertow/run-undertow upstream-handler
                                        {:host "127.0.0.1"
                                         :port 0})
        upstream-uri (URI. (str "http://127.0.0.1:" (listener-port upstream)))
        proxy (undertow/run-undertow
               local-handler
               {:host "127.0.0.1"
                :port 0
                :handler-proxy #(app-proxy/handler-proxy % (constantly {app-id upstream-uri}))})
        proxy-origin (str "http://127.0.0.1:" (listener-port proxy))]
    (try
      (testing "admin requests are selected from the app-id header"
        (let [response (http/post
                        (str proxy-origin "/admin/query?app_id=" app-id)
                        {:headers {"app-id" (str app-id)
                                   "content-type" "application/json"}
                         :body "{\"query\":{}}"
                         :as :json})]
          (is (= 200 (:status response)))
          (is (= "post" (get-in response [:body :method])))
          (is (= "/admin/query" (get-in response [:body :uri])))
          (is (= (str "app_id=" app-id)
                 (get-in response [:body :query-string])))
          (is (= (str "127.0.0.1:" (listener-port upstream))
                 (get-in response [:body :host])))
          (is (= "{\"query\":{}}" (get-in response [:body :body])))))

      (testing "upload request bodies remain intact"
        (let [response (http/put
                        (str proxy-origin "/storage/upload")
                        {:headers {"app_id" (str app-id)
                                   "content-type" "application/octet-stream"}
                         :body "file contents"
                         :as :json})]
          (is (= 200 (:status response)))
          (is (= "put" (get-in response [:body :method])))
          (is (= "file contents" (get-in response [:body :body])))))

      (testing "current body-only auth requests are restored before proxying"
        (let [body (json/->json {:app-id app-id
                                 :email "person@example.com"})
              response (http/post
                        (str proxy-origin "/runtime/auth/send_magic_code")
                        {:content-type :json
                         :body body
                         :as :json})]
          (is (= 200 (:status response)))
          (is (= body (get-in response [:body :body])))))

      (testing "an unrelated UUID earlier in the path does not shadow the app id"
        (let [path (str "/runtime/" (random-uuid) "/" app-id "/config")
              response (http/get (str proxy-origin path) {:as :json})]
          (is (= 200 (:status response)))
          (is (= path (get-in response [:body :uri])))))

      (testing "unmapped apps stay on the local handler"
        (let [response (http/get
                        (str proxy-origin "/runtime/session?app_id=" (random-uuid))
                        {:throw-exceptions false})]
          (is (= 418 (:status response)))
          (is (= "local" (:body response)))))

      (testing "websocket upgrades are proxied"
        (let [message (promise)
              listener (reify WebSocket$Listener
                         (onOpen [_ socket]
                           (.request socket 1))
                         (onText [_ socket data _last?]
                           (deliver message (str data))
                           (.request socket 1)
                           (CompletableFuture/completedFuture nil)))
              socket (-> (HttpClient/newHttpClient)
                         (.newWebSocketBuilder)
                         (.buildAsync
                          (URI. (str "ws://127.0.0.1:"
                                     (listener-port proxy)
                                     "/runtime/session?app_id="
                                     app-id))
                          listener)
                         (.get 5 TimeUnit/SECONDS))]
          (-> socket
              (.sendText "hello" true)
              (.get 5 TimeUnit/SECONDS))
          (is (= "{\"echo\":\"hello\"}" (deref message 5000 ::timeout)))
          (-> socket
              (.sendClose WebSocket/NORMAL_CLOSURE "")
              (.get 5 TimeUnit/SECONDS))))
      (finally
        (Server/.stop proxy)
        (Server/.stop upstream)))))

(deftest leaves-requests-alone-without-configured-targets
  ;; Body inspection buffers and caps request bodies, so it must not run when
  ;; nothing is being proxied.
  (let [proxy (undertow/run-undertow
               local-handler
               {:host "127.0.0.1"
                :port 0
                :handler-proxy #(app-proxy/handler-proxy % (constantly {}))})
        oversized-body (apply str (repeat (* 280 1024) "x"))]
    (try
      (let [response (http/post
                      (str "http://127.0.0.1:" (listener-port proxy)
                           "/runtime/auth/send_magic_code")
                      {:content-type :json
                       :body oversized-body
                       :throw-exceptions false})]
        (is (= 418 (:status response)))
        (is (= "local" (:body response))))
      (finally
        (Server/.stop proxy)))))

(deftest bounds-body-inspection-when-routing-is-active
  (let [proxy (undertow/run-undertow
               local-handler
               {:host "127.0.0.1"
                :port 0
                :handler-proxy #(app-proxy/handler-proxy
                                 %
                                 (constantly {(random-uuid)
                                              (URI. "http://127.0.0.1:1")}))})
        oversized-body (apply str (repeat (* 280 1024) "x"))]
    (try
      (let [response (http/post
                      (str "http://127.0.0.1:" (listener-port proxy)
                           "/runtime/auth/send_magic_code")
                      {:content-type :json
                       :body oversized-body
                       :throw-exceptions false})]
        (is (= 413 (:status response))))
      (finally
        (Server/.stop proxy)))))

(deftest fails-closed-when-target-is-down
  ;; Serving a proxied app from the local handler while its target is down
  ;; would silently write to the wrong backend.
  (let [app-id (random-uuid)
        dead-port (with-open [socket (ServerSocket. 0)]
                    (.getLocalPort socket))
        proxy (undertow/run-undertow
               local-handler
               {:host "127.0.0.1"
                :port 0
                :handler-proxy #(app-proxy/handler-proxy
                                 %
                                 (constantly {app-id (URI. (str "http://127.0.0.1:" dead-port))}))})
        proxy-origin (str "http://127.0.0.1:" (listener-port proxy))]
    (try
      (testing "both the connection failure and the problem-host window return 503"
        (dotimes [_ 2]
          (let [response (http/get
                          (str proxy-origin "/runtime/session?app_id=" app-id)
                          {:throw-exceptions false})]
            (is (= 503 (:status response))))))
      (testing "other apps still reach the local handler"
        (let [response (http/get
                        (str proxy-origin "/runtime/session?app_id=" (random-uuid))
                        {:throw-exceptions false})]
          (is (= 418 (:status response)))
          (is (= "local" (:body response)))))
      (finally
        (Server/.stop proxy)))))
