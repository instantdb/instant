(ns instant.util.aws-signature
  "Implements AWS' Signature Version 4. [1] 
   
   We use these to generate S3 presigned URLs.
   
   Why not use the Java SDK directly to generate presigned URLs? 
     We need a way to set the signing time. 
     A consistent signing-time gives us stable URLs which browsers can cache. 
   
   This code was originally imported from clj-aws-sign [2]

   [1] https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_sigv-create-signed-request.html
   [2] https://github.com/joseferben/clj-aws-sign/blob/master/src/clj_aws_sign/core.clj"
  (:require
   [clojure.string :as str]
   [instant.util.crypt :as crypt-util])
  (:import
   (java.net URLEncoder)
   (java.time ZonedDateTime ZoneId Instant Duration)
   (java.time.format DateTimeFormatter)))

(set! *warn-on-reflection* true)

;; ------------
;; Constants 

(def sig-algorithm "AWS4-HMAC-SHA256")

(def unsigned-payload "UNSIGNED-PAYLOAD")

(def empty-sha256 "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")

;; ------------------------
;; CanonicalRequest 

(defn- url-encode
  "Percent encode the string to put in a URL."
  [^String s]
  (-> s
      (URLEncoder/encode "UTF-8")
      (.replace "+" "%20")
      (.replace "*" "%2A")
      (.replace "%7E" "~")))

(defn- ->canonical-path-str
  "The `CanonicalURI` part of a CanonicalRequest string. 
   
   Note, though Amazon calls this a `CanonicalURI`, it is in fact _just_ 
   the path component of a URI. 

   Rules: 
    The URI-encoded version of the absolute path component URI, 
    starting with the / that follows the domain name and up to 
    the end of the string or to the question mark character (?)
    if you have query string parameters. 
    
    If the absolute path is empty, use a forward slash character (/)."
  [^String path]
  (->> (.split path "/" -1)
       (map url-encode)
       (str/join "/")))

(defn- kv-sort [[k1 v1] [k2 v2]]
  (if (not= k1 k2)
    (compare k1 k2)
    (compare v1 v2)))

(defn- ->canonical-query-str
  "Generates the `CanonicalQueryString` part of a CanonicalRequest string. 
  
  Rules:  
   The URI-encoded query string parameters. 
   You URI-encode each name and value individually. 
   You must also sort the parameters in the canonical query string alphabetically by key name. 
   The sorting occurs after encoding"
  [query]
  (->> query
       (map #(map (comp url-encode str) %))
       (sort kv-sort)
       (map (fn [pair] (str/join "=" pair)))
       (str/join "&")))

(defn- ->canonical-headers-str
  "Generates the `CanonicalHeaders` part of a CanonicalRequest string. 

   Note: The input `headers` _must_ already come sorted & transformed. 
         see `create-sig-request`. 

   Rules: 
    <headername>:<value>\n"
  [canonical-headers]
  (let [s (StringBuilder.)]
    (doseq [[k v] canonical-headers]
      (doto s
        (.append k) (.append ":") (.append v) (.append "\n")))
    (.toString s)))

(defn- ->signed-headers-str
  "Generates the `SignedHeaders` part of a CanonicalRequest. 
   
   Note: The input `headers` _must_ already come sorted & transformed. 
         see `create-sig-request`. 
   
   Rules: 
    <headername>;<headername>;..."
  [canonical-headers]
  (str/join ";" (keys canonical-headers)))

(defn- ->hashed-payload-str
  "Generates the `HashedPayload` part of a CanonicalRequest string.
  
   Rules: 
    Hex(SHA256Hash(<payload>)) 
   
    For Amazon S3, include the literal string UNSIGNED-PAYLOAD 
    when constructing a canonical request, and set the same value as the x-amz-content-sha256 
    header value when sending the request."
  [{:keys [payload headers] :as _sig-request}]
  (let [content-sha-header (get headers "x-amz-content-sha256")]
    (cond
      content-sha-header content-sha-header
      (nil? payload) empty-sha256
      (= payload unsigned-payload) unsigned-payload
      :else (-> payload
                str
                (.getBytes "utf-8")
                crypt-util/bytes->sha256
                crypt-util/bytes->hex-string))))

(defn- ->canonical-method-str
  "Generates the `HTTPMethod` part of a CanonicalRequest string. 
  
   Rules: 
    GET | PUT ..."
  [method]
  (.toUpperCase (name method)))

(defn ->canonical-request-str
  "To create a signature, we first generate a CanonicalRequest string 
 
  
   A `CanonicalRequest` is a deterministic string representation of your 
   request. We format and sort it in the same way that AWS will.
  
   We use this string as an input to generate our signature. 
   
   Rules: 
    <HTTPMethod>\n
    <CanonicalURI>\n
    <CanonicalQueryString>\n
    <CanonicalHeaders>\n
    <SignedHeaders>\n
    <HashedPayload>"
  [{:keys [method
           path
           query
           headers] :as sig-request}]
  (str (->canonical-method-str method) \newline
       (->canonical-path-str path) \newline
       (->canonical-query-str query) \newline
       (->canonical-headers-str headers)   \newline
       (->signed-headers-str headers) \newline
       (->hashed-payload-str sig-request)))

;; ------------- 
;; StringToSign 

(def ^DateTimeFormatter amz-date-pattern
  (DateTimeFormatter/ofPattern "yyyyMMdd'T'HHmmss'Z'"))

(def ^DateTimeFormatter short-date-pattern
  (DateTimeFormatter/ofPattern "yyyyMMdd"))

(defn instant->utc-date-time [instant]
  (ZonedDateTime/ofInstant instant (ZoneId/of "UTC")))

(defn instant->amz-date [instant]
  (.format amz-date-pattern (instant->utc-date-time instant)))

(defn instant->amz-short-date [instant]
  (.format short-date-pattern (instant->utc-date-time instant)))

(defn ->credential-scope-str
  "Generates a `CredentialScope`. 
   This restricts credentials to a specific region and service
  
   Rules: 
    YYYYMMDD/region/service/aws4_request"
  [{:keys [signing-instant region service] :as _sig-request}]
  (str (instant->amz-short-date signing-instant) "/" region "/" service "/aws4_request"))

(defn ->string-to-sign
  "Generates the StringToSign. 
  
  Rules: 
   Algorithm \n
   RequestDateTime \n
   CredentialScope  \n
   HashedCanonicalRequest"
  [{:keys [signing-instant] :as sig-request}]
  (str
   sig-algorithm \newline
   (instant->amz-date signing-instant) \newline
   (->credential-scope-str sig-request) \newline
   (-> (->canonical-request-str sig-request)
       crypt-util/str->utf-8-bytes
       crypt-util/bytes->sha256
       crypt-util/bytes->hex-string)))

;; ---------------- 
;; SigningKey 

(defn ->signing-key-bytes
  "Generates a `SigningKey`. 
   
   We do this by performing a succession of keyed hash operations 
   on the request date, region, and service"
  [{:keys [secret-key signing-instant region service] :as _sig-request}]
  (let [start-key (crypt-util/str->utf-8-bytes (str "AWS4" secret-key))
        date-key (crypt-util/hmac-256 start-key
                                      (crypt-util/str->utf-8-bytes
                                       (instant->amz-short-date signing-instant)))

        date-region-key (crypt-util/hmac-256 date-key (crypt-util/str->utf-8-bytes region))
        date-region-service-key (crypt-util/hmac-256 date-region-key (crypt-util/str->utf-8-bytes service))
        signing-key-bytes (crypt-util/hmac-256 date-region-service-key (crypt-util/str->utf-8-bytes "aws4_request"))]
    signing-key-bytes))

;; ------------- 
;; Signature 

(defn ->signature
  "To generate a signature: 
   1. We generate our SigningKey 
   2. We generate our StringToSign 
   
   We then encrypt the StringToSign with our SigningKey, and voila!"
  [sig-request]
  (let [signing-key (->signing-key-bytes sig-request)
        string-to-sign (->string-to-sign sig-request)
        string-to-sign-bytes (crypt-util/str->utf-8-bytes string-to-sign)
        sig-bytes (crypt-util/hmac-256 signing-key string-to-sign-bytes)]
    (crypt-util/bytes->hex-string sig-bytes)))

;; ------------- 
;; sig-request 

(defn- canonicalize-headers
  "Generates a `CanonicalizedHeaders` sorted map. 
  
   Rules: 
    Lowercase(<HeaderName1>):Trim(<value>)\n"
  [headers]
  (into (sorted-map)
        (map (fn [[k v]] [(str/lower-case k) (str/trim (or v ""))]) headers)))

(defn create-sig-request
  "Creates a signature request. 

   Main transformation: we sort and transform the `headers` map."
  [request]
  (-> request
      (update :headers canonicalize-headers)))

;; -------------------- 
;; presign-s3-url 

(defn s3-host [region bucket]
  (str bucket
       "."
       (if (= region "us-east-1") "s3" (str "s3-" region))
       ".amazonaws.com"))

(defn amz-credential [{:keys [access-key signing-instant region service]}]
  (str access-key "/"
       (instant->amz-short-date signing-instant) "/" region "/" service "/aws4_request"))

(defn presign-s3-url [{:keys [access-key
                              secret-key

                              ^Instant signing-instant
                              ^Duration expires-duration

                              method
                              region
                              bucket
                              ^String path]}]

  (let [signing-instant (or signing-instant (Instant/now))
        host (s3-host region bucket)
        path-with-slash (if (.startsWith path "/")
                          path
                          (str "/" path))
        amz-expires (str (.getSeconds expires-duration))
        query {"X-Amz-Algorithm" sig-algorithm
               "X-Amz-Credential" (amz-credential {:access-key access-key
                                                   :signing-instant signing-instant
                                                   :region region
                                                   :service "s3"})
               "X-Amz-Date" (instant->amz-date signing-instant)
               "X-Amz-Expires" amz-expires
               "X-Amz-SignedHeaders" "host"}
        sig-request (create-sig-request {:access-key access-key
                                         :secret-key secret-key

                                         :method method
                                         :region region
                                         :service "s3"
                                         :path path-with-slash

                                         :signing-instant signing-instant
                                         :query query
                                         :headers {"host" host}
                                         :payload unsigned-payload})
        signature (->signature sig-request)
        all-query-params (assoc query "X-Amz-Signature" signature)]
    (str "https://" host path-with-slash "?" (->canonical-query-str all-query-params))))

