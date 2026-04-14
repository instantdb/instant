(ns instant.rate-limit
  (:require
   [instant.flags :as flags]
   [instant.util.defrecord :refer [defrecord-once]]
   [instant.util.exception :as ex]
   [instant.util.tracer :as tracer]
   [instant.util.uuid :as uuid-util]
   [taoensso.nippy :as nippy])
  (:import
   (com.hazelcast.config EvictionConfig EvictionPolicy MaxSizePolicy)
   (com.hazelcast.core HazelcastInstance)
   (io.github.bucket4j Bandwidth Bucket BucketConfiguration)
   (io.github.bucket4j.grid.hazelcast Bucket4jHazelcast)
   (java.security MessageDigest)
   (java.time Duration)
   (org.postgresql.util PGInterval)))

;; Bucket4j docs: https://bucket4j.com/8.17.0/toc.html

(defrecord-once CreateMagicCodeKey [^bytes key-bytes])

(defrecord-once ConsumeMagicCodeKey [^bytes key-bytes])

(defrecord-once UserKey [^bytes key-bytes])

(defn create-rate-limit-config [capacity]
  (.. (BucketConfiguration/builder)
      (addLimit (.. (Bandwidth/builder)
                    (capacity capacity)
                    (refillIntervally capacity (Duration/ofHours 1))
                    (build)))
      (build)))

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
        map-config (.getMapConfig (.getConfig hz) map-name)
        _ (doto map-config
            (.setEvictionConfig eviction-config)
            (.setMaxIdleSeconds (* 60 60))) ;; one hour
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

(defn magic-code-key-hash ^bytes [app-id ^String email]
  (let [digest (MessageDigest/getInstance "SHA-256")]
    (.update digest (uuid-util/->bytes app-id))
    (.update digest (.getBytes email "UTF-8"))
    (.digest digest)))

(defn try-consume-create-magic-code
  "Takes (hz/rate-limit) and app-id + email, will return false if the rate-limit is exceeded.
   Otherwise, will return true and increment the bucket counter."
  [{:keys [get-bucket]} {:keys [app-id email]}]
  (let [key (CreateMagicCodeKey. (magic-code-key-hash app-id email))
        ^Bucket bucket (get-bucket key)]
    (.tryConsume bucket 1)))

(defn try-consume-consume-magic-code
  "Takes (hz/rate-limit) and app-id + email, will return false if the rate-limit is exceeded.
   Otherwise, will return true and increment the bucket counter."
  [{:keys [get-bucket]} {:keys [app-id email]}]
  (let [key (ConsumeMagicCodeKey. (magic-code-key-hash app-id email))
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
    (.update digest (uuid-util/->bytes app-id))
    (.update digest (.getBytes bucket-name "UTF-8"))
    ;; Include the config in the key so that the rate limits
    ;; reset if the config changes. There is a way to replace
    ;; the config for every bucket, but it's not cheap or easy
    (.update digest (nippy/fast-freeze config))
    (.update digest (nippy/fast-freeze bucket-key))
    (.digest digest)))

(defn try-consume-user-rate-limit
  [{:keys [get-bucket-with-config]} {:keys [app-id bucket-name bucket-key config]}]
  (let [key (ConsumeMagicCodeKey. (user-key-hash app-id bucket-name config bucket-key))
        ^Bucket bucket (get-bucket-with-config key (make-bucket-config-fn config))]
    (tool/inspect (.isConsumed (.tryConsumeAndReturnRemaining bucket 1)))))
