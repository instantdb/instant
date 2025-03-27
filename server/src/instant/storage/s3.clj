(ns instant.storage.s3
  (:require [clojure.string :as string]
            [instant.config :as config]
            [instant.util.s3 :as s3-util]
            [instant.util.date :as date-util])
  (:import
   [software.amazon.awssdk.auth.credentials DefaultCredentialsProvider]
   [software.amazon.awssdk.services.s3 S3AsyncClient S3Client]
   [java.time Duration Instant]
   [java.time.temporal ChronoUnit]))

(set! *warn-on-reflection* true)

;; Configuration
;; ----------------------

(def ^:private s3-client* (delay (.build (S3Client/builder))))

(defn s3-client
  "Standard blocking S3 client. We use this for most operations."
  ^S3Client []
  @s3-client*)

(def ^:private s3-async-client* (delay
                                  (-> (S3AsyncClient/crtBuilder)
                                      (.targetThroughputInGbps 20.0)
                                      (.build))))

(defn s3-async-client
  "Async S3 Client. Useful when you want to asynchronously upload streams to S3"
  ^S3AsyncClient []
  @s3-async-client*)

(def ^:private presign-creds*
  (delay
    (let [access-key (config/s3-storage-access-key)
          secret-key (config/s3-storage-secret-key)
          region (.toString (.region (.serviceClientConfiguration (s3-client))))]
      (if (and access-key secret-key)
        {:access-key access-key
         :secret-key secret-key
         :region region}
        (let [creds (.resolveCredentials (DefaultCredentialsProvider/create))]
          {:access-key (.accessKeyId creds)
           :secret-key (.secretAccessKey creds)
           :region region})))))

(defn presign-creds
  "Credentials to presign S3 URLs. We use special credentials, because 
   the default credentials provider creates URLs that expire in 2 days. 
   
   These are special credentials that can create URLs that expire in 7 days.
   
   Note: you need to make sure that both these credentials, and the default credentials, 
   have the necessary permissions to access the same S3 bucket."
  []
  @presign-creds*)

(def bucket-name config/s3-bucket-name)

;; S3 path manipulation
;; ----------------------

(defn location-id->bin
  "We add a bin to the location id to scale S3 performance
   See: https://docs.aws.amazon.com/AmazonS3/latest/userguide/optimizing-performance.html"
  ^long [^String location-id]
  (mod (Math/abs (.hashCode location-id)) 10))

(defn ->object-key
  "Object keys have the shape of app-id/bin/location-id"
  [app-id ^String location-id]
  (str app-id "/" (location-id->bin location-id) "/" location-id))

(defn object-key->app-id
  "Extract app-id from our S3 object keys"
  [object-key]
  (first (string/split object-key #"/")))

(defn object-key->bin
  "Extract bin from our S3 object keys"
  [object-key]
  (second (string/split object-key #"/")))

(defn object-key->location-id
  "Extract location-id from our S3 object keys"
  [object-key]
  (last (string/split object-key #"/")))

;; Instant <> S3 integration
;; ----------------------

(defn upload-file-to-s3 [{:keys [app-id location-id] :as ctx} file]
  (when (not (instance? java.io.InputStream file))
    (throw (Exception. "Unsupported file format")))
  (let [ctx* (assoc ctx :object-key (->object-key app-id location-id))]
    (s3-util/upload-stream-to-s3 (s3-async-client) bucket-name ctx* file)))

(defn format-object [{:keys [object-metadata]}]
  (-> object-metadata
      (select-keys [:content-disposition :content-type :content-length :etag])
      (assoc :size (:content-length object-metadata)
             :last-modified
             (.toEpochMilli ^Instant (object-metadata :last-modified)))))

(defn get-object-metadata
  ([app-id location-id] (get-object-metadata bucket-name app-id location-id))
  ([bucket-name app-id location-id]
   (let [object-key (->object-key app-id location-id)]
     (format-object (s3-util/head-object (s3-client) bucket-name object-key)))))

(defn update-object-metadata!
  ([app-id location-id params]
   (update-object-metadata! bucket-name app-id location-id params))
  ([bucket-name app-id location-id {:keys [content-type content-disposition]}]
   (let [object-key (->object-key app-id location-id)]
     (s3-util/update-object-metadata
      (s3-client)
      {:source-bucket-name bucket-name
       :destination-bucket-name bucket-name
       :source-key object-key
       :destination-key object-key
       :content-type content-type
       :content-disposition content-disposition}))))

(defn delete-file! [app-id location-id]
  (when location-id
    (s3-util/delete-object (s3-client) bucket-name (->object-key app-id location-id))))

(defn bulk-delete-files! [app-id location-ids]
  (let [location-keys (mapv
                       (fn [location-id] (->object-key app-id location-id))
                       location-ids)]
    (s3-util/delete-objects-paginated (s3-client) bucket-name location-keys)))

(defn bucketed-signing-instant
  "AWS URLs depend on the signing-instant.  
  
  We want to keep URLs stable: repeated calls to the same object should return 
  the same URL, so that browsers can cache the object. 

  To do this, we bucket dates to the start of the day. 
  
  This gives about 24 hours where URLs are stable."
  []
  (let [now (date-util/utc-now)]
    (.toInstant (.truncatedTo now ChronoUnit/DAYS))))

(defn location-id-url [app-id location-id]
  (let [signing-instant (bucketed-signing-instant)
        duration (Duration/ofDays 7)
        object-key (->object-key app-id location-id)]
    (str (s3-util/generate-presigned-url
          (presign-creds)
          {:method :get
           :bucket-name bucket-name
           :key object-key
           :duration duration
           :signing-instant signing-instant}))))

(defn create-signed-download-url! [app-id location-id]
  (when location-id
    (location-id-url app-id location-id)))

;; S3 Usage Metrics
;; These functions calculate usage by talking to S3 directly. We can use these
;; for debugging whenever we suspect that our usage metrics based on triples
;; are off.
;; ----------------------

(defn list-all-app-objects []
  (loop [all-objects []
         continuation-token nil]
    (let [opts (if continuation-token
                 {:continuation-token continuation-token}
                 {})
          {:keys [object-summaries next-continuation-token truncated?]}
          (s3-util/list-objects (s3-client) bucket-name opts)]
      (if truncated?
        (recur (into all-objects object-summaries) next-continuation-token)
        (into all-objects object-summaries)))))

(defn list-objects-by-app []
  (group-by #(object-key->app-id (:key %)) (list-all-app-objects)))

(defn calculate-app-metrics []
  (let [objects-by-app-id (list-objects-by-app)]
    (reduce (fn [acc [app-id objects]]
              (assoc acc app-id {:total-byte-size (reduce (fn [acc obj] (+ acc (:size obj))) 0 objects)
                                 :total-file-count (count objects)}))
            {} objects-by-app-id)))

(comment
  (count (list-all-app-objects))
  (list-objects-by-app)
  (calculate-app-metrics))
