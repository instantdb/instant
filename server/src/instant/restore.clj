(ns instant.restore
  (:require
   [clojure.string]
   [instant.config :as config]
   [instant.dash.ephemeral-app :as ephemeral-app]
   [instant.db.model.attr :as attr-model]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.copy :as copy]
   [instant.jdbc.sql :as sql]
   [instant.jdbc.wal :as wal]
   [instant.model.app :as app-model]
   [instant.model.app-email-template :as app-email-template-model]
   [instant.model.instant-user :as instant-user-model]
   [instant.model.org :as org-model]
   [instant.model.rule :as rule-model]
   [instant.model.schema :as schema-model]
   [instant.storage.s3 :refer [->object-key bucket-name multipart-part-size
                               s3-transfer-manager]]
   [instant.system-catalog :as system-catalog]
   [instant.util.async :as ua]
   [instant.util.coll :as ucoll]
   [instant.util.crypt :as crypt-util]
   [instant.util.defrecord :refer [defrecord-once]]
   [instant.util.exception :as ex]
   [instant.util.hsql :as uhsql]
   [instant.util.json :as json]
   [instant.util.memoize :refer [vmemoize]]
   [instant.util.s3 :as s3]
   [instant.util.tracer :as tracer]
   [next.jdbc])
  (:import
   (instant.util.async IBlockingSubmit)
   (java.io BufferedInputStream BufferedReader InputStream InputStreamReader)
   (java.nio.charset StandardCharsets)
   (java.util.concurrent Callable LinkedBlockingQueue TimeUnit)
   (java.util.zip ZipEntry ZipFile)))

(def triple-columns [{:name :app-id
                      :pgtype "uuid"}
                     {:name :entity-id
                      :pgtype "uuid"}
                     {:name :attr-id
                      :pgtype "uuid"}
                     {:name :value
                      :pgtype "jsonb"}
                     {:name :value-md5
                      :pgtype "text"}
                     {:name :ea
                      :pgtype "boolean"}
                     {:name :eav
                      :pgtype "boolean"}
                     {:name :av
                      :pgtype "boolean"}
                     {:name :ave
                      :pgtype "boolean"}
                     {:name :vae
                      :pgtype "boolean"}
                     {:name :created-at
                      :pgtype "bigint"}
                     {:name :checked-data-type
                      :pgtype "text"}])

(defrecord-once Triple [app-id
                        entity-id
                        attr-id
                        value
                        value-md5
                        ea
                        eav
                        av
                        ave
                        vae
                        created-at
                        checked-data-type])

(def copy-query "copy triples (app_id, entity_id, attr_id, value, value_md5, ea, eav, av, ave, vae, created_at, checked_data_type) from stdin with (format binary)")

(def files-prefix "files/")
(def entities-prefix "entities/")
(def entities-suffix ".jsonl")

(defn update-owner!
  ([app-id params] (update-owner! (aurora/conn-pool :write) app-id params))
  ([conn app-id {:keys [creator-id org-id]}]
   (if creator-id
     (app-model/change-creator! conn {:id app-id
                                      :new-creator-id creator-id})
     (org-model/transfer-app-to-org! conn {:app-id app-id
                                           :org-id org-id}))))

(defn value-md5 [v]
  (-> v
      json/->json-bytes
      crypt-util/bytes->md5
      crypt-util/bytes->hex-string))

(defn restore-email-templates!
  "Restores the app's email templates' body/name/subject. The sender isn't
   restored — the backup only kept the sender's email, not the sender record —
   so sender_id is left null for the owner to reconnect."
  [app-id email-templates]
  (doseq [{:keys [type body name subject]} email-templates]
    (app-email-template-model/put! {:app-id app-id
                                    :email-type type
                                    :subject subject
                                    :name name
                                    :body body})))

(defn initialize-app-from-config
  "Creates a new ephemeral app with rules, schema, and email templates.
   At the end of the process we'll transfer the app to the org or user.
   We don't want the app to be discoverable while we're in the process of
   doing a restore."
  [config {:keys [id title]}]
  (let [app (ephemeral-app/create-with-id! {:id id
                                            :title title})]
    (when-let [rules-code (:rules config)]
      (rule-model/put! {:app-id (:id app)
                        :code rules-code}))
    (->> (:schema config)
         (schema-model/plan! {:app-id (:id app)
                              :check-types? true
                              :background-updates? false})
         (schema-model/apply-plan! (:id app)))
    (restore-email-templates! (:id app) (:emailTemplates config))
    app))

(defn enqueue-file!
  "Enqueues a restored $files entity's blob for upload, pairing its metadata
   with the bytes from the zip at files/<location-id>.
   Throws if the blob is missing from the backup."
  [^ZipFile zin ^LinkedBlockingQueue files-queue entity]
  (let [location-id (get entity "location-id")
        entry (.getEntry zin (str files-prefix location-id))]
    (when-not location-id
      (throw (ex-info "Backup is missing the location-id for a $files entity"
                      {:entity entity})))
    (when-not entry
      (throw (ex-info "Backup is missing the file blob for a $files entity"
                      {:location-id location-id})))
    (.put files-queue
          {:location-id location-id
           :content-type (get entity "content-type")
           :content-disposition (get entity "content-disposition")
           :content-length (get entity "size")
           :input-stream (.getInputStream zin entry)})))

(defn process-entities-from-zip-input-stream [^ZipFile zin triples-queue files-queue app-id attrs ^String etype ^InputStream in]
  (let [get-attr (vmemoize (fn [k]
                             (attr-model/seek-by-fwd-ident-name [etype k] attrs)))]

    (with-open [in in
                rdr_ (InputStreamReader. in StandardCharsets/UTF_8)
                rdr (BufferedReader. rdr_)]
      (doseq [row (json/parsed-seq rdr)
              :let [entity (get row "entity")
                    entity-id (-> entity (get "id") parse-uuid)]]
        (when (= etype "$files")
          (enqueue-file! zin files-queue entity))
        (doseq [[k v] entity
                :let [attr (get-attr k)
                      attr-id (:id attr)
                      ref? (= :ref (:value-type attr))
                      one? (= :one (:cardinality attr))]]
          (when-not attr
            (throw (ex-info (format "Missing attr for %s.%s" etype k)
                            {:namespace etype
                             :field k
                             :entity-id entity-id})))
          (if one?
            (LinkedBlockingQueue/.put triples-queue (->Triple app-id
                                                              entity-id
                                                              attr-id
                                                              v
                                                              (value-md5 v)
                                                              one? ;; ea
                                                              ref? ;; eav
                                                              (:unique? attr) ;; av
                                                              (:index? attr) ;; ave
                                                              ref? ;; vae
                                                              (get row "createdAt")
                                                              (some-> attr :checked-data-type name)))
            (doseq [v v]
              (LinkedBlockingQueue/.put triples-queue (->Triple app-id
                                                                entity-id
                                                                attr-id
                                                                v
                                                                (value-md5 v)
                                                                one? ;; ea
                                                                ref? ;; eav
                                                                (:unique? attr) ;; av
                                                                (:index? attr) ;; ave
                                                                ref? ;; vae
                                                                (get row "createdAt")
                                                                (some-> attr :checked-data-type name))))))))))

(defn get-config-from-zip-input-stream [^InputStream in]
  (with-open [in in
              rdr_ (InputStreamReader. in StandardCharsets/UTF_8)
              rdr (BufferedReader. rdr_)]
    (let [config (json/<-json-stream rdr true)]
      (when-not (and (map? config) (:schema config))
        (throw (ex-info "Backup config.json is malformed: expected an object with a schema key."
                        {:config-keys (when (map? config) (keys config))})))
      config)))

(defn queue-seq [^LinkedBlockingQueue q done-signal]
  (lazy-seq
   (let [item (.take q)]
     (when-not (= item done-signal)
       (cons item (queue-seq q done-signal))))))

(def triples-copy-batch-size 1000)

(defn process-triples [done-signal ^LinkedBlockingQueue triples-queue]
  (tracer/with-span! {:name "restore/process-triples"}
    (with-open [conn (wal/get-pg-copy-ready-conn (config/get-aurora-config))]
      ;; This looks a little odd, but it lets us stream the next batch of
      ;; 1000 triples into the database instead of waiting for the full chunk
      ;; to be ready.
      (loop [rs (seq (queue-seq triples-queue done-signal))]
        (when rs
          (copy/copy-in-rows conn copy-query triple-columns
                             (take triples-copy-batch-size rs))
          (recur (seq (nthrest rs triples-copy-batch-size))))))))

(defn memory-based-max-file-upload-concurrency
  "Number of files to upload concurrently, making sure we have
   enough free memory for s3 segments."
  []
  (let [rt (Runtime/getRuntime)
        ;; max heap (-Xmx) minus what's currently in use
        free-heap (- (.maxMemory rt)
                     (- (.totalMemory rt) (.freeMemory rt)))]
    (min (max 8 (quot free-heap (* 4 multipart-part-size)))
         256)))

(defn upload-file [app-id {:keys [location-id
                                  input-stream
                                  content-type
                                  content-disposition
                                  content-length]}]
  (let [ctx (cond-> {:object-key (->object-key app-id location-id)}
              content-type (assoc :content-type content-type)
              content-disposition (assoc :content-disposition content-disposition)
              content-length (assoc :content-length (long content-length)))]
    ;; Use a buffered stream to make sure transfer-manager can retry
    (with-open [stream (BufferedInputStream. input-stream (int multipart-part-size))]
      (s3/transfer-manager-upload-stream (s3-transfer-manager)
                                         bucket-name
                                         ctx
                                         stream))))

(defn process-files [app-id done-signal max-concurrency ^LinkedBlockingQueue files-queue error abort]
  (tracer/with-span! {:name "restore/process-files"}
    (let [executor (ua/make-limited-concurrency-executor max-concurrency)]
      (try
        (doseq [item (queue-seq files-queue done-signal)]
          (IBlockingSubmit/.submitBlocking
           executor
           (reify Callable
             (call [_]
               (try
                 (upload-file app-id item)
                 (catch Throwable t
                   (abort t)
                   (throw t)))))))
        ;; Wait for executor to drain
        (.shutdown executor)
        (.awaitTermination executor 60 TimeUnit/MINUTES)
        (when-not (.isTerminated executor)
          (throw (ex-info "File uploads did not complete." {})))
        (when-let [t @error]
          (throw t))
        (finally
          ;; On abort/interrupt, stop any uploads still in flight.
          (.shutdownNow executor))))))

(def check-files-q (uhsql/preformat {:select [[[:json_agg [:triples_extract_string_value :value]] :location-ids]]
                                     :from :triples
                                     :where [:and
                                             [:= :app-id :?app-id]
                                             [:= :attr-id [:inline system-catalog/location-id-attr-id]]
                                             [:= [:triples_extract_string_value :value] [:any :?location-ids]]]}))

(defn check-files [app-id done-signal ^LinkedBlockingQueue files-queue]
  (doseq [ids-seq (partition-all triples-copy-batch-size (queue-seq files-queue done-signal))
          :let [location-ids (set ids-seq)
                q (uhsql/formatp check-files-q
                                 {:app-id app-id
                                  :location-ids (with-meta location-ids {:pgtype "text[]"})})
                db-location-ids (-> (sql/select-one ::check-files
                                                    (aurora/conn-pool :read)
                                                    q)
                                    :location_ids)
                missing-ids (ucoll/reduce-tr disj! location-ids db-location-ids)]]
    (when (seq missing-ids)
      (throw (ex-info "Files in the zip are missing in the $files entities"
                      {:missing-location-ids missing-ids})))))

(defn read-zip-entries!
  "Producer for the restore: walks the zip and feeds the triples and files
   queues, then signals both queues that it's done. Runs in its own vfuture so a
   consumer failure can cancel it even while it's blocked on a full queue."
  [^ZipFile zin
   app-id
   done-signal
   ^LinkedBlockingQueue triples-queue
   ^LinkedBlockingQueue files-queue
   ^LinkedBlockingQueue files-check-queue
   title]
  (tracer/with-span! {:name "restore/read-zip-entries"}
    (loop [status :config
           attrs nil
           entries (enumeration-seq (.entries zin))]
      (when-let [^ZipEntry entry (first entries)]
        (let [entry-name (.getName entry)]
          (case status
            :config (if-not (= entry-name "config.json")
                      (throw (ex-info "Expected first entry in zip file to be config.json."
                                      {:expected "config.json"
                                       :actual entry-name}))
                      (let [config (get-config-from-zip-input-stream (.getInputStream zin entry))
                            app (initialize-app-from-config config {:id app-id
                                                                    :title (or title
                                                                               (str (:title config) " (Restored)"))})]
                        (recur :entity
                               (attr-model/get-by-app-id (:id app))
                               (next entries))))
            :entity (cond (clojure.string/starts-with? entry-name files-prefix)
                          (do
                            (.put triples-queue done-signal)
                            (recur :file
                                   attrs
                                   entries))

                          (and (clojure.string/starts-with? entry-name entities-prefix)
                               (clojure.string/ends-with? entry-name entities-suffix))
                          (let [etype (subs entry-name
                                            (count entities-prefix)
                                            (- (count entry-name) (count entities-suffix)))
                                in (.getInputStream zin entry)]
                            (process-entities-from-zip-input-stream zin triples-queue files-queue app-id attrs etype in)
                            (recur :entity
                                   attrs
                                   (next entries)))

                          :else
                          (throw (ex-info "Expected entry in zip file to be entities/* or files/*"
                                          {:expected "entities/*|files/*"
                                           :actual entry-name})))
            :file (if-not (clojure.string/starts-with? entry-name files-prefix)
                    (throw (ex-info "Expected a file entry in the zip file"
                                    {:expected "file/*"
                                     :actual entry-name}))
                    (let [location-id (subs entry-name (count files-prefix))]
                      (.put files-check-queue location-id)
                      (recur :file
                             attrs
                             (next entries))))))))))

(defn validate-restore-params!
  "A restored app is owned by exactly one of a creator or an org. Validates that
   exactly one is given and exists, and that the target app-id (if given) is free."
  [{:keys [creator-id org-id app-id]}]
  (ex/assert-valid!
   :restore
   {:creator-id creator-id :org-id org-id}
   (cond
     (and creator-id org-id)
     [{:message "Provide either a creator-id or an org-id, not both."}]

     (not (or creator-id org-id))
     [{:message "Provide a creator-id or an org-id for the restored app."}]))
  (when creator-id
    (instant-user-model/get-by-id! {:id creator-id}))
  (when org-id
    (org-model/get-by-id! {:id org-id}))
  (when (and app-id (app-model/get-by-id {:id app-id}))
    (ex/throw-validation-err!
     :restore
     {:app-id app-id}
     [{:message "An app already exists with this id."}])))

(def delete-app-triples-q
  (uhsql/preformat
   {:with [[:to-delete {:select :ctid
                        :from :triples
                        :where [:= :app-id :?app-id]
                        :limit :?batch-size
                        :for :update}]]
    :delete-from :triples
    :where [:in :ctid {:select :ctid
                       :from :to-delete}]}))

(defn delete-app-triples!
  "Deletes an app's triples in batches so the per-statement delete trigger works
   over a bounded transition table."
  [app-id]
  (loop []
    (let [deleted (-> (sql/do-execute! ::delete-app-triples!
                                       (aurora/conn-pool :write)
                                       (uhsql/formatp delete-app-triples-q
                                                      {:app-id app-id
                                                       :batch-size triples-copy-batch-size}))
                      first
                      :next.jdbc/update-count)]
      (when (and deleted (pos? deleted))
        (recur)))))

(defn restore-from-zip [{:keys [^String zip-file-path
                                creator-id
                                app-id
                                title
                                org-id
                                max-files-concurrency]
                         :as params}]
  (validate-restore-params! params)
  (let [max-concurrency (or max-files-concurrency
                            (memory-based-max-file-upload-concurrency))
        app-id (or app-id (random-uuid))
        done-signal ::done
        error (atom nil)
        processes (atom nil)
        ;; Capture the first error (compare-and-set! keeps the root cause even
        ;; if a later cancellation throws an InterruptedException) and cancel
        ;; every process.
        abort (fn [t]
                (when (compare-and-set! error nil t)
                  (run! future-cancel @processes)))
        triples-queue (LinkedBlockingQueue. 5000)
        files-queue (LinkedBlockingQueue. 1024)
        files-check-queue (LinkedBlockingQueue. 10000)]
    (try
      (with-open [zin (ZipFile. zip-file-path)]
        (let [start (promise)
              triples-process (ua/vfuture
                               (try
                                 @start
                                 (process-triples done-signal triples-queue)
                                 (catch Throwable t
                                   (abort t)
                                   (throw t))))
              files-process (ua/vfuture
                             (try
                               @start
                               (process-files app-id done-signal max-concurrency files-queue error abort)
                               (catch Throwable t
                                 (abort t)
                                 (throw t))))
              files-check-process (ua/vfuture
                                   (try
                                     ;; We need to wait for all triples to sync before we check
                                     ;; that all files are present.
                                     @triples-process
                                     (check-files app-id done-signal files-check-queue)
                                     (catch Throwable t
                                       (abort t)
                                       (throw t))))
              zip-process (ua/vfuture
                           (try
                             @start
                             (read-zip-entries! zin app-id done-signal triples-queue files-queue files-check-queue title)
                             (.put triples-queue done-signal)
                             (.put files-queue done-signal)
                             (.put files-check-queue done-signal)
                             (catch Throwable t
                               (abort t)
                               (throw t))))]
          (reset! processes [zip-process triples-process files-process files-check-process])
          (deliver start true)
          @zip-process
          @triples-process
          @files-process
          @files-check-process))
      (update-owner! app-id {:creator-id creator-id
                             :org-id org-id})
      (catch Throwable t
        (compare-and-set! error nil t)
        (run! future-cancel @processes)
        ;; Best-effort cleanup of the partially-restored app; don't let it mask
        ;; the original error (the ephemeral-app sweeper is a backstop).
        (try
          (delete-app-triples! app-id)
          (app-model/delete-immediately-by-id! {:id app-id})
          (catch Throwable cleanup-err
            (tracer/record-exception-span! cleanup-err
                                           {:name "restore/cleanup-failed"
                                            :escaping? false})))
        (throw @error)))
    app-id))
