(ns instant.storage.s3
  (:require [clojure.string :as string]
            [instant.util.s3 :as s3-util]))

;; S3 path manipulation
;; ----------------------

(defn ->object-key
  "Combine app-id and filename to provide a full S3 object key"
  [app-id filename]
  (if (string/starts-with? filename "/")
    (str app-id filename)
    (str app-id "/" filename)))

(defn object-key->app-id
  "Extract app-id from our S3 object keys"
  [object-key]
  (first (string/split object-key #"/")))

(defn object-key->path
  "Extract path from our S3 object keys"
  [object-key]
  (string/join "/" (rest (string/split object-key #"/"))))

;; Instant <> S3 integration
;; ----------------------

(defn upload-file-to-s3 [{:keys [app-id path] :as ctx} file]
  (when (not (instance? java.io.InputStream file))
    (throw (Exception. "Unsupported file format")))
  (let [ctx* (assoc ctx :object-key (->object-key app-id path))]
    (s3-util/upload-stream-to-s3 ctx* file)))

(defn format-object [{:keys [key object-metadata]}]
  (-> object-metadata
      (select-keys [:content-disposition :content-type :content-length :etag])
      (assoc :size (:content-length object-metadata)
             :last-modified (-> object-metadata :last-modified .getMillis)
             :path (object-key->path key))))

(defn get-object-metadata [app-id path]
  (let [object-key (->object-key app-id path)]
    (format-object (s3-util/get-object object-key))))

(defn bulk-delete-files! [app-id filenames]
  (let [keys (mapv (fn [filename] (->object-key app-id filename)) filenames)]
    (s3-util/delete-objects-paginated keys)))

(defn create-signed-download-url! [app-id filename]
  (let [expiration (+ (System/currentTimeMillis) (* 1000 60 60 24 7)) ;; 7 days
        object-key (->object-key app-id filename)]
    (str (s3-util/generate-presigned-url
          {:method :get
           :bucket-name s3-util/default-bucket
           :key object-key
           :expiration expiration}))))

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
