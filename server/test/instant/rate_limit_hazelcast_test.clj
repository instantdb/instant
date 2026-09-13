(ns instant.rate-limit-hazelcast-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [instant.config :as config]
   [instant.flags :as flags]
   [instant.rate-limit :as rate-limit]
   [instant.reactive.ephemeral :as ephemeral]
   [instant.reactive.store :as rs])
  (:import
   (com.hazelcast.config Config EvictionPolicy MapStoreConfig$InitialLoadMode MaxSizePolicy)
   (com.hazelcast.core Hazelcast HazelcastInstance)
   (com.hazelcast.instance.impl HazelcastInstanceProxy)
   (com.hazelcast.map IMap MapStore)
   (com.hazelcast.map.impl MapService)
   (com.hazelcast.map.impl.mapstore.writebehind WriteBehindStore)
   (io.github.bucket4j Bucket)
   (io.github.bucket4j.grid.hazelcast HazelcastProxyManager)))

(defn- memory-map-store [data]
  (reify MapStore
    (loadAllKeys [_] (keys @data))
    (loadAll [_ ks] (select-keys @data ks))
    (load [_ k] (get @data k))
    (delete [_ k] (swap! data dissoc k) nil)
    (deleteAll [_ ks] (swap! data #(apply dissoc % ks)) nil)
    (store [_ k v] (swap! data assoc k v) nil)
    (storeAll [_ entries] (swap! data into entries) nil)))

(defn- local-settings! [^Config cfg]
  (doseq [[k v] {"hazelcast.phone.home.enabled" "false"
                 "hazelcast.shutdownhook.enabled" "false"
                 "hazelcast.logging.type" "none"
                 "hazelcast.partition.count" "17"
                 "hazelcast.operation.thread.count" "2"
                 "hazelcast.operation.generic.thread.count" "2"
                 "hazelcast.io.input.thread.count" "1"
                 "hazelcast.io.output.thread.count" "1"
                 "hazelcast.event.thread.count" "1"
                 "hazelcast.max.join.seconds" "10"
                 "hazelcast.wait.seconds.before.join" "0"
                 "hazelcast.operation.call.timeout.millis" "10000"
                 "hazelcast.graceful.shutdown.max.wait" "10"}]
    (.setProperty cfg k v))
  (doto (.getInterfaces (.getNetworkConfig cfg))
    (.setEnabled true)
    (.addInterface "127.0.0.1"))
  (.setEnabled (.getMetricsConfig cfg) false)
  cfg)

(defn- local-config [cluster-name members]
  (let [cfg (local-settings! (Config.))
        network (.getNetworkConfig cfg)
        join (.getJoin network)]
    (.setClusterName cfg cluster-name)
    (.setInstanceName cfg (str (random-uuid)))
    (.setPort network 0)
    (.setPortAutoIncrement network false)
    (.setEnabled (.getAutoDetectionConfig join) false)
    (.setEnabled (.getMulticastConfig join) false)
    (doto (.getTcpIpConfig join)
      (.setEnabled true)
      (.setMembers members))
    (HazelcastProxyManager/addCustomSerializers (.getSerializationConfig cfg) 10000)
    cfg))

(defn- with-members [f]
  (let [members (atom [])
        data (atom {})]
    (with-redefs [config/aws-env? (constantly false)
                  config/using-swarm? (constantly false)
                  config/instance-id (delay nil)
                  rate-limit/map-store #(memory-map-store data)
                  flags/magic-code-rate-limit-per-hour (constantly 2)
                  flags/add-flag-listener (fn [& _] (fn []))]
      (try
        (f members data)
        (finally
          (doseq [^HazelcastInstance hz (reverse @members)]
            (when (.isRunning (.getLifecycleService hz))
              (.shutdown hz))))))))

(defn- start-member! [members ^Config cfg]
  (let [hz (Hazelcast/newHazelcastInstance cfg)]
    (swap! members conj hz)
    hz))

(defn- await-cluster [^HazelcastInstance hz member-count]
  (let [deadline (+ (System/nanoTime) (* 30 1000000000))]
    (loop []
      (when-not (and (= member-count (count (.getMembers (.getCluster hz))))
                     (.isClusterSafe (.getPartitionService hz)))
        (when (> (System/nanoTime) deadline)
          (throw (ex-info "Timed out waiting for Hazelcast partitions" {:members member-count})))
        (Thread/sleep 50)
        (recur)))))

(defn- existing-map-data-store [^HazelcastInstanceProxy hz k]
  (let [partition-id (.getPartitionId (.getPartition (.getPartitionService hz) k))
        ^MapService service (.. hz getOriginal -node getNodeEngine
                                (getServiceOrNull MapService/SERVICE_NAME))]
    (some-> (.getMapServiceContext service)
            (.getPartitionContainer partition-id)
            (.getExistingRecordStore "bucket4j-2")
            (.getMapDataStore))))

(defn- bucket ^Bucket [rate-limit k]
  ((:get-bucket rate-limit) k))

(deftest init-hz-configures-map-before-starting-member
  (with-members
    (fn [members data]
      (let [configure rate-limit/configure-hazelcast!
            initialize rate-limit/initialize
            configure-calls (atom 0)
            initialized? (atom false)
            instance-name (str (random-uuid))
            k (random-uuid)]
        (with-redefs-fn
          {#'ephemeral/add-member-listener (fn [_])
           #'rate-limit/configure-hazelcast!
           (fn [^Config cfg]
             (swap! configure-calls inc)
             (is (nil? (Hazelcast/getHazelcastInstanceByName (.getInstanceName cfg)))
                 "Map configuration must precede member startup, not just initialize")
             (local-settings! (configure cfg)))
           #'rate-limit/initialize
           (fn [^HazelcastInstance hz]
             (swap! members conj hz)
             (reset! initialized? true)
             (let [map-config (.getMapConfig (.getConfig hz) "bucket4j-2")
                   store-config (.getMapStoreConfig map-config)
                   eviction-config (.getEvictionConfig map-config)
                   ^IMap m (.getMap hz "bucket4j-2")]
               (is (= [true true 10 1000 true MapStoreConfig$InitialLoadMode/LAZY 3600]
                      [(.isEnabled store-config) (.isOffload store-config)
                       (.getWriteDelaySeconds store-config) (.getWriteBatchSize store-config)
                       (.isWriteCoalescing store-config) (.getInitialLoadMode store-config)
                       (.getMaxIdleSeconds map-config)]))
               (is (= [EvictionPolicy/LRU MaxSizePolicy/PER_NODE 500000]
                      [(.getEvictionPolicy eviction-config) (.getMaxSizePolicy eviction-config)
                       (.getSize eviction-config)]))
               (.put m k (byte-array [1 2 3]))
               (is (instance? WriteBehindStore (existing-map-data-store hz k)))
               (.flush m)
               (is (= [1 2 3] (vec (get @data k)))))
             (initialize hz))}
          (fn []
            (try
              (let [state (ephemeral/init-hz :test (rs/init)
                                             {:instance-name instance-name
                                              :cluster-name (str (random-uuid))})]
                ((get-in state [:rate-limit :shutdown]))
                (is @initialized?)
                (is (= 1 @configure-calls)))
              (finally
                ;; Also clean up if init-hz failed before initialize registered the member.
                (when-let [hz (Hazelcast/getHazelcastInstanceByName instance-name)]
                  (when-not (some #(identical? hz %) @members)
                    (swap! members conj hz)))))))))))

(deftest late-map-configuration-leaves-existing-record-store-unconfigured
  (with-members
    (fn [members data]
      (let [hz (start-member! members (local-config (str (random-uuid)) []))
            limiter (rate-limit/initialize hz)
            ^IMap m (:bucket-map limiter)
            k (random-uuid)]
        (is (.tryConsume (bucket limiter k) 1))
        ;; Reproduce the old startup ordering after a partition already exists.
        (rate-limit/configure-hazelcast! (.getConfig hz))
        (is (.isEnabled (.getMapStoreConfig (.getMapConfig (.getConfig hz) "bucket4j-2"))))
        (is (= "EmptyMapDataStore" (.getSimpleName (class (existing-map-data-store hz k)))))
        (.flush m)
        (is (empty? @data) "Updating MapConfig did not install persistence on the existing store")
        (is (.evict m k))
        (is (.tryConsume (bucket limiter k) 2) "Without persistence, eviction resets the consumed token")
        ((:shutdown limiter))))))

(deftest configured-members-preserve-buckets-through-migration-and-reload
  (with-members
    (fn [members data]
      (let [cluster-name (str (random-uuid))
            a (start-member! members (rate-limit/configure-hazelcast! (local-config cluster-name [])))
            limiter-a (rate-limit/initialize a)
            ;; Cover every partition so at least one populated partition must move.
            ks (vals (reduce (fn [by-partition k]
                               (let [partition (.getPartitionId (.getPartition (.getPartitionService a) k))]
                                 (assoc by-partition partition k)))
                             {}
                             (repeatedly 1000 random-uuid)))]
        (is (= 17 (count ks)))
        (doseq [k ks]
          (is (.tryConsume (bucket limiter-a k) 1)))
        (let [address (.getAddress (.getLocalMember (.getCluster a)))
              b (start-member! members
                               (rate-limit/configure-hazelcast!
                                (local-config cluster-name [(str "127.0.0.1:" (.getPort address))])))]
          (await-cluster a 2)
          (await-cluster b 2)
          (let [member-b (.getLocalMember (.getCluster b))
                k (first (filter #(= member-b (.getOwner (.getPartition (.getPartitionService a) %))) ks))
                _ (is (some? k) "A populated partition migrated to the joining member")
                _ (is (instance? WriteBehindStore (existing-map-data-store b k))
                      "The joining member received a configured record store before initialize")
                limiter-b (rate-limit/initialize b)
                ^IMap m (:bucket-map limiter-b)]
            (testing "both members enforce the same remaining token count"
              (is (= 1 (.getAvailableTokens (bucket limiter-b k))))
              (is (.tryConsume (bucket limiter-b k) 1))
              (is (false? (.tryConsume (bucket limiter-a k) 1))))
            (testing "write-behind persistence and reload preserve consumed tokens"
              (.flush m)
              (is (contains? @data k))
              (is (.evict m k))
              (is (= 0 (.getAvailableTokens (bucket limiter-a k)))))
            (testing "departing owner transfers the same bucket back to the remaining member"
              ((:shutdown limiter-b))
              (.shutdown b)
              (await-cluster a 1)
              (is (instance? WriteBehindStore (existing-map-data-store a k)))
              (is (false? (.tryConsume (bucket limiter-a k) 1))))
            ((:shutdown limiter-a))))))))
