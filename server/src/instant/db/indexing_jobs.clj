(ns instant.db.indexing-jobs
  (:require
   [chime.core :as chime-core]
   [clojure.core.async :as a]
   [clojure.string :as string]
   [honey.sql :as hsql]
   [instant.db.model.attr :as attr-model]
   [instant.db.model.transaction :as transaction-model]
   [instant.discord :as discord]
   [instant.config :as config]
   [instant.jdbc.aurora :as aurora]
   [instant.util.async :as ua]
   [instant.util.tracer :as tracer]
   [instant.jdbc.sql :as sql]
   [next.jdbc :as next-jdbc])
  (:import
   (java.lang AutoCloseable)
   (java.sql Timestamp)
   (java.time Duration Instant)
   (java.time.temporal ChronoUnit)))

(declare job-queue)

(def job-types #{"check-data-type"
                 "remove-data-type"
                 "index"
                 "unique"})

;; This is the key we use to ensure that we don't
;; check and index simultaneously
(def check-and-index-serial-key "index")

(def check-data-type-stages ["validate" ;; make sure this will work
                             "update-attr-start" ;; update attr to prevent adding invalid data
                             "revalidate" ;; recheck that no invalid data was added
                             "estimate-work"
                             "update-triples" ;; add checked-data-type to triples
                             "update-attr-done" ;; update attr to mark checking finished
                             ])

(def remove-data-type-stages ["update-attr-start" ;; update attr to prevent adding invalid data
                              "estimate-work"
                              "update-triples" ;; remove checked-data-type from triples
                              "update-attr-done" ;; update attr to mark checking finished
                              ])

(def invalid-triple-error "invalid-triple-error")
(def invalid-attr-state-error "invalid-attr-state-error")
(def unexpected-error "unexpected-error")

(defn ms-since [^Timestamp t ^Instant now]
  (.between ChronoUnit/MILLIS (.toInstant t) now))

(defn job-span-attrs [span-name job]
  (let [now (Instant/now)]
    {:name (format "indexing-jobs/%s" span-name)
     :attributes (merge {:job-id (:id job)
                         :job-status (:job_status job)
                         :job-type (:job_type job)
                         :job-stage (:job_stage job)
                         :work-estimate (:work_estimate job)
                         :work-completed (:work_completed job)
                         :ms-since-creation (ms-since (:created_at job) now)
                         :ms-since-update (ms-since (:updated_at job) now)}
                        (when (and (= "completed" (:job_status job))
                                   (:done_at job))
                          {:run-time-ms (ms-since (:created_at job)
                                                  (.toInstant ^Timestamp (:done_at job)))}))}))

(defn get-by-id
  ([job-id]
   (get-by-id aurora/conn-pool job-id))
  ([conn job-id]
   (sql/select-one conn (hsql/format {:select :*
                                      :from :indexing-jobs
                                      :where [:= :id job-id]}))))

(defn job->client-format [job]
  ;; Keep in sync with app/get-all-for-user (except for invalid_triples_sample)
  (select-keys job [:id
                    :app_id
                    :group_id
                    :attr_id
                    :attr_name
                    :job_type
                    :job_status
                    :job_stage
                    :work_estimate
                    :work_completed
                    :error
                    :checked_data_type
                    :created_at
                    :updated_at
                    :done_at
                    :invalid_triples_sample]))

(defn get-for-client-q [app-id & wheres]
  {:select [:j.*
            [{:select [[[:|| :idents.etype "." :idents.label]]]
              :from :idents
              :where [:= :attr-id :j.attr-id]}
             :attr-name]
            [[:case [:= :error invalid-triple-error]
              {:select [[[:json_agg :t]]]
               :from [[{:select [:t.entity-id :t.value]
                        :from [[:triples :t]]
                        :limit 10
                        :where [:and
                                [:= :app-id app-id]
                                [:not= nil :j.checked-data-type]
                                [:= :t.app_id :j.app_id]
                                [:= :t.attr_id :j.attr_id]
                                [:not [:triples_valid_value :j.checked-data-type :t.value]]]}
                       :t]]}
              ] :invalid-triples-sample]]
   :from [[:indexing-jobs :j]]
   :where (list* :and
                 [:= :app-id app-id]
                 wheres)})

(defn get-by-id-for-client
  ([app-id job-id]
   (get-by-id-for-client aurora/conn-pool app-id job-id))
  ([conn app-id job-id]
   (let [q (get-for-client-q app-id [:= :id job-id])
         res (sql/select-one conn (hsql/format q))]
     (job->client-format res))))

(defn get-by-group-id-for-client
  ([app-id group-id]
   (get-by-group-id-for-client aurora/conn-pool app-id group-id))
  ([conn app-id group-id]
   (let [q (get-for-client-q app-id [:= :group-id group-id])
         jobs (sql/select conn (hsql/format q))]
     (map job->client-format jobs))))

(defn invalid-triples
  ([limit job-id]
   (invalid-triples aurora/conn-pool limit job-id))
  ([conn limit job-id]
   (sql/select conn (hsql/format {:select :t.*
                                  :from [[:triples :t]]
                                  :join [[:indexing-jobs :j] [:= :t.app_id :j.app_id]]
                                  :limit limit
                                  :where [:and
                                          [:= :j.id job-id]
                                          [:not= nil :j.checked-data-type]
                                          [:= :t.app_id :j.app_id]
                                          [:= :t.attr_id :j.attr_id]
                                          [:not [:triples_valid_value :j.checked-data-type :t.value]]]}))))

(defn create-job!
  ([params]
   (create-job! aurora/conn-pool params))
  ([conn {:keys [app-id
                 group-id
                 attr-id
                 job-serial-key
                 job-type
                 job-dependency
                 job-stage
                 checked-data-type]}]
   (assert app-id)
   (assert attr-id)
   (when (= job-type "check-data-type")
     (assert checked-data-type "checked-data-type must be provided if job type is check-data-type"))
   (sql/execute-one! conn (hsql/format {:insert-into :indexing-jobs
                                        :values [{:id (random-uuid)
                                                  :group-id group-id
                                                  :app-id app-id
                                                  :attr-id attr-id
                                                  :job-serial-key job-serial-key
                                                  :job-type job-type
                                                  :checked-data-type [:cast checked-data-type :checked_data_type]
                                                  :job-dependency job-dependency
                                                  :job-stage job-stage
                                                  :job-status "waiting"}]}))))

(defn create-check-data-type-job!
  ([params]
   (create-check-data-type-job! aurora/conn-pool params))
  ([conn {:keys [app-id
                 group-id
                 attr-id
                 checked-data-type]}]
   (assert checked-data-type "checked-data-type must be provided if job type is check-data-type")
   (create-job! conn {:app-id app-id
                      :group-id group-id
                      :attr-id attr-id
                      :job-serial-key "index"
                      :job-type "check-data-type"
                      :checked-data-type checked-data-type
                      :job-stage "validate"})))

(defn create-remove-data-type-job!
  ([params]
   (create-remove-data-type-job! aurora/conn-pool params))
  ([conn {:keys [app-id
                 group-id
                 attr-id]}]
   (create-job! conn {:app-id app-id
                      :group-id group-id
                      :attr-id attr-id
                      :job-serial-key "index"
                      :job-type "remove-data-type"
                      :job-stage "update-attr-start"})))

(defn job-available-wheres
  "Where clauses that select jobs that are available for taking."
  [& additional-clauses]
  (list* :and
         [:= :worker-id nil]
         ;; Ensure we don't grab a job we can't handle
         [:in :job-type job-types]
         [:or
          [:= :job-dependency nil]
          [:= "completed" {:select :job-status
                           :from [[:indexing-jobs :dep]]
                           :where [:= :dep.id :job-dependency]}]]
         [:or
          [:= :job-status "waiting"]
          [:= :job-status "processing"]]
         additional-clauses))

(defn grab-job!
  ([job-id]
   (grab-job! aurora/conn-pool job-id))
  ([conn job-id]
   (sql/execute-one! conn (hsql/format
                           {:update :indexing-jobs
                            :where (job-available-wheres
                                    [:= :id job-id])
                            :set {:worker-id @config/process-id
                                  :job-status "processing"}}))))

(defn job-update-wheres
  "Where clauses that prevent us from updating a job we don't own."
  [& additional-clauses]
  (list* :and
         [:= :worker-id @config/process-id]
         [:= :job-status "processing"]
         additional-clauses))

(defn update-work-estimate!
  ([job next-stage]
   (update-work-estimate! aurora/conn-pool next-stage job))
  ([conn next-stage job]
   (let [estimate (case (:job_type job)
                    ("check-data-type" "remove-data-type" "index" "unique")
                    (-> (sql/select-one
                         conn
                         (hsql/format {:select :%count.*
                                       :from :triples
                                       :where [:and
                                               [:= :app-id (:app_id job)]
                                               [:= :attr-id (:attr_id job)]]}))
                        :count))]
     (sql/execute-one! conn (hsql/format {:update :indexing-jobs
                                          :where (job-update-wheres
                                                  [:= :id (:id job)])
                                          :set {:work-estimate estimate
                                                :job-stage next-stage}})))))

(defn add-work-completed!
  ([completed-count job]
   (add-work-completed! aurora/conn-pool completed-count job))
  ([conn completed-count job]
   (sql/execute-one! conn (hsql/format {:update :indexing-jobs
                                        :where (job-update-wheres
                                                [:= :id (:id job)])
                                        :set {:work-completed
                                              [:+
                                               [:coalesce :work-completed 0]
                                               completed-count]}}))))

(defn release-job!
  ([job] (release-job! aurora/conn-pool job))
  ([conn job]
   (tracer/with-span! (job-span-attrs "release-job" job)
     (sql/execute-one! conn (hsql/format {:update :indexing-jobs
                                          :where (job-update-wheres
                                                  [:= :id (:id job)])
                                          :set {:worker-id nil}})))))

(defn mark-job-completed!
  ([job]
   (mark-job-completed! aurora/conn-pool job))
  ([conn job]
   (tracer/with-span! (job-span-attrs "mark-job-completed" job)
     (sql/execute-one! conn (hsql/format {:update :indexing-jobs
                                          :where (job-update-wheres
                                                  [:= :id (:id job)])
                                          :set {:job-status "completed"
                                                :done-at :%now}})))))

(defn set-next-stage!
  ([stage job]
   (set-next-stage! aurora/conn-pool stage job))
  ([conn stage job]
   (tracer/with-span! (update (job-span-attrs "set-next-stage" job)
                              :attributes assoc :next-stage stage)
     (sql/execute-one! conn (hsql/format {:update :indexing-jobs
                                          :where (job-update-wheres
                                                  [:= :id (:id job)])
                                          :set {:job-stage stage}})))))

(defn mark-error!
  ([error job]
   (mark-error! aurora/conn-pool error job))
  ([conn error job]
   (tracer/with-span! (assoc (job-span-attrs "mark-error" job)
                             :error error)
     (sql/execute-one! conn (hsql/format {:update :indexing-jobs
                                          :where (job-update-wheres
                                                  [:= :id (:id job)])
                                          :set {:job-status "errored"
                                                :error error}})))))

(def batch-size 1000)

(defn check-next-batch!
  ([job]
   (check-next-batch! aurora/conn-pool job))
  ([conn {:keys [app_id attr_id job_type checked_data_type]}]
   (assert (= "check-data-type" job_type))
   (assert checked_data_type)
   (let [res (sql/do-execute! conn (hsql/format {:update :triples
                                                 :set {:checked-data-type [:cast checked_data_type :checked_data_type]}
                                                 :where [:in :ctid
                                                         {:select :ctid
                                                          :from :triples
                                                          :limit batch-size
                                                          :where [:and
                                                                  [:= :app-id app_id]
                                                                  [:= :attr-id attr_id]
                                                                  [:or
                                                                   [:not=
                                                                    :checked-data-type
                                                                    [:cast checked_data_type :checked_data_type]]
                                                                   [:= :checked-data-type nil]]]}]}))]
     (:next.jdbc/update-count (first res)))))

(defn check-batch-and-update-job!
  ([job]
   (check-batch-and-update-job! aurora/conn-pool job))
  ([conn job]
   (tracer/with-span! (job-span-attrs "check-batch" job)
     (let [update-count (check-next-batch! conn job)]
       (tracer/add-data! {:attributes {:update-count update-count}})
       (cond->> job
         (not (zero? update-count)) (add-work-completed! conn update-count)
         (< update-count batch-size) (set-next-stage! conn "update-attr-done"))))))

(defn has-invalid-row?
  ([job]
   (has-invalid-row? aurora/conn-pool job))
  ([conn {:keys [app_id attr_id checked_data_type]}]
   (->> (hsql/format
         {:select [[[:exists {:select :*
                              :from :triples
                              :limit 1
                              :where [:and
                                      [:= :app-id app_id]
                                      [:= :attr-id attr_id]
                                      [:or
                                       [:not=
                                        :checked-data-type
                                        [:cast checked_data_type :checked_data_type]]
                                       [:= :checked-data-type nil]]
                                      [:not [:triples_valid_value
                                             [:cast checked_data_type :checked_data_type]
                                             :value]]]}]]]})
        (sql/select-one conn)
        :exists)))

(defn update-attr! [conn {:keys [app-id attr-id set where]}]
  (attr-model/with-cache-invalidation app-id
    (next-jdbc/with-transaction [conn conn]
      (let [res (sql/execute-one!
                 conn
                 (hsql/format
                  {:update :attrs
                   :where (list* :and
                                 [:= :app-id app-id]
                                 [:= :id attr-id]
                                 where)
                   :set set}))]
        (transaction-model/create! conn {:app-id app-id})
        res))))

(defn update-attr-for-check-start!
  ([job]
   (update-attr-for-check-start! aurora/conn-pool job))
  ([conn job]
   (if (update-attr! conn {:app-id (:app_id job)
                           :attr-id (:attr_id job)
                           :set {:checked-data-type [:cast (:checked_data_type job) :checked_data_type]
                                 :checking-data-type true}})
     (set-next-stage! conn "revalidate" job)
     (mark-error! conn invalid-attr-state-error job))))

(defn update-attr-for-check-done!
  ([job]
   (update-attr-for-check-done! aurora/conn-pool job))
  ([conn job]
   (if (update-attr! conn {:app-id (:app_id job)
                           :attr-id (:attr_id job)
                           :where [[:= :checked-data-type [:cast (:checked_data_type job) :checked_data_type]]
                                   [:= :checking-data-type true]]
                           :set {:checking-data-type false}})
     (mark-job-completed! conn job)
     (mark-error! conn invalid-attr-state-error job))))

(defn rollback-attr-for-check!
  ([job]
   (rollback-attr-for-check! aurora/conn-pool job))
  ([conn job]
   (update-attr! conn {:app-id (:app_id job)
                       :attr-id (:attr_id job)
                       :where [[:= :checked-data-type [:cast (:checked_data_type job) :checked_data_type]]
                               [:= :checking-data-type true]]
                       :set {:checking-data-type false
                             :checked-data-type nil}})))

(defn validate-check!
  ([next-stage job]
   (validate-check! aurora/conn-pool next-stage job))
  ([conn next-stage job]
   (if (has-invalid-row? conn job)
     (do
       (rollback-attr-for-check! conn job)
       (mark-error! conn invalid-triple-error job))
     (set-next-stage! conn next-stage job))))

(defn run-next-check-step
  ([job]
   (run-next-check-step aurora/conn-pool job))
  ([conn job]
   (case (:job_stage job)
     ;; make sure this will work
     "validate" (validate-check! conn "update-attr-start" job)
     ;; update attr to prevent adding invalid data
     "update-attr-start" (update-attr-for-check-start! conn job)
     ;; recheck that no invalid data was added
     "revalidate" (validate-check! conn "estimate-work" job)
     "estimate-work" (update-work-estimate! conn "update-triples" job)
     ;; set checked_data_type on triples
     "update-triples" (check-batch-and-update-job! conn job)
     ;; set attr checking? to false and mark job complete
     "update-attr-done" (update-attr-for-check-done! conn job))))

(defn update-attr-for-remove-data-type-start!
  ([job]
   (update-attr-for-remove-data-type-start! aurora/conn-pool job))
  ([conn job]
   (if (update-attr! conn {:app-id (:app_id job)
                           :attr-id (:attr_id job)
                           :set {:checked-data-type nil
                                 :checking-data-type true}})
     (set-next-stage! conn "estimate-work" job)
     (mark-error! conn invalid-attr-state-error job))))

(defn update-attr-for-remove-data-type-done!
  ([job]
   (update-attr-for-remove-data-type-done! aurora/conn-pool job))
  ([conn job]
   (if (update-attr! conn {:app-id (:app_id job)
                           :attr-id (:attr_id job)
                           :where [[:= :checked-data-type nil]
                                   [:= :checking-data-type true]]
                           :set {:checking-data-type false}})
     (mark-job-completed! conn job)
     (mark-error! conn invalid-attr-state-error job))))

(defn remove-data-type-next-batch!
  ([job]
   (remove-data-type-next-batch! aurora/conn-pool job))
  ([conn {:keys [app_id attr_id job_type checked_data_type]}]
   (assert (= "remove-data-type" job_type))
   (assert (nil? checked_data_type))
   (let [res (sql/do-execute! conn (hsql/format {:update :triples
                                                 :set {:checked-data-type nil}
                                                 :where [:in :ctid
                                                         {:select :ctid
                                                          :from :triples
                                                          :limit batch-size
                                                          :where [:and
                                                                  [:= :app-id app_id]
                                                                  [:= :attr-id attr_id]
                                                                  [:not= nil :checked-data-type]]}]}))]
     (:next.jdbc/update-count (first res)))))

(defn remove-data-type-batch-and-update-job!
  ([job]
   (check-batch-and-update-job! aurora/conn-pool job))
  ([conn job]
   (tracer/with-span! (job-span-attrs "remove-data-type-batch" job)
     (let [update-count (remove-data-type-next-batch! conn job)]
       (tracer/add-data! {:attributes {:update-count update-count}})
       (cond->> job
         (not (zero? update-count)) (add-work-completed! conn update-count)
         (< update-count batch-size) (set-next-stage! conn "update-attr-done"))))))


(defn run-next-remove-data-type-step
  ([job]
   (run-next-remove-data-type-step aurora/conn-pool job))
  ([conn job]
   (case (:job_stage job)
     "update-attr-start" (update-attr-for-remove-data-type-start! conn job)
     "estimate-work" (update-work-estimate! conn "update-triples" job)
     "update-triples" (remove-data-type-batch-and-update-job! conn job)
     "update-attr-done" (update-attr-for-remove-data-type-done! conn job))))

(defn run-next-step
  ([job]
   (run-next-step aurora/conn-pool job))
  ([conn job]
   (tracer/with-span! (job-span-attrs "run-next-step" job)
     (assert (= "processing" (:job_status job)) (:job_status job))
     (case (:job_type job)
       "check-data-type" (run-next-check-step conn job)
       "remove-data-type" (run-next-remove-data-type-step conn job)))))

(defn enqueue-job
  ([job]
   (if-not (bound? #'job-queue)
     (throw (Exception. "job queue not started"))
     (enqueue-job job-queue job)))
  ([chan job]
   (a/put! chan (:id job))))

(defn process-job
  ([chan job]
   (process-job aurora/conn-pool chan job))
  ([conn chan job]
   (let [updated-job (run-next-step conn job)]
     (if (not= "processing" (:job_status updated-job))
       (tracer/record-info! (job-span-attrs "job-finished-processing" updated-job))
       (if-let [job (release-job! conn updated-job)]
         (enqueue-job chan job)
         (tracer/record-info! (job-span-attrs "unable-to-release-job" updated-job)))))))

(defn start-process [chan]
  (loop []
    (when-let [job-id (a/<!! chan)]
      (try
        (tracer/with-span! {:name "indexing-jobs/grab-job"
                            :attributes {:job-id job-id}}
          (if-let [job (grab-job! job-id)]
            (process-job chan job)
            (tracer/add-data! {:attributes {:job-not-grabbed true}})))
        (catch Throwable t
          (discord/send-error-async! (format "%s unexpected job error job-id=%s msg=%s"
                                             (:dww discord/mention-constants)
                                             job-id
                                             (.getMessage t)))
          (tracer/record-exception-span! t {:name "indexing-jobs/process-error"
                                            :escaping? false
                                            :attributes {:job-id job-id}})))
      (recur))))

(defn grab-forgotten-jobs!
  ([] (grab-forgotten-jobs! aurora/conn-pool))
  ([conn]
   (tracer/with-span! {:name "indexing-jobs/grab-forgotten-jobs!"}
     (let [jobs (sql/select conn (hsql/format {:select :id
                                               :from :indexing-jobs
                                               :limit 100
                                               :where (job-available-wheres)}))]
       (tracer/add-data! {:attributes {:job-count (count jobs)
                                       :job-ids (map :id jobs)}})
       (doseq [job jobs]
         (enqueue-job job))
       jobs))))

(defn warn-stuck-jobs!
  ([] (warn-stuck-jobs! aurora/conn-pool))
  ([conn]
   (tracer/with-span! {:name "indexing-jobs/grab-forgotten-jobs!"}
     (let [q {:select :id
              :from :indexing-jobs
              :limit 5
              :where [:and
                      [:in :job-status ["processing" "waiting"]]
                      [:< [:raw "interval '5 minutes'"] [:- :%now :updated-at]]]}
           jobs (sql/select conn (hsql/format q))]

       ;; TODO(dww): Notify team once we're comfortable with how this works
       ;;   Might need a flag to prevent spamming the channel.
       ;;   Could also just "steal" the job.
       (if (= :prod (config/get-env))
         (discord/send-error-async!
          (str (:dww discord/mention-constants)
               " Indexing jobs are stuck! First 5 are "
               (string/join "," (map (fn [{:keys [id]}]
                                       (format "\"%s\"" id)) jobs))))
         (tracer/record-info! {:name "indexing-jobs/found-stuck-jobs!"
                               :attributes {:job-ids (map :id jobs)}}))

       (tracer/add-data! {:attributes {:job-count (count jobs)
                                       :job-ids (map :id jobs)}})
       jobs))))

(defn start []
  (let [job-queue-chan (ua/gauged-chan ::job-queue 32000)]
    (def job-queue job-queue-chan)

    (def workers (doall (for [i (range 32)]
                          (do
                            (tracer/with-span! {:name "indexing-jobs/start-worker"
                                                :attributes {:i i}})
                            {:i i
                             :process (ua/vfut-bg (start-process job-queue-chan))}))))

    (def schedule (chime-core/chime-at
                   (chime-core/periodic-seq (Instant/now) (Duration/ofMinutes 5))
                   (fn [_time]
                     (grab-forgotten-jobs!)
                     (warn-stuck-jobs!))))))

(defn stop []
  (when (bound? #'schedule)
    (.close ^AutoCloseable schedule))
  (when (bound? #'job-queue)
    (a/close! job-queue))

  (when (bound? #'workers)
    (doseq [{:keys [i process]} workers]
      (tracer/with-span! {:name "indexing-jobs/wait-for-worker-to-stop"
                          :attributes {:i i}}
        @process))))

(defn restart []
  (stop)
  (start))
