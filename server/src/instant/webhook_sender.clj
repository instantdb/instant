(ns instant.webhook-sender
  (:require
   [instant.config :as config]
   [instant.smokescreen :as smokescreen]
   [instant.util.async :as ua]
   [instant.util.crypt :as crypt]
   [instant.util.defrecord :refer [defrecord-once]]
   [instant.util.exception :as ex]
   [instant.util.tracer :as tracer])
  (:import
   (java.io IOException InterruptedIOException)
   (java.net ConnectException ProtocolException UnknownHostException)
   (java.nio ByteBuffer)
   (java.nio.charset StandardCharsets)
   (java.time Duration Instant)
   (java.util Collection)
   (java.util.concurrent ExecutorService TimeUnit)
   (java.util.function Predicate)
   (javax.net.ssl SSLException)
   (okhttp3 ConnectionPool Dispatcher Dns HttpUrl MediaType OkHttpClient OkHttpClient$Builder Request$Builder RequestBody)
   (okhttp3.dnsoverhttps DnsOverHttps DnsOverHttps$Builder)))

(def ^{:tag 'bytes} period-bytes (.getBytes "." StandardCharsets/UTF_8))

(defn sign-webhook [^bytes body-bytes]
  (let [t (-> (Instant/now)
              (.getEpochSecond)
              str)
        t-bytes (.getBytes t StandardCharsets/UTF_8)
        buf (doto (ByteBuffer/allocate (+ (alength t-bytes)
                                          (alength period-bytes)
                                          (alength body-bytes)))
              (.put t-bytes)
              (.put period-bytes)
              (.put body-bytes))]
    (assoc (crypt/signature-sign (config/webhook-signing-key) (.array buf))
           :t t)))

(defn make-dns-client ^DnsOverHttps [executor url]
  (.. (DnsOverHttps$Builder.)
      (client (.. (OkHttpClient$Builder.)
                  (dispatcher (Dispatcher. executor))
                  (callTimeout 10 TimeUnit/SECONDS)
                  (build)))
      (url (HttpUrl/parse url))
      (build)))

(defn race-dns-resolve [^ExecutorService executor clients hostname]
  (tracer/with-span! {:name "webhook-sender/race-dns-resolve"
                      :attributes {:hostname hostname}}
    (let [runners (mapv (fn [client]
                          (reify Callable
                            (call [_]
                              {:tag (:tag client)
                               :result (DnsOverHttps/.lookup (:resolver client) hostname)})))
                        clients)
          winner (.invokeAny executor runners)]
      (tracer/add-data! {:attributes {:winner (:tag winner)}})
      (:result winner))))

(def ^{:tag Predicate} bad-ip? (reify Predicate
                                 (test [_ inet-ip]
                                   (smokescreen/bad-ip? inet-ip))))

(defn make-dns-resolver
  "Creates a custom DNS resolver that defends against SSRF, where a
   malicious user attempts to make requests to internal resources."
  [executor]
  (let [dns-clients [{:tag :cloudflare
                      :resolver (make-dns-client executor "https://cloudflare-dns.com/dns-query")}
                     {:tag :google
                      :resolver (make-dns-client executor "https://dns.google/dns-query")}]]
    (reify Dns
      (lookup [_ hostname]
        (let [ips (race-dns-resolve executor dns-clients hostname)]
          ;; Mutates in place (dns resolver returns an ArrayList)
          (Collection/.removeIf ips bad-ip?)
          ips)))))

(defn make-client ^OkHttpClient []
  (let [executor (ua/make-virtual-thread-executor)
        dispatcher (Dispatcher. executor)
        pool (ConnectionPool.)
        dns (make-dns-resolver executor)]
    (.. (OkHttpClient$Builder.)
        (connectionPool pool)
        ;; Total time for the full request, including dns lookup
        (callTimeout 20 TimeUnit/SECONDS)
        (dispatcher dispatcher)
        (dns dns)
        (build))))

(def ^{:tag OkHttpClient} client (make-client))

(def ^{:tag MediaType} json-type (MediaType/parse "application/json; charset=utf-8"))

(defrecord-once WebhookAttempt [attempt-at
                                duration-ms
                                success?
                                status-code
                                response-text
                                error-type
                                error-message])

(defn make-exception-attempt [start internal-msg error-type error-message]
  (tracer/add-data! {:success false
                     :error-type error-type
                     :internal-error-message internal-msg})
  (->WebhookAttempt start
                    (.toMillis (Duration/between start (Instant/now)))
                    false
                    nil
                    nil
                    error-type
                    error-message))

(defn classify-throwable
  "Walks the cause chain, returning [error-type error-message] for the
   first exception (or cause) that matches a known type."
  [^Throwable e]
  (loop [t e]
    (when t
      (or (condp instance? t
            InterruptedIOException ["timeout" "Request timed out."]
            UnknownHostException ["dns" "Could not resolve hostname."]
            ConnectException ["connect" "Could not connect to server."]
            SSLException ["tls" "TLS handshake failed."]
            ProtocolException ["protocol" "Invalid HTTP response."]
            IOException ["network" "Network error."]
            nil)
          (recur (.getCause t))))))

(defn send-webhook [^String url idempotency-key ^bytes body-bytes]
  (tracer/with-span! {:name "send-webhook"
                      :attributes {:url url}}
    (let [sig (sign-webhook body-bytes)
          start (Instant/now)
          request (.. (Request$Builder.)
                      (url url)
                      (header "User-Agent" "InstantDB Webhook Sender")
                      (header "Instant-Signature" (str "t=" (:t sig)
                                                       ",kid=" (:kid sig)
                                                       ",v1=" (:signature sig)))
                      (header "Idempotency-Key" (str idempotency-key))
                      (post (RequestBody/create json-type body-bytes))
                      (build))]
      (try
        (with-open [response (.. client
                                 (newCall request)
                                 (execute))]
          (let [success? (.isSuccessful response)
                response-text (.. response
                                  (peekBody 256)
                                  (string))
                code (.code response)]
            (tracer/add-data! {:success success?
                               :code code})
            (->WebhookAttempt start
                              (.toMillis (Duration/between start (Instant/now)))
                              success?
                              code
                              response-text
                              nil
                              nil)))
        (catch Exception e
          (let [[error-type error-message] (or (classify-throwable e)
                                               ["unknown" "Unknown error."])]
            (make-exception-attempt start (.getMessage e) error-type error-message)))))))

(defn validate-url [^String url]
  (let [url (try
              (HttpUrl/parse url)
              (catch Exception _
                (ex/throw-validation-err! :webhook {:url url} [{:message "Invalid URL."}])))]
    (try
      (dorun (.lookup (.dns client)
                      (HttpUrl/.host url)))
      (catch Exception _
        (ex/throw-validation-err! :webhook {:url url} [{:message "Could not resolve URL."}])))))
