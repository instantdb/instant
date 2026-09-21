(ns instant.lib.ring.compression-test
  (:require
   [clj-http.client :as http]
   [clojure.string :as string]
   [clojure.test :refer [deftest is testing]]
   [instant.lib.ring.compression :as compression]
   [instant.lib.ring.undertow :as undertow]
   [instant.lib.ring.undertow-test :refer [listener-port]])
  (:import
   (instant.lib.ring.undertow Server)
   (io.undertow.server.handlers BlockingHandler)
   (java.io ByteArrayInputStream)
   (java.util Base64 Random)
   (java.util.zip GZIPInputStream)))

(defn with-server [f]
  (let [response (atom nil)
        enabled? (atom true)
        server (undertow/run-undertow
                (fn [_] @response)
                {:host "127.0.0.1"
                 :port 0
                 :io-threads 2
                 :worker-threads 4
                 :handler-proxy (fn [handler]
                                  (compression/wrap-handler
                                   (BlockingHandler. ((undertow/undertow-handler {}) handler))
                                   #(deref enabled?)))})
        request (fn [opts]
                  (http/request
                   (merge {:method :post
                           :url (str "http://127.0.0.1:" (listener-port server)
                                     (get opts :path "/admin/query"))
                           :headers {"Accept-Encoding" "gzip"}
                           :as :byte-array
                           :decompress-body false
                           :throw-exceptions false
                           :socket-timeout 5000
                           :connection-timeout 5000}
                          (dissoc opts :path))))]
    (try
      (f response enabled? request)
      (finally (Server/.stop server)))))

(defn gunzip [body]
  (with-open [in (GZIPInputStream. (ByteArrayInputStream. body))]
    (String. (.readAllBytes in) "UTF-8")))

(defn vary-tokens [response]
  (let [vary (get-in response [:headers "vary"])]
    (->> (if (string? vary) [vary] vary)
         (mapcat #(string/split % #","))
         (map (comp string/lower-case string/trim)))))

(deftest negotiated-compression
  (with-server
    (fn [response enabled? request]
      (let [body (str "{\"message\":\"" (apply str (repeat 500 "hello 世界🌍 ")) "\"}")]
        (reset! response {:status 200
                          :headers {"Content-Type" "application/json; charset=utf-8"
                                    "Vary" "Origin"}
                          :body body})
        (testing "gzip round-trips Unicode and advertises the wire length"
          (let [r (request {})
                wire-length (alength ^bytes (:body r))]
            (is (= 200 (:status r)))
            (is (= "gzip" (get-in r [:headers "content-encoding"])))
            (is (= body (gunzip (:body r))))
            (is (< wire-length (/ (alength (.getBytes body "UTF-8")) 2)))
            (is (= #{"origin" "accept-encoding"} (set (vary-tokens r))))
            (when-let [length (get-in r [:headers "content-length"])]
              (is (= wire-length (parse-long length))))))
        (testing "negotiation preserves identity clients"
          (doseq [accept [nil "identity" "br" "gzip;q=0" "gzip;q=0, *" "gzip;q=0.5, identity;q=1" "*"]]
            (let [r (request {:headers (if accept {"Accept-Encoding" accept} {})})]
              (is (= 200 (:status r)) accept)
              (is (contains? #{nil "identity"} (get-in r [:headers "content-encoding"])) accept)
              (is (= body (String. ^bytes (:body r) "UTF-8")) accept)
              (is (= #{"origin" "accept-encoding"} (set (vary-tokens r))) accept))))
        (testing "a standard HTTP client decodes gzip automatically"
          (is (= body (:body (request {:decompress-body true :as :text})))))
        (testing "Vary tokens are preserved without duplication"
          (doseq [vary ["Origin, ACCEPT-Encoding" "*"]]
            (swap! response assoc-in [:headers "Vary"] vary)
            (let [tokens (vary-tokens (request {}))]
              (is (= (count tokens) (count (set tokens))))
              (is (= (if (= vary "*") #{"*"} #{"origin" "accept-encoding"})
                     (set tokens))))))
        (testing "the runtime switch takes effect without restarting"
          (reset! enabled? false)
          (let [r (request {})]
            (is (nil? (get-in r [:headers "content-encoding"])))
            (is (= body (String. ^bytes (:body r) "UTF-8"))))
          (reset! enabled? true)
          (is (= "gzip" (get-in (request {}) [:headers "content-encoding"]))))))))

(deftest compression-boundaries
  (with-server
    (fn [response _ request]
      (let [body (str "\"" (apply str (repeat 1022 "a")) "\"")
            base {:status 200 :headers {"Content-Type" "application/json"} :body body}]
        (reset! response base)
        (testing "the 1024-byte threshold is inclusive"
          (is (= body (gunzip (:body (request {})))))
          (swap! response assoc :body (str "\"" (apply str (repeat 1021 "a")) "\""))
          (is (nil? (get-in (request {}) [:headers "content-encoding"]))))
        (testing "errors, SSE, no-transform and encoded responses are unchanged"
          (doseq [r [(assoc base :status 400)
                     (assoc-in base [:headers "Content-Type"] "text/event-stream")
                     (assoc-in base [:headers "Cache-Control"] "private, no-transform")
                     (assoc-in base [:headers "Content-Encoding"] "br")]]
            (reset! response r)
            (let [result (request {})]
              (is (= (:status r) (:status result)))
              (is (= (get-in r [:headers "Content-Encoding"])
                     (get-in result [:headers "content-encoding"])))
              (is (= body (String. ^bytes (:body result) "UTF-8"))))))
        (testing "an unknown-length stream is not compressed"
          (let [stream-body (apply str (repeat 100 body))]
            (reset! response (assoc base :body (ByteArrayInputStream. (.getBytes stream-body "UTF-8"))))
            (let [r (request {})]
              (is (nil? (get-in r [:headers "content-encoding"])))
              (is (= stream-body (String. ^bytes (:body r) "UTF-8"))))))
        (reset! response base)
        (testing "other methods and paths bypass encoding negotiation"
          (doseq [opts [{:method :get} {:method :options} {:path "/runtime/query"}]]
            (let [r (request (assoc opts :headers {"Accept-Encoding" "*;q=0"}))]
              (is (= 200 (:status r)))
              (is (nil? (get-in r [:headers "content-encoding"])))
              (is (nil? (get-in r [:headers "vary"]))))))))))

(deftest compressed-response-larger-than-undertow-buffer
  (with-server
    (fn [response _ request]
      (let [bytes (byte-array 100000)
            _ (.nextBytes (Random. 42) bytes)
            body (str "\"" (.encodeToString (Base64/getEncoder) bytes) "\"")]
        (reset! response {:status 200 :headers {"Content-Type" "application/json"} :body body})
        (let [r (request {})]
          (is (< 16384 (alength ^bytes (:body r))))
          (is (= body (gunzip (:body r))))
          (when-let [length (get-in r [:headers "content-length"])]
            (is (= (alength ^bytes (:body r)) (parse-long length)))))))))
