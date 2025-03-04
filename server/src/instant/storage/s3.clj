(ns instant.storage.s3
  (:require [clojure.string :as string]
            [instant.util.s3 :as s3-util]
            [instant.util.date :as date-util])
  (:import
   [java.time ZonedDateTime Duration DayOfWeek]
   [java.time.temporal TemporalAdjusters ChronoUnit]))

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
    (s3-util/upload-stream-to-s3 ctx* file)))

(defn format-object [{:keys [object-metadata]}]
  (-> object-metadata
      (select-keys [:content-disposition :content-type :content-length :etag])
      (assoc :size (:content-length object-metadata)
             :last-modified (-> object-metadata :last-modified .toEpochMilli))))

(defn get-object-metadata
  ([app-id location-id] (get-object-metadata s3-util/default-bucket app-id location-id))
  ([bucket-name app-id location-id]
   (let [object-key (->object-key app-id location-id)]
     (format-object (s3-util/head-object bucket-name object-key)))))

(defn update-object-metadata!
  ([app-id location-id params]
   (update-object-metadata! s3-util/default-bucket app-id location-id params))
  ([bucket-name app-id location-id {:keys [content-type content-disposition]}]
   (let [object-key (->object-key app-id location-id)]
     (s3-util/update-object-metadata
      {:source-bucket-name bucket-name
       :destination-bucket-name bucket-name
       :source-key object-key
       :destination-key object-key
       :content-type content-type
       :content-disposition content-disposition}))))

(defn delete-file! [app-id location-id]
  (when location-id
    (s3-util/delete-object (->object-key app-id location-id))))

(defn bulk-delete-files! [app-id location-ids]
  (let [location-keys (mapv
                       (fn [location-id] (->object-key app-id location-id))
                       location-ids)]
    (s3-util/delete-objects-paginated location-keys)))

(defn bucketed-zdate
  "AWS URLs depend on the signing-instant.  
  
  We want to keep URLs stable: repeated calls to the same object should return 
  the same URL, so that browsers can cache the object. 

  To do this, we bucket input dates like so: 
  
  start-of-week: Mon midnight 
  mid-week: Thu 12PM. 

  Given an input date `z-date`, we stick it to the closest previous bucket. 

  So: 
   - Mon 9AM -> Mon midnight 
   - Tue 3PM -> Mon midnight 
   - Thu 4PM -> Thu 12PM
   - Sat 11PM -> Thu 12PM  
   - Sun midnight -> Thu 12PM 

  We set a 7 day expiration for our URLs. This means that in the worst cases 
  (if a user calls us at 11:59PM on a Sunday), we will have a real expiration date of 
  
  3.5 days"
  [^ZonedDateTime z-date]
  (let [start-of-week (-> z-date
                          (.with (TemporalAdjusters/previousOrSame DayOfWeek/MONDAY))
                          (.truncatedTo ChronoUnit/DAYS))
        mid-week (-> start-of-week
                     (.plus (Duration/ofDays 3))
                     (.plus (Duration/ofHours 12)))

        choice (if (.isBefore z-date mid-week)
                 start-of-week
                 mid-week)]
    choice))

(defn location-id-url [app-id location-id]
  (let [signing-instant (.toInstant (bucketed-zdate (date-util/pst-now)))
        duration (Duration/ofDays 7)
        object-key (->object-key app-id location-id)]
    (str (s3-util/generate-presigned-url
          {:method :get
           :bucket-name s3-util/default-bucket
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
          (s3-util/list-objects opts)]
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
