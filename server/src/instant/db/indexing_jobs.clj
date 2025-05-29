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
   [instant.util.crypt :refer [json-null-md5]]
   [instant.util.exception :as ex]
   [instant.util.tracer :as tracer]
   [instant.jdbc.sql :as sql]
   [next.jdbc :as next-jdbc])
  (:import
   (clojure.lang ExceptionInfo)
   (java.lang AutoCloseable)
   (java.sql Timestamp)
   (java.time Duration Instant)
   (java.time.temporal ChronoUnit)))

(declare job-queue jobs)

(def invalid-triple-error "invalid-triple-error")
(def triple-too-large-error "triple-too-large-error")
(def triple-not-unique-error "triple-not-unique-error")
(def missing-required-error "missing-required-error")
(def invalid-attr-state-error "invalid-attr-state-error")
(def unexpected-error "unexpected-error")

(def batch-size 1000)

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
                    :invalid_triples_sample
                    :error_data]))

(defn get-for-client-q [app-id & wheres]
  {:select [:j.*
            [{:select [[[:|| :idents.etype [:inline "."] :idents.label]]]
              :from :attrs
              :join [:idents [:= :attrs.forward_ident :idents.id]]
              :where [:= :attrs.id :j.attr-id]}
             :attr-name]
            [[:case-expr :error
              [:inline invalid-triple-error]
              [:case-expr :job-type
               [:inline "check-data-type"]
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

              [:inline missing-required-error]
              {:select [[[:json_agg 't]]]
               :from [[{:select [:t.entity-id [nil :value] ["null" :json-type]]
                        :from [[:triples :t]]
                        :limit 10
                        :where [:and
                                [:= :app-id app-id]
                                [:= :t.app_id :j.app_id]
                                [:= :t.attr_id {:select :id
                                                :from :attrs
                                                :where [:and
                                                        [:= :app-id app-id]
                                                        [:= :label [:inline "id"]]
                                                        [:= :etype {:select :etype
                                                                    :from :attrs
                                                                    :where [:and
                                                                            [:= :app-id app-id]
                                                                            [:= :id :j.attr-id]]}]]}]
                                [:in :t.entity_id {:select [[[:cast
                                                              [:json_array_elements_text
                                                               [:cast
                                                                [:-> :j.error_data [:inline "entity-ids"]]
                                                                :json]]
                                                              :uuid]]]}]]}
                       :t]]}]
             :invalid-triples-sample]]
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
  ([conn args]
   (let [{:keys [app-id
                 group-id
                 attr-id
                 job-type
                 job-dependency
                 checked-data-type]} args
         {:keys [serial-key stages]} (get jobs job-type)
         stage  (-> stages first :stage)]
     (assert app-id)
     (assert attr-id)
     (assert (contains? jobs job-type) (str "Unexpected job type: " job-type))
     (when (= "check-data-type" job-type)
       (assert checked-data-type))
     (sql/execute-one! ::create-job!
                       conn (hsql/format {:insert-into :indexing-jobs
                                          :values [(cond-> {:id             (random-uuid)
                                                            :group-id       group-id
                                                            :app-id         app-id
                                                            :attr-id        attr-id
                                                            :job-serial-key serial-key
                                                            :job-type       job-type
                                                            :job-dependency job-dependency
                                                            :job-stage      stage
                                                            :job-status     "waiting"}
                                                     (= "check-data-type" job-type)
                                                     (assoc :checked-data-type [:cast checked-data-type :checked_data_type]))]})))))

(defn job-available-wheres
  "Where clauses that select jobs that are available for taking."
  [& additional-clauses]
  (list* :and
         [:= :worker-id nil]
         ;; Ensure we don't grab a job we can't handle
         [:in :job-type (keys jobs)]
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
  [conn stage {:keys [app_id attr_id]}]
  (let [attrs (attr-model/get-by-app-id conn app_id)
        etype (attr-model/fwd-etype (attr-model/seek-by-id attr_id attrs))
        _ (assert etype "Attribute has no etype")
        id-attr (attr-model/seek-by-fwd-ident-name [etype "id"] attrs)
        _ (assert id-attr (str etype " has no id attribute"))
        indexed-attr (attr-model/seek-by-id attr_id attrs)
        _ (assert indexed-attr (str "no attr found with id " attr_id))]
    (if (not= (:value-type indexed-attr) :blob)
      ;; Just return false if it's not a blob
      [:= [:inline 1] [:inline 0]]
      [:and
       [:= :triples.app-id app_id]
       [:= :triples.attr-id (:id id-attr)]
       (when (and (:unique? id-attr)
                  (not (:setting-unique? id-attr)))
         :triples.av)
       [:not [:exists {:select :1
                       :from [[:triples :attr-triples]]
                       :where [:and
                               (if (= stage :estimate)
                                 ;; If we're estimating, then the triples won't
                                 ;; be ave yet
                                 true
                                 :attr-triples.ave)
                               [:= :attr-triples.app-id app_id]
                               [:= :attr-triples.attr-id attr_id]
                               [:= :attr-triples.entity-id :triples.entity-id]]}]]])))

(defn update-work-estimate! [conn job]
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
                                              (missing-null-triple-wheres conn :estimate job)]
                                             default-where)}))
                     :count)]
    (sql/execute-one! ::estimate-work-estimate!
                      conn (hsql/format {:update :indexing-jobs
                                         :where (job-update-wheres
                                                 [:= :id (:id job)])
                                         :set {:work-estimate estimate}}))))

(defn add-work-completed! [conn completed-count job]
  (when (pos? completed-count)
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
  ([^ExceptionInfo e job]
   (mark-error-from-ex-info! (aurora/conn-pool :write) e job))
  ([conn ^ExceptionInfo e job]
   (let [error-data (ex-data e)
         job-error-fields (case (::ex/type error-data)
                            ::ex/record-not-unique
                            {:error triple-not-unique-error
                             :invalid-unique-value [:cast
                                                    (-> error-data
                                                        ::ex/hint
                                                        :value)
                                                    :jsonb]}

                            ::ex/validation-failed
                            (if (and (some-> error-data
                                             ::ex/hint
                                             :entity-id)
                                     (some-> error-data
                                             ::ex/hint
                                             :value-too-large?))
                              {:error triple-too-large-error
                               :invalid-entity-id [:cast
                                                   (-> error-data
                                                       ::ex/hint
                                                       :entity-id)
                                                   :uuid]}
                              {:error unexpected-error})

                            ::missing-required
                            {:error missing-required-error
                             :error-data [:cast [:lift (::ex/hint error-data)] :jsonb]}

                            {:error unexpected-error})]
     (mark-error! conn job-error-fields job))))

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
        (when-not res
          [::error invalid-attr-state-error])))))


;; "check-data-type" ----------------------------------------------------------

(defn check-data-type--validate [conn job]
  (let [{:keys [app_id attr_id checked_data_type]} job
        has-invalid-row? (->> (hsql/format
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
                              :exists)]
    (when has-invalid-row?
      (update-attr! conn {:app-id (:app_id job)
                          :attr-id (:attr_id job)
                          :where [[:= :checked-data-type [:cast (:checked_data_type job) :checked_data_type]]
                                  [:= :checking-data-type true]]
                          :set {:checking-data-type false
                                :checked-data-type nil}})
      [::error invalid-triple-error])))

(defn check-data-type--update-attr-start [conn job]
  (update-attr! conn {:app-id (:app_id job)
                      :attr-id (:attr_id job)
                      :set {:checked-data-type [:cast (:checked_data_type job) :checked_data_type]
                            :checking-data-type true}}))

(defn check-data-type--update-triples [conn job]
  (tracer/with-span! (job-span-attrs "check-batch" job)
    (let [{:keys [app_id attr_id checked_data_type]} job
          _ (assert checked_data_type)
          q {:update :triples
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
          res (sql/do-execute! ::check-next-batch! conn (hsql/format q))
          update-count (:next.jdbc/update-count (first res))]
      (tracer/add-data! {:attributes {:update-count update-count}})
      (add-work-completed! conn update-count job)
      (when (<= batch-size update-count)
        [::repeat]))))

(defn check-data-type--update-attr-done [conn job]
  (update-attr! conn {:app-id (:app_id job)
                      :attr-id (:attr_id job)
                      :where [[:= :checked-data-type [:cast (:checked_data_type job) :checked_data_type]]
                              [:= :checking-data-type true]]
                      :set {:checking-data-type false}}))

(def check-data-type--stages
  [{:stage "validate",          :fn #'check-data-type--validate}
   {:stage "update-attr-start", :fn #'check-data-type--update-attr-start}
   {:stage "revalidate",        :fn #'check-data-type--validate}
   {:stage "estimate-work",     :fn #'update-work-estimate!}
   {:stage "update-triples",    :fn #'check-data-type--update-triples}
   {:stage "update-attr-done",  :fn #'check-data-type--update-attr-done}])


;; "remove-data-type" ---------------------------------------------------------

(defn remove-data-type--update-attr-start [conn job]
  (update-attr! conn {:app-id (:app_id job)
                      :attr-id (:attr_id job)
                      :set {:checked-data-type nil
                            :checking-data-type true}}))

(defn remove-data-type--update-triples [conn job]
  (tracer/with-span! (job-span-attrs "remove-data-type-batch" job)
    (let [{:keys [app_id attr_id checked_data_type]} job
          _ (assert (nil? checked_data_type))
          q {:update :triples
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
                               conn (hsql/format q))

          update-count (:next.jdbc/update-count (first res))]
      (tracer/add-data! {:attributes {:update-count update-count}})
      (add-work-completed! conn update-count job)
      (when (<= batch-size update-count)
        [::repeat]))))

(defn remove-data-type--update-attr-done [conn job]
  (update-attr! conn {:app-id (:app_id job)
                      :attr-id (:attr_id job)
                      :where [[:= :checked-data-type nil]
                              [:= :checking-data-type true]]
                      :set {:checking-data-type false}}))

(def remove-data-type--stages
  [{:stage "update-attr-start", :fn #'remove-data-type--update-attr-start}
   {:stage "estimate-work",     :fn #'update-work-estimate!}
   {:stage "update-triples",    :fn #'remove-data-type--update-triples}
   {:stage "update-attr-done",  :fn #'remove-data-type--update-attr-done}])


;; "index" --------------------------------------------------------------------

(defn index--update-attr-start [conn job]
  (update-attr! conn {:app-id (:app_id job)
                      :attr-id (:attr_id job)
                      :set {:is-indexed true
                            :indexing true}}))

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

(defn index--update-triples [conn job]
  (tracer/with-span! (job-span-attrs "index" job)
    (try
      (let [{:keys [app_id attr_id]} job
            q {:update :triples
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
            res (sql/do-execute! ::index-next-batch! conn (hsql/format q))
            update-count (:next.jdbc/update-count (first res))]
        (tracer/add-data! {:attributes {:update-count update-count}})
        (add-work-completed! conn update-count job)
        (when (pos? update-count)
          [::repeat]))
      (catch ExceptionInfo e
        (abort-index! conn job)
        [::exception e]))))

(defn index--insert-nulls [conn job]
  (tracer/with-span! (job-span-attrs "insert-nulls" job)
    (try
      (let [{:keys [attr_id]} job
            q {:insert-into [[:triples triple-model/triple-cols]
                             {:select [[:app_id :app_id]
                                       [:entity_id :entity_id]
                                       [attr_id :attr_id]
                                       [[:cast "null" :jsonb] :value]
                                       [[:inline json-null-md5] :value_md5]
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
                                     :from :triples
                                     ;; The `for update` should prevent a concurrent
                                     ;; query from deleting the entity while we're
                                     ;; doing our insert
                                     :for :update
                                     :join [:attrs [:and
                                                    [:= :triples.app_id :attrs.app_id]
                                                    [:= :attrs.id attr_id]]]
                                     :where (missing-null-triple-wheres conn :update job)
                                     :limit batch-size}}]}
            res (sql/do-execute! ::insert-nulls-next-batch! conn (hsql/format q))
            update-count (:next.jdbc/update-count (first res))]
        (tracer/add-data! {:attributes {:update-count update-count}})
        (add-work-completed! conn update-count job)
        (when (pos? update-count)
          [::repeat]))
      (catch ExceptionInfo e
        (abort-index! conn job)
        [::exception e]))))

(defn index--update-attr-done [conn job]
  (update-attr! conn {:app-id (:app_id job)
                      :attr-id (:attr_id job)
                      :where [[:= :is-indexed true]
                              [:= :indexing true]]
                      :set {:indexing false}}))

(def index--stages
  [{:stage "update-attr-start", :fn #'index--update-attr-start}
   {:stage "estimate-work",     :fn #'update-work-estimate!}
   {:stage "update-triples",    :fn #'index--update-triples}
   {:stage "insert-nulls",      :fn #'index--insert-nulls}
   {:stage "update-attr-done",  :fn #'index--update-attr-done}])


;; "remove-index" -------------------------------------------------------------

(defn remove-index--update-attr-start [conn job]
  (update-attr! conn {:app-id (:app_id job)
                      :attr-id (:attr_id job)
                      :set {:is-indexed false
                            :indexing true}}))

(defn remove-index--update-triples [conn job]
  (tracer/with-span! (job-span-attrs "remove-index" job)
    (let [{:keys [app_id attr_id]} job
          q {:update :triples
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
                               conn (hsql/format q))
          update-count (:next.jdbc/update-count (first res))]
      (tracer/add-data! {:attributes {:update-count update-count}})
      (add-work-completed! conn update-count job)
      (when (<= batch-size update-count)
        [::repeat]))))

(defn remove-index--update-attr-done [conn job]
  (update-attr! conn {:app-id (:app_id job)
                      :attr-id (:attr_id job)
                      :where [[:= :is-indexed false]
                              [:= :indexing true]]
                      :set {:indexing false}}))

(def remove-index--stages
  [{:stage "update-attr-start", :fn #'remove-index--update-attr-start}
   {:stage "estimate-work",     :fn #'update-work-estimate!}
   {:stage "update-triples",    :fn #'remove-index--update-triples}
   {:stage "update-attr-done",  :fn #'remove-index--update-attr-done}])


;; "unique" -------------------------------------------------------------------

(defn unique--update-attr-start [conn job]
  (update-attr! conn {:app-id (:app_id job)
                      :attr-id (:attr_id job)
                      :set {:is-unique true
                            :setting-unique true}}))

(defn unique--update-triples [conn job]
  (tracer/with-span! (job-span-attrs "unique" job)
    (try
      (let [{:keys [app_id attr_id]} job
            q {:update :triples
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
            res (sql/do-execute! ::unique-next-batch! conn (hsql/format q))
            update-count (:next.jdbc/update-count (first res))]
        (tracer/add-data! {:attributes {:update-count update-count}})
        (add-work-completed! conn update-count job)
        (when (<= batch-size update-count)
          [::repeat]))
      (catch ExceptionInfo e
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
                                                    :av]}))
        [::exception e]))))

(defn unique--update-attr-done [conn job]
  (update-attr! conn {:app-id (:app_id job)
                      :attr-id (:attr_id job)
                      :where [[:= :is-unique true]
                              [:= :setting-unique true]]
                      :set {:setting-unique false}}))

(def unique--stages
  [{:stage "update-attr-start", :fn #'unique--update-attr-start}
   {:stage "estimate-work",     :fn #'update-work-estimate!}
   {:stage "update-triples",    :fn #'unique--update-triples}
   {:stage "update-attr-done",  :fn #'unique--update-attr-done}])


;; "remove-unique" ------------------------------------------------------------

(defn remove-unique--update-attr-start [conn job]
  (update-attr! conn {:app-id (:app_id job)
                      :attr-id (:attr_id job)
                      :set {:is-unique false
                            :setting-unique true}}))

(defn remove-unique--update-triples [conn job]
  (tracer/with-span! (job-span-attrs "remove-unique" job)
    (let [{:keys [app_id attr_id]} job
          q {:update :triples
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
                               conn (hsql/format q))
          update-count (:next.jdbc/update-count (first res))]
      (tracer/add-data! {:attributes {:update-count update-count}})
      (add-work-completed! conn update-count job)
      (when (<= batch-size update-count)
        [::repeat]))))

(defn remove-unique--update-attr-done [conn job]
  (update-attr! conn {:app-id (:app_id job)
                      :attr-id (:attr_id job)
                      :where [[:= :is-unique false]
                              [:= :setting-unique true]]
                      :set {:setting-unique false}}))

(def remove-unique--stages
   [{:stage "update-attr-start", :fn #'remove-unique--update-attr-start}
    {:stage "estimate-work",     :fn #'update-work-estimate!}
    {:stage "update-triples",    :fn #'remove-unique--update-triples}
    {:stage "update-attr-done",  :fn #'remove-unique--update-attr-done}])


;; "required" -----------------------------------------------------------------

(defn required--validate [conn job]
  (tracer/with-span! (job-span-attrs "required" job)
    (let [{app-id :app_id
           attr-id :attr_id} job
          attrs (attr-model/get-by-app-id conn app-id)
          attr (attr-model/seek-by-id attr-id attrs)
          attr-etype (attr-model/fwd-etype attr)
          id-attr (->> (attr-model/get-by-app-id conn app-id)
                       (attr-model/seek-by-fwd-ident-name [attr-etype "id"]))]
      (if-not id-attr
        (do (update-attr! conn {:app-id  app-id
                                :attr-id attr-id
                                :set     {:is-required false}})
            [::exception (ex-info "Could not find id attribute for entity."
                                  {::ex/type ::missing-required
                                   ::ex/hint {:attr-id attr-id
                                              :etype attr-etype}})])
        (let [query {:select :t-id/entity-id
                     :from [[:triples :t-id]]
                     :where [:and
                             [:= :t-id/app-id app-id]
                             [:= :t-id/attr-id (:id id-attr)]
                             ;; hsql will filter the nil out
                             (when (and (:unique? id-attr)
                                        (not (:setting-unique? id-attr)))
                               :t-id/av)
                             [:not
                              [:exists
                               {:select :1
                                :from [[:triples :t-a]]
                                :where [:and
                                        [:= :t-a/entity-id :t-id/entity-id]
                                        [:= :t-a/app-id app-id]
                                        [:= :t-a/attr-id attr-id]
                                        [:not= :t-a/value [:cast "null" :jsonb]]]}]]]}
              res (sql/select conn (hsql/format query))]
          (when (seq res)
            (update-attr! conn {:app-id  app-id
                                :attr-id attr-id
                                :set     {:is-required false}})
            (let [entity-ids (map :entity_id res)
                  message (format "Attribute %s (%s) can't be marked required because %s %s entities are missing it."
                                  (attr-model/fwd-label attr)
                                  attr-id
                                  (count entity-ids)
                                  attr-etype)
                  data {:count (count entity-ids)
                        :etype attr-etype
                        :label (attr-model/fwd-label attr)
                        :entity-ids (take 10 entity-ids)}]
              [::exception (ex-info message {::ex/type ::missing-required
                                             ::ex/hint data})])))))))

(defn required--update-attr [conn job]
  (update-attr! conn {:app-id  (:app_id job)
                      :attr-id (:attr_id job)
                      :set     {:is-required true}}))

(def required--stages
  [{:stage "validate",    :fn #'required--validate}
   {:stage "update-attr", :fn #'required--update-attr}
   {:stage "revalidate",  :fn #'required--validate}])


;; "remove-required" ----------------------------------------------------------

(defn remove-required--update-attr [conn job]
  (update-attr! conn {:app-id  (:app_id job)
                      :attr-id (:attr_id job)
                      :set     {:is-required false}}))

(def remove-required--stages
  [{:stage "update-attr", :fn #'remove-required--update-attr}])


;; ----------------------------------------------------------------------------

(def jobs
  {"check-data-type"  {:serial-key "data-type", :stages check-data-type--stages}
   "remove-data-type" {:serial-key "data-type", :stages remove-data-type--stages}
   "index"            {:serial-key "index",     :stages index--stages}
   "remove-index"     {:serial-key "index",     :stages remove-index--stages}
   "unique"           {:serial-key "unique",    :stages unique--stages}
   "remove-unique"    {:serial-key "unique",    :stages remove-unique--stages}
   "required"         {:serial-key "required",  :stages required--stages}
   "remove-required"  {:serial-key "required",  :stages remove-required--stages}})

(defn run-next-stage [conn job]
  (tracer/with-span! (job-span-attrs "run-next-stage" job)
    (assert (= "processing" (:job_status job)) (:job_status job))
    (let [[stage & next-stages] (-> jobs
                                    (get (:job_type job))
                                    :stages
                                    (->> (drop-while #(not= (:stage %) (:job_stage job)))))
          _                     (assert stage (str "Unknown stage: " (:job_type job) " " (:job_stage job)))
          res                   ((:fn stage) conn job)
          [res-type res-value]  (when (vector? res) res)]
      (cond
        (= ::error res-type)
        (mark-error! conn {:error res-value} job)

        (= ::exception res-type)
        (mark-error-from-ex-info! conn res-value job)

        (= ::repeat res-type)
        job

        (empty? next-stages)
        (mark-job-completed! conn job)

        :else
        (set-next-stage! conn (:stage (first next-stages)) job)))))

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
   (let [updated-job (run-next-stage conn job)]
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

(defn before-ns-unload []
  (stop))

(defn after-ns-reload []
  (start))

;; ----------
;; Migrations

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

(defn insert-nulls-for-existing-indexed-blob-attrs
  "Inserts nulls for existing attrs. Should be run after
   https://github.com/instantdb/instant/pull/869 is fully deployed"
  []
  (let [attrs (sql/select (aurora/conn-pool :read)
                          (hsql/format {:select :*
                                        :from :attrs
                                        :where [:and
                                                :is_indexed
                                                [:not :indexing]]}))]
    (doseq [attr attrs]
      (loop [total 0]
        (println "Starting" (str "app_id=" (:app_id attr)) (str "attr_id=" (:id attr)))
        (let [update-count (time (index--insert-nulls (aurora/conn-pool :write)
                                                      {:attr_id (:id attr)
                                                       :app_id (:app_id attr)
                                                       :job_type "index"}))]
          (println "Updated" (+ total update-count) "for" (str "app_id=" (:app_id attr)) (str "attr_id=" (:id attr)))
          (when (pos? update-count)
            (recur (long (+ total update-count)))))))))
