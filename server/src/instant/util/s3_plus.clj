(ns instant.util.s3-plus
  (:require
   [instant.config :as config]
   [instant.util.async :refer [default-virtual-thread-executor]])
  (:import
   (java.net URI URLEncoder)
   (java.nio.charset StandardCharsets)
   (java.time Instant Duration)
   (java.time.format DateTimeFormatter)
   (java.util Date TreeMap)
   (javax.crypto Mac)
   (javax.crypto.spec SecretKeySpec)
   (software.amazon.awssdk.auth.credentials AwsBasicCredentials StaticCredentialsProvider)
   (software.amazon.awssdk.regions Region)
   (software.amazon.awssdk.utils BinaryUtils)))

(defn- hmac-sha256
  [^String key ^String data]
  (let [algorithm "HmacSHA256"
        mac (Mac/getInstance algorithm)
        secret-key (SecretKeySpec. (.getBytes key) algorithm)]
    (.init mac secret-key)
    (BinaryUtils/toHex (.doFinal mac (.getBytes data)))))

(defn- url-encode
  [^String s]
  (-> s
      (URLEncoder/encode StandardCharsets/UTF_8)
      (.replace "+" "%20")
      (.replace "*" "%2A")
      (.replace "%7E" "~")))

(defn- format-date-time
  [^Instant instant format]
  (.format (DateTimeFormatter/ofPattern format) instant))

(defn generate-presigned-url-with-custom-time
  [{:keys [access-key secret-key method bucket-name key duration region signing-time]
    :or {method :get
         region "use-east-1"
         signing-time (Instant/now)}}]
  (let [service "s3"
        algorithm "AWS4-HMAC-SHA256"

;; Format dates
        amz-date (format-date-time signing-time "yyyyMMdd'T'HHmmss'Z'")
        date-stamp (format-date-time signing-time "yyyyMMdd")

        ;; Create canonical request
        http-verb (name method)
        canonical-uri (str "/" key)

        ;; Query parameters
        expiration (int (/ (.getSeconds duration) 60))
        query-params (doto (TreeMap.)
                       (.put "X-Amz-Algorithm" algorithm)
                       (.put "X-Amz-Credential" (str access-key "/" date-stamp "/" region "/s3/aws4_request"))
                       (.put "X-Amz-Date" amz-date)
                       (.put "X-Amz-Expires" (str expiration))
                       (.put "X-Amz-SignedHeaders" "host"))

        canonical-query-string (->> query-params
                                    (map (fn [[k v]] (str (url-encode k) "=" (url-encode v))))
                                    (clojure.string/join "&"))

        canonical-headers (str "host:" bucket-name ".s3." region ".amazonaws.com\n")
        signed-headers "host"

        canonical-request (str http-verb "\n"
                               canonical-uri "\n"
                               canonical-query-string "\n"
                               canonical-headers "\n"
                               signed-headers "\n"
                               "UNSIGNED-PAYLOAD")

        ;; Create string to sign
        credential-scope (str date-stamp "/" region "/s3/aws4_request")
        string-to-sign (str algorithm "\n"
                            amz-date "\n"
                            credential-scope "\n"
                            (BinaryUtils/toHex (instant.aws. canonical-request)))

        ;; Calculate signature
        k-date (hmac-sha256 (str "AWS4" secret-key) date-stamp)
        k-region (hmac-sha256 k-date (name region))
        k-service (hmac-sha256 k-region service)
        k-signing (hmac-sha256 k-service "aws4_request")
        signature (hmac-sha256 k-signing string-to-sign)

        ;; Create signed URL
        endpoint (str "https://" bucket-name ".s3." region ".amazonaws.com/" key)
        signed-url (str endpoint "?"
                        canonical-query-string "&"
                        "X-Amz-Signature=" signature)]
    signed-url))
