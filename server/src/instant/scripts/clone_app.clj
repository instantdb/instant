(ns instant.scripts.clone-app
  (:require
   [clojure.string :as string]
   [clojure.tools.cli :refer [parse-opts]]
   [instant.aurora-config :as aurora-config]
   [instant.config :as config]
   [instant.jdbc.sql :as sql]
   [instant.util.hsql :as uhsql]
   [instant.util.uuid :as uuid-util]
   [instant.comment :as comment]
   [instant.model.instant-user :as instant-user-model]
   [instant.model.app :as app-model]
   [honey.sql :as hsql]
   [next.jdbc :as next-jdbc])
  (:import
   (java.util UUID)))

;; ----------- 
;; Assert column counts

(def ^:private column-count-q
  (uhsql/preformat
   {:select [[[:count :*] :count]]
    :from :information_schema.columns
    :where [:and
            [:= :table-schema [:inline "public"]]
            [:= :table-name :?table-name]]}))

(defn- get-column-count [conn table-name]
  (-> (sql/select-one conn (uhsql/formatp column-count-q {:table-name table-name}))
      :count))

(defn- assert-table-column-count [conn table-name expected]
  (let [got (get-column-count conn table-name)]
    (assert
     (= got expected)
     (format
      "Check for new columns in %s table and update clone_app.clj. Expected %d columns, but got %d"
      table-name expected got))))

(defn- assert-table-column-counts [conn]
  (assert-table-column-count conn "triples" 13)
  (assert-table-column-count conn "idents" 5)
  (assert-table-column-count conn "attrs" 22)
  (assert-table-column-count conn "rules" 2))

;; ------------ 
;; snapshot helpers

(defn- resolve-db-config
  "Ensure db-config has :user/:password (resolve :secret-arn once)."
  [db-config]
  (if-let [secret-arn (:secret-arn db-config)]
    (-> db-config
        (dissoc :secret-arn)
        (merge (aurora-config/secret-arn->db-creds secret-arn)))
    db-config))

(def ^:private export-snapshot-q
  ["select pg_export_snapshot() as snapshot"])

(defn- with-repeatable-read-snapshot
  "Open a repeatable-read, read-only transaction, export snapshot, and keep it
   open while f runs."
  [db-config f]
  (next-jdbc/with-transaction [tx db-config {:isolation :repeatable-read
                                             :read-only true}]
    (let [snapshot (:snapshot (sql/select-one tx export-snapshot-q))]
      (f {:snapshot snapshot
          :snapshot-conn tx}))))

(defn- with-snapshot-transaction
  "Start a repeatable-read transaction and import snapshot before any query."
  [db-config snapshot f]
  (next-jdbc/with-transaction [tx db-config {:isolation :repeatable-read}]
    ;; Must be the first SQL command in the transaction.
    ;; Can't parametrize snapshot id; see wal.clj for the same pattern.
    (sql/do-execute! tx [(format "set transaction snapshot '%s'" snapshot)])
    (f tx)))

(defn- run-workers!
  "Run worker-fn over items. Fail fast on first error, cancel others."
  [worker-fn items]
  (if (empty? items)
    []
    (let [remaining (atom (count items))
          done (promise)
          futures (mapv (fn [item]
                          (future
                            (try
                              (worker-fn item)
                              (catch Throwable t
                                (deliver done {:error t})
                                (throw t))
                              (finally
                                (when (zero? (swap! remaining dec))
                                  (deliver done {:ok true}))))))
                        items)
          result @done]
      (when-let [err (:error result)]
        (doseq [f futures] (future-cancel f))
        (throw err))
      futures)))

(defn- coerce-uuid! [label value]
  (let [uuid (uuid-util/coerce value)]
    (when-not uuid
      (throw (ex-info (format "Invalid %s UUID: %s" label value)
                      {:label label :value value})))
    uuid))

(defn- normalize-dest-title [source-title dest-title]
  (if (string/blank? dest-title)
    (throw (ex-info "Missing new title" {:source-title source-title}))
    dest-title))

(defn- worker-status-query [job-id]
  (format
   "select *
from clone_app_jobs
where job_id = '%s'::uuid;

with job as (
  select *
  from clone_app_jobs
  where job_id = '%s'::uuid
),
progress as (
  select *
  from clone_app_progress
  where job_id = (select job_id from job)
)
select
  p.worker_id,
  p.rows_copied,
  (select total_triples from job) as total_triples,
  ((select total_triples from job) - sum(p.rows_copied) over ()) as rows_left_overall,
  round((p.rows_copied::numeric / nullif((select total_triples from job), 0)) * 100, 2) as percent_of_total,
  p.done,
  p.updated_at
from progress p
order by p.worker_id;"
   job-id
   job-id))

(defn- print-worker-status-query! [job-id]
  (println "To check the status of the workers, run:\n")
  (println (worker-status-query job-id))
  (println))

;; ------------ 
;; set-up-empty-clone-app!

(def ^:private insert-ident-map-q
  (uhsql/preformat
   {:insert-into [[:clone-app-ident-map [:job-id :old-id :new-id]]
                  {:select [:?job-id :id :%gen_random_uuid]
                   :from :idents
                   :where [:= :app-id :?source-app-id]}]}))

(def ^:private insert-attr-map-q
  (uhsql/preformat
   {:insert-into [[:clone-app-attr-map [:job-id :old-id :new-id]]
                  {:select [:?job-id :id :%gen_random_uuid]
                   :from :attrs
                   :where [:= :app-id :?source-app-id]}]}))

(def ^:private insert-idents-q
  (uhsql/preformat
   {:insert-into [[:idents [:id
                            :app-id
                            :attr-id
                            :etype
                            :label]]
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
                   :where [:= :i.app-id :?source-app-id]}]}))

(def ^:private insert-attrs-q
  (uhsql/preformat
   {:insert-into [[:attrs [:id
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
                           :metadata]]
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
                   :where [:= :a.app-id :?source-app-id]}]}))

(def ^:private insert-rules-q
  (uhsql/preformat
   {:insert-into [[:rules [:app-id :code]]
                  {:select [:?new-app-id :r.code]
                   :from [[:rules :r]]
                   :where [:= :r.app-id :?source-app-id]}]}))

(defn setup-empty-clone-app! [conn {:keys [job-id temporary-creator-id source-app-id dest-title dest-app-id]}]
  ;; todo: should do this inside a transaction
  (let [new-admin-token (random-uuid)
        app (app-model/create! conn {:id dest-app-id
                                     :admin-token new-admin-token
                                     :title dest-title
                                     :creator-id temporary-creator-id})]

    ;; map idents + create them 
    (sql/do-execute! conn
                     (uhsql/formatp insert-ident-map-q {:job-id job-id
                                                        :source-app-id source-app-id}))
    (sql/do-execute! conn
                     (uhsql/formatp insert-idents-q {:new-app-id dest-app-id
                                                     :job-id job-id
                                                     :source-app-id source-app-id}))
    ;; map attrs + create them
    (sql/do-execute! conn
                     (uhsql/formatp insert-attr-map-q {:job-id job-id
                                                       :source-app-id source-app-id}))
    (sql/do-execute! conn
                     (uhsql/formatp insert-attrs-q {:new-app-id dest-app-id
                                                    :job-id job-id
                                                    :source-app-id source-app-id}))
    ;; copy over rules
    (sql/do-execute! conn
                     (uhsql/formatp insert-rules-q {:new-app-id dest-app-id
                                                    :source-app-id source-app-id}))
    app))

;; ------- 
;; jobs + progress 

(def ^:private create-job-q
  (uhsql/preformat
   {:insert-into :clone-app-jobs
    :values [{:job-id :?job-id
              :source-app-id :?source-app-id
              :dest-app-id :?dest-app-id
              :dest-title :?dest-title
              :temporary-creator-id :?temporary-creator-id
              :dest-creator-id :?dest-creator-id
              :batch-size :?batch-size
              :num-workers :?num-workers
              :total-triples :?total-triples
              :status :?status}]
    :returning :*}))

(defn- create-job!
  [conn opts]
  (sql/execute-one! conn
                    (uhsql/formatp create-job-q opts)))

(def ^:private update-job-total-triples-q
  (uhsql/preformat
   {:update :clone-app-jobs
    :set {:total-triples :?total-triples
          :updated-at :%now}
    :where [:= :job-id :?job-id]}))

(defn- update-job-total-triples!
  [conn opts]
  (sql/do-execute! conn
                   (uhsql/formatp update-job-total-triples-q opts)))

(def ^:private create-progress-q
  (uhsql/preformat
   {:insert-into :clone-app-progress
    :values [{:job-id :?job-id
              :worker-id :?worker-id}]
    :returning :*}))

(defn- create-progress!
  [conn opts]
  (sql/execute-one! conn
                    (uhsql/formatp create-progress-q opts)))

(def ^:private update-progress-q
  (uhsql/preformat
   {:update :clone-app-progress
    :set {:rows-copied :?rows-copied
          :last-entity-id :?last-entity-id
          :last-attr-id :?last-attr-id
          :last-value-md5 :?last-value-md5
          :updated-at :%now
          :done :?done}
    :where [:and
            [:= :job-id :?job-id]
            [:= :worker-id :?worker-id]]}))

(defn- update-progress!
  [conn opts]
  (sql/do-execute! conn (uhsql/formatp update-progress-q opts)))

(def ^:private delete-job-q
  (uhsql/preformat
   {:delete-from :clone-app-jobs
    :where [:= :job-id :?job-id]}))

(defn- delete-job!
  [conn opts]
  (sql/do-execute! conn
                   (uhsql/formatp delete-job-q opts)))

(def ^:private total-triples-q
  (uhsql/preformat
   {:select [[[:count :*] :count]]
    :from :triples
    :where [:= :app-id :?source-app-id]}))

(defn- get-total-triples [conn source-app-id]
  (:count (sql/select-one conn (uhsql/formatp total-triples-q {:source-app-id source-app-id}))))

;; -------------- 
;; Worker ranges 

(def ^:private worker-ranges-q
  (uhsql/preformat
   {:with [[:ordered {:select [:entity-id
                               [[:over [[:ntile [:cast :?num-workers :int]]
                                        {:order-by [:entity-id]}]]
                                :bucket]]
                      :from :triples
                      :where [:= :app-id :?source-app-id]}]
           [:buckets {:select-distinct-on [[:bucket]
                                           :bucket
                                           [:entity-id :start-entity-id]]
                      :from :ordered
                      :order-by [:bucket :entity-id]}]
           [:ranges {:select [:bucket
                              :start-entity-id
                              [[:over [[:lead :start-entity-id]
                                       {:order-by [:bucket]}]]
                               :end-entity-id]]
                     :from :buckets}]]
    :select [:bucket :start-entity-id :end-entity-id]
    :from :ranges
    :order-by :bucket}))

(comment
  (let [db-config (config/get-aurora-config)]
    (with-open [conn (next-jdbc/get-connection db-config)]
      (sql/select conn
                  (uhsql/formatp worker-ranges-q
                                 {:source-app-id (:id zeneca-app)
                                  :num-workers 3})))))

(defn get-worker-ranges
  "This does one pass over app triples, and divides up the entity ids into `num-workers` regions.
  
  This way each worker can consume its own region, and expect that the triples will be contiguous
  on disk. 

  The reason we did this was to optimize for page cache locality.
  
  Note: this assumes the `conn` comes with a snapshot, so that all workers see a consistent
        view"
  [conn source-app-id num-workers]
  (sql/select conn
              (uhsql/formatp worker-ranges-q
                             {:source-app-id source-app-id
                              :num-workers num-workers})))

;; --------------- 
;; triple-batch-insert 

(def ^:private lowest-uuid
  (UUID/fromString "00000000-0000-0000-0000-000000000000"))

;; todo: can we try to get this as a preformat?
(defn- triples-batch-q [has-end?]
  (let [where (cond-> [:and
                       [:= :t.app-id :?source-app-id]
                       [:>= :t.entity-id :?start-entity-id]
                       [:> [:composite :t.entity-id :t.attr-id :t.value-md5]
                        [:composite :?last-entity-id :?last-attr-id :?last-value-md5]]]
                has-end? (conj [:< :t.entity-id :?end-entity-id]))]
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
                     :where where
                     :order-by [:t.entity-id :t.attr-id :t.value-md5]
                     :limit :?batch-size}]
            [:ins {:insert-into [[:triples
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
                                   :pg-size]]
                                 {:select [:?dest-app-id
                                           :b.entity-id
                                           [[:coalesce :am.new-id :b.attr-id] :attr-id]
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

;; --------------- 
;; run-worker

(defn- run-worker!
  [snapshot-conn db-config {:keys [job-id source-app-id dest-app-id batch-size
                                   start-entity-id end-entity-id]} worker-id]
  (with-open [progress-conn (next-jdbc/get-connection db-config)]
    (let [batch-q (triples-batch-q (some? end-entity-id))]
      (create-progress! progress-conn {:job-id job-id
                                       :worker-id worker-id})
      (loop [last-key [lowest-uuid lowest-uuid ""]
             total (long 0)]
        (let [{:keys [rows last_entity_id last_attr_id last_value_md5]}
              (sql/execute-one! snapshot-conn
                                (hsql/format
                                 batch-q
                                 {:params {:source-app-id source-app-id
                                           :start-entity-id start-entity-id
                                           :end-entity-id end-entity-id
                                           :last-entity-id (nth last-key 0)
                                           :last-attr-id (nth last-key 1)
                                           :last-value-md5 (nth last-key 2)
                                           :batch-size batch-size
                                           :dest-app-id dest-app-id
                                           :job-id job-id}}))
              rows (long rows)]
          (if (zero? rows)
            (do
              (update-progress! progress-conn {:job-id job-id
                                               :worker-id worker-id
                                               :rows-copied total
                                               :last-entity-id (nth last-key 0)
                                               :last-attr-id (nth last-key 1)
                                               :last-value-md5 (nth last-key 2)
                                               :done true})

              total)
            (let [next-key [last_entity_id last_attr_id last_value_md5]
                  next-total (+ total rows)]
              (update-progress! progress-conn {:job-id job-id
                                               :worker-id worker-id
                                               :rows-copied next-total
                                               :last-entity-id last_entity_id
                                               :last-attr-id last_attr_id
                                               :last-value-md5 last_value_md5
                                               :done false})

              (recur next-key next-total))))))))

;; --------------- 
;; clone-app 

(defn clone-app! [db-config {:keys [source-app-id
                                    temporary-creator-id
                                    dest-creator-id
                                    dest-title
                                    num-workers
                                    batch-size]}]
  (let [db-config (resolve-db-config db-config)
        source-app-id (coerce-uuid! "source app id" source-app-id)
        temporary-creator-id (coerce-uuid! "temporary creator id" temporary-creator-id)
        dest-creator-id (coerce-uuid! "dest creator id" dest-creator-id)
        num-workers (long (or num-workers
                              (throw (ex-info "Missing num-workers" {}))))
        batch-size (long (or batch-size
                             (throw (ex-info "Missing batch-size" {}))))
        job-id (random-uuid)
        dest-app-id (random-uuid)]
    (with-open [control-conn (next-jdbc/get-connection db-config)]
      (assert-table-column-counts control-conn)
      (let [source-app (app-model/get-by-id! control-conn {:id source-app-id})
            dest-title (normalize-dest-title (:title source-app) dest-title)]
        (instant-user-model/get-by-id! control-conn {:id temporary-creator-id})
        (instant-user-model/get-by-id! control-conn {:id dest-creator-id})
        (next-jdbc/with-transaction [tx control-conn]
          (create-job! tx {:job-id job-id
                           :source-app-id source-app-id
                           :dest-app-id dest-app-id
                           :dest-title dest-title
                           :temporary-creator-id temporary-creator-id
                           :dest-creator-id dest-creator-id
                           :batch-size batch-size
                           :num-workers num-workers
                           :total-triples nil
                           :status "running"})
          (setup-empty-clone-app! tx {:job-id job-id
                                      :temporary-creator-id temporary-creator-id
                                      :source-app-id source-app-id
                                      :dest-title dest-title
                                      :dest-app-id dest-app-id}))
        (with-repeatable-read-snapshot db-config
          (fn [{:keys [snapshot snapshot-conn]}]
            (let [total-triples (get-total-triples snapshot-conn source-app-id)
                  worker-ranges (get-worker-ranges snapshot-conn source-app-id num-workers)]
              (update-job-total-triples! control-conn {:job-id job-id
                                                       :total-triples total-triples})
              (print-worker-status-query! job-id)
              (try
                (run-workers!
                 (fn [{:keys [bucket]
                       start-entity-id :start_entity_id
                       end-entity-id :end_entity_id}]
                   (with-snapshot-transaction db-config snapshot
                     (fn [tx]
                       (run-worker! tx
                                    db-config
                                    {:job-id job-id
                                     :source-app-id source-app-id
                                     :dest-app-id dest-app-id
                                     :batch-size batch-size
                                     :start-entity-id start-entity-id
                                     :end-entity-id end-entity-id}
                                    (int bucket)))))
                 worker-ranges)
                (app-model/change-creator! control-conn {:id dest-app-id
                                                         :new-creator-id dest-creator-id})
                (delete-job! control-conn {:job-id job-id})
                (app-model/get-by-id! control-conn {:id dest-app-id})
                (catch Exception e
                  (throw e))))))))))

(defn- print-usage! [summary]
  (println
   (string/join
    "\n"
    ["USAGE:"
     "  clojure -M -m instant.scripts.clone-app \\"
     "    --database-url URL \\"
     "    --app-id APP_UUID \\"
     "    --temporary-email EMAIL \\"
     "    --dest-email EMAIL \\"
     "    --new-title TITLE \\"
     "    --num-workers N \\"
     "    --batch-size N"
     ""
     summary])))

(def ^:private cli-options
  [["-h" "--help" "Show help"]
   [nil "--database-url URL" "Database URL"]
   [nil "--app-id APP_UUID" "Source app id"
    :parse-fn (fn [value]
                (or (parse-uuid value)
                    (throw (ex-info (format "Invalid app id: %s" value)
                                    {:value value}))))
    :id :source-app-id
    :assoc-fn (fn [m k v] (assoc m k v))]
   [nil "--temporary-email EMAIL" "Temporary creator email"]
   [nil "--dest-email EMAIL" "Destination creator email"]
   [nil "--new-title TITLE" "Destination app title"
    :id :dest-title]
   [nil "--num-workers N" "Number of workers"
    :parse-fn (fn [value]
                (or (parse-long value)
                    (throw (ex-info (format "Invalid num-workers: %s" value)
                                    {:value value}))))
    :assoc-fn (fn [m k v] (assoc m k v))]
   [nil "--batch-size N" "Batch size"
    :parse-fn (fn [value]
                (or (parse-long value)
                    (throw (ex-info (format "Invalid batch-size: %s" value)
                                    {:value value}))))
    :assoc-fn (fn [m k v] (assoc m k v))]])

(defn -main [& args]
  (let [{:keys [options errors summary]} (parse-opts args cli-options)
        opts options]
    (when (seq errors)
      (throw (ex-info (string/join "\n" errors) {:errors errors})))
    (if (:help opts)
      (print-usage! summary)
      (let [db-url (:database-url opts)
            source-app-id (:source-app-id opts)
            temporary-email (:temporary-email opts)
            dest-email (:dest-email opts)]
        (when (string/blank? db-url)
          (throw (ex-info "Missing --database-url" {})))
        (when (nil? source-app-id)
          (throw (ex-info "Missing --app-id" {})))
        (when (string/blank? temporary-email)
          (throw (ex-info "Missing --temporary-email" {})))
        (when (string/blank? dest-email)
          (throw (ex-info "Missing --dest-email" {})))
        (when (string/blank? (:dest-title opts))
          (throw (ex-info "Missing --new-title" {})))
        (when (nil? (:num-workers opts))
          (throw (ex-info "Missing --num-workers" {})))
        (when (nil? (:batch-size opts))
          (throw (ex-info "Missing --batch-size" {})))
        (let [db-config (config/db-url->config db-url)]
          (with-open [conn (next-jdbc/get-connection db-config)]
            (let [temporary-user (instant-user-model/get-by-email conn {:email temporary-email})
                  dest-user (instant-user-model/get-by-email conn {:email dest-email})]
              (when-not temporary-user
                (throw (ex-info (format "No user found for temporary email: %s" temporary-email)
                                {:email temporary-email})))
              (when-not dest-user
                (throw (ex-info (format "No user found for dest email: %s" dest-email)
                                {:email dest-email})))
              (let [app (clone-app! db-config {:source-app-id source-app-id
                                               :temporary-creator-id (:id temporary-user)
                                               :dest-creator-id (:id dest-user)
                                               :dest-title (:dest-title opts)
                                               :num-workers (:num-workers opts)
                                               :batch-size (:batch-size opts)})]
                (println "done!")
                (println (:id app))))))))))

(comment
  (def zeneca-app (comment/zeneca-app!))
  (def u (instant-user-model/get-by-email {:email "stepan.p@gmail.com"}))
  (def db-config (config/get-aurora-config))

  (app-model/change-creator! {:id (:id zeneca-app)
                              :new-creator-id (:id u)})

  (with-open [conn (next-jdbc/get-connection db-config)]
    (get-column-count conn "instant_users"))

  (with-open [conn (next-jdbc/get-connection db-config)]
    (assert-table-column-counts conn))

  (clone-app!
   db-config
   {:source-app-id (:id zeneca-app)
    :temporary-creator-id (:id u)
    :dest-creator-id (:id u)
    :dest-title "cloned-app-4"
    :num-workers 2
    :batch-size 100}))
