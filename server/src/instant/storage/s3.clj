(ns instant.storage.s3
  (:require [clojure.java.io :as io]
            [clj-http.client :as clj-http]
            [amazonica.aws.s3 :as s3]))

(def default-bucket "instant-storage")

(defn ->object-key [app-id filename]
  (str app-id "/" filename))

(defn list-buckets []
  (s3/list-buckets))

(defn list-objects [bucket-name]
  (s3/list-objects bucket-name))

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
   (s3/list-objects-v2 {:bucket-name bucket-name :prefix prefix})))

(comment
  (def app-id  #uuid "524bc106-1f0d-44a0-b222-923505264c47")
  (list-app-objects default-bucket app-id)
  (list-app-objects app-id))

(defn signed-upload-url
  ([object-key] (signed-upload-url default-bucket object-key))
  ([bucket-name object-key]
   (s3/generate-presigned-url {:method :put
                               :bucket-name bucket-name
                               :key object-key})))

(defn signed-download-url
  ([object-key] (let [expiration (+ (System/currentTimeMillis) (* 1000 60 60 24 7))] ;; 7 days
                  (signed-download-url default-bucket object-key expiration)))
  ([object-key expiration] (signed-download-url default-bucket object-key expiration))
  ([bucket-name object-key expiration]
   (s3/generate-presigned-url {:method :get
                               :bucket-name bucket-name
                               :key object-key
                               :expiration expiration})))

(defn upload-image-to-s3 [image-url bucket-name object-key]
  (let [response (clj-http/get image-url {:as :byte-array})
        image-bytes (:body response)]
    (s3/put-object {:bucket-name bucket-name
                    :key object-key
                    :input-stream (io/input-stream image-bytes)
                    :metadata {:content-length (count image-bytes)
                               :content-type "image/png"}})))

(comment
  (def image-url "https://i.redd.it/bugxrdkjmm1b1.png")
  (def app-id  #uuid "b26191cf-7391-4118-a7f7-5aba2483a0d3")
  (def filename "calvin.png")
  (def object-key (str app-id "/" filename))
  (def expiration (+ (System/currentTimeMillis) (* 1000 60 60 24)))
  (upload-image-to-s3 image-url default-bucket object-key)
  (signed-download-url default-bucket object-key expiration)
  (signed-download-url object-key expiration)
  (signed-download-url object-key)
  (delete-object default-bucket object-key))
