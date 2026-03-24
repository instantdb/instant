(ns instant.rate-limit
  (:require
   [instant.flags :as flags]
   [instant.util.defrecord :refer [defrecord-once]]
   [instant.util.tracer :as tracer]
   [instant.util.uuid :as uuid-util])
  (:import
   (com.hazelcast.config EvictionConfig EvictionPolicy MaxSizePolicy)
   (com.hazelcast.core HazelcastInstance)
   (io.github.bucket4j Bandwidth Bucket BucketConfiguration)
   (io.github.bucket4j.grid.hazelcast Bucket4jHazelcast)
   (java.security MessageDigest)
   (java.time Duration)))

;; Bucket4j docs: https://bucket4j.com/8.17.0/toc.html

(defrecord-once CreateMagicCodeKey [^bytes key-bytes])

(defrecord-once ConsumeMagicCodeKey [^bytes key-bytes])

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
        bucket-map (.getMap hz "bucket4j")
        eviction-config (.. (EvictionConfig.)
                            (setEvictionPolicy EvictionPolicy/LRU)
                            (setMaxSizePolicy MaxSizePolicy/PER_NODE)
                            (setSize 500000))
        map-config (.getMapConfig (.getConfig hz) map-name)
        _ (doto map-config
            (.setEvictionConfig eviction-config)
            (.setMaxIdleSeconds (* 60 60))) ;; one hour
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
                   (.getProxy manager key bucket-config-fn))}))

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
