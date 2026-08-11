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
   (java.util.concurrent Callable ExecutorService TimeUnit)
   (java.util.function Predicate)
   (javax.net.ssl SSLException)
   (okhttp3 ConnectionPool Dispatcher Dns FormBody$Builder Headers HttpUrl MediaType OkHttpClient OkHttpClient$Builder Request$Builder RequestBody Response)
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
        (followRedirects false)
        (followSslRedirects false)
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

(defn ensure-safe-host! [^HttpUrl url]
  (let [host (HttpUrl/.host url)]
    (when-let [inet-ip (smokescreen/parse-literal-ip host)]
      (when (smokescreen/bad-ip? inet-ip)
        (throw (UnknownHostException. "Could not resolve hostname."))))))

(defn send-webhook [^String url idempotency-key queue-latency-ms ^bytes body-bytes]
  (tracer/with-span! {:name "send-webhook"
                      :attributes {:url url
                                   :queue-latency-ms queue-latency-ms}}
    (let [sig (sign-webhook body-bytes)
          start (Instant/now)
          parsed-url (HttpUrl/parse url)
          request (.. (Request$Builder.)
                      (url parsed-url)
                      (header "User-Agent" "InstantDB Webhook Sender")
                      (header "Instant-Signature" (str "t=" (:t sig)
                                                       ",kid=" (:kid sig)
                                                       ",v1=" (:signature sig)))
                      (header "Idempotency-Key" (str idempotency-key))
                      (post (RequestBody/create json-type body-bytes))
                      (build))]
      (try
        (ensure-safe-host! parsed-url)
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

(defn validate-url [^String input-url]
  (let [parsed-url (HttpUrl/parse input-url)]
    (when (nil? parsed-url)
      (ex/throw-validation-err! :webhook {:url input-url} [{:message "Invalid URL."}]))
    (try
      (ensure-safe-host! parsed-url)
      (when (empty? (.lookup (.dns client)
                             (HttpUrl/.host parsed-url)))
        (throw (Exception. "Could not resolve URL.")))
      (catch Exception _
        (ex/throw-validation-err! :webhook {:url input-url} [{:message "Could not resolve URL."}])))))

(defn assert-safe-url!
  "Parses url and rejects it if unparseable or if its host is an unsafe (SSRF)
   literal IP. Does not make a request. Returns the parsed HttpUrl."
  ^HttpUrl [^String url]
  (let [parsed-url (HttpUrl/parse url)]
    (when (nil? parsed-url)
      (ex/throw-validation-err! :url {:url url} [{:message "Invalid URL."}]))
    (ensure-safe-host! parsed-url)
    parsed-url))

(defn- response-headers->map [^Headers hs]
  (into {} (map (fn [^String n] [(.toLowerCase n) (.get hs n)])) (.names hs)))

(def max-response-bytes
  "Upper bound on bytes read from a guarded response body, to bound memory for
   hostile endpoints that return unbounded/oversized responses."
  (* 5 1024 1024))

(defn- read-capped-body ^String [^Response response]
  (when (.body response)
    ;; peekBody buffers at most (inc limit) bytes without reading the rest, so
    ;; an oversized/unbounded body is capped even with no Content-Length header.
    (let [bytes (.. response
                    (peekBody (inc (long max-response-bytes)))
                    (bytes))]
      (when (> (alength bytes) max-response-bytes)
        (throw (ex-info "Response body exceeds size limit"
                        {:limit max-response-bytes})))
      (String. bytes StandardCharsets/UTF_8))))

(defn- execute-response [^Request$Builder builder headers]
  (doseq [[k v] headers]
    (.header builder ^String k ^String v))
  (with-open [response (.. client
                           (newCall (.build builder))
                           (execute))]
    {:success? (.isSuccessful response)
     :status (.code response)
     :headers (response-headers->map (.headers response))
     :body (read-capped-body response)}))

(defn safe-get
  "SSRF-safe HTTP GET using the guarded client (SSRF-defending DNS resolver plus
   literal-IP check, no redirects). Returns {:success? bool :status int :body
   string}. Throws for an unparseable URL, an unsafe host, or a network error."
  [^String url & {:keys [headers]}]
  (let [parsed-url (assert-safe-url! url)]
    (execute-response (doto (Request$Builder.) (.url parsed-url)) headers)))

(defn safe-post-form
  "SSRF-safe form-encoded HTTP POST using the guarded client. form-params is a
   map of name -> value. Same return/throw contract as safe-get."
  [^String url form-params & {:keys [headers]}]
  (let [parsed-url (assert-safe-url! url)
        form (FormBody$Builder.)]
    (doseq [[k v] form-params]
      (.add form (name k) (str v)))
    (execute-response (doto (Request$Builder.)
                        (.url parsed-url)
                        (.post (.build form)))
                      headers)))
