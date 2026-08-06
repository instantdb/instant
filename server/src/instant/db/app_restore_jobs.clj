(ns instant.db.app-restore-jobs
  "Admin-only, on-demand app restores from an uploaded zip. The upload handler
   validates params, streams the zip to local disk, inserts a row here, and kicks
   off `instant.restore/restore-from-zip` in a background vfuture *on this
   machine* -- there's no worker pool, since this is meant for the operator of a
   self-hosted instance and only one restore runs at a time. The client polls the
   row for `job_status`."
  (:require
   [clojure.java.io :as io]
   [honey.sql :as hsql]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.restore :as restore]
   [instant.util.async :as ua]
   [instant.util.tracer :as tracer])
  (:import
   (java.io File InputStream)
   (java.util.concurrent.atomic AtomicLong)))

;; Where uploaded zips are staged on disk until the restore reads them. The same
;; machine that received the upload runs the restore, so local disk is fine.
(def ^{:tag File} upload-dir
  (io/file (System/getProperty "java.io.tmpdir") "instant-restore-uploads"))

(defn store-zip!
  "Streams the uploaded zip to `<upload-dir>/<job-id>.zip` and returns the File."
  ^File [job-id ^InputStream in]
  (.mkdirs upload-dir)
  (let [dest (io/file upload-dir (str job-id ".zip"))]
    (io/copy in dest)
    dest))

(defn create-job!
  [{:keys [id app-id creator-id org-id title zip-path]}]
  (sql/execute-one! ::create-job!
                    (aurora/conn-pool :write)
                    (hsql/format {:insert-into :app-restore-jobs
                                  :values [{:id id
                                            :app-id app-id
                                            :creator-id creator-id
                                            :org-id org-id
                                            :title title
                                            :zip-path zip-path
                                            :job-status "waiting"}]
                                  :returning :*})))

(defn get-by-id
  ([id] (get-by-id (aurora/conn-pool :read) id))
  ([conn id]
   (sql/select-one ::get-by-id
                   conn
                   (hsql/format {:select :*
                                 :from :app-restore-jobs
                                 :where [:= :id id]}))))

(defn get-recent
  "The most recent restore jobs, newest first, for the admin dashboard list."
  ([] (get-recent (aurora/conn-pool :read) 20))
  ([conn n]
   (sql/select ::get-recent
               conn
               (hsql/format {:select :*
                             :from :app-restore-jobs
                             :order-by [[:created-at :desc]]
                             :limit n}))))

(defn job->admin-format [job]
  (select-keys job [:id
                    :app_id
                    :title
                    :job_status
                    :progress
                    :error
                    :created_at
                    :done_at
                    :updated_at]))

(defn mark-processing! [id]
  (sql/execute-one! ::mark-processing!
                    (aurora/conn-pool :write)
                    (hsql/format {:update :app-restore-jobs
                                  :set {:job-status "processing"}
                                  :where [:and
                                          [:= :id id]
                                          [:= :job-status "waiting"]]})))

(defn mark-completed! [id]
  (sql/execute-one! ::mark-completed!
                    (aurora/conn-pool :write)
                    (hsql/format {:update :app-restore-jobs
                                  :set {:job-status "completed"
                                        :done-at :%now}
                                  :where [:and
                                          [:= :id id]
                                          [:= :job-status "processing"]]})))

(defn mark-errored! [id ^Throwable t]
  (sql/execute-one! ::mark-errored!
                    (aurora/conn-pool :write)
                    (hsql/format {:update :app-restore-jobs
                                  :set {:job-status "errored"
                                        :error (.getMessage t)
                                        :done-at :%now}
                                  :where [:and
                                          [:= :id id]
                                          [:in :job-status ["waiting" "processing"]]]})))

;; How often a running restore persists progress (which doubles as its
;; cancellation checkpoint).
(def progress-report-interval-ms 1000)

(defn- format-progress [triples files totals]
  (cond
    (and (zero? triples) (zero? files) (nil? totals))
    "Preparing restore…"

    totals
    (format "Restored %,d / %,d triples, %,d / %,d files"
            triples (:triples totals) files (:files totals))

    :else
    (format "Restored %,d triples, %,d files" triples files)))

(defn report-progress!
  "Persists the restore's progress and, in the same write, confirms the job is
   still `processing`. Returns true while it's still ours to run, false once it's
   been cancelled (or otherwise left `processing`)."
  [id progress]
  (let [res (sql/do-execute! ::report-progress!
                             (aurora/conn-pool :write)
                             (hsql/format {:update :app-restore-jobs
                                           :set {:progress progress}
                                           :where [:and
                                                   [:= :id id]
                                                   [:= :job-status "processing"]]}))]
    (pos? (:next.jdbc/update-count (first res)))))

(defn cancel-job!
  "Marks a waiting/processing restore as cancelled so its worker stops. Returns
   the updated row, or nil if there was no in-flight restore with that id."
  [id]
  (sql/execute-one! ::cancel-job!
                    (aurora/conn-pool :write)
                    (hsql/format {:update :app-restore-jobs
                                  :set {:job-status "cancelled"
                                        :done-at :%now}
                                  :where [:and
                                          [:= :id id]
                                          [:in :job-status ["waiting" "processing"]]]
                                  :returning :*})))

(defn run-restore!
  "Runs the restore for a job and records the outcome, then removes the staged
   zip. The restore runs on a vfuture while this thread persists progress every
   `progress-report-interval-ms`; that write doubles as the cancellation
   checkpoint -- once the job is no longer `processing` (a DELETE flipped it to
   `cancelled`), the restore is interrupted (which triggers its partial-app
   cleanup) and left cancelled. Meant to run in a background vfuture."
  [{:keys [id app-id creator-id org-id title zip-path]}]
  (tracer/with-span! {:name "app-restore-jobs/run-restore"
                      :attributes {:job-id id
                                   :app-id app-id}}
    (mark-processing! id)
    (let [triples (AtomicLong. 0)
          files (AtomicLong. 0)
          totals (atom nil)
          fut (ua/vfuture
               (restore/restore-from-zip
                {:zip-file-path zip-path
                 :app-id app-id
                 :creator-id creator-id
                 :org-id org-id
                 :title title
                 :on-totals (fn [t] (reset! totals t))
                 :on-triples-copied (fn [n] (.addAndGet triples n))
                 :on-file-uploaded (fn [] (.incrementAndGet files))}))]
      (try
        (loop []
          (let [result (deref fut progress-report-interval-ms ::pending)]
            (if (identical? ::pending result)
              (if (report-progress! id (format-progress (.get triples) (.get files) @totals))
                (recur)
                (do (future-cancel fut)
                    (tracer/add-data! {:attributes {:cancelled true}})))
              (do (mark-completed! id)
                  (tracer/add-data! {:attributes {:triples (.get triples)
                                                  :files (.get files)}})))))
        (catch Throwable t
          ;; `fut` wraps the cause in an ExecutionException; unwrap it so the
          ;; recorded error is the real failure.
          (let [cause (or (ex-cause t) t)]
            (tracer/record-exception-span! cause {:name "app-restore-jobs/run-restore-error"
                                                  :escaping? false})
            (mark-errored! id cause)))
        (finally
          (io/delete-file zip-path true))))))

(defn start-restore!
  "Stages the uploaded zip, inserts a job row, and kicks off the restore in a
   detached background vfuture on this machine. Returns the inserted row. Params
   are assumed already validated (see `restore/validate-restore-params!`)."
  [{:keys [app-id creator-id org-id title zip-stream]}]
  (let [id (random-uuid)
        zip-path (.getPath (store-zip! id zip-stream))
        params {:id id
                :app-id app-id
                :creator-id creator-id
                :org-id org-id
                :title title
                :zip-path zip-path}
        job (create-job! params)]
    (ua/vfut-bg (run-restore! params))
    job))
