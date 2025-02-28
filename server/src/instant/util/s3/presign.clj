(ns instant.util.s3.presign
  (:require
   [clojure.string :as str]
   [instant.util.aws-signature :as aws])
  (:import
   (java.time ZonedDateTime ZoneOffset)
   (java.time.format DateTimeFormatter)))

(defn generate-presigned-url
  "Generate a pre-signed URL for an S3 object"
  [{:keys [path region bucket access-key secret-key method]
    :or {method "GET"}}]
  (let [now (ZonedDateTime/now ZoneOffset/UTC)
        formatter (DateTimeFormatter/ofPattern "yyyyMMdd'T'HHmmss'Z'")
        date (.format formatter now)
        host (format "%s.s3.%s.amazonaws.com" bucket region)

        ;; Normalize path: ensure it has no leading slash for URL construction
        path-without-slash (if (.startsWith path "/") (subs path 1) path)

        ;; Create canonical URI with leading slash for signing
        uri-path (str "/" path-without-slash)

        request {:method method
                 :uri uri-path
                 :query [["X-Amz-Algorithm" "AWS4-HMAC-SHA256"]
                         ["X-Amz-Credential" (format "%s/%s/%s/s3/aws4_request"
                                                     access-key
                                                     (subs date 0 8)
                                                     region)]
                         ["X-Amz-Date" date]
                         ["X-Amz-Expires" "3600"]
                         ["X-Amz-SignedHeaders" "host"]]
                 :date date
                 :headers {"host" host}
                 :service "s3"
                 :region region
                 :access-key access-key
                 :secret-key secret-key
                 :payload "UNSIGNED-PAYLOAD"} ; This is crucial for presigned URLs

        ;; Get authorization header with signature
        auth-header (aws/authorize request)
        signature (second (re-find #"Signature=([0-9a-f]+)" auth-header))

        ;; Add signature to query parameters
        all-query-params (conj (:query request) ["X-Amz-Signature" signature])

        ;; Build properly encoded query string
        query-string (str/join "&"
                               (map (fn [[k v]]
                                      (str (java.net.URLEncoder/encode k "UTF-8")
                                           "="
                                           (java.net.URLEncoder/encode v "UTF-8")))
                                    all-query-params))

        ;; Construct final URL
        url (str "https://" host "/" path-without-slash "?" query-string)]
    url))

