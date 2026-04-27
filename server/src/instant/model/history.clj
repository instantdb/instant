(ns instant.model.history
  (:require
   [chime.core :as chime-core]
   [instant.config :as config]
   [instant.flags :as flags]
   [instant.grpc]
   [instant.isn :as isn]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.storage.s3 :refer [s3-async-client]]
   [instant.util.async :as ua]
   [instant.util.date :as date-util]
   [instant.util.hsql :as uhsql]
   [instant.util.lang :as lang]
   [instant.util.s3 :refer [upload-body-to-s3]]
   [instant.util.tracer :as tracer]
   [taoensso.nippy :as nippy]
   [honey.sql :as hsql])
  (:import
   (software.amazon.awssdk.core.async AsyncRequestBody)
   (com.github.luben.zstd Zstd)
   (instant.grpc WalRecord)
   (instant.isn ISN)
   (java.time Instant Period ZonedDateTime)
   (java.util UUID)
   (net.openhft.hashing LongHashFunction)
   (org.postgresql.replication LogSequenceNumber)))

(defn store-to-s3? []
  (and config/s3-wal-history-bucket-name
       (not (flags/toggled? :store-history-in-db))))

(defn s3-key
  "Creates an s3 key that is sortable by isn (for a given app id).
   We convert the slot num and lsn to fixed-length hex strings that will
   sort the same way as numbers."
  [{:keys [^UUID app-id ^ISN isn]}]
  (str (when config/wal-history-prefix
         (str config/wal-history-prefix "/"))
       (format "%s/%08x/%016x" app-id (.slotNum isn) (.asLong ^LogSequenceNumber (.lsn isn)))))

(defn attr-id-of-triple-change [triple-change]
  (reduce (fn [_acc col]
            (when (= "attr_id" (:name col))
              (reduced (parse-uuid (:value col)))))
          nil
          (concat (:identity triple-change)
                  (:columns triple-change))))

(defn bloom-bit [^UUID uuid]
  (let [h (LongHashFunction/xx3 (.getMostSignificantBits uuid))
        v (.hashLong h (.getLeastSignificantBits uuid))]
    (bit-shift-left 1 (mod v 64))))

(defn topic-filter-of-wal-record
  "Right now we're just interested in invalidating create/update/delete webhooks,
   so we only need to store the attr ids (really only the id attrs, but we don't
   want to look those up, and we're also interested in our false-positive rate)."
  [^WalRecord wal-record]
  (reduce (fn [acc triple-change]
            (bit-or acc (bloom-bit (attr-id-of-triple-change triple-change))))
          0
          (:triple-changes wal-record)))

(defn partition-bucket-of-wal-record
  "Extract the partition from the tx-created-at. Each bucket spans 30 days, with
   13 total buckets. That allows us to store up to 1 year of history."
  [^WalRecord wal-record]
  (-> ^Instant (:tx-created-at wal-record)
      (.getEpochSecond)
      (quot 86400) ; 1 day
      (quot 30)
      (mod 13)
      int))

(def push-q (uhsql/preformat {:insert-into :history
                              :values [{:isn :?isn
                                        :app-id :?app-id
                                        :topics :?topics
                                        :storage [:cast :?storage :history_storage]
                                        :content :?content
                                        :partition-bucket :?partition-bucket}]
                              :on-conflict [:isn :partition-bucket]
                              :do-nothing true}))

(defn pack-wal-record
  "byte-encodes the wal record with nippy and compresses it with zstd."
  ^bytes [^WalRecord wal-record]
  (if-let [packed (:packed (meta wal-record))]
    packed
    (Zstd/compress (nippy/fast-freeze wal-record))))

(defn unpack-wal-record ^WalRecord [^bytes ba]
  (-> ba
      (Zstd/decompress)
      (nippy/fast-thaw)))

(defn upload-to-s3
  "Uploads the wal-record to s3, trying 3 times by default."
  ([^WalRecord wal-record]
   (upload-to-s3 1 3 wal-record))
  ([attempt max-attempts ^WalRecord wal-record]
   (let [ba (pack-wal-record wal-record)]
     (try (upload-body-to-s3 (s3-async-client)
                             config/s3-wal-history-bucket-name
                             {:object-key (s3-key wal-record)
                              :content-length (long (alength ba))
                              :content-type "application/octet-stream"}
                             (AsyncRequestBody/fromBytesUnsafe ba))
          (catch Throwable t
            (if (>= attempt max-attempts)
              (throw t)
              (do
                (tracer/record-exception-span! t {:name "history/upload-to-s3-failure"
                                                  :attributes {:attempt attempt
                                                               :max-attempts max-attempts}})
                (upload-to-s3 (inc attempt) max-attempts wal-record))))))))

(defn push!
  "Saves a single wal record in the history table, pushing the content to s3 (or
   the database if s3 is disabled)."
  ([wal-record] (push! (aurora/conn-pool :write) wal-record))
  ([conn wal-record]
   (let [topic-filter (topic-filter-of-wal-record wal-record)
         storage (if (store-to-s3?) "s3" "pg")]
     (when (= storage "s3")
       (upload-to-s3 wal-record))
     (sql/do-execute! ::push!
                      conn
                      (uhsql/formatp push-q
                                     {:isn (:isn wal-record)
                                      :app-id (:app-id wal-record)
                                      :topics topic-filter
                                      :storage storage
                                      :content (when (= storage "pg")
                                                 (pack-wal-record wal-record))
                                      :partition-bucket (partition-bucket-of-wal-record wal-record)})))))

(defn upload-batch-to-s3!
  "Uploads a batch of wal records to s3 simultaneously, trying 3 times for each.
   Returns {:status :ok|:error, :wal-record wal-record}[]"
  [wal-records]
  (->> wal-records
       (mapv (fn [wal-record]
               (ua/vfuture (try
                             (upload-to-s3 wal-record)
                             {:status :ok
                              :wal-record wal-record}
                             (catch Exception e
                               (tracer/record-exception-span! e {:name "history/upload-batch-to-s3-failure"})
                               {:status :error
                                :wal-record wal-record})))))
       (mapv deref)))

(defn collect-push-batch-params [upload-results]
  (loop [isns (transient [])
         app-ids (transient [])
         topics (transient [])
         storage (transient [])
         content (transient [])
         partition-bucket (transient [])
         upload-results upload-results]
    (if-let [{:keys [status wal-record]} (first upload-results)]
      (recur (conj! isns (:isn wal-record))
             (conj! app-ids (:app-id wal-record))
             (conj! topics (topic-filter-of-wal-record wal-record))
             (conj! storage (case status
                              :ok "s3"
                              :error "pg"))
             (conj! content (case status
                              :ok nil
                              :error (pack-wal-record wal-record)))
             (conj! partition-bucket (partition-bucket-of-wal-record wal-record))
             (rest upload-results))

      {:isn (with-meta (persistent! isns) {:pgtype "isn[]"})
       :app-id (with-meta (persistent! app-ids) {:pgtype "uuid[]"})
       :topics (with-meta (persistent! topics) {:pgtype "bigint[]"})
       :storage (with-meta (persistent! storage) {:pgtype "history_storage[]"})
       :content (with-meta (persistent! content) {:pgtype "bytea[]"})
       :partition-bucket (with-meta (persistent! partition-bucket) {:pgtype "int[]"})})))

(def push-batch-q
  (uhsql/preformat
   {:insert-into [[:history [:isn :app-id :topics :storage :content :partition-bucket]]
                  {:select [[[:cast [:composite :slot-num :lsn] :isn]]
                            :app-id :topics :storage :content :partition-bucket]
                   :from [[[:unnest :?isn :?app-id :?topics :?storage :?content :?partition-bucket]
                           [:t [:composite :slot-num :lsn :app-id :topics :storage :content :partition-bucket]]]]}]
    :on-conflict [:isn :partition-bucket]
    :do-nothing true}))

(defn push-batch!
  "Saves a batch of wal records in the history table, pushing the content to s3 (or
   the database if s3 is disabled)."
  ([wal-records] (push-batch! (aurora/conn-pool :write) wal-records))
  ([conn wal-records]
   (let [upload-results (if (store-to-s3?)
                          (upload-batch-to-s3! wal-records)
                          ;; If we don't have a bucket to upload to, pretend
                          ;; the upload failed and we'll store in the db.
                          (mapv (fn [wal-record]
                                  {:status :error
                                   :wal-record wal-record})
                                wal-records))
         params (collect-push-batch-params upload-results)]
     (sql/do-execute! ::push-batch!
                      conn
                      (uhsql/formatp push-batch-q params)))))

(defn partitions-to-truncate
  "Calculates which partitions to truncate. Each bucket spans 30 days, with 13 buckets cycling.
   The bucket formula is (days-since-epoch / 30) % 13.
   To save at least 90 days, we keep the current bucket and the 3 previous buckets.
   The kept buckets are at offsets 0, -1 (≡ +12), -2 (≡ +11), -3 (≡ +10) mod 13,
   which covers 90 to 120 days.
   We truncate the complement: buckets (current + 1) through (current + 9) mod 13."
  [^Instant now]
  (let [current-bucket (-> now
                           (.getEpochSecond)
                           (quot 86400) ; 1 day
                           (quot 30)
                           (mod 13))]
    (for [offset (range 1 10)]
      (mod (+ current-bucket offset) 13))))

(defn truncate-old-partitions!
  "Truncates old history partitions."
  ([] (truncate-old-partitions! (aurora/conn-pool :write)))
  ([conn]
   (tracer/with-span! {:name "history/truncate-old-partitions!"}
     (let [to-truncate (partitions-to-truncate (Instant/now))]
       (doseq [bucket-idx to-truncate]
         (let [table-name (keyword (str "history_" bucket-idx))]
           (sql/do-execute! ::truncate-old-partitions!
                            conn
                            (hsql/format {:truncate table-name}))))))))

(defn period []
  (let [now (date-util/pt-now)
        run-time (-> now
                     (.withHour 16) ; Run at 4 PM PT
                     (.withMinute 0)
                     (.withSecond 0)
                     (.withNano 0))
        periodic-seq (chime-core/periodic-seq
                      run-time
                      (Period/ofDays 1))]
    (->> periodic-seq
         (filter (fn [x] (ZonedDateTime/.isAfter x now))))))

(declare schedule)

(defn start []
  (tracer/record-info! {:name "history-truncator/start"})
  (def schedule
    (chime-core/chime-at (period) (fn [_time]
                                    (when-not (flags/failing-over?)
                                      (truncate-old-partitions!))))))

(defn stop []
  (tracer/record-info! {:name "history-truncator/stop"})
  (when (bound? #'schedule)
    (lang/close schedule)))

(defn restart []
  (stop)
  (start))
