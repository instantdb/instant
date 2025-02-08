(ns instant.storage.sweeper
  (:require
   [chime.core :as chime-core]
   [instant.flags :as flags]
   [instant.model.app-file-to-sweep :as app-file-to-sweep]
   [instant.storage.s3 :as instant-s3]
   [instant.util.s3 :as s3-util]
   [instant.util.tracer :as tracer]
   [instant.util.date :as date]
   [clojure.tools.logging :as log])
  (:import
   (java.lang AutoCloseable)
   (java.time Period)))

(defn handle-sweep! []
  (tracer/with-span! {:name "storage/sweeper"}
    (let [files (app-file-to-sweep/get-all)
          migration? (-> (flags/storage-migration) :disableLegacy? not)
          keys-to-delete (mapv #(instant-s3/->object-key (:app_id %) (:path %)) files)
          legacy-keys-to-delete (delay
                                  (map #(instant-s3/->legacy-object-key
                                         (:app_id %)
                                         (:path %))
                                       files))
          all-keys (cond-> keys-to-delete
                     migration? (into @legacy-keys-to-delete))]
      (when (seq all-keys)
        (s3-util/delete-objects-paginated all-keys)
        (app-file-to-sweep/delete-by-ids!
         {:ids (mapv :id files)})))))

(comment
  (handle-sweep!))

(defn period []
  (let [now (date/pst-now)
        run-at-pst (-> (date/pst-now)
                       (.withHour 5)
                       (.withMinute 0))
        periodic-seq (chime-core/periodic-seq
                      run-at-pst
                      (Period/ofDays 1))]

    (->> periodic-seq
         (filter (fn [x] (.isAfter x now))))))

(comment
  (first (period)))

(defonce schedule (atom nil))

(defn start []
  (log/info "Starting storage sweeper daemon")
  (swap! schedule (fn [curr-schedule]
                    (if curr-schedule
                      curr-schedule
                      (chime-core/chime-at
                       (period)
                       (fn [_time]
                         (handle-sweep!)))))))

(defn stop []
  (when-let [curr-schedule @schedule]
    (.close ^AutoCloseable curr-schedule)
    (reset! schedule nil)))

(defn restart []
  (stop)
  (start))
