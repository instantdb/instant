(ns instant.storage.sweeper
  (:require
   [chime.core :as chime-core]
   [clojure.core.async :as a]
   [instant.storage.s3 :as instant-s3]
   [instant.util.s3 :as s3-util]
   [instant.util.tracer :as tracer]
   [instant.util.async :as ua]
   [instant.config :as config]
   [honey.sql :as hsql]
   [instant.jdbc.sql :as sql]
   [instant.jdbc.aurora :as aurora]
   [clojure.tools.logging :as log]
   [instant.discord :as discord]
   [clojure.string :as string])
  (:import
   (java.lang AutoCloseable)
   (java.sql Timestamp)
   (java.time Duration Instant)
   (java.time.temporal ChronoUnit)))

;; Assuming 1 job takes ~5 seconds to complete (should be less)
;; this config will process up to >10M files per hour
;; -> 720 jobs per hour, 1000 files per job, 720k files per hour
;; -> with 16 workers that's >10M files per hour per machine
(declare job-queue)
(def batch-size 1000) ;; how many files to process at a time
(def num-workers 16) ;; max number of workers to run concurrently
(def job-queue-size 1000) ;; how many jobs to keep in memory

(def job-stages ["claim-files"
                 "delete-files"
                 "mark-complete"])

(defn ms-since [^Timestamp t ^Instant now]
  (.between ChronoUnit/MILLIS (.toInstant t) now))

(defn job-span-attrs [span-name job]
  (let [now (Instant/now)]
    {:name (format "storage-sweeper-jobs/%s" span-name)
     :attributes (merge {:job-id (:id job)
                         :job-status (:job_status job)
                         :job-stage (:job_stage job)
                         :num-files-claimed (:num_files_claimed job)
                         :ms-since-creation (ms-since (:created_at job) now)}
                        (when (and (= "completed" (:job_status job))
                                   (:done_at job))
                          {:run-time-ms (ms-since (:created_at job)
                                                  (.toInstant ^Timestamp (:done_at job)))}))}))

(defn job-available-wheres
  [& additional-clauses]
  (list* :and
         [:= :worker-id nil]
         [:= :job-status [:cast "waiting" :storage_sweeper_job_status]]
         additional-clauses))

(defn job-update-wheres
  "Where clauses that prevent us from updating a job we don't own."
  [& additional-clauses]
  (list* :and
         [:= :worker-id @config/process-id]
         [:= :job-status [:cast "processing" :storage_sweeper_job_status]]
         additional-clauses))

(defn get-jobs
  ([] (get-jobs (aurora/conn-pool :read)))
  ([conn]
   (sql/select ::get-jobs
               conn
               (hsql/format
                {:select :*
                 :from :storage-sweeper-jobs
                 :where (job-available-wheres)}))))

(defn get-job-by-id
  ([job-id]
   (get-job-by-id (aurora/conn-pool :read) job-id))
  ([conn job-id]
   (sql/select-one ::get-by-id
                   conn
                   (hsql/format
                    {:select :*
                     :from :storage-sweeper-jobs
                     :where [:= :id job-id]}))))

(defn get-job-files
  ([job] (get-job-files (aurora/conn-pool :read) job))
  ([conn job]
   (sql/select ::get-job-files
               conn
               (hsql/format
                {:select [:*]
                 :from :app-files-to-sweep
                 :where [:= :processing-job-id (:id job)]}))))

(defn create-jobs!
  ([] (create-jobs! (aurora/conn-pool :write) nil))
  ([conn] (create-jobs! conn nil))
  ([conn app-id]
   (let [job-count (-> (sql/select-one
                        ::get-needed-job-count
                        conn
                        (hsql/format
                         {:select [[[:ceil [:/ [:count :*] (* 1.0 batch-size)]] :job-count]]
                          :from :app-files-to-sweep
                          :where
                          (if app-id
                            [:and
                             [:= :app-id app-id]
                             [:is :processing-job-id nil]]
                            [:is :processing-job-id nil])}))
                       :job_count)]
     (when (pos? job-count)
       (sql/execute! ::create-jobs!
                     (aurora/conn-pool :write)
                     (hsql/format
                      {:insert-into :storage-sweeper-jobs
                       :values (repeatedly job-count
                                           (fn []
                                             {:id (random-uuid)
                                              :app-id app-id
                                              :job-status [:cast "waiting" :storage_sweeper_job_status]
                                              :job-stage "claim-files"}))}))))))

(defn mark-error!
  ([props job]
   (mark-error! (aurora/conn-pool :write) props job))
  ([conn props job]
   (tracer/with-span! (merge (job-span-attrs "mark-error" job)
                             props)
     (sql/execute-one! ::mark-error!
                       conn (hsql/format {:update :storage-sweeper-jobs
                                          :where (job-update-wheres
                                                  [:= :id (:id job)])
                                          :set (merge {:job-status [:cast "errored" :storage_sweeper_job_status]}
                                                      props)})))))

(defn set-next-stage!
  ([stage job]
   (set-next-stage! (aurora/conn-pool :write) stage job))
  ([conn stage job]
   (tracer/with-span! (update (job-span-attrs "set-next-stage" job)
                              :attributes assoc :next-stage stage)
     (sql/execute-one! ::set-next-stage!
                       conn (hsql/format {:update :storage-sweeper-jobs
                                          :where (job-update-wheres
                                                  [:= :id (:id job)])
                                          :set {:job-stage stage}})))))

(defn grab-job!
  ([job-id]
   (grab-job! (aurora/conn-pool :write) job-id))
  ([conn job-id]
   (def res (sql/execute-one! ::grab-job!
                              conn
                              (hsql/format
                               {:update :storage-sweeper-jobs
                                :where (job-available-wheres
                                        [:= :id job-id])
                                :set {:worker-id @config/process-id
                                      :job-status [:cast "processing" :storage_sweeper_job_status]}})))
   res))

(defn claim-files!
  ([job]
   (claim-files! (aurora/conn-pool :write) job))
  ([conn job]

   (let [app-id (:app_id job)
         files (sql/select ::claim-files!
                           conn
                           (hsql/format
                            {:with [[:to_update
                                     {:select [:id]
                                      :from :app_files_to_sweep
                                      :where (if app-id
                                               [:and
                                                [:= :app-id app-id]
                                                [:is :processing_job_id nil]]
                                               [:is :processing_job_id nil])
                                      :order-by :created-at
                                      :limit batch-size}]]
                             :update :app_files_to_sweep
                             :set {:processing_job_id (:id job)}
                             :where [:in :id {:select [:id]
                                              :from :to_update}]
                             :returning [:id]}))]
     (when (seq files)
       (sql/execute-one! ::update-job-count!
                         conn
                         (hsql/format
                          {:update :storage_sweeper_jobs
                           :set {:num_files_claimed (count files)}
                           :where [:= :id (:id job)]}))

       (set-next-stage! conn "delete-files" job)))))

(defn delete-files!
  ([job] (delete-files! (aurora/conn-pool :write) job))
  ([conn job]
   (tracer/with-span! (job-span-attrs "delete-files" job)
     (let [files (get-job-files conn job)]
       (when (seq files)
         (try
           (let [object-keys (mapv #(instant-s3/->object-key (:app_id %) (:location_id %)) files)]

             ;; Delete from S3 in prod
             (when (= :prod (config/get-env))
               (s3-util/delete-objects object-keys))

             ;; Delete files from sweeper
             (sql/execute! ::delete-swept-files!
                           conn
                           (hsql/format
                            {:delete-from :app-files-to-sweep
                             :where [:= :processing-job-id (:id job)]
                             :returning [:id]}))

             (set-next-stage! conn "mark-complete" job))
           (catch Exception e
             (log/error e "Error deleting files batch")
             (mark-error! conn (.getMessage e) job))))))))

(defn mark-job-completed!
  ([job]
   (mark-job-completed! (aurora/conn-pool :write) job))
  ([conn job]
   (tracer/with-span! (job-span-attrs "mark-job-completed" job)
     (sql/execute-one! ::mark-job-completed!
                       conn (hsql/format {:update :storage-sweeper-jobs
                                          :where (job-update-wheres
                                                  [:= :id (:id job)])
                                          :set {:job-status [:cast "completed" :storage_sweeper_job_status]
                                                :done-at :%now}})))))

(defn run-next-step
  ([job]
   (run-next-step (aurora/conn-pool :write) job))
  ([conn job]
   (case (:job_stage job)
     "claim-files" (claim-files! conn job)
     "delete-files" (delete-files! conn job)
     "mark-complete" (mark-job-completed! conn job))))

(defn enqueue-job
  ([job]
   (if-not (bound? #'job-queue)
     (throw (Exception. "job queue not started"))
     (enqueue-job job-queue job)))
  ([chan job]
   (a/put! chan (:id job))))

(defn release-job!
  ([job] (release-job! (aurora/conn-pool :write) job))
  ([conn job]
   (tracer/with-span! (job-span-attrs "release-job" job)
     (sql/execute-one! ::release-job!
                       conn
                       (hsql/format
                        {:update :storage-sweeper-jobs
                         :where (job-update-wheres
                                 [:= :id (:id job)])
                         :set {:worker-id nil}})))))

(defn process-job
  ([job]
   (process-job (aurora/conn-pool :write) job))
  ([conn job]
   (loop [current-job job]
     (let [updated-job (run-next-step conn current-job)]
       (if (not= "processing" (:job_status updated-job))
         (tracer/record-info! (job-span-attrs "job-finished-processing" updated-job))
         (recur updated-job))))))

(defn handle-process [job-id]
  (try
    (tracer/with-span! {:name "storage-sweeper/grab-job"
                        :attributes {:job-id job-id}}
      (if-let [job (grab-job! job-id)]
        (do
          (def res job)
          (process-job job))
        (tracer/add-data! {:attributes {:job-not-grabbed true}})))
    (catch Throwable t
      (when (= :prod (config/get-env))
        (discord/send-error-async! (format "%s unexpected storage sweeper job error job-id=%s msg=%s"
                                           (:nezaj discord/mention-constants)
                                           job-id
                                           (.getMessage t))))
      (tracer/record-exception-span! t {:name "storage-sweeper/process-error"
                                        :escaping? false
                                        :attributes {:job-id job-id}})
      (sql/execute-one! ::handle-process-error
                        (aurora/conn-pool :write)
                        (hsql/format
                         {:update :storage-sweeper-jobs
                          :where (job-update-wheres
                                  [:= :id job-id])
                          :set {:job-status [:cast "errored" :storage_sweeper_job_status]
                                :error (.getMessage t)}}))
      (when-let [job (get-job-by-id job-id)]
        (release-job! job)))))

(defn start-process [chan]
  (loop []
    (when-let [job-id (a/<!! chan)]
      (handle-process job-id)
      (recur))))

(defn grab-forgotten-jobs!
  ([] (grab-forgotten-jobs! (aurora/conn-pool :write)))
  ([conn]
   (tracer/with-span! {:name "storage-sweeper/grab-forgotten-jobs!"}
     (let [jobs (sql/select ::grab-forgotten-jobs!
                            conn
                            (hsql/format
                             {:select :id
                              :from :storage-sweeper-jobs
                              :limit 100
                              :where (job-available-wheres)}))]
       (tracer/add-data! {:attributes {:job-count (count jobs)
                                       :job-ids (map :id jobs)}})
       (doseq [job jobs]
         (enqueue-job job))))))

(defn warn-stuck-jobs!
  ([] (warn-stuck-jobs! (aurora/conn-pool :read)))
  ([conn]
   (tracer/with-span! {:name "storage-sweeper/warn-stuck-jobs!"}
     (let [jobs (sql/select ::warn-stuck-jobs!
                            conn
                            (hsql/format
                             {:select :id
                              :from :storage_sweeper_jobs
                              :limit 5
                              :where [:and
                                      [:in :job_status
                                       [[:cast "processing" :storage_sweeper_job_status]
                                        [:cast "waiting" :storage_sweeper_job_status]]]
                                      [:< [:raw "interval '5 minutes'"]
                                       [:- :%now :created_at]]]}))]
       (when (seq jobs)
         (if (= :prod (config/get-env))
           (discord/send-error-async!
            (str (:neza discord/mention-constants)
                 " Storage sweeper jobs are stuck! First 5 are "
                 (string/join "," (map (fn [{:keys [id]}]
                                         (format "\"%s\"" id))
                                       jobs))))
           (tracer/record-info! {:name "storage-sweeper/found-stuck-jobs!"
                                 :attributes {:job-ids (map :id jobs)}})))
       (tracer/add-data! {:attributes {:job-count (count jobs)
                                       :job-ids (map :id jobs)}})))))

(defn start []
  (log/info "Starting storage sweeper daemon")
  (let [job-queue-chan (ua/gauged-chan ::job-queue job-queue-size)]
    (def job-queue job-queue-chan)

    (def workers
      (doall
       (for [i (range num-workers)]
         (do
           (tracer/with-span! {:name "storage-sweeper/start-worker"
                               :attributes {:i i}})

           {:i i
            :process (ua/vfut-bg (start-process job-queue-chan))}))))

    ;; Schedule periodic job creation and monitoring
    (def schedule
      (chime-core/chime-at
       (chime-core/periodic-seq
        (Instant/now)
        (Duration/ofMinutes 60))
       (fn [_time]
         (create-jobs!)
         (grab-forgotten-jobs!)
         (warn-stuck-jobs!))))))

(defn stop []
  (log/info "Stopping storage sweeper daemon")
  (when (bound? #'schedule)
    (.close ^AutoCloseable schedule))
  (when (bound? #'job-queue)
    (a/close! job-queue))
  (when (bound? #'workers)
    (doseq [{:keys [i process]} workers]
      (tracer/with-span! {:name "storage-sweeper/wait-for-worker-to-stop"
                          :attributes {:i i}}
        (try
          @process
          (catch Exception e
            (log/error e "Error stopping worker")))))))

(defn restart []
  (stop)
  (start))

(defn before-ns-unload []
  (stop))

(defn after-ns-reload []
  (start))
