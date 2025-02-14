(ns instant.util.s3
  (:require
   [instant.config :as config]
   [instant.util.async :refer [default-virtual-thread-executor]])
  (:import
   (java.time Duration)
   (software.amazon.awssdk.auth.credentials AwsBasicCredentials
                                            StaticCredentialsProvider)
   (software.amazon.awssdk.core.async AsyncRequestBody
                                      BlockingInputStreamAsyncRequestBody)
   (software.amazon.awssdk.services.s3 S3AsyncClient
                                       S3Client)
   (software.amazon.awssdk.services.s3.model CopyObjectRequest
                                             CopyObjectResponse
                                             Delete
                                             DeleteObjectRequest
                                             DeleteObjectsRequest
                                             GetObjectRequest
                                             HeadObjectRequest
                                             HeadObjectResponse
                                             ListObjectsV2Request
                                             ListObjectsV2Response
                                             ObjectIdentifier
                                             PutObjectRequest
                                             S3Object)
   (software.amazon.awssdk.services.s3.presigner S3Presigner)
   (software.amazon.awssdk.services.s3.presigner.model GetObjectPresignRequest
                                                       PutObjectPresignRequest)))

(set! *warn-on-reflection* true)

(def default-bucket config/s3-bucket-name)
(def default-content-type "application/octet-stream")
(def default-content-disposition "inline")

(def default-s3-client* (delay (.build (S3Client/builder))))
(defn default-s3-client ^S3Client []
  @default-s3-client*)

(def default-s3-async-client* (delay (-> (S3AsyncClient/crtBuilder)
                                         (.targetThroughputInGbps 20.0)
                                         (.build))))

(defn default-s3-async-client ^S3AsyncClient []
  @default-s3-async-client*)

(def signer-s3-client*
  (delay
    (let [access-key (config/s3-storage-access-key)
          secret-key (config/s3-storage-secret-key)]
      (if (and access-key secret-key)
        (-> (S3Client/builder)
            (.credentialsProvider (StaticCredentialsProvider/create
                                   (AwsBasicCredentials/create access-key secret-key)))
            (.build))
        ;; For OSS developers, use the default credentials provider chain
        ;; so they don't need to set up separate storage credentials
        (default-s3-client)))))

(def presigner* (delay (-> (S3Presigner/builder)
                           (.s3Client @signer-s3-client*)
                           (.build))))

(defn presigner ^S3Presigner []
  @presigner*)

(defn list-objects
  ([opts] (list-objects default-bucket opts))
  ([bucket-name {:keys [continuation-token prefix]}]
   (let [^ListObjectsV2Request req (cond-> (ListObjectsV2Request/builder)
                                     true (.bucket bucket-name)
                                     prefix (.prefix prefix)
                                     continuation-token (.continuationToken continuation-token)
                                     true (.build))
         ^ListObjectsV2Response resp (.listObjectsV2 (default-s3-client) req)]
     {:key-count (.keyCount resp)
      :truncated? (.isTruncated resp)
      :bucket-name (.name resp)
      :max-keys (.maxKeys resp)
      :object-summaries (mapv (fn [^S3Object s3-obj]
                                {:key (.key s3-obj)
                                 :size (.size s3-obj)
                                 :last-modified (.lastModified s3-obj)
                                 :bucket-name (.name resp)
                                 :etag (.eTag s3-obj)})
                              (.contents resp))
      :next-continuation-token (.nextContinuationToken resp)})))

(defn list-all-objects
  ([opts] (list-all-objects default-bucket opts))
  ([bucket-name opts]
   (loop [all-objects []
          continuation-token nil]
     (let [page-opts (cond-> opts
                       continuation-token (assoc :continuation-token continuation-token))
           {:keys [object-summaries next-continuation-token truncated?]}
           (list-objects bucket-name page-opts)]
       (if truncated?
         (recur (into all-objects object-summaries) next-continuation-token)
         (into all-objects object-summaries))))))

(defn head-object
  ([object-key] (head-object default-bucket object-key))
  ([bucket-name object-key]
   (let [^HeadObjectRequest req (-> (HeadObjectRequest/builder)
                                    (.bucket bucket-name)
                                    (.key object-key)
                                    (.build))
         ^HeadObjectResponse resp (.headObject (default-s3-client) req)]
     {:bucket-name bucket-name
      :key object-key
      :object-metadata {:content-disposition (.contentDisposition resp)
                        :content-type (.contentType resp)
                        :content-length (.contentLength resp)
                        :version-id (.versionId resp)
                        :etag (.eTag resp)
                        :last-modified (.lastModified resp)}})))

(defn copy-object
  [{:keys [source-bucket-name
           destination-bucket-name
           source-key
           destination-key]}]
  (let [^CopyObjectRequest req (-> (CopyObjectRequest/builder)
                                   (.sourceBucket source-bucket-name)
                                   (.sourceKey source-key)
                                   (.destinationBucket destination-bucket-name)
                                   (.destinationKey destination-key)
                                   (.build))
        ^CopyObjectResponse resp (.copyObject (default-s3-client) req)]
    resp))

(def user-controlled-metadata-keys
  #{:content-type :content-disposition})

(defn update-object-metadata
  [{:keys [source-bucket-name
           destination-bucket-name
           source-key
           destination-key
           content-type
           content-disposition]}]
  (let [current-metadata (-> (head-object source-bucket-name source-key)
                             :object-metadata
                             (select-keys user-controlled-metadata-keys))
        new-metadata (cond-> current-metadata
                       content-type
                       (assoc :content-type content-type)

                       content-disposition
                       (assoc :content-disposition content-disposition))
        ^CopyObjectRequest req
        (-> (CopyObjectRequest/builder)
            (.sourceBucket source-bucket-name)
            (.sourceKey source-key)
            (.destinationBucket destination-bucket-name)
            (.destinationKey destination-key)
            (.contentType (:content-type new-metadata))
            (.contentDisposition (:content-disposition new-metadata))
            (.metadataDirective "REPLACE") ;; this will replace all metadata
            (.build))
        ^CopyObjectResponse resp
        (.copyObject (default-s3-client) req)]
    resp))

(defn delete-object
  ([object-key] (delete-object default-bucket object-key))
  ([bucket-name object-key]
   (let [^DeleteObjectRequest req (-> (DeleteObjectRequest/builder)
                                      (.bucket bucket-name)
                                      (.key object-key)
                                      (.build))
         _resp (.deleteObject (default-s3-client) req)]
     nil)))

(defn delete-objects
  ([object-keys] (delete-objects default-bucket object-keys))
  ([bucket-name object-keys]
   (let [^java.util.Collection objects (mapv (fn [k]
                                               (-> (ObjectIdentifier/builder)
                                                   (.key k)
                                                   (.build)))
                                             object-keys)
         ^Delete delete (-> (Delete/builder)
                            (.objects objects)
                            (.build))
         ^DeleteObjectsRequest req (-> (DeleteObjectsRequest/builder)
                                       (.bucket bucket-name)
                                       (.delete delete)
                                       (.build))
         _resp (.deleteObjects (default-s3-client) req)]
     nil)))

(defn delete-objects-paginated
  ([object-keys] (delete-objects-paginated default-bucket object-keys))
  ([bucket-name object-keys]
   ;; Limited to 1000 keys per request
   (let [chunks (partition-all 1000 object-keys)]
     (->> chunks
          (mapcat #(delete-objects bucket-name (vec %)))))))

(defn generate-presigned-url-get
  ([{:keys [method bucket-name key ^Duration duration]}]
   (assert (= :get method)
           "get presigned urls are only implemented for :get requests")
   (let [^GetObjectRequest obj-request (-> (GetObjectRequest/builder)
                                           (.bucket bucket-name)
                                           (.key key)
                                           (.build))
         ^GetObjectPresignRequest signer-request (-> (GetObjectPresignRequest/builder)
                                                     (.signatureDuration duration)
                                                     (.getObjectRequest obj-request)
                                                     (.build))]
     (-> (presigner)
         (.presignGetObject signer-request)
         (.url)
         (.toExternalForm)))))

(defn generate-presigned-url-put
  ([{:keys [method bucket-name key ^Duration duration]}]
   (assert (= :put method)
           "put presigned urls are only implemented for :put requests")
   (let [^PutObjectRequest obj-request (-> (PutObjectRequest/builder)
                                           (.bucket bucket-name)
                                           (.key key)
                                           (.build))
         ^PutObjectPresignRequest signer-request (-> (PutObjectPresignRequest/builder)
                                                     (.signatureDuration duration)
                                                     (.putObjectRequest obj-request)
                                                     (.build))]
     (-> (presigner)
         (.presignPutObject signer-request)
         (.url)
         (.toExternalForm)))))

(defn generate-presigned-url
  ([{:keys [method] :as opts}]
   (case method
     :get (generate-presigned-url-get opts)
     :put (generate-presigned-url-put opts)
     (throw (ex-info "Unsupported method for presigned url" {:method method})))))

(defn- make-s3-put-opts
  [bucket-name {:keys [object-key content-type content-disposition]} file-opts]
  (merge
   {:bucket-name bucket-name
    :key object-key
    :metadata {:content-type (or content-type default-content-type)
               :content-disposition (or content-disposition default-content-disposition)}}
   file-opts))

(defn upload-stream-to-s3
  ([ctx stream] (upload-stream-to-s3 default-bucket ctx stream))
  ([bucket-name ctx stream]
   (let [opts (make-s3-put-opts bucket-name ctx {})
         content-length (:content-length ctx)
         ^PutObjectRequest req (cond-> (PutObjectRequest/builder)
                                 true (.bucket (:bucket-name opts))
                                 true (.key (:key opts))
                                 true (.contentType (:content-type (:metadata opts)))
                                 true (.contentDisposition (:content-disposition (:metadata opts)))
                                 content-length (.contentLength content-length)
                                 true (.build))]
     (if content-length
       (let [body (AsyncRequestBody/fromInputStream stream content-length default-virtual-thread-executor)]
         (-> (.putObject (default-s3-async-client) req body)
             deref))
       (let [^BlockingInputStreamAsyncRequestBody body (AsyncRequestBody/forBlockingInputStream nil)
             resp (.putObject (default-s3-async-client) req body)]
         (.writeInputStream body stream)
         (deref resp))))))
