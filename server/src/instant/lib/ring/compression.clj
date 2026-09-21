(ns instant.lib.ring.compression
  (:require [clojure.string :as string])
  (:import
   (io.undertow.predicate Predicate)
   (io.undertow.server HttpHandler HttpServerExchange ResponseCommitListener)
   (io.undertow.server.handlers.encoding ContentEncodingRepository EncodingHandler GzipEncodingProvider)
   (io.undertow.util Headers Methods)))

(defn- compressible-response? [^HttpServerExchange exchange]
  (let [headers (.getResponseHeaders exchange)]
    (and (= 200 (.getStatusCode exchange))
         (<= 1024 (.getResponseContentLength exchange))
         (= "application/json"
            (some-> (.getFirst headers Headers/CONTENT_TYPE)
                    (string/split #";" 2)
                    first
                    string/trim
                    string/lower-case))
         (not-any? #(re-find #"(?i)(?:^|,)\s*no-transform\s*(?:,|$)" %)
                   (.get headers Headers/CACHE_CONTROL)))))

(defn- vary-accept-encoding! [^HttpServerExchange exchange]
  (let [headers (.getResponseHeaders exchange)
        varies (into #{}
                     (comp (mapcat #(string/split % #","))
                           (map string/trim)
                           (map string/lower-case))
                     (.get headers Headers/VARY))]
    (when-not (or (contains? varies "*")
                  (contains? varies "accept-encoding"))
      (.add headers Headers/VARY "Accept-Encoding"))))

(defn wrap-handler [^HttpHandler handler enabled?]
  (let [encodings (doto (ContentEncodingRepository.)
                    (.addEncodingHandler "gzip" (GzipEncodingProvider. 1) 100
                                         (reify Predicate
                                           (resolve [_ exchange]
                                             (boolean (compressible-response? exchange))))))
        compressed (EncodingHandler. handler encodings)
        vary (reify ResponseCommitListener
               (beforeCommit [_ exchange]
                 (vary-accept-encoding! exchange)))]
    (reify HttpHandler
      (handleRequest [_ exchange]
        (if (and (= Methods/POST (.getRequestMethod exchange))
                 (= "/admin/query" (.getRequestPath exchange))
                 (enabled?))
          (do
            ;; Ring sets headers later. Merge Vary when the response is committed,
            ;; including when negotiation selects the uncompressed response.
            (.addResponseCommitListener exchange vary)
            (.handleRequest compressed exchange))
          (.handleRequest handler exchange))))))
