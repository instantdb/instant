(ns instant.db.indexing-jobs
  (:require
   [chime.core :as chime-core]
   [clojure.core.async :as a]
   [clojure.string :as string]
   [honey.sql :as hsql]
   [instant.db.model.attr :as attr-model]
   [instant.db.model.transaction :as transaction-model]
   [instant.db.model.triple :as triple-model]
   [instant.discord :as discord]
   [instant.config :as config]
   [instant.jdbc.aurora :as aurora]
   [instant.system-catalog :as system-catalog]
   [instant.util.async :as ua]
   [instant.util.exception :as ex]
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
                 "remove-index"
                 "unique"
                 "remove-unique"})

;; This is the key we use for checking to ensure we don't set the type
;; to two values simultaneously
(def check-serial-key "check")
;; This is the key we use for checking to ensure we don't start multiple indexing
;; jobs for the same attr
(def index-serial-key "index")
(def unique-serial-key "unique")

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

(def index-stages ["update-attr-start"
                   "estimate-work"
                   "update-triples"
                   "insert-nulls"
                   "update-attr-done"])

(def remove-index-stages ["update-attr-start"
                          "estimate-work"
                          "update-triples"
                          "update-attr-done"])

(def unique-stages ["update-attr-start"
                    "estimate-work"
                    "update-triples"
                    "update-attr-done"])

(def remove-unique-stages ["update-attr-start"
                           "estimate-work"
                           "update-triples"
                           "update-attr-done"])


(def invalid-triple-error "invalid-triple-error")
(def triple-too-large-error "triple-too-large-error")
(def triple-not-unique-error "triple-not-unique-error")
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
   (get-by-id (aurora/conn-pool :read) job-id))
  ([conn job-id]
   (sql/select-one ::get-by-id
                   conn (hsql/format {:select :*
                                      :from :indexing-jobs
                                      :where [:= :id job-id]}))))

(defn job->client-format [job]
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
                    :invalid_unique_value
                    :invalid_triples_sample]))

(defn get-for-client-q [app-id & wheres]
  {:select [:j.*
            [{:select [[[:|| :idents.etype "." :idents.label]]]
              :from :idents
              :where [:= :attr-id :j.attr-id]}
             :attr-name]
            [[:case-expr :error
              [:inline invalid-triple-error]
              [:case-expr :job-type
               "check-data-type"
               {:select [[[:json_agg :t]]]
                :from [[{:select [:t.entity-id :t.value [[:jsonb_typeof :t.value] :json-type]]
                         :from [[:triples :t]]
                         :limit 10
                         :where [:and
                                 [:= :app-id app-id]
                                 [:not= nil :j.checked-data-type]
                                 [:= :t.app_id :j.app_id]
                                 [:= :t.attr_id :j.attr_id]
                                 [:not [:triples_valid_value :j.checked-data-type :t.value]]]}
                        :t]]}]
              [:inline triple-not-unique-error]
              {:select [[[:json_agg :t]]]
               :from [[{:select [:t.entity-id :t.value [[:jsonb_typeof :t.value] :json-type]]
                        :from [[:triples :t]]
                        :limit 10
                        :where [:and
                                [:= :app-id app-id]
                                [:= :t.app_id :j.app_id]
                                [:= :t.attr_id :j.attr_id]
                                [:= :t.value :j.invalid-unique-value]]}
                       :t]]}

              [:inline triple-too-large-error]
              {:select [[[:json_agg :t]]]
               :from [[{:select [:t.entity-id :t.value [[:jsonb_typeof :t.value] :json-type]]
                        :from [[:triples :t]]
                        :limit 10
                        :where [:and
                                [:= :app-id app-id]
                                [:= :t.app_id :j.app_id]
                                [:= :t.attr_id :j.attr_id]
                                [:= :t.entity_id :j.invalid-entity-id]]}
                       :t]]}
              ] :invalid-triples-sample]]
   :from [[:indexing-jobs :j]]
   :where (list* :and
                 [:= :app-id app-id]
                 wheres)})

(defn get-by-id-for-client
  ([app-id job-id]
   (get-by-id-for-client (aurora/conn-pool :read) app-id job-id))
  ([conn app-id job-id]
   (let [q (get-for-client-q app-id [:= :id job-id])
         res (sql/select-one ::get-by-id-for-client conn (hsql/format q))]
     (job->client-format res))))

(defn get-by-group-id-for-client
  ([app-id group-id]
   (get-by-group-id-for-client (aurora/conn-pool :read) app-id group-id))
  ([conn app-id group-id]
   (let [q (get-for-client-q app-id [:= :group-id group-id])
         jobs (sql/select ::get-by-group-id-for-client conn (hsql/format q))]
     (map job->client-format jobs))))

(defn invalid-triples
  ([limit job-id]
   (invalid-triples (aurora/conn-pool :read) limit job-id))
  ([conn limit job-id]
   (sql/select ::invalid-triples
               conn (hsql/format {:select [:t.* [[:jsonb_typeof :value] :json-type]]
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
   (create-job! (aurora/conn-pool :write) params))
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
   (sql/execute-one! ::create-job!
                     conn (hsql/format {:insert-into :indexing-jobs
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
   (create-check-data-type-job! (aurora/conn-pool :write) params))
  ([conn {:keys [app-id
                 group-id
                 attr-id
                 checked-data-type]}]
   (assert checked-data-type "checked-data-type must be provided if job type is check-data-type")
   (create-job! conn {:app-id app-id
                      :group-id group-id
                      :attr-id attr-id
                      :job-serial-key check-serial-key
                      :job-type "check-data-type"
                      :checked-data-type checked-data-type
                      :job-stage "validate"})))

(defn create-remove-data-type-job!
  ([params]
   (create-remove-data-type-job! (aurora/conn-pool :write) params))
  ([conn {:keys [app-id
                 group-id
                 attr-id]}]
   (create-job! conn {:app-id app-id
                      :group-id group-id
                      :attr-id attr-id
                      :job-serial-key check-serial-key
                      :job-type "remove-data-type"
                      :job-stage "update-attr-start"})))

(defn create-index-job!
  ([params]
   (create-index-job! (aurora/conn-pool :write) params))
  ([conn {:keys [app-id
                 group-id
                 attr-id]}]
   (create-job! conn {:app-id app-id
                      :group-id group-id
                      :attr-id attr-id
                      :job-serial-key index-serial-key
                      :job-type "index"
                      :job-stage "update-attr-start"})))

(defn create-remove-index-job!
  ([params]
   (create-remove-index-job! (aurora/conn-pool :write) params))
  ([conn {:keys [app-id
                 group-id
                 attr-id]}]
   (create-job! conn {:app-id app-id
                      :group-id group-id
                      :attr-id attr-id
                      :job-serial-key index-serial-key
                      :job-type "remove-index"
                      :job-stage "update-attr-start"})))

(defn create-unique-job!
  ([params]
   (create-unique-job! (aurora/conn-pool :write) params))
  ([conn {:keys [app-id
                 group-id
                 attr-id]}]
   (create-job! conn {:app-id app-id
                      :group-id group-id
                      :attr-id attr-id
                      :job-serial-key unique-serial-key
                      :job-type "unique"
                      :job-stage "update-attr-start"})))

(defn create-remove-unique-job!
  ([params]
   (create-remove-unique-job! (aurora/conn-pool :write) params))
  ([conn {:keys [app-id
                 group-id
                 attr-id]}]
   (create-job! conn {:app-id app-id
                      :group-id group-id
                      :attr-id attr-id
                      :job-serial-key unique-serial-key
                      :job-type "remove-unique"
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
   (grab-job! (aurora/conn-pool :write) job-id))
  ([conn job-id]
   (sql/execute-one! ::grab-job!
                     conn (hsql/format
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

(defn missing-null-triple-wheres
  "Where clauses that return the id triples that are missing a value for the
   indexed attr."
  [job]
  (let [{:keys [app_id attr_id]} job
        attrs (attr-model/get-by-app-id app_id)
        etype (attr-model/fwd-etype (attr-model/seek-by-id attr_id attrs))
        _ (assert etype "Attribute has no etype")
        id-attr-id (:id (attr-model/seek-by-fwd-ident-name [etype "id"] attrs))
        _ (assert id-attr-id (str etype " has no id attribute"))
        indexed-attr (attr-model/seek-by-id attr_id attrs)
        _ (assert indexed-attr (str "no attr found with id " attr_id))]
    (if (not= (:value-type indexed-attr) :blob)
      ;; Just return false if it's not a blob
      [:= [:inline 1] [:inline 0]]
      [:and
       [:= :triples.app-id app_id]
       [:= :triples.attr-id id-attr-id]
       [:not [:exists {:select :*
                       :from [[:triples :attr-triples]]
                       :where [:and
                               [:= :attr-triples.app-id app_id]
                               [:= :attr-triples.attr-id attr_id]
                               [:= :attr-triples.entity-id :triples.entity-id]]}]]])))

(defn update-work-estimate!
  ([job next-stage]
   (update-work-estimate! (aurora/conn-pool :write) next-stage job))
  ([conn next-stage job]
   (let [default-where [:and
                        [:= :app-id (:app_id job)]
                        [:= :attr-id (:attr_id job)]]
         estimate (-> (sql/select-one
                       ::get-work-estimate!
                       conn
                       (hsql/format {:select :%count.*
                                     :from :triples
                                     :where (if (= "index" (:job_type job))
                                              [:or
                                               default-where
                                               (missing-null-triple-wheres job)]
                                              default-where)}))
                      :count)]
     (sql/execute-one! ::estimate-work-estimate!
                       conn (hsql/format {:update :indexing-jobs
                                          :where (job-update-wheres
                                                  [:= :id (:id job)])
                                          :set {:work-estimate estimate
                                                :job-stage next-stage}})))))

(defn add-work-completed!
  ([completed-count job]
   (add-work-completed! (aurora/conn-pool :write) completed-count job))
  ([conn completed-count job]
   (sql/execute-one! ::add-work-completed!
                     conn (hsql/format {:update :indexing-jobs
                                        :where (job-update-wheres
                                                [:= :id (:id job)])
                                        :set {:work-completed
                                              [:+
                                               [:coalesce :work-completed 0]
                                               completed-count]}}))))

(defn release-job!
  ([job] (release-job! (aurora/conn-pool :write) job))
  ([conn job]
   (tracer/with-span! (job-span-attrs "release-job" job)
     (sql/execute-one! ::release-job!
                       conn (hsql/format {:update :indexing-jobs
                                          :where (job-update-wheres
                                                  [:= :id (:id job)])
                                          :set {:worker-id nil}})))))

(defn mark-job-completed!
  ([job]
   (mark-job-completed! (aurora/conn-pool :write) job))
  ([conn job]
   (tracer/with-span! (job-span-attrs "mark-job-completed" job)
     (sql/execute-one! ::mark-job-completed!
                       conn (hsql/format {:update :indexing-jobs
                                          :where (job-update-wheres
                                                  [:= :id (:id job)])
                                          :set {:job-status "completed"
                                                :done-at :%now}})))))

(defn set-next-stage!
  ([stage job]
   (set-next-stage! (aurora/conn-pool :write) stage job))
  ([conn stage job]
   (tracer/with-span! (update (job-span-attrs "set-next-stage" job)
                              :attributes assoc :next-stage stage)
     (sql/execute-one! ::set-next-stage!
                       conn (hsql/format {:update :indexing-jobs
                                          :where (job-update-wheres
                                                  [:= :id (:id job)])
                                          :set {:job-stage stage}})))))

(defn mark-error!
  ([props job]
   (mark-error! (aurora/conn-pool :write) props job))
  ([conn props job]
   (tracer/with-span! (merge (job-span-attrs "mark-error" job)
                             props)
     (sql/execute-one! ::mark-error!
                       conn (hsql/format {:update :indexing-jobs
                                          :where (job-update-wheres
                                                  [:= :id (:id job)])
                                          :set (merge {:job-status "errored"}
                                                      props)})))))

(defn mark-error-from-ex-info!
  ([^clojure.lang.ExceptionInfo e job]
   (mark-error-from-ex-info! (aurora/conn-pool :write) e job))
  ([conn ^clojure.lang.ExceptionInfo e job]
   (let [error-data (ex-data e)
         validation-error (some-> error-data
                                  ::ex/hint
                                  :errors
                                  first)
         job-error-fields (case (::ex/type error-data)
                            ::ex/record-not-unique
                            {:error triple-not-unique-error
                             :invalid-unique-value [:cast
                                                    (-> error-data
                                                        ::ex/hint
                                                        :value)
                                                    :jsonb]}

                            ::ex/validation-failed
                            (if (and (some-> validation-error
                                             :hint
                                             :entity-id)
                                     (some-> validation-error
                                             :hint
                                             :value-too-large?))
                              {:error triple-too-large-error
                               :invalid-entity-id [:cast
                                                   (-> validation-error
                                                       :hint
                                                       :entity-id)
                                                   :uuid]}
                              {:error unexpected-error})

                            {:error unexpected-error})]
     (mark-error! conn job-error-fields job))))

(def batch-size 1000)

(defn check-next-batch!
  ([job]
   (check-next-batch! (aurora/conn-pool :write) job))
  ([conn {:keys [app_id attr_id job_type checked_data_type]}]
   (assert (= "check-data-type" job_type))
   (assert checked_data_type)
   (let [q {:update :triples
            :set {:checked-data-type [:cast checked_data_type :checked_data_type]}
            :where [:in :ctid
                    {:select :ctid
                     :for :update
                     :from :triples
                     :limit batch-size
                     :where [:and
                             [:= :app-id app_id]
                             [:= :attr-id attr_id]
                             [:or
                              [:not=
                               :checked-data-type
                               [:cast checked_data_type :checked_data_type]]
                              [:= :checked-data-type nil]]]}]}
         res (sql/do-execute! ::check-next-batch! conn (hsql/format q))]
     (:next.jdbc/update-count (first res)))))

(defn check-batch-and-update-job!
  ([job]
   (check-batch-and-update-job! (aurora/conn-pool :write) job))
  ([conn job]
   (tracer/with-span! (job-span-attrs "check-batch" job)
     (let [update-count (check-next-batch! conn job)]
       (tracer/add-data! {:attributes {:update-count update-count}})
       (cond->> job
         (not (zero? update-count)) (add-work-completed! conn update-count)
         (< update-count batch-size) (set-next-stage! conn "update-attr-done"))))))

(defn has-invalid-row?
  ([job]
   (has-invalid-row? (aurora/conn-pool :read) job))
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
        (sql/select-one ::has-invalid-row? conn)
        :exists)))

(defn update-attr! [conn {:keys [app-id attr-id set where]}]
  (attr-model/with-cache-invalidation app-id
    (next-jdbc/with-transaction [conn conn]
      (let [res (sql/execute-one!
                 ::update-attr!
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
   (update-attr-for-check-start! (aurora/conn-pool :write) job))
  ([conn job]
   (if (update-attr! conn {:app-id (:app_id job)
                           :attr-id (:attr_id job)
                           :set {:checked-data-type [:cast (:checked_data_type job) :checked_data_type]
                                 :checking-data-type true}})
     (set-next-stage! conn "revalidate" job)
     (mark-error! conn {:error invalid-attr-state-error} job))))

(defn update-attr-for-check-done!
  ([job]
   (update-attr-for-check-done! (aurora/conn-pool :write) job))
  ([conn job]
   (if (update-attr! conn {:app-id (:app_id job)
                           :attr-id (:attr_id job)
                           :where [[:= :checked-data-type [:cast (:checked_data_type job) :checked_data_type]]
                                   [:= :checking-data-type true]]
                           :set {:checking-data-type false}})
     (mark-job-completed! conn job)
     (mark-error! conn {:error invalid-attr-state-error} job))))

(defn rollback-attr-for-check!
  ([job]
   (rollback-attr-for-check! (aurora/conn-pool :write) job))
  ([conn job]
   (update-attr! conn {:app-id (:app_id job)
                       :attr-id (:attr_id job)
                       :where [[:= :checked-data-type [:cast (:checked_data_type job) :checked_data_type]]
                               [:= :checking-data-type true]]
                       :set {:checking-data-type false
                             :checked-data-type nil}})))

(defn validate-check!
  ([next-stage job]
   (validate-check! (aurora/conn-pool :write) next-stage job))
  ([conn next-stage job]
   (if (has-invalid-row? conn job)
     (do
       (rollback-attr-for-check! conn job)
       (mark-error! conn {:error invalid-triple-error} job))
     (set-next-stage! conn next-stage job))))

(defn run-next-check-step
  ([job]
   (run-next-check-step (aurora/conn-pool :write) job))
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
   (update-attr-for-remove-data-type-start! (aurora/conn-pool :write) job))
  ([conn job]
   (if (update-attr! conn {:app-id (:app_id job)
                           :attr-id (:attr_id job)
                           :set {:checked-data-type nil
                                 :checking-data-type true}})
     (set-next-stage! conn "estimate-work" job)
     (mark-error! conn {:error invalid-attr-state-error} job))))

(defn update-attr-for-remove-data-type-done!
  ([job]
   (update-attr-for-remove-data-type-done! (aurora/conn-pool :write) job))
  ([conn job]
   (if (update-attr! conn {:app-id (:app_id job)
                           :attr-id (:attr_id job)
                           :where [[:= :checked-data-type nil]
                                   [:= :checking-data-type true]]
                           :set {:checking-data-type false}})
     (mark-job-completed! conn job)
     (mark-error! conn {:error invalid-attr-state-error} job))))

(defn remove-data-type-next-batch!
  ([job]
   (remove-data-type-next-batch! (aurora/conn-pool :write) job))
  ([conn {:keys [app_id attr_id job_type checked_data_type]}]
   (assert (= "remove-data-type" job_type))
   (assert (nil? checked_data_type))
   (let [q {:update :triples
            :set {:checked-data-type nil}
            :where [:in :ctid
                    {:select :ctid
                     :for :update
                     :from :triples
                     :limit batch-size
                     :where [:and
                             [:= :app-id app_id]
                             [:= :attr-id attr_id]
                             [:not= nil :checked-data-type]]}]}
         res (sql/do-execute! ::remove-data-type-next-batch!
                              conn (hsql/format q))]
     (:next.jdbc/update-count (first res)))))

(defn remove-data-type-batch-and-update-job!
  ([job]
   (check-batch-and-update-job! (aurora/conn-pool :write) job))
  ([conn job]
   (tracer/with-span! (job-span-attrs "remove-data-type-batch" job)
     (let [update-count (remove-data-type-next-batch! conn job)]
       (tracer/add-data! {:attributes {:update-count update-count}})
       (cond->> job
         (not (zero? update-count)) (add-work-completed! conn update-count)
         (< update-count batch-size) (set-next-stage! conn "update-attr-done"))))))


(defn run-next-remove-data-type-step
  ([job]
   (run-next-remove-data-type-step (aurora/conn-pool :write) job))
  ([conn job]
   (case (:job_stage job)
     "update-attr-start" (update-attr-for-remove-data-type-start! conn job)
     "estimate-work" (update-work-estimate! conn "update-triples" job)
     "update-triples" (remove-data-type-batch-and-update-job! conn job)
     "update-attr-done" (update-attr-for-remove-data-type-done! conn job))))

(defn update-attr-for-index-start!
  ([job]
   (update-attr-for-index-start! (aurora/conn-pool :write) job))
  ([conn job]
   (if (update-attr! conn {:app-id (:app_id job)
                           :attr-id (:attr_id job)
                           :set {:is-indexed true
                                 :indexing true}})
     (set-next-stage! conn "estimate-work" job)
     (mark-error! conn {:error invalid-attr-state-error} job))))

(defn update-attr-for-index-done!
  ([job]
   (update-attr-for-index-done! (aurora/conn-pool :write) job))
  ([conn job]
   (if (update-attr! conn {:app-id (:app_id job)
                           :attr-id (:attr_id job)
                           :where [[:= :is-indexed true]
                                   [:= :indexing true]]
                           :set {:indexing false}})
     (mark-job-completed! conn job)
     (mark-error! conn {:error invalid-attr-state-error} job))))

(defn index-next-batch!
  ([job]
   (index-next-batch! (aurora/conn-pool :write) job))
  ([conn {:keys [app_id attr_id job_type]}]
   (assert (= "index" job_type))
   (let [q {:update :triples
            :set {:ave true}
            :where [:in :ctid
                    {:select :ctid
                     :for :update
                     :from :triples
                     :limit batch-size
                     :where [:and
                             [:= :app-id app_id]
                             [:= :attr-id attr_id]
                             [:not :ave]]}]}
         res (sql/do-execute! ::index-next-batch! conn (hsql/format q))]
     (:next.jdbc/update-count (first res)))))

(defn insert-nulls-next-batch!
  "Inserts nulls for indexed blob attrs so that we can efficiently scan the
   index with pagination queries."
  ([job]
   (insert-nulls-next-batch! (aurora/conn-pool :write) job))
  ([conn {:keys [attr_id job_type] :as job}]
   (assert (= "index" job_type))
   (let [q {:insert-into [[:triples triple-model/triple-cols]
                          {:select [[:app_id :app_id]
                                    [:entity_id :entity_id]
                                    [attr_id :attr_id]
                                    [[:cast "null" :jsonb] :value]
                                    ;; md5 of json null
                                    [[:inline "37a6259cc0c1dae299a7866489dff0bd"] :value_md5]
                                    [[:= :cardinality [:inline "one"]] :ea]
                                    [[:= :value_type [:inline "ref"]] :eav]
                                    [:is_unique :av]
                                    [:is_indexed :ave]
                                    [[:= :value_type [:inline "ref"]] :vae]
                                    :checked_data_type]
                           :from {:select [:triples.app_id
                                           :triples.entity_id
                                           :attrs.cardinality
                                           :attrs.value_type
                                           :attrs.is_unique
                                           :attrs.is_indexed
                                           :attrs.checked_data_type]
                                  ;; The `for update` should prevent a concurrent
                                  ;; query from deleting the entity while we're
                                  ;; doing our insert
                                  :for :update
                                  :from :triples
                                  :join [:attrs [:and
                                                 [:= :triples.app_id :attrs.app_id]
                                                 [:= :attrs.id attr_id]]]
                                  :limit batch-size
                                  :where (missing-null-triple-wheres job)}}]}
         res (sql/do-execute! ::insert-nulls-next-batch! conn (hsql/format q))]
     (:next.jdbc/update-count (first res)))))

(defn abort-index! [conn job]
  (update-attr! conn {:app-id (:app_id job)
                      :attr-id (:attr_id job)
                      :where [[:= :is-indexed true]
                              [:= :indexing true]]
                      :set {:indexing false
                            :is-indexed false}})
  ;; It would be better to do this in a batch or even to
  ;; create a new job to undo the update
  (sql/do-execute! ::abort-index!
                   conn
                   (hsql/format {:update :triples
                                 :set {:ave false}
                                 :where [:and
                                         [:= :app-id (:app_id job)]
                                         [:= :attr-id (:attr_id job)]
                                         :ave]})))

(defn index-batch-and-update-job!
  ([job]
   (index-batch-and-update-job! (aurora/conn-pool :write) job))
  ([conn job]
   (tracer/with-span! (job-span-attrs "index" job)
     (try
       (let [update-count (index-next-batch! conn job)]
         (tracer/add-data! {:attributes {:update-count update-count}})
         (cond->> job
           (not (zero? update-count)) (add-work-completed! conn update-count)
           (< update-count batch-size) (set-next-stage! conn "insert-nulls")))
       (catch clojure.lang.ExceptionInfo e
         (abort-index! conn job)
         (mark-error-from-ex-info! conn e job))))))

(defn insert-nulls-batch-and-update-job!
  ([job]
   (insert-nulls-batch-and-update-job! (aurora/conn-pool :write) job))
  ([conn job]
   (tracer/with-span! (job-span-attrs "insert-nulls" job)
     (try
       (let [update-count (insert-nulls-next-batch! conn job)]
         (tracer/add-data! {:attributes {:update-count update-count}})
         (cond->> job
           (not (zero? update-count)) (add-work-completed! conn update-count)
           (< update-count batch-size) (set-next-stage! conn "update-attr-done")))
       (catch clojure.lang.ExceptionInfo e
         (abort-index! conn job)
         (mark-error-from-ex-info! conn e job))))))

(defn run-next-index-step
  ([job]
   (run-next-index-step (aurora/conn-pool :write) job))
  ([conn job]
   (case (:job_stage job)
     "update-attr-start" (update-attr-for-index-start! conn job)
     "estimate-work" (update-work-estimate! conn "update-triples" job)
     "update-triples" (index-batch-and-update-job! conn job)
     "insert-nulls" (insert-nulls-batch-and-update-job! conn job)
     "update-attr-done" (update-attr-for-index-done! conn job))))

(defn update-attr-for-remove-index-start!
  ([job]
   (update-attr-for-remove-index-start! (aurora/conn-pool :write) job))
  ([conn job]
   (if (update-attr! conn {:app-id (:app_id job)
                           :attr-id (:attr_id job)
                           :set {:is-indexed false
                                 :indexing true}})
     (set-next-stage! conn "estimate-work" job)
     (mark-error! conn {:error invalid-attr-state-error} job))))

(defn update-attr-for-remove-index-done!
  ([job]
   (update-attr-for-remove-index-done! (aurora/conn-pool :write) job))
  ([conn job]
   (if (update-attr! conn {:app-id (:app_id job)
                           :attr-id (:attr_id job)
                           :where [[:= :is-indexed false]
                                   [:= :indexing true]]
                           :set {:indexing false}})
     (mark-job-completed! conn job)
     (mark-error! conn {:error invalid-attr-state-error} job))))

(defn remove-index-next-batch!
  ([job]
   (remove-index-next-batch! (aurora/conn-pool :write) job))
  ([conn {:keys [app_id attr_id job_type]}]
   (assert (= "remove-index" job_type))
   (let [q {:update :triples
            :set {:ave false}
            :where [:in :ctid
                    {:select :ctid
                     :for :update
                     :from :triples
                     :limit batch-size
                     :where [:and
                             [:= :app-id app_id]
                             [:= :attr-id attr_id]
                             :ave]}]}
         res (sql/do-execute! ::remove-index-next-batch
                              conn (hsql/format q))]
     (:next.jdbc/update-count (first res)))))

(defn remove-index-batch-and-update-job!
  ([job]
   (remove-index-batch-and-update-job! (aurora/conn-pool :write) job))
  ([conn job]
   (tracer/with-span! (job-span-attrs "remove-index" job)
     (let [update-count (remove-index-next-batch! conn job)]
       (tracer/add-data! {:attributes {:update-count update-count}})
       (cond->> job
         (not (zero? update-count)) (add-work-completed! conn update-count)
         (< update-count batch-size) (set-next-stage! conn "update-attr-done"))))))

(defn run-next-remove-index-step
  ([job]
   (run-next-index-step (aurora/conn-pool :write) job))
  ([conn job]
   (assert (= "remove-index" (:job_type job)))
   (case (:job_stage job)
     "update-attr-start" (update-attr-for-remove-index-start! conn job)
     "estimate-work" (update-work-estimate! conn "update-triples" job)
     "update-triples" (remove-index-batch-and-update-job! conn job)
     "update-attr-done" (update-attr-for-remove-index-done! conn job))))

(defn update-attr-for-unique-start!
  ([job]
   (update-attr-for-unique-start! (aurora/conn-pool :write) job))
  ([conn job]
   (if (update-attr! conn {:app-id (:app_id job)
                           :attr-id (:attr_id job)
                           :set {:is-unique true
                                 :setting-unique true}})
     (set-next-stage! conn "estimate-work" job)
     (mark-error! conn {:error invalid-attr-state-error} job))))

(defn update-attr-for-unique-done!
  ([job]
   (update-attr-for-unique-done! (aurora/conn-pool :write) job))
  ([conn job]
   (if (update-attr! conn {:app-id (:app_id job)
                           :attr-id (:attr_id job)
                           :where [[:= :is-unique true]
                                   [:= :setting-unique true]]
                           :set {:setting-unique false}})
     (mark-job-completed! conn job)
     (mark-error! conn {:error invalid-attr-state-error} job))))

(defn unique-next-batch!
  ([job]
   (unique-next-batch! (aurora/conn-pool :write) job))
  ([conn {:keys [app_id attr_id job_type]}]
   (assert (= "unique" job_type))
   (let [q {:update :triples
            :set {:av true}
            :where [:in :ctid
                    {:select :ctid
                     :for :update
                     :from :triples
                     :limit batch-size
                     :where [:and
                             [:= :app-id app_id]
                             [:= :attr-id attr_id]
                             [:not :av]]}]}
         res (sql/do-execute! ::unique-next-batch! conn (hsql/format q))]
     (:next.jdbc/update-count (first res)))))

(defn abort-unique! [conn job]
  (update-attr! conn {:app-id (:app_id job)
                      :attr-id (:attr_id job)
                      :where [[:= :is-unique true]
                              [:= :setting-unique true]]
                      :set {:setting-unique false
                            :is-unique false}})
  ;; It would be better to do this in a batch or even to
  ;; create a new job to undo the update
  (sql/do-execute! ::abort-unique!
                   conn (hsql/format {:update :triples
                                      :set {:av false}
                                      :where [:and
                                              [:= :app-id (:app_id job)]
                                              [:= :attr-id (:attr_id job)]
                                              :av]})))

(defn unique-batch-and-update-job!
  ([job]
   (unique-batch-and-update-job! (aurora/conn-pool :write) job))
  ([conn job]
   (tracer/with-span! (job-span-attrs "unique" job)
     (try
       (let [update-count (unique-next-batch! conn job)]
         (tracer/add-data! {:attributes {:update-count update-count}})
         (cond->> job
           (not (zero? update-count)) (add-work-completed! conn update-count)
           (< update-count batch-size) (set-next-stage! conn "update-attr-done")))
       (catch clojure.lang.ExceptionInfo e
         (abort-unique! conn job)
         (mark-error-from-ex-info! conn e job))))))

(defn run-next-unique-step
  ([job]
   (run-next-unique-step (aurora/conn-pool :write) job))
  ([conn job]
   (case (:job_stage job)
     "update-attr-start" (update-attr-for-unique-start! conn job)
     "estimate-work" (update-work-estimate! conn "update-triples" job)
     "update-triples" (unique-batch-and-update-job! conn job)
     "update-attr-done" (update-attr-for-unique-done! conn job))))

(defn update-attr-for-remove-unique-start!
  ([job]
   (update-attr-for-remove-unique-start! (aurora/conn-pool :write) job))
  ([conn job]
   (if (update-attr! conn {:app-id (:app_id job)
                           :attr-id (:attr_id job)
                           :set {:is-unique false
                                 :setting-unique true}})
     (set-next-stage! conn "estimate-work" job)
     (mark-error! conn {:error invalid-attr-state-error} job))))

(defn update-attr-for-remove-unique-done!
  ([job]
   (update-attr-for-remove-unique-done! (aurora/conn-pool :write) job))
  ([conn job]
   (if (update-attr! conn {:app-id (:app_id job)
                           :attr-id (:attr_id job)
                           :where [[:= :is-unique false]
                                   [:= :setting-unique true]]
                           :set {:setting-unique false}})
     (mark-job-completed! conn job)
     (mark-error! conn {:error invalid-attr-state-error} job))))

(defn remove-unique-next-batch!
  ([job]
   (remove-unique-next-batch! (aurora/conn-pool :write) job))
  ([conn {:keys [app_id attr_id job_type]}]
   (assert (= "remove-unique" job_type))
   (let [q {:update :triples
            :set {:av false}
            :where [:in :ctid
                    {:select :ctid
                     :for :update
                     :from :triples
                     :limit batch-size
                     :where [:and
                             [:= :app-id app_id]
                             [:= :attr-id attr_id]
                             :av]}]}
         res (sql/do-execute! ::remove-unique-next-batch!
                              conn (hsql/format q))]
     (:next.jdbc/update-count (first res)))))

(defn remove-unique-batch-and-update-job!
  ([job]
   (remove-unique-batch-and-update-job! (aurora/conn-pool :write) job))
  ([conn job]
   (tracer/with-span! (job-span-attrs "remove-unique" job)
     (let [update-count (remove-unique-next-batch! conn job)]
       (tracer/add-data! {:attributes {:update-count update-count}})
       (cond->> job
         (not (zero? update-count)) (add-work-completed! conn update-count)
         (< update-count batch-size) (set-next-stage! conn "update-attr-done"))))))

(defn run-next-remove-unique-step
  ([job]
   (run-next-unique-step (aurora/conn-pool :write) job))
  ([conn job]
   (assert (= "remove-unique" (:job_type job)))
   (case (:job_stage job)
     "update-attr-start" (update-attr-for-remove-unique-start! conn job)
     "estimate-work" (update-work-estimate! conn "update-triples" job)
     "update-triples" (remove-unique-batch-and-update-job! conn job)
     "update-attr-done" (update-attr-for-remove-unique-done! conn job))))

(defn run-next-step
  ([job]
   (run-next-step (aurora/conn-pool :write) job))
  ([conn job]
   (tracer/with-span! (job-span-attrs "run-next-step" job)
     (assert (= "processing" (:job_status job)) (:job_status job))
     (case (:job_type job)
       "check-data-type" (run-next-check-step conn job)
       "remove-data-type" (run-next-remove-data-type-step conn job)
       "index" (run-next-index-step conn job)
       "remove-index" (run-next-remove-index-step conn job)
       "unique" (run-next-unique-step conn job)
       "remove-unique" (run-next-remove-unique-step conn job)))))

(defn enqueue-job
  ([job]
   (if-not (bound? #'job-queue)
     (throw (Exception. "job queue not started"))
     (enqueue-job job-queue job)))
  ([chan job]
   (a/put! chan (:id job))))

(defn process-job
  ([chan job]
   (process-job (aurora/conn-pool :write) chan job))
  ([conn chan job]
   (let [updated-job (run-next-step conn job)]
     (if (not= "processing" (:job_status updated-job))
       (tracer/record-info! (job-span-attrs "job-finished-processing" updated-job))
       (if-let [job (release-job! conn updated-job)]
         (enqueue-job chan job)
         (tracer/record-info! (job-span-attrs "unable-to-release-job" updated-job)))))))

(defn handle-process [chan job-id]
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
                                        :attributes {:job-id job-id}})
      (sql/execute-one! ::handle-process-error
                        (aurora/conn-pool :write)
                        (hsql/format {:update :indexing-jobs
                                      :where (job-update-wheres
                                              [:= :id job-id])
                                      :set {:job-status "errored"
                                            :error unexpected-error
                                            :error-detail (.getMessage t)}})))))

(defn start-process [chan]
  (loop []
    (when-let [job-id (a/<!! chan)]
      (handle-process chan job-id)
      (recur))))

(defn grab-forgotten-jobs!
  ([] (grab-forgotten-jobs! (aurora/conn-pool :write)))
  ([conn]
   (tracer/with-span! {:name "indexing-jobs/grab-forgotten-jobs!"}
     (let [jobs (sql/select ::grab-forgotten-jobs!
                            conn (hsql/format {:select :id
                                               :from :indexing-jobs
                                               :limit 100
                                               :where (job-available-wheres)}))]
       (tracer/add-data! {:attributes {:job-count (count jobs)
                                       :job-ids (map :id jobs)}})
       (doseq [job jobs]
         (enqueue-job job))
       jobs))))

(defn warn-stuck-jobs!
  ([] (warn-stuck-jobs! (aurora/conn-pool :read)))
  ([conn]
   (tracer/with-span! {:name "indexing-jobs/grab-forgotten-jobs!"}
     (let [q {:select :id
              :from :indexing-jobs
              :limit 5
              :where [:and
                      [:in :job-status ["processing" "waiting"]]
                      [:< [:raw "interval '5 minutes'"] [:- :%now :updated-at]]]}
           jobs (sql/select ::warn-stuck-jobs!
                            conn (hsql/format q))]

       ;; TODO(dww): Notify team once we're comfortable with how this works
       ;;   Might need a flag to prevent spamming the channel.
       ;;   Could also just "steal" the job.
       (when (seq jobs)
         (if (= :prod (config/get-env))
           (discord/send-error-async!
            (str (:dww discord/mention-constants)
                 " Indexing jobs are stuck! First 5 are "
                 (string/join "," (map (fn [{:keys [id]}]
                                         (format "\"%s\"" id)) jobs))))
           (tracer/record-info! {:name "indexing-jobs/found-stuck-jobs!"
                                 :attributes {:job-ids (map :id jobs)}})))

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
                   (chime-core/periodic-seq (Instant/now)
                                            (Duration/ofMinutes
                                             (if (= :prod (config/get-env))
                                               1
                                               10)))
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
        (try
          @process
          (catch Exception _e
            nil))))))

(defn restart []
  (stop)
  (start))

;; ----------------------
;; Migrate system catalog

(defn migrate-system-catalog []
  (doseq [{:keys [checked-data-type] :as attr} system-catalog/all-attrs
          :when checked-data-type]
    (println (format "Updating attr %s.%s"
                     (attr-model/fwd-etype attr)
                     (attr-model/fwd-label attr)))
    (update-attr! (aurora/conn-pool :write)
                  {:app-id system-catalog/system-catalog-app-id
                   :attr-id (:id attr)
                   :set {:checked-data-type [:cast
                                             (name checked-data-type)
                                             :checked_data_type]}})
    (loop []
      (let [batch-size 5000
            checked-data-type (name checked-data-type)
            q {:update :triples
               :set {:checked-data-type
                     [:cast checked-data-type :checked_data_type]}
               :where [:in :ctid
                       {:select :ctid
                        :for :update
                        :from :triples
                        :limit batch-size
                        :where [:and
                                [:= :attr-id (:id attr)]
                                [:or
                                 [:not=
                                  :checked-data-type
                                  [:cast checked-data-type :checked_data_type]]
                                 [:= :checked-data-type nil]]]}]}
            res (sql/do-execute! (aurora/conn-pool :write) (hsql/format q))]
        (when (<= batch-size (:next.jdbc/update-count (first res)))
          (recur))))))

(defn before-ns-unload []
  (stop))

(defn after-ns-reload []
  (start))
