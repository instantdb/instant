(ns instant.lib.ring.undertow-test
  (:require
   [clj-http.client :as clj-http]
   [clojure.test :refer [deftest is]]
   [instant.lib.ring.undertow :as undertow])
  (:import
   (instant.lib.ring.undertow Server)
   (io.undertow Undertow$ListenerInfo)
   (java.net InetSocketAddress)
   (java.util.concurrent CountDownLatch TimeUnit)))

(defn slow-handler
  "Ring handler with two routes:
   - /slow: counts down `entered`, awaits `release`, then returns 200.
   - /fast: returns 200 immediately."
  [^CountDownLatch entered ^CountDownLatch release]
  (fn [req]
    (case (:uri req)
      "/slow" (do
                (.countDown entered)
                (.await release 10 TimeUnit/SECONDS)
                {:status 200 :body "slow"})
      "/fast" {:status 200 :body "fast"}
      {:status 404 :body "not found"})))

(defn listener-port [server]
  (let [^Undertow$ListenerInfo info (first (Server/.getListenerInfo server))
        ^InetSocketAddress addr (.getAddress info)]
    (.getPort addr)))

(deftest graceful-shutdown-rejects-new-completes-in-flight
  (let [entered (CountDownLatch. 1)
        release (CountDownLatch. 1)
        server (undertow/run-undertow (slow-handler entered release)
                                      {:host "127.0.0.1"
                                       :port 0
                                       :graceful-shutdown? true})
        url (fn [path] (str "http://127.0.0.1:" (listener-port server) path))]
    (try
      ;; Kick off an in-flight request that will block in the handler.
      (let [slow-future (future
                          (clj-http/get (url "/slow")
                                        {:throw-exceptions false
                                         :socket-timeout 15000
                                         :connection-timeout 5000}))]
        (is (.await entered 5 TimeUnit/SECONDS)
            "slow handler should be entered before we start the shutdown")

        ;; Begin graceful shutdown while the request is still in flight.
        (Server/.shutdownGracefully server)

        ;; New requests should now be rejected with 503.
        (let [resp (clj-http/get (url "/fast")
                                 {:throw-exceptions false
                                  :socket-timeout 5000
                                  :connection-timeout 5000})]
          ;; In prod, the instance will have been removed from the load
          ;; balancer before we call shutdown on the server.
          (is (= 503 (:status resp))
              "post-shutdown requests should get 503"))

        ;; Let the slow handler finish.
        (.countDown release)

        ;; The in-flight request should have been allowed to complete.
        (let [resp @slow-future]
          (is (= 200 (:status resp))
              "in-flight request should complete normally")
          (tool/def-locals)
          (is (= "slow" (:body resp))))

        ;; With no requests in flight, awaitShutdown should return promptly.
        (Server/.awaitShutdown server 5000))
      (finally
        ;; Unblock the slow handler if the test failed before releasing.
        (.countDown release)
        (Server/.stop server)))))
