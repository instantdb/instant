(ns instant.storage.s3
  (:require [clojure.string :as string]
            [clojure.java.io :as io]
            [instant.util.s3 :as s3-util]
            [instant.flags :as flags]))

;; Legacy S3 migration helpers
;; ------------------
(defn ->legacy-object-key [app-id filename]
  (str app-id "/" filename))

(defn legacy-object-key->path
  "Extract path from our S3 object keys"
  [object-key]
  (let [[_app-id & path] (string/split object-key #"/")]
    (string/join "/" path)))

;; S3 path manipulation
;; ----------------------
(defn filename->bin
  ^long [^String filename]
  (mod (Math/abs (.hashCode filename)) 10))

(defn ->object-key
  "We prefix objects with an app id and bin. Combined with a filename
  this gives us our key for each object."
  [app-id filename]
  (let [bin (filename->bin filename)
        fname (if (string/starts-with? filename "/")
                (subs filename 1)
                filename)]
    (str app-id "/" bin "/" fname)))

(defn object-key->app-id
  "Extract app-id from our S3 object keys"
  [object-key]
  (first (string/split object-key #"/")))

(defn object-key->bin
  "Extract bin from our S3 object keys"
  [object-key]
  (second (string/split object-key #"/")))

(defn object-key->path
  "Extract path from our S3 object keys"
  [object-key]
  (let [[_app-id _bin & path] (string/split object-key #"/")]
    (string/join "/" path)))

;; Instant <> S3 integration
;; ----------------------
(defn upload-file-to-s3 [{:keys [app-id path] :as ctx} file]
  (when (not (instance? java.io.InputStream file))
    (throw (Exception. "Unsupported file format")))
  (let [migration? (-> (flags/storage-migration) :disableLegacy? not)]
    (if migration?
      (let [baos (java.io.ByteArrayOutputStream.)
            _ (io/copy file baos)
            bytes (.toByteArray baos)
            ctx* (assoc ctx :object-key (->object-key app-id path))
            ctx-legacy* (assoc ctx :object-key (->legacy-object-key app-id path))]
        (s3-util/upload-stream-to-s3 ctx-legacy* (io/input-stream bytes))
        (s3-util/upload-stream-to-s3 ctx* (io/input-stream bytes)))
      (let [ctx* (assoc ctx :object-key (->object-key app-id path))]
        (s3-util/upload-stream-to-s3 ctx* file)))))

(defn format-object [{:keys [key object-metadata]}]
  (-> object-metadata
      (select-keys [:content-disposition :content-type :content-length :etag])
      (assoc :size (:content-length object-metadata)
             :last-modified (-> object-metadata :last-modified .getMillis)
             :path (object-key->path key))))

(defn get-object-metadata
  ([app-id path] (get-object-metadata s3-util/default-bucket app-id path))
  ([bucket-name app-id path]
   (let [object-key (->object-key app-id path)]
     (format-object (s3-util/get-object bucket-name object-key)))))

(defn delete-file! [app-id filename]
  (let [object-key (->object-key app-id filename)]
    (s3-util/delete-object object-key)))

(defn bulk-delete-files! [app-id filenames]
  (let [keys (mapv (fn [filename] (->object-key app-id filename)) filenames)]
    (s3-util/delete-objects-paginated keys)))

(defn create-legacy-signed-download-url! [app-id filename]
  (let [expiration (+ (System/currentTimeMillis) (* 1000 60 60 24 7)) ;; 7 days
        object-key (->legacy-object-key app-id filename)]
    (str (s3-util/generate-presigned-url
          {:method :get
           :bucket-name s3-util/default-bucket
           :key object-key
           :expiration expiration}))))

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
