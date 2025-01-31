(ns instant.storage.s3
  (:require [clojure.java.io :as io]
            [clj-http.client :as clj-http]
            [amazonica.aws.s3 :as s3]
            [instant.config :as config]))

(def default-bucket "instant-storage")

(defn list-buckets []
  (s3/list-buckets))

(defn list-objects
  ([] (list-objects default-bucket))
  ([bucket-name]
   (s3/list-objects bucket-name)))

(defn list-objects-v2
  ([opts] (list-objects-v2 default-bucket opts))
  ([bucket-name opts]
   (s3/list-objects-v2 (merge {:bucket-name bucket-name} opts))))

(defn get-object
  ([object-key] (get-object default-bucket object-key))
  ([bucket-name object-key]
   (s3/get-object {:bucket-name bucket-name :key object-key})))

(defn delete-object
  ([object-key] (delete-object default-bucket object-key))
  ([bucket-name object-key]
   (s3/delete-object {:bucket-name bucket-name
                      :key object-key})))

(defn delete-objects
  ([object-keys] (delete-objects default-bucket object-keys))
  ([bucket-name object-keys]
   (s3/delete-objects {:bucket-name bucket-name
                       :quiet false ;; returns deleted objects with response
                       :keys object-keys})))

(comment
  (def object-keys ["524bc106-1f0d-44a0-b222-923505264c47/pika.webp"
                    "524bc106-1f0d-44a0-b222-923505264c47/boop-1.png"])
  (delete-objects object-keys))

(defn list-app-objects
  ([prefix] (list-app-objects default-bucket prefix))
  ([bucket-name prefix]
   (loop [all-objects []
          continuation-token nil]
     (let [opts (cond-> {:bucket-name bucket-name :prefix prefix}
                  continuation-token
                  (assoc :continuation-token continuation-token))
           {:keys [object-summaries next-continuation-token truncated?]}
           (list-objects-v2 opts)]
       (if (and truncated? (< (count all-objects) 50000))
         (recur (into all-objects object-summaries) next-continuation-token)
         (into all-objects object-summaries))))))

(comment
  (def app-id  #uuid "524bc106-1f0d-44a0-b222-923505264c47")
  (list-app-objects default-bucket app-id)
  (list-app-objects app-id))

(defn generate-presigned-url
  ([opts]
   (let [access-key (config/s3-storage-access-key)
         secret-key (config/s3-storage-secret-key)]
     (if (and access-key secret-key)
       (s3/generate-presigned-url {:access-key access-key
                                   :secret-key secret-key} opts)
       ;; For OSS developers, use the default credentials provider chain
       ;; so they don't need to set up separate storage credentials
       (s3/generate-presigned-url opts)))))

(defn signed-upload-url
  ([object-key] (signed-upload-url default-bucket object-key))
  ([bucket-name object-key]
   (generate-presigned-url {:method :put
                            :bucket-name bucket-name
                            :key object-key})))

(defn signed-download-url
  ([object-key] (let [expiration (+ (System/currentTimeMillis) (* 1000 60 60 24 7))] ;; 7 days
                  (signed-download-url default-bucket object-key expiration)))
  ([object-key expiration] (signed-download-url default-bucket object-key expiration))
  ([bucket-name object-key expiration]
   (generate-presigned-url {:method :get
                            :bucket-name bucket-name
                            :key object-key
                            :expiration expiration})))

(defn upload-image-to-s3
  ([object-key image-url] (upload-image-to-s3 default-bucket object-key image-url))
  ([bucket-name object-key image-url]
   (let [response (clj-http/get image-url {:as :byte-array})
         image-bytes (:body response)]
     (s3/put-object {:bucket-name bucket-name
                     :key object-key
                     :input-stream (io/input-stream image-bytes)
                     :metadata {:content-length (count image-bytes)
                                :content-type "image/png"}}))))

(comment
  (def image-url "https://i.redd.it/bugxrdkjmm1b1.png")
  (def app-id  #uuid "524bc106-1f0d-44a0-b222-923505264c47")
  (def filename "calvin.png")
  (def object-key (str app-id "/" filename))
  (def expiration (+ (System/currentTimeMillis) (* 1000 60 60 24)))
  (upload-image-to-s3 object-key image-url)
  (get-object object-key)
  (signed-download-url default-bucket object-key expiration)
  (signed-download-url object-key expiration)
  (signed-download-url object-key)
  (delete-object default-bucket object-key))
