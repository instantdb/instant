(ns instant.scripts.clone-app
  (:require
   [clojure.java.shell :as shell]
   [clojure.string :as str]
   [instant.config :as config]
   [instant.jdbc.sql :as sql]
   [instant.util.hsql :as uhsql]
   [next.jdbc :as next-jdbc])
  (:import
   (java.time Duration)
   (java.util UUID)))

(def ^:private lowest-uuid
  (UUID/fromString "00000000-0000-0000-0000-000000000000"))

(def ^:private default-batch-size 50000)
(def ^:private default-workers 4)
(def ^:private default-report-every 10)

(def ^:private triples-column-count 13)
(def ^:private idents-column-count 5)
(def ^:private attrs-column-count 22)

(def ^:private triples-cols
  [:app-id
   :entity-id
   :attr-id
   :value
   :value-md5
   :ea
   :eav
   :av
   :ave
   :vae
   :created-at
   :checked-data-type
   :pg-size])

(def ^:private attrs-cols
  [:id
   :app-id
   :value-type
   :cardinality
   :is-unique
   :is-indexed
   :forward-ident
   :reverse-ident
   :inferred-types
   :on-delete
   :checked-data-type
   :checking-data-type
   :indexing
   :setting-unique
   :on-delete-reverse
   :is-required
   :etype
   :label
   :reverse-etype
   :reverse-label
   :deletion-marked-at
   :metadata])

(def ^:private idents-cols
  [:id
   :app-id
   :attr-id
   :etype
   :label])

(def ^:private column-count-q
  (uhsql/preformat
   {:select [[[:count :*] :count]]
    :from :information_schema.columns
    :where [:and
            [:= :table-schema [:inline "public"]]
            [:= :table-name :?table-name]]}))

(def ^:private fetch-app-q
  (uhsql/preformat
   {:select [:id :title :creator-id]
    :from :apps
    :where [:= :id :?app-id]}))

(def ^:private user-id-by-email-q
  (uhsql/preformat
   {:select [:id]
    :from :instant-users
    :where [:= :email :?email]}))

(def ^:private count-triples-q
  (uhsql/preformat
   {:select [[[:count :*] :count]]
    :from :triples
    :where [:= :app-id :?app-id]}))

(def ^:private insert-app-q
  (uhsql/preformat
   {:insert-into :apps
    :values [{:id :?new-app-id
              :creator-id :?creator-id
              :title :?title}]}))

(def ^:private insert-ident-map-q
  (uhsql/preformat
   {:insert-into :clone-app-ident-map
    :columns [:job-id :old-id :new-id]
    :select [:?job-id :id [:gen_random_uuid]]
    :from :idents
    :where [:= :app-id :?old-app-id]}))

(def ^:private insert-attr-map-q
  (uhsql/preformat
   {:insert-into :clone-app-attr-map
    :columns [:job-id :old-id :new-id]
    :select [:?job-id :id [:gen_random_uuid]]
    :from :attrs
    :where [:= :app-id :?old-app-id]}))

(def ^:private insert-rules-q
  (uhsql/preformat
   {:insert-into :rules
    :columns [:app-id :code]
    :select [:?new-app-id :r.code]
    :from [[:rules :r]]
    :where [:= :r.app-id :?old-app-id]}))

(def ^:private insert-attrs-q
  (uhsql/preformat
   {:insert-into [[:attrs attrs-cols]
                  {:select [:am.new-id
                            :?new-app-id
                            :a.value-type
                            :a.cardinality
                            :a.is-unique
                            :a.is-indexed
                            :im-fwd.new-id
                            :im-rev.new-id
                            :a.inferred-types
                            :a.on-delete
                            :a.checked-data-type
                            :a.checking-data-type
                            :a.indexing
                            :a.setting-unique
                            :a.on-delete-reverse
                            :a.is-required
                            :a.etype
                            :a.label
                            :a.reverse-etype
                            :a.reverse-label
                            :a.deletion-marked-at
                            :a.metadata]
                   :from [[:attrs :a]]
                   :join [[:clone-app-attr-map :am]
                          [:and
                           [:= :am.job-id :?job-id]
                           [:= :am.old-id :a.id]]
                          [:clone-app-ident-map :im-fwd]
                          [:and
                           [:= :im-fwd.job-id :?job-id]
                           [:= :im-fwd.old-id :a.forward-ident]]]
                   :left-join [[:clone-app-ident-map :im-rev]
                               [:and
                                [:= :im-rev.job-id :?job-id]
                                [:= :im-rev.old-id :a.reverse-ident]]]
                   :where [:= :a.app-id :?old-app-id]}]}))

(def ^:private insert-idents-q
  (uhsql/preformat
   {:insert-into [[:idents idents-cols]
                  {:select [:im.new-id
                            :?new-app-id
                            :am.new-id
                            :i.etype
                            :i.label]
                   :from [[:idents :i]]
                   :join [[:clone-app-ident-map :im]
                          [:and
                           [:= :im.job-id :?job-id]
                           [:= :im.old-id :i.id]]
                          [:clone-app-attr-map :am]
                          [:and
                           [:= :am.job-id :?job-id]
                           [:= :am.old-id :i.attr-id]]]
                   :where [:= :i.app-id :?old-app-id]}]}))

(def ^:private insert-admin-token-q
  (uhsql/preformat
   {:insert-into :app-admin-tokens
    :values [{:app-id :?new-app-id
              :token :?token}]}))

(def ^:private insert-job-q
  (uhsql/preformat
   {:insert-into :clone-app-jobs
    :values [{:job-id :?job-id
              :old-app-id :?old-app-id
              :new-app-id :?new-app-id
              :new-title :?new-title
              :creator-email :?creator-email
              :batch-size :?batch-size
              :workers :?workers
              :total-triples :?total-triples
              :status :?status}]}))

(def ^:private insert-progress-q
  (uhsql/preformat
   {:insert-into :clone-app-progress
    :values [{:job-id :?job-id
              :worker-id :?worker-id}]}))

(def ^:private update-progress-q
  (uhsql/preformat
   {:update :clone-app-progress
    :set {:rows-copied [:+ :rows-copied :?rows]
          :last-entity-id :?last-entity-id
          :last-attr-id :?last-attr-id
          :last-value-md5 :?last-value-md5
          :updated-at :%now}
    :where [:and
            [:= :job-id :?job-id]
            [:= :worker-id :?worker-id]]}))

(def ^:private update-progress-done-q
  (uhsql/preformat
   {:update :clone-app-progress
    :set {:done [:inline true]
          :updated-at :%now}
    :where [:and
            [:= :job-id :?job-id]
            [:= :worker-id :?worker-id]]}))

(def ^:private update-job-status-q
  (uhsql/preformat
   {:update :clone-app-jobs
    :set {:status :?status
          :updated-at :%now}
    :where [:= :job-id :?job-id]}))

(def ^:private update-job-status-error-q
  (uhsql/preformat
   {:update :clone-app-jobs
    :set {:status :?status
          :error :?error
          :updated-at :%now}
    :where [:= :job-id :?job-id]}))

(def ^:private update-job-status-finished-q
  (uhsql/preformat
   {:update :clone-app-jobs
    :set {:status :?status
          :updated-at :%now
          :finished-at :%now}
    :where [:= :job-id :?job-id]}))

(def ^:private progress-q
  (uhsql/preformat
   {:select [:worker-id :rows-copied :done]
    :from :clone-app-progress
    :where [:= :job-id :?job-id]
    :order-by :worker-id}))

(def ^:private delete-attr-map-q
  (uhsql/preformat
   {:delete-from :clone-app-attr-map
    :where [:= :job-id :?job-id]}))

(def ^:private delete-ident-map-q
  (uhsql/preformat
   {:delete-from :clone-app-ident-map
    :where [:= :job-id :?job-id]}))

(def ^:private triples-batch-q
  (uhsql/preformat
   {:with [[:batch {:select [:t.entity-id
                             :t.attr-id
                             :t.value
                             :t.value-md5
                             :t.ea
                             :t.eav
                             :t.av
                             :t.ave
                             :t.vae
                             :t.created-at
                             :t.checked-data-type
                             :t.pg-size]
                    :from [[:triples :t]]
                    :where [:and
                            [:= :t.app-id :?old-app-id]
                            [:= [:mod [:+ [:mod [:hashtextextended
                                                 [:cast :t.entity-id :text]
                                                 [:inline 0]]
                                           :?workers]
                                       :?workers]
                                   :?workers]
                                :?worker-id]
                            [:> [:composite :t.entity-id :t.attr-id :t.value-md5]
                                [:composite :?last-entity-id :?last-attr-id :?last-value-md5]]]
                    :order-by [:t.entity-id :t.attr-id :t.value-md5]
                    :limit :?batch-size}]
           [:ins {:insert-into [[:triples triples-cols]
                                {:select [:?new-app-id
                                          :b.entity-id
                                          [:coalesce :am.new-id :b.attr-id]
                                          :b.value
                                          :b.value-md5
                                          :b.ea
                                          :b.eav
                                          :b.av
                                          :b.ave
                                          :b.vae
                                          :b.created-at
                                          :b.checked-data-type
                                          :b.pg-size]
                                 :from [[:batch :b]]
                                 :left-join [[:clone-app-attr-map :am]
                                             [:and
                                              [:= :am.job-id :?job-id]
                                              [:= :am.old-id :b.attr-id]]]}]}]]
    :select [[{:select [[[:count :*]]]
               :from :batch} :rows]
             [{:select :entity-id
               :from :batch
               :order-by [[:entity-id :desc]
                          [:attr-id :desc]
                          [:value-md5 :desc]]
               :limit 1} :last-entity-id]
             [{:select :attr-id
               :from :batch
               :order-by [[:entity-id :desc]
                          [:attr-id :desc]
                          [:value-md5 :desc]]
               :limit 1} :last-attr-id]
             [{:select :value-md5
               :from :batch
               :order-by [[:entity-id :desc]
                          [:attr-id :desc]
                          [:value-md5 :desc]]
               :limit 1} :last-value-md5]]}))

(defn- usage []
  (str
   "USAGE:\n"
   "  clj -M -m instant.scripts.clone-app --env {prod|dev} --app-id APP_UUID\n"
   "    [--new-email EMAIL] [--new-title TITLE]\n"
   "    [--batch-size N] [--workers N] [--report-every SECONDS]\n"
   "    [--db-url URL] [--skip-count]\n"))

(defn- die! [msg]
  (binding [*out* *err*]
    (println msg)
    (println (usage)))
  (throw (ex-info msg {})))

(defn- parse-long! [flag value]
  (try
    (Long/parseLong value)
    (catch Exception _
      (die! (format "%s must be an integer, got: %s" flag value)))))

(defn- parse-uuid! [flag value]
  (try
    (UUID/fromString value)
    (catch Exception _
      (die! (format "%s must be a UUID, got: %s" flag value)))))

(defn- parse-args [args]
  (loop [opts {:batch-size default-batch-size
               :workers default-workers
               :report-every default-report-every}
         args args]
    (if (empty? args)
      opts
      (let [flag (first args)]
        (case flag
          "--help" (recur (assoc opts :help true) (rest args))
          "--skip-count" (recur (assoc opts :skip-count true) (rest args))
          "--env" (if-let [value (second args)]
                    (recur (assoc opts :env value) (nnext args))
                    (die! "--env requires a value"))
          "--db-url" (if-let [value (second args)]
                       (recur (assoc opts :db-url value) (nnext args))
                       (die! "--db-url requires a value"))
          "--app-id" (if-let [value (second args)]
                       (recur (assoc opts :app-id value) (nnext args))
                       (die! "--app-id requires a value"))
          "--new-email" (if-let [value (second args)]
                          (recur (assoc opts :new-email value) (nnext args))
                          (die! "--new-email requires a value"))
          "--new-title" (if-let [value (second args)]
                          (recur (assoc opts :new-title value) (nnext args))
                          (die! "--new-title requires a value"))
          "--batch-size" (if-let [value (second args)]
                           (recur (assoc opts :batch-size (parse-long! flag value)) (nnext args))
                           (die! "--batch-size requires a value"))
          "--workers" (if-let [value (second args)]
                        (recur (assoc opts :workers (parse-long! flag value)) (nnext args))
                        (die! "--workers requires a value"))
          "--report-every" (if-let [value (second args)]
                             (recur (assoc opts :report-every (parse-long! flag value)) (nnext args))
                             (die! "--report-every requires a value"))
          (die! (format "Unknown flag: %s" flag)))))))

(defn- resolve-db-url! [{:keys [db-url env]}]
  (cond
    (and db-url (not (str/blank? db-url))) db-url
    (and env (= "dev" env)) "jdbc:postgresql://localhost:5432/instant"
    (and env (= "prod" env))
    (let [script-path (str (System/getProperty "user.dir") "/scripts/prod_connection_string.sh")
          {:keys [exit out err]} (shell/sh script-path)]
      (when-not (zero? exit)
        (die! (format "Failed to resolve prod DB url: %s" (str/trim err))))
      (str/trim out))
    :else
    (or (System/getenv "DATABASE_URL")
        (die! "Missing --db-url or --env (prod|dev), and DATABASE_URL not set."))))

(defn- column-count [conn table-name]
  (-> (sql/select-one conn (uhsql/formatp column-count-q {:table-name table-name}))
      :count))

(defn- ensure-column-counts! [conn]
  (let [triples-count (column-count conn "triples")
        idents-count (column-count conn "idents")
        attrs-count (column-count conn "attrs")]
    (when (not= triples-column-count triples-count)
      (die! "Triples schema changed. Update scripts/clone_app.sql and this script."))
    (when (not= idents-column-count idents-count)
      (die! "Idents schema changed. Update scripts/clone_app.sql and this script."))
    (when (not= attrs-column-count attrs-count)
      (die! "Attrs schema changed. Update scripts/clone_app.sql and this script."))))

(defn- fetch-app! [conn app-id]
  (or (sql/select-one conn (uhsql/formatp fetch-app-q {:app-id app-id}))
      (die! (format "App not found: %s" app-id))))

(defn- resolve-creator-id! [conn {:keys [creator_id]} new-email]
  (if (str/blank? new-email)
    creator_id
    (let [user (sql/select-one conn (uhsql/formatp user-id-by-email-q {:email new-email}))]
      (or (:id user)
          (die! (format "User not found for email: %s" new-email))))))

(defn- resolve-title [app new-title]
  (if (str/blank? new-title)
    (str (:title app) " (clone)")
    new-title))

(defn- count-triples [conn app-id]
  (-> (sql/select-one conn (uhsql/formatp count-triples-q {:app-id app-id}))
      :count))

(defn- setup-clone!
  [ds {:keys [old-app-id new-email new-title batch-size workers total-triples]}]
  (next-jdbc/with-transaction [tx ds]
    (ensure-column-counts! tx)
    (let [app (fetch-app! tx old-app-id)
          creator-id (resolve-creator-id! tx app new-email)
          new-title (resolve-title app new-title)
          job-id (random-uuid)
          new-app-id (random-uuid)]
      (sql/do-execute! tx
                       (uhsql/formatp insert-app-q {:new-app-id new-app-id
                                                    :creator-id creator-id
                                                    :title new-title}))
      (sql/do-execute! tx
                       (uhsql/formatp insert-ident-map-q {:job-id job-id
                                                          :old-app-id old-app-id}))
      (sql/do-execute! tx
                       (uhsql/formatp insert-attr-map-q {:job-id job-id
                                                         :old-app-id old-app-id}))
      (sql/do-execute! tx
                       (uhsql/formatp insert-rules-q {:new-app-id new-app-id
                                                      :old-app-id old-app-id}))
      (sql/do-execute! tx
                       (uhsql/formatp insert-attrs-q {:new-app-id new-app-id
                                                      :job-id job-id
                                                      :old-app-id old-app-id}))
      (sql/do-execute! tx
                       (uhsql/formatp insert-idents-q {:new-app-id new-app-id
                                                       :job-id job-id
                                                       :old-app-id old-app-id}))
      (sql/do-execute! tx
                       (uhsql/formatp insert-admin-token-q {:new-app-id new-app-id
                                                            :token (random-uuid)}))
      (sql/do-execute! tx
                       (uhsql/formatp insert-job-q {:job-id job-id
                                                    :old-app-id old-app-id
                                                    :new-app-id new-app-id
                                                    :new-title new-title
                                                    :creator-email new-email
                                                    :batch-size batch-size
                                                    :workers workers
                                                    :total-triples total-triples
                                                    :status "running"}))
      (doseq [worker-id (range workers)]
        (sql/do-execute! tx
                         (uhsql/formatp insert-progress-q {:job-id job-id
                                                           :worker-id worker-id})))
      {:job-id job-id
       :new-app-id new-app-id})))

(defn- update-job-status! [ds job-id status & [{:keys [error finished]}]]
  (cond
    error
    (sql/do-execute! ds
                     (uhsql/formatp update-job-status-error-q {:job-id job-id
                                                               :status status
                                                               :error error}))
    finished
    (sql/do-execute! ds
                     (uhsql/formatp update-job-status-finished-q {:job-id job-id
                                                                  :status status}))
    :else
    (sql/do-execute! ds
                     (uhsql/formatp update-job-status-q {:job-id job-id
                                                         :status status}))))

(defn- update-worker-progress! [conn job-id worker-id rows last-key done?]
  (if done?
    (sql/do-execute! conn
                     (uhsql/formatp update-progress-done-q {:job-id job-id
                                                            :worker-id worker-id}))
    (sql/do-execute! conn
                     (uhsql/formatp update-progress-q {:rows rows
                                                       :last-entity-id (nth last-key 0)
                                                       :last-attr-id (nth last-key 1)
                                                       :last-value-md5 (nth last-key 2)
                                                       :job-id job-id
                                                       :worker-id worker-id}))))

(defn- run-worker!
  [ds {:keys [job-id old-app-id new-app-id workers batch-size]} worker-id cancel?]
  (with-open [conn (next-jdbc/get-connection ds)]
    (sql/do-execute! conn
                     ["SET application_name = ?"
                      (format "clone_app_worker_%d" worker-id)])
    (loop [last-key [lowest-uuid lowest-uuid ""]
           total 0]
      (if @cancel?
        total
        (let [{:keys [rows last_entity_id last_attr_id last_value_md5]}
              (next-jdbc/with-transaction [tx conn]
                (sql/execute-one! tx
                                  (uhsql/formatp triples-batch-q {:old-app-id old-app-id
                                                                  :workers workers
                                                                  :worker-id worker-id
                                                                  :last-entity-id (nth last-key 0)
                                                                  :last-attr-id (nth last-key 1)
                                                                  :last-value-md5 (nth last-key 2)
                                                                  :batch-size batch-size
                                                                  :new-app-id new-app-id
                                                                  :job-id job-id})))]
          (if (zero? rows)
            (do
              (update-worker-progress! conn job-id worker-id 0 last-key true)
              total)
            (let [next-key [last_entity_id last_attr_id last_value_md5]
                  next-total (+ total rows)]
              (when (some nil? next-key)
                (die! (format "Worker %d returned empty last key with %d rows" worker-id rows)))
              (update-worker-progress! conn job-id worker-id rows next-key false)
              (recur next-key next-total))))))))

(defn- format-seconds [seconds]
  (let [d (Duration/ofSeconds (long seconds))
        hours (.toHours d)
        minutes (.toMinutes d)
        secs (.toSeconds d)
        mins (mod minutes 60)
        s (mod secs 60)]
    (format "%02d:%02d:%02d" hours mins s)))

(defn- report-progress!
  [ds job-id total-triples start-nanos]
  (let [rows (sql/select ds
                         (uhsql/formatp progress-q {:job-id job-id}))
        total (reduce (fn [acc row] (+ acc (:rows_copied row))) 0 rows)
        elapsed-seconds (max 1 (long (/ (- (System/nanoTime) start-nanos) 1e9)))
        rate (/ total elapsed-seconds)
        pct (when (and total-triples (pos? total-triples))
              (* 100.0 (/ total total-triples)))
        eta-seconds (when (and total-triples (pos? rate))
                      (long (/ (max 0 (- total-triples total)) rate)))
        worker-summary (->> rows
                            (map (fn [{:keys [worker_id rows_copied done]}]
                                   (format "w%d=%s%s"
                                           worker_id
                                           (format "%,d" (long rows_copied))
                                           (if done "*" ""))))
                            (str/join " "))]
    (println
     (str "progress "
          (if pct (format "%.2f%% " pct) "")
          (format "%,d" (long total))
          (when total-triples
            (str "/" (format "%,d" (long total-triples))))
          " rows"
          " rate " (format "%.1f" rate) "/s"
          (when eta-seconds
            (str " eta " (format-seconds eta-seconds)))
          (when (seq worker-summary)
            (str " " worker-summary))))))

(defn- start-reporter!
  [ds job-id total-triples report-every stop?]
  (let [start-nanos (System/nanoTime)]
    (future
      (loop []
        (when-not @stop?
          (Thread/sleep (* 1000 report-every))
          (report-progress! ds job-id total-triples start-nanos)
          (recur))))))

(defn- cleanup-maps! [ds job-id]
  (sql/do-execute! ds (uhsql/formatp delete-attr-map-q {:job-id job-id}))
  (sql/do-execute! ds (uhsql/formatp delete-ident-map-q {:job-id job-id})))

(defn- validate-opts! [{:keys [env app-id batch-size workers]}]
  (when (and env (not (#{"prod" "dev"} env)))
    (die! "--env must be 'prod' or 'dev'."))
  (when (str/blank? app-id)
    (die! "--app-id is required."))
  (when (or (nil? batch-size) (<= batch-size 0))
    (die! "--batch-size must be > 0."))
  (when (or (nil? workers) (<= workers 0))
    (die! "--workers must be > 0.")))

(defn clone-app!
  [{:keys [env app-id new-email new-title batch-size workers report-every skip-count] :as opts}]
  (validate-opts! opts)
  (let [db-url (resolve-db-url! opts)
        config (merge (config/db-url->config db-url)
                      {:maximumPoolSize (max 2 (+ workers 2))
                       :minimumIdle 1
                       :poolName "clone_app"})]
    (binding [sql/*query-timeout-seconds* 0]
      (with-open [ds (sql/start-pool config)]
        (let [old-app-id (parse-uuid! "--app-id" app-id)
              total-triples (when-not skip-count
                              (count-triples ds old-app-id))
              {:keys [job-id new-app-id]}
              (setup-clone! ds {:old-app-id old-app-id
                                :new-email new-email
                                :new-title new-title
                                :batch-size batch-size
                                :workers workers
                                :total-triples total-triples})
              cancel? (atom false)
              stop-reporter? (atom false)
              reporter (when (pos? report-every)
                         (start-reporter! ds job-id total-triples report-every stop-reporter?))
              worker-opts {:job-id job-id
                           :old-app-id old-app-id
                           :new-app-id new-app-id
                           :workers workers
                           :batch-size batch-size}
              workers-futures
              (mapv (fn [worker-id]
                      (future
                        (try
                          (run-worker! ds worker-opts worker-id cancel?)
                          (catch Throwable t
                            (reset! cancel? true)
                            (throw t)))))
                    (range workers))]
          (try
            (doseq [f workers-futures]
              @f)
            (update-job-status! ds job-id "completed" {:finished true})
            (cleanup-maps! ds job-id)
            (println (format "clone complete. new_app_id=%s job_id=%s"
                             new-app-id job-id))
            {:new-app-id new-app-id
             :job-id job-id}
            (catch Throwable t
              (reset! cancel? true)
              (update-job-status! ds job-id "failed" {:error (.getMessage t)})
              (throw t))
            (finally
              (reset! stop-reporter? true)
              (when reporter
                @reporter))))))))

(defn -main [& args]
  (let [opts (parse-args args)]
    (when (:help opts)
      (println (usage))
      (System/exit 0))
    (try
      (clone-app! opts)
      (shutdown-agents)
      (catch Throwable t
        (binding [*out* *err*]
          (println (.getMessage t)))
        (System/exit 1)))))
