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
   (java.net InetSocketAddress URI)
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

(deftest target-config-validation
  (let [app-id (random-uuid)]
    (is (= {app-id (URI. "https://example.com")}
           (app-proxy/parse-targets {(str app-id) "https://example.com/"})))
    (testing "invalid app ids and non-origin targets are ignored"
      (is (= {}
             (app-proxy/parse-targets
              {"not-an-app" "https://example.com"
               (str app-id) "https://user@example.com/path?query=yes"}))))))

(deftest body-app-id-extraction
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
        target-fn #(when (= app-id %) upstream-uri)
        proxy (undertow/run-undertow
               local-handler
               {:host "127.0.0.1"
                :port 0
                :handler-proxy #(app-proxy/handler-proxy % target-fn)})
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
