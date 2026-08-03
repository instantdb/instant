(ns instant.storage.copier
  (:require
   [honey.sql :as hsql]
   [instant.flags :as flags]
   [instant.config :as config]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.copy :as copy]
   [instant.jdbc.sql :as sql]
   [instant.jdbc.wal :as wal]
   [instant.system-catalog :as system-catalog]
   [instant.storage.s3 :as instant-s3]
   [instant.util.hsql :as uhsql]
   [instant.util.s3 :as s3-util]
   [instant.util.tracer :as tracer])
  (:import
   (java.util.concurrent ArrayBlockingQueue)))

(def batch-size 1000) ;; max number of files to process in one loop

(defn dest-bucket [app-id]
  (flags/copy-file-bucket app-id))

(def claim-files-q (uhsql/preformat {:with [[:to-update
                                             {:select [:id]
                                              :from :app-files-to-copy
                                              :where [:and
                                                      [:= :machine-id nil]
                                                      [:= :error nil]]
                                              :for [:update :skip-locked]
                                              :limit :?limit}]]
                                     :update :app-files-to-copy
                                     :set {:machine-id :?machine-id}
                                     :from :to-update
                                     :where [:= :app-files-to-copy.id :to-update.id]
                                     :returning [:app-files-to-copy.*]}))

(defn claim-files!
  ([params]
   (claim-files! (aurora/conn-pool :write) params))
  ([conn {:keys [limit]}]
   (sql/execute! ::claim-files!
                 conn
                 (uhsql/formatp claim-files-q
                                {:limit limit
                                 :machine-id config/machine-id}))))

(defn delete-files!
  ([params]
   (delete-files! (aurora/conn-pool :write) params))
  ([conn {:keys [ids]}]
   (sql/do-execute! ::delete-files!
                    conn
                    (hsql/format
                     {:delete-from :app-files-to-copy
                      :where [:in :id ids]}))))

(def mark-failed-q (uhsql/preformat
                    {:with [[:updates {:select [[[:unnest :?ids] :id]
                                                [[:unnest :?errors] :error]]}]]
                     :update :app-files-to-copy
                     :set {:error :updates.error}
                     :from [:updates]
                     :where [:= :app-files-to-copy.id :updates.id]}))

(defn mark-failed!
  "Marks each failed file with its error in a single statement. `failures` is a
   seq of {:id :error}."
  ([params]
   (mark-failed! (aurora/conn-pool :write) params))
  ([conn {:keys [failures]}]
   (sql/do-execute!
    ::mark-failed!
    conn
    (uhsql/formatp mark-failed-q
                   {:ids (with-meta (mapv :id failures) {:pgtype "uuid[]"})
                    :errors (with-meta (mapv :error failures) {:pgtype "text[]"})}))))

(defn copy-files!
  "Copies each file to its destination bucket in parallel via the transfer
   manager. Returns {:succeeded [id ...] :failed [{:id id :error msg} ...]}.
   A file whose app has no destination bucket configured is reported as a failure."
  [files]
  (let [transfer-manager (instant-s3/s3-transfer-manager)
        in-flight (mapv (fn [{:keys [id app_id location_id]}]
                          (let [object-key (instant-s3/->object-key app_id location_id)
                                dest (dest-bucket app_id)]
                            (if-not dest
                              {:id id
                               :error (str "No destination bucket configured for app " app_id)}
                              {:id id
                               :copy (s3-util/transfer-manager-copy
                                      transfer-manager
                                      {:source-bucket-name instant-s3/bucket-name
                                       :destination-bucket-name dest
                                       :source-key object-key
                                       :destination-key object-key})})))
                        files)]
    (reduce (fn [acc {:keys [id copy error]}]
              (if error
                (update acc :failed conj {:id id :error error})
                (try
                  @copy
                  (update acc :succeeded conj id)
                  (catch Throwable t
                    (let [cause (or (.getCause t) t)]
                      (update acc :failed conj {:id id
                                                :error (or (.getMessage cause)
                                                           (str cause))}))))))
            {:succeeded [] :failed []}
            in-flight)))

(defn process-copy!
  "Claims a batch of files, copies each to the destination bucket, and removes
   them from the queue. Returns the number of files copied."
  ([params]
   (process-copy! (aurora/conn-pool :write) params))
  ([conn {:keys [limit]}]
   (tracer/with-span! {:name "storage-copier/process-copy!"}
     (let [files (claim-files! conn {:limit limit})]
       (when (seq files)
         (let [{:keys [succeeded failed]} (copy-files! files)]
           (when (seq succeeded)
             (delete-files! conn {:ids succeeded}))
           (when (seq failed)
             (mark-failed! conn {:failures failed}))))
       (count files)))))

(defn clear-copy-queue!
  "Drains the copy queue by processing batches until no more files are
   available. Run manually."
  ([] (clear-copy-queue! {}))
  ([params] (clear-copy-queue! (aurora/conn-pool :write) params))
  ([conn {:keys [limit]
          :or {limit batch-size}}]
   (tracer/with-span! {:name "storage-copier/handle-copy!"}
     (loop [total 0]
       (let [n-copied (process-copy! conn {:limit limit})
             total (+ total (long n-copied))]
         (if (< n-copied limit)
           total
           (recur total)))))))

;; The `value` column is jsonb; decoding it yields the plain location-id string.
(def enqueue-out-columns
  [{:name "app_id" :pgtype "uuid"}
   {:name "location_id" :pgtype "jsonb"}])

(def enqueue-in-columns
  [{:name "app_id" :pgtype "uuid"}
   {:name "location_id" :pgtype "text"}])

(defn enqueue-app-files!
  "Streams every $files location for `app-id` out of the triples table with one
   long-running COPY and enqueues them into `app_files_to_copy`, `write-batch-size`
   rows per COPY (each its own transaction, so we never push one giant insert onto
   the WAL). Returns the number of rows enqueued.

   The COPY OUT (producer) and the batched COPY INs (consumer) run concurrently,
   decoupled by a bounded queue that gives the read side backpressure once it gets
   too far ahead of the write side.

   Throws if the app has no destination bucket configured in the flags."
  ([app-id]
   (enqueue-app-files! app-id 5000))
  ([app-id write-batch-size]
   (assert (uuid? app-id))
   (when-not (dest-bucket app-id)
     (throw (ex-info "No destination bucket configured for app" {:app-id app-id})))
   (when (= instant-s3/bucket-name (dest-bucket app-id))
     (throw (ex-info "Destination bucket is the same as the source bucket"
                     {:app-id app-id :bucket instant-s3/bucket-name})))
   (tracer/with-span! {:name "storage-copier/enqueue-app-files!"
                       :attributes {:app-id app-id
                                    :write-batch-size write-batch-size}}
     (let [^ArrayBlockingQueue queue (ArrayBlockingQueue. (* 10 write-batch-size))
           producer-error (atom nil)
           producer (future
                      (try
                        (with-open [read-conn (wal/get-pg-copy-ready-conn (config/get-aurora-config))]
                          (doseq [row (copy/copy-seq
                                       read-conn
                                       (format "copy (select app_id, value from triples where app_id = '%s' and attr_id = '%s') to stdout with (format binary)"
                                               app-id
                                               system-catalog/location-id-attr-id)
                                       enqueue-out-columns)]
                            (.put queue row)))
                        (.put queue ::done)
                        (catch InterruptedException _ nil)
                        (catch Throwable t
                          (reset! producer-error t)
                          (.put queue ::done))))
           flush! (fn [write-conn batch]
                    (when (seq batch)
                      (copy/copy-in-rows
                       write-conn
                       "copy app_files_to_copy (app_id, location_id) from stdin with (format binary)"
                       enqueue-in-columns
                       batch)))]
       (try
         (with-open [write-conn (wal/get-pg-copy-ready-conn (config/get-aurora-config))]
           (loop [batch []
                  total 0]
             (let [item (.take queue)]
               (if (= ::done item)
                 (do (flush! write-conn batch)
                     (when-let [e @producer-error]
                       (throw e))
                     (+ total (count batch)))
                 (let [batch (conj batch item)]
                   (if (>= (count batch) write-batch-size)
                     (do (flush! write-conn batch)
                         (recur [] (+ total (count batch))))
                     (recur batch total)))))))
         (catch Throwable t
           (future-cancel producer)
           (throw t)))))))
