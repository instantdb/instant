(ns instant.util.aws.sig-v4
  "Implements AWS' Signature Version 4. 
   
   We use these to generate signature's for S3 presigned URLs.
   
   Why not use the Java SDK directly? 
   
   Because we need a way to set the `signing-time` for the presigned URL. 
   A consistent `signing-time` gives us stable URLs, which browsers can cache.

   This code was imported from [clj-aws-sign](https://github.com/joseferben/clj-aws-sign/)."
  (:require [clojure.string :as str])
  (:import java.security.MessageDigest
           javax.crypto.Mac
           javax.crypto.spec.SecretKeySpec
           [java.text DateFormat SimpleDateFormat]
           [java.util TimeZone]
           [java.net URLEncoder]))

(def EMPTY_SHA256 "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
(def UNSIGNED_PAYLOAD "UNSIGNED-PAYLOAD")

(def ^DateFormat iso8601-date-format
  (doto (SimpleDateFormat. "yyyyMMdd'T'HHmmss'Z'")
    (.setTimeZone (TimeZone/getTimeZone "UTC"))))

;; ---------- AWS authentication

(def zone->endpoints
  "Mapping of AWS zones to S3 endpoints as documented here:
   http://docs.aws.amazon.com/general/latest/gr/rande.html#s3_region"
  {"us-east-1"      "s3"
   "us-west-1"      "s3-us-west-1"
   "us-west-2"      "s3-us-west-2"
   "eu-west-1"      "s3-eu-west-1"
   "eu-central-1"   "s3-eu-central-1"
   "ap-southeast-1" "s3-ap-southeast-1"
   "ap-southeast-2" "s3-ap-southeast-2"
   "ap-northeast-1" "s3-ap-northeast-1"
   "sa-east-1"      "s3-sa-east-1"})

(defn zone->host
  "Maps a zone to the full host name"
  [zone]
  (str (get zone->endpoints zone) ".amazonaws.com"))

(defn- as-hex [bytes]
  (map #(format "%02x" (if (neg? %) (bit-and % 0xFF) %)) bytes))

(defn url-encode
  "Percent encode the string to put in a URL."
  [^String s]
  (-> s
      (URLEncoder/encode "UTF-8")
      (.replace "+" "%20")
      (.replace "*" "%2A")
      (.replace "%7E" "~")))

(defn- ^String as-hex-str [bytes]
  (apply str (as-hex bytes)))

(defn- ^bytes to-utf8 [s]
  (.getBytes (str s) "utf-8"))

(defn- ^String sha-256 [bs]
  (let [sha (MessageDigest/getInstance "SHA-256")]
    (.update sha ^bytes bs)
    (as-hex-str (.digest sha))))

(defn- hmac-256 [secret-key s]
  (let [mac (Mac/getInstance "HmacSHA256")]
    (.init mac (SecretKeySpec. secret-key "HmacSHA256"))
    (.doFinal mac (to-utf8 s))))

;; ---------- Misc

(defn- signing-key
  [secret-key short-timestamp region service]
  (-> (hmac-256 (to-utf8 (str "AWS4" secret-key)) short-timestamp)
      (hmac-256 region)
      (hmac-256 service)
      (hmac-256 "aws4_request")))

(defn- query->string
  [query]
  (->> query
       (sort (fn [[k1 v1] [k2 v2]] (if (not= k1 k2)
                                     (compare k1 k2)
                                     (compare v1 v2))))
       (map #(map url-encode %))
       (#(map (fn [pair] (str/join "=" pair)) %))
       (str/join "&")))

(defn- change-directory
  [segments]
  (let [change-amount (get (frequencies segments) ".." 0)]
    (if (> change-amount 0)
      (change-directory (drop-last (rest segments)))
      segments)))

(defn- both
  [f1 f2]
  #(and (f1 %) (f2 %)))

(defn- not-blank?
  [str]
  (and (not (= "" str))
       (not (nil? str))))

(defn- not-dot?
  [str]
  (not= str "."))

(defn- remove-spaces
  [str]
  (str/replace str #" " ""))

(defn- resolve-path
  [path]
  (->> (str/split path #"/")
       (filter (both not-blank? not-dot?))
       (change-directory)
       (str/join "/")
       (str "/")))

(defn- encode-uri
  [uri]
  (->> (str/split uri #"/")
       (map url-encode)
       (str/join "/")
       (#(if (str/blank? %) "/" %))))

(defn- append-slash
  [uri raw]
  (str uri (and (re-matches #".*/$" raw) "/")))

(defn- replace-double-slash
  [uri]
  (str/replace uri #"//" "/"))

(defn- normalize-uri
  [uri]
  (-> uri
      (resolve-path)
      (encode-uri)
      (append-slash uri)
      (replace-double-slash)))

(defn canonical-headers [headers]
  (into (sorted-map)
        (map (fn [[k v]] [(str/lower-case k) (str/trim (or v ""))]) headers)))

(defn- stringify-headers [headers]
  (let [s (StringBuilder.)]
    (doseq [[k v] headers]
      (doto s
        (.append k) (.append ":") (.append v) (.append "\n")))
    (.toString s)))

(defn content-sha256
  "Returns content sha256 given payload"
  [payload]
  (cond
    (= payload UNSIGNED_PAYLOAD) UNSIGNED_PAYLOAD
    (nil? payload) EMPTY_SHA256
    :else (sha-256 (to-utf8 payload))))

(defn canonical-request
  "Returns canonical request as string"
  [{:keys [method uri query payload headers]}]
  (str
   method \newline
   (normalize-uri uri) \newline
   (query->string query) \newline
   (stringify-headers headers)   \newline
   (str/join ";" (keys headers)) \newline
   (or (get headers "x-amz-content-sha256")
       (content-sha256 payload))))

;; ---------- AWS authentication

(defn signature
  "Returns hmac-256 signature given credential scope, secret and string-to-sign"
  [{:keys [secret-key short-timestamp region service string-to-sign]}]
  (-> (signing-key secret-key short-timestamp region service)
      (hmac-256 string-to-sign)
      (as-hex-str)))

(defn string-to-sign
  "Returns string to sign given data of request-to-sign"
  [{:keys [timestamp method uri query payload short-timestamp region service headers]}]
  (let [cannonical-request-str (canonical-request
                                {:method method :uri uri :query query
                                 :payload payload :headers headers})]
    (str
     "AWS4-HMAC-SHA256\n"
     timestamp "\n"
     short-timestamp "/" region "/" service "/aws4_request" "\n"
     (sha-256 (to-utf8 cannonical-request-str)))))

(defn authorize
  "Returns complete authorization header given data of request-to-sign including headers"
  [{:keys [method uri query headers payload date region service access-key secret-key]}]
  (let [canonical-headers (canonical-headers headers)
        timestamp (get canonical-headers "x-amz-date" date)
        short-timestamp (.substring ^String timestamp 0 8)
        string-to-sign (string-to-sign {:timestamp timestamp :method method
                                        :uri uri :query query :payload payload
                                        :short-timestamp short-timestamp
                                        :region region :service service
                                        :headers canonical-headers})
        signature (signature {:secret-key secret-key
                              :short-timestamp short-timestamp
                              :region region :service service
                              :string-to-sign string-to-sign})]
    {:credential (str access-key "/" short-timestamp "/" region "/" service)
     :signed-headers (str/join ";" (keys canonical-headers))
     :signature signature}))



