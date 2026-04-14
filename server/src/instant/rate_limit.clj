(ns instant.rate-limit
  (:require
   [chime.core :as chime]
   [instant.flags :as flags]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.util.defrecord :refer [defrecord-once]]
   [instant.util.exception :as ex]
   [instant.util.hsql :as uhsql]
   [instant.util.tracer :as tracer]
   [instant.util.uuid :as uuid-util]
   [taoensso.nippy :as nippy])
  (:import
   (com.hazelcast.config EvictionConfig EvictionPolicy MapStoreConfig MapStoreConfig$InitialLoadMode MaxSizePolicy)
   (com.hazelcast.core HazelcastInstance)
   (com.hazelcast.map MapStore)
   (io.github.bucket4j Bandwidth Bucket BucketConfiguration)
   (io.github.bucket4j.grid.hazelcast Bucket4jHazelcast)
   (java.lang AutoCloseable)
   (java.security MessageDigest)
   (java.time Duration Instant)
   (org.postgresql.util PGInterval)))

;; Bucket4j docs: https://bucket4j.com/8.17.0/toc.html

;; TODO(dww); Remove once backend is fully deployed
(defrecord-once CreateMagicCodeKey [^bytes key-bytes])

(defrecord-once ConsumeMagicCodeKey [^bytes key-bytes])

(defn create-rate-limit-config [capacity]
  (.. (BucketConfiguration/builder)
      (addLimit (.. (Bandwidth/builder)
                    (capacity capacity)
                    (refillIntervally capacity (Duration/ofHours 1))
                    (build)))
      (build)))

;; https://docs.hazelcast.com/hazelcast/5.6/mapstore/implement-a-mapstore
;; Backs the hazelcast map with postgres. If the hazelcast map is missing a key,
;; it will check postgres for the key. It will also push the values to postgres
;; in batches after a short delay. This lets our map grow much larger than memory,
;; but keeps the most recent values cached in hazelcast.
;; We could also delegate to an s3 directory bucket if this puts too much pressure
;; on the database.
(defn map-store []
  (reify MapStore
    (loadAllKeys [_]
      (->>
       (sql/select-arrays ::loadAllKeys
                          (aurora/conn-pool :read)
                          ["select key from rate_limit_keys order by updated_at desc limit 1000"])
       (rest) ;; remove header
       (map first)))
    (loadAll [_ ks]
      (->>
       (sql/select-arrays ::loadAll
                          (aurora/conn-pool :read)
                          ["select key, value from rate_limit_keys where key = ANY(?::bytea[])"
                           (with-meta (vec ks) {:pgtype "bytea[]"})])
       (rest) ;; remove header
       (into {})))
    (load [_ k]
      (-> (sql/select-arrays ::load
                             (aurora/conn-pool :read)
                             ["select value from rate_limit_keys where key = ?" k])
          second ;; remove header row
          first))
    (delete [_ k]
      (sql/do-execute! ::delete
                       (aurora/conn-pool :write)
                       ["delete from rate_limit_keys where key = ?" k]))
    (deleteAll [_ ks]
      (sql/do-execute! ::deleteAll
                       (aurora/conn-pool :write)
                       ["delete from rate_limit_keys where key = ANY(?)"
                        (with-meta (vec ks) {:pgtype "bytea[]"})]))
    (store [_ k v]
      (sql/do-execute! ::store
                       (aurora/conn-pool :write)
                       ["insert into rate_limit_keys (key, value) values (?, ?) on conflict (key) do update set value = excluded.value"
                        k v]))
    (storeAll [_ m]
      (sql/do-execute! ::store
                       (aurora/conn-pool :write)
                       ["insert into rate_limit_keys (key, value) values (unnest(?::bytea[]), unnest(?::bytea[])) on conflict (key) do update set value = excluded.value"
                        (with-meta (keys m) {:pgtype "bytea[]"})
                        (with-meta (vals m) {:pgtype "bytea[]"})]))))

(defn initialize
  "Sets up bucket4j to use hazelcast.
   Returns a map with a `get-bucket` function. For each unique key,
   get-bucket will return a bucket4j bucket that can be used to rate-limit
   by calling .tryConsume on it."
  [^HazelcastInstance hz]
  (let [map-name "bucket4j"
        eviction-config (.. (EvictionConfig.)
                            (setEvictionPolicy EvictionPolicy/LRU)
                            (setMaxSizePolicy MaxSizePolicy/PER_NODE)
                            (setSize 500000))
        map-store-config (doto (MapStoreConfig.)
                           (.setEnabled true)
                           (.setImplementation (map-store))
                           ;; Handle operations async
                           (.setOffload true)
                           ;; Batch writes
                           (.setWriteDelaySeconds 10)
                           (.setWriteBatchSize 1000)
                           ;; Only send the last write
                           (.setWriteCoalescing true)
                           (.setInitialLoadMode MapStoreConfig$InitialLoadMode/LAZY))

        map-config (.getMapConfig (.getConfig hz) map-name)
        _ (doto map-config
            (.setEvictionConfig eviction-config)
            (.setMaxIdleSeconds (* 60 60)) ;; one hour
            (.setMapStoreConfig map-store-config))
        bucket-map (.getMap hz "bucket4j")
        manager (.. (Bucket4jHazelcast/entryProcessorBasedBuilder bucket-map)
                    (build))
        capacity (flags/magic-code-rate-limit-per-hour)
        bucket-config (atom (create-rate-limit-config capacity))
        ;; This gets called each time a new bucket is created
        ;; (i.e. you ask for the rate limit on a new key)
        bucket-config-fn (fn [] @bucket-config)
        ;; Updates the bucket config when the flag changes
        ;; Will only affect buckets for new keys
        clear-watch (flags/add-flag-listener
                     :magic-code-rate-limit-per-hour
                     (fn [_key old-value new-value]
                       (tracer/with-span! {:name "rate-limit/change-magic-code-rate-limit-per-hour"
                                           :attributes {:old-value old-value
                                                        :new-value new-value}}
                         (let [new-config (create-rate-limit-config new-value)]
                           (reset! bucket-config new-config)))))]
    {:shutdown (fn []
                 (clear-watch))
     :manager manager
     :bucket-map bucket-map
     :get-bucket (fn [key]
                   (.getProxy manager key bucket-config-fn))
     :get-bucket-with-config (fn [key config-fn]
                               (.getProxy manager key config-fn))}))

(defn magic-code-key-hash ^bytes [^String type app-id ^String email]
  (let [digest (MessageDigest/getInstance "SHA-256")]
    (.update digest (.getBytes type "UTF-8"))
    (.update digest (uuid-util/->bytes app-id))
    (.update digest (.getBytes email "UTF-8"))
    (.digest digest)))

(defn try-consume-create-magic-code
  "Takes (hz/rate-limit) and app-id + email, will return false if the rate-limit is exceeded.
   Otherwise, will return true and increment the bucket counter."
  [{:keys [get-bucket]} {:keys [app-id email]}]
  (let [key (magic-code-key-hash "create" app-id email)
        ^Bucket bucket (get-bucket key)]
    (.tryConsume bucket 1)))

(defn try-consume-consume-magic-code
  "Takes (hz/rate-limit) and app-id + email, will return false if the rate-limit is exceeded.
   Otherwise, will return true and increment the bucket counter."
  [{:keys [get-bucket]} {:keys [app-id email]}]
  (let [key (magic-code-key-hash "consume" app-id email)
        ^Bucket bucket (get-bucket key)]
    (.tryConsume bucket 1)))

(defn parse-duration ^Duration [^String s]
  (let [i (PGInterval. s)]
    (-> Duration/ZERO
        (.plusDays (+ (* (.getYears i) 365)
                      (* (.getMonths i) 30)
                      (.getDays i)))
        (.plusHours (.getHours i))
        (.plusMinutes (.getMinutes i))
        (.plusSeconds (long (.getSeconds i))))))

(defn rules-rate-limit-config->bucket-config [config]
  (let [^long capacity (ex/get-param! config ["capacity"] (fn [c]
                                                            (when (pos-int? c)
                                                              c)))

        config-with-defaults (merge-with merge
                                         {"refill" {"period" "1 hour"
                                                    "type" "greedy"
                                                    "amount" capacity}}
                                         config)

        ^long refill-amount (ex/get-param! config-with-defaults
                                           ["refill" "amount"]
                                           (fn [c]
                                             (when (pos-int? c)
                                               c)))

        ^String refill-type (ex/get-param! config-with-defaults
                                           ["refill" "type"]
                                           (fn [v]
                                             (when (or (= "interval" v)
                                                       (= "greedy" v))
                                               v)))

        ^Duration refill-period (ex/get-param! config-with-defaults
                                               ["refill" "period"]
                                               (fn [v]
                                                 (try
                                                   (parse-duration v)
                                                   (catch Exception _
                                                     nil))))

        _ (when-not (pos? (/ (.toMillis refill-period)
                             1000))
            (ex/throw-validation-err! :refill config [{:message "The refill period must be longer than a second."}]))

        _ (when (> (.toHours refill-period)
                   24)
            (ex/throw-validation-err! :refill config [{:message "The refill period can't be longer than a day."}]))

        capacity-builder (.. (Bandwidth/builder)
                             (capacity capacity))
        limit (case refill-type
                "greedy" (.. capacity-builder
                             (refillGreedy refill-amount refill-period)
                             (build))
                "interval" (.. capacity-builder
                               (refillIntervally refill-amount refill-period)
                               (build)))]
    (.. (BucketConfiguration/builder)
        (addLimit limit)
        (build))))

(defn make-bucket-config-fn [config]
  (fn []
    (rules-rate-limit-config->bucket-config config)))

(defn user-key-hash
  ^bytes [app-id ^String bucket-name config bucket-key]
  (let [digest (MessageDigest/getInstance "SHA-256")]
    (.update digest (.getBytes "user" "UTF-8"))
    (.update digest (uuid-util/->bytes app-id))
    (.update digest (.getBytes bucket-name "UTF-8"))
    ;; Include the config in the key so that the rate limits
    ;; reset if the config changes. There is a way to replace
    ;; the config for every bucket, but it's not cheap or easy
    (.update digest (nippy/fast-freeze config))
    (.update digest (nippy/fast-freeze bucket-key))
    (.digest digest)))

(defn try-consume-user-rate-limit
  [{:keys [get-bucket-with-config]}
   {:keys [app-id config tokens
           bucket-key bucket-name]
    :or {tokens 1}}]
  (let [key (user-key-hash app-id bucket-name config bucket-key)
        ^Bucket bucket (get-bucket-with-config key (make-bucket-config-fn config))]
    (.tryConsume bucket tokens)))

(defn consume-user-rate-limit
  [{:keys [get-bucket-with-config]}
   {:keys [app-id config tokens
           bucket-key bucket-name]
    :or {tokens 1}}]
  (let [key (user-key-hash app-id bucket-name config bucket-key)
        ^Bucket bucket (get-bucket-with-config key (make-bucket-config-fn config))
        remaining (.tryConsumeAndReturnRemaining bucket tokens)]
    (if (.isConsumed remaining)
      true
      (throw (ex/throw-permission-rate-limited! (.plusNanos (Instant/now)
                                                            (.getNanosToWaitForRefill remaining)))))))

(defonce schedule (atom nil))

(def sweep-q (uhsql/formatp
              (uhsql/preformat {:with [[:keys {:select :key
                                               :from :rate-limit-keys
                                               :for [:update :skip-locked]
                                               :where [:< :updated-at [:- :%now [:interval [:inline "2 days"]]]]
                                               :limit [:inline 10000]}]]
                                :delete-from :rate-limit-keys
                                :where [:in :key {:select :key :from :keys}]})
              {}))

(defn handle-sweep! [{:keys [max-loops]}]
  (when-not (flags/failing-over?)
    (tracer/with-span! {:name "rate-limit/handle-sweep!"}
      (loop [current-loop 1]
        (if (> current-loop max-loops)
          (tracer/with-new-trace-root
            (tracer/record-exception-span! (Exception. "Too many rate limit sweep loops")
                                           {:name "rate-limit/too-many-loops"
                                            :attributes {:max-loops max-loops}}))
          (let [updated (-> (sql/do-execute! ::handle-sweep!
                                             (aurora/conn-pool :write)
                                             sweep-q)
                            first
                            :next.jdbc/update-count)]
            (when (pos? updated)
              (recur (inc current-loop)))))))))

(defn start []
  (swap! schedule (fn [curr-schedule]
                    (if curr-schedule
                      curr-schedule
                      (chime/chime-at
                       (chime/periodic-seq
                        (Instant/now)
                        (Duration/ofMinutes 60))
                       (fn [_time]
                         (handle-sweep! {:max-loops 100})))))))

(defn stop []
  (when-let [curr-schedule @schedule]
    (.close ^AutoCloseable curr-schedule)
    (reset! schedule nil)))

(defn restart []
  (stop)
  (start))

(defn before-ns-unload []
  (stop))

(defn after-ns-reload []
  (start))
