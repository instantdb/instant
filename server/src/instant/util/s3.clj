(ns instant.util.s3
  (:require
   [instant.config :as config]
   [amazonica.aws.s3 :as s3]))

(def default-bucket "instant-storage")
(def default-content-type "application/octet-stream")
(def default-content-disposition "inline")

(defn list-buckets []
  (s3/list-buckets))

(defn list-objects
  ([opts] (list-objects default-bucket opts))
  ([bucket-name opts]
   (s3/list-objects-v2 (merge {:bucket-name bucket-name} opts))))

(defn list-objects-paginated
  ([opts] (list-objects-paginated default-bucket opts))
  ([bucket-name opts]
   (loop [all-objects []
          continuation-token nil]
     (let [request (if continuation-token
                     (assoc opts :continuation-token continuation-token)
                     opts)
           {:keys [object-summaries next-continuation-token truncated?]}
           (list-objects bucket-name request)]
       (if truncated?
         (recur (into all-objects object-summaries) next-continuation-token)
         (into all-objects object-summaries))))))

(defn get-object
  ([object-key] (get-object default-bucket object-key))
  ([bucket-name object-key]
   (s3/get-object {:bucket-name bucket-name :key object-key})))

(defn delete-object
  ([object-key] (delete-object default-bucket object-key))
  ([bucket-name object-key]
   (s3/delete-object {:bucket-name bucket-name
                      :quiet true ;; no response
                      :key object-key})))

(defn delete-objects
  ([object-keys] (delete-objects default-bucket object-keys))
  ([bucket-name object-keys]
   (s3/delete-objects {:bucket-name bucket-name
                       :quiet true ;; no response
                       :keys object-keys})))

(defn delete-objects-paginated
  ([object-keys] (delete-objects-paginated default-bucket object-keys))
  ([bucket-name object-keys]
   ;; Limited to 1000 keys per request
   (let [chunks (partition-all 1000 object-keys)]
     (->> chunks
          (mapcat #(s3/delete-objects {:bucket-name bucket-name
                                       :quiet true ;; no response
                                       :keys (vec %)}))))))

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

(defn- make-s3-put-opts
  [bucket-name {:keys [object-key content-type content-disposition]} file-opts]
  (merge
   {:bucket-name bucket-name
    :key object-key
    :metadata {:content-type (or content-type default-content-type)
               :content-disposition (or content-disposition default-content-disposition)}}
   file-opts))

(defn upload-file-to-s3
  ([ctx file] (upload-file-to-s3 default-bucket ctx file))
  ([bucket-name ctx file]
   (s3/put-object (make-s3-put-opts bucket-name ctx {:file file}))))

(defn upload-stream-to-s3
  ([ctx stream] (upload-stream-to-s3 default-bucket ctx stream))
  ([bucket-name ctx stream]
   (s3/put-object (make-s3-put-opts bucket-name ctx {:input-stream stream}))))
