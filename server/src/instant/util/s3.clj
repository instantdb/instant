(ns instant.util.s3
  (:require
   [instant.util.async :refer [default-virtual-thread-executor]]
   [instant.util.aws-signature :as aws-sig]
   [instant.util.tracer :as tracer])
  (:import
   (java.time Instant Duration)
   (software.amazon.awssdk.core.async AsyncRequestBody
                                      BlockingInputStreamAsyncRequestBody)
   (software.amazon.awssdk.services.s3 S3AsyncClient
                                       S3Client)
   (software.amazon.awssdk.services.s3.model CopyObjectRequest
                                             CopyObjectResponse
                                             Delete
                                             DeleteObjectRequest
                                             DeleteObjectsRequest
                                             HeadObjectRequest
                                             HeadObjectResponse
                                             ListObjectsV2Request
                                             ListObjectsV2Response
                                             ObjectIdentifier
                                             PutObjectRequest
                                             S3Object)))

(set! *warn-on-reflection* true)

(def default-content-type "application/octet-stream")
(def default-content-disposition "inline")

(defn list-objects
  [^S3Client s3-client bucket-name {:keys [continuation-token prefix]}]
  (let [^ListObjectsV2Request req (cond-> (ListObjectsV2Request/builder)
                                    true (.bucket bucket-name)
                                    prefix (.prefix prefix)
                                    continuation-token (.continuationToken continuation-token)
                                    true (.build))
        ^ListObjectsV2Response resp (.listObjectsV2 s3-client req)]
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
     :next-continuation-token (.nextContinuationToken resp)}))

(defn list-all-objects
  [^S3Client s3-client bucket-name opts]
  (loop [all-objects []
         continuation-token nil]
    (let [page-opts (cond-> opts
                      continuation-token (assoc :continuation-token continuation-token))
          {:keys [object-summaries next-continuation-token truncated?]}
          (list-objects s3-client bucket-name page-opts)]
      (if truncated?
        (recur (into all-objects object-summaries) next-continuation-token)
        (into all-objects object-summaries)))))

(defn head-object
  [^S3Client s3-client bucket-name object-key]
  (let [^HeadObjectRequest req (-> (HeadObjectRequest/builder)
                                   (.bucket bucket-name)
                                   (.key object-key)
                                   (.build))
        ^HeadObjectResponse resp (.headObject s3-client req)]
    {:bucket-name bucket-name
     :key object-key
     :object-metadata {:content-disposition (.contentDisposition resp)
                       :content-type (.contentType resp)
                       :content-length (.contentLength resp)
                       :version-id (.versionId resp)
                       :etag (.eTag resp)
                       :last-modified (.lastModified resp)}}))

(defn copy-object
  [^S3Client s3-client
   {:keys [source-bucket-name
           destination-bucket-name
           source-key
           destination-key]}]
  (let [^CopyObjectRequest req (-> (CopyObjectRequest/builder)
                                   (.sourceBucket source-bucket-name)
                                   (.sourceKey source-key)
                                   (.destinationBucket destination-bucket-name)
                                   (.destinationKey destination-key)
                                   (.build))
        ^CopyObjectResponse resp (.copyObject s3-client req)]
    resp))

(def user-controlled-metadata-keys
  #{:content-type :content-disposition})

(defn update-object-metadata
  [^S3Client s3-client
   {:keys [source-bucket-name
           destination-bucket-name
           source-key
           destination-key
           content-type
           content-disposition]}]
  (let [current-metadata (-> (head-object s3-client source-bucket-name source-key)
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
        (.copyObject s3-client req)]
    resp))

(defn delete-object
  [^S3Client s3-client bucket-name object-key]
  (let [^DeleteObjectRequest req (-> (DeleteObjectRequest/builder)
                                     (.bucket bucket-name)
                                     (.key object-key)
                                     (.build))
        _resp (.deleteObject s3-client req)]
    nil))

(defn delete-objects
  [^S3Client s3-client bucket-name object-keys]
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
        _resp (.deleteObjects s3-client req)]
    nil))

(defn delete-objects-paginated
  [^S3Client s3-client bucket-name object-keys]
   ;; Limited to 1000 keys per request
  (let [chunks (partition-all 1000 object-keys)]
    (->> chunks
         (mapcat #(delete-objects s3-client bucket-name (vec %))))))

(defn generate-presigned-url-get
  [{:keys [access-key secret-key region] :as _signer-creds}
   {:keys [method bucket-name
           key
           ^Instant signing-instant
           ^Duration duration]}]
  (assert (= :get method)
          "get presigned urls are only implemented for :get requests")
  (aws-sig/presign-s3-url
   {:access-key access-key
    :secret-key secret-key
    :region region
    :method method
    :bucket bucket-name
    :signing-instant signing-instant
    :expires-duration duration
    :path key}))

(defn generate-presigned-url-put
  [{:keys [access-key secret-key region] :as _signer-creds}
   {:keys [method bucket-name key ^Instant signing-instant ^Duration duration]}]
  (assert (= :put method)
          "put presigned urls are only implemented for :put requests")
  (aws-sig/presign-s3-url
   {:access-key access-key
    :secret-key secret-key
    :region region
    :method method
    :bucket bucket-name
    :signing-instant signing-instant
    :expires-duration duration
    :path key}))

(defn generate-presigned-url
  [signer-creds {:keys [method] :as opts}]
  (case method
    :get (generate-presigned-url-get signer-creds opts)
    :put (generate-presigned-url-put signer-creds opts)
    (throw (ex-info "Unsupported method for presigned url" {:method method}))))

(defn- make-s3-put-opts
  [bucket-name {:keys [object-key content-type content-disposition content-length]} file-opts]
  (merge
   {:bucket-name bucket-name
    :key object-key
    :metadata {:content-type (or content-type default-content-type)
               :content-disposition (or content-disposition default-content-disposition)
               :content-length content-length}}
   file-opts))

(defn upload-stream-to-s3
  [^S3AsyncClient async-client bucket-name ctx stream]
  (let [{:keys [key metadata] :as _opts} (make-s3-put-opts bucket-name ctx {})
        {:keys [content-disposition content-type content-length]} metadata]
    (tracer/with-span! {:name "s3/upload-stream-to-s3"
                        :attributes {:bucket-name bucket-name
                                     :key key
                                     :content-type content-type
                                     :content-disposition content-disposition
                                     :content-length content-length}}
      (let [^PutObjectRequest req (cond-> (PutObjectRequest/builder)
                                    true (.bucket bucket-name)
                                    true (.key key)
                                    true (.contentType content-type)
                                    true (.contentDisposition content-disposition)
                                    content-length (.contentLength content-length)
                                    true (.build))]
        (if content-length
          (let [body (AsyncRequestBody/fromInputStream stream (long content-length) default-virtual-thread-executor)]
            (-> (.putObject async-client req body)
                deref))
          (let [^BlockingInputStreamAsyncRequestBody body (AsyncRequestBody/forBlockingInputStream nil)
                resp (.putObject async-client req body)]
            (.writeInputStream body stream)
            (deref resp)))))))
