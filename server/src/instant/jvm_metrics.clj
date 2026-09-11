(ns instant.jvm-metrics
  (:require
   [clojure.set :as set]
   [instant.cloudwatch :as cloudwatch]
   [instant.config :as config]
   [instant.util.aws :as aws-util]
   [instant.util.coll :as ucoll]
   [instant.util.tracer :as tracer])
  (:import
   (com.sun.management GarbageCollectorMXBean GcInfo)
   (java.lang.management ManagementFactory MemoryPoolMXBean MemoryType MemoryUsage)
   (java.time Duration Instant)
   (java.util.concurrent Executors ScheduledExecutorService ThreadFactory TimeUnit)
   (software.amazon.awssdk.core.client.config ClientOverrideConfiguration)
   (software.amazon.awssdk.services.cloudwatch CloudWatchClient)
   (software.amazon.awssdk.services.cloudwatch.model Dimension MetricDatum PutMetricDataRequest StandardUnit)))

(def ^:private g1-collectors
  #{"G1 Young Generation" "G1 Old Generation" "G1 Concurrent GC"})

(defn- after-gc-heap [^java.lang.management.GarbageCollectorMXBean gc heap-pools]
  (when (instance? GarbageCollectorMXBean gc)
    (when-let [^GcInfo info (.getLastGcInfo ^GarbageCollectorMXBean gc)]
      (let [after (.getMemoryUsageAfterGc info)
            usages (mapv #(.get after %) heap-pools)]
        (when (and (seq heap-pools) (every? some? usages))
          {:end-ms (.getEndTime info)
           :heap-used (reduce + (map #(.getUsed ^MemoryUsage %) usages))})))))

(defn snapshot
  "Reads MXBean getters only. Returned values contain no MXBeans or GC objects."
  []
  (let [heap (.getHeapMemoryUsage (ManagementFactory/getMemoryMXBean))
        heap-pools (into #{}
                         (keep (fn [^MemoryPoolMXBean pool]
                                 (when (= MemoryType/HEAP (.getType pool))
                                   (.getName pool))))
                         (ManagementFactory/getMemoryPoolMXBeans))
        collectors (into {}
                         (map (fn [^java.lang.management.GarbageCollectorMXBean gc]
                                [(.getName gc)
                                 {:time-ms (.getCollectionTime gc)
                                  :count (.getCollectionCount gc)
                                  :after-gc (after-gc-heap gc heap-pools)}]))
                         (ManagementFactory/getGarbageCollectorMXBeans))]
    {:heap-used (.getUsed heap)
     :heap-max (.getMax heap)
     :collectors collectors
     :uptime-ms (.getUptime (ManagementFactory/getRuntimeMXBean))
     :monotonic-ns (System/nanoTime)}))

(defn- supported-collectors? [collectors]
  (let [names (set (keys collectors))]
    (and (set/subset? #{"G1 Young Generation" "G1 Old Generation"} names)
         (set/subset? names g1-collectors)
         (every? (fn [{:keys [time-ms count]}]
                   (and (number? time-ms) (not (neg? time-ms))
                        (number? count) (not (neg? count))))
                 (vals collectors)))))

(defn- heap-pressure [{:keys [heap-used heap-max uptime-ms collectors]}]
  (when (and (pos? heap-max) (not (neg? heap-used)))
    (let [latest-gc (last (sort-by :end-ms (keep :after-gc (vals collectors))))
          ;; Quiet heaps may not collect for minutes. Do not indefinitely repeat
          ;; an old low occupancy while allocations fill the heap.
          used (if (and latest-gc
                        (<= 0 (- uptime-ms (:end-ms latest-gc)) 60000)
                        (not (neg? (:heap-used latest-gc))))
                 (:heap-used latest-gc)
                 heap-used)]
      (* 100.0 (/ used heap-max)))))

(defn- gc-pause [previous current]
  (let [elapsed-ms (when previous
                     (/ (- (:monotonic-ns current) (:monotonic-ns previous)) 1e6))]
    (when (and previous
               (supported-collectors? (:collectors previous))
               (= (set (keys (:collectors previous)))
                  (set (keys (:collectors current))))
               (< (:uptime-ms previous) (:uptime-ms current))
               (< 0 elapsed-ms 90000))
      (let [deltas (for [[name {:keys [time-ms count]}] (:collectors current)]
                     {:time-ms (- time-ms (get-in previous [:collectors name :time-ms]))
                      :count (- count (get-in previous [:collectors name :count]))})]
        (when (every? (fn [{:keys [time-ms count]}]
                        (and (not (neg? time-ms)) (not (neg? count))))
                      deltas)
          ;; G1 Concurrent GC accounts for its stop-the-world phases too. The
          ;; counters update at collection boundaries, so one interval can
          ;; include a pause that began before the previous sample.
          (min 100.0 (* 100.0 (/ (reduce + (map :time-ms deltas)) elapsed-ms))))))))

(defn metrics
  "Calculates pressure from consecutive snapshots. Missing or unsupported
   collector data omits pressure metrics so scale-in cannot treat it as zero."
  [previous current]
  (cond-> {"UptimeSeconds" (/ (:uptime-ms current) 1000.0)}
    (supported-collectors? (:collectors current))
    (into (keep (fn [[metric value]] (when (some? value) [metric value]))
                [["HeapPressurePercent" (heap-pressure current)]
                 ["GcPausePercent" (gc-pause previous current)]]))))

(defn record-metrics!
  [^CloudWatchClient client {:keys [asg-name instance-id]} ^Instant recorded-at values]
  (let [dimension (fn [name value]
                    (-> (Dimension/builder) (.name name) (.value value) (.build)))
        asg-dimensions [(dimension "AutoScalingGroupName" asg-name)]
        instance-dimensions (conj asg-dimensions (dimension "InstanceId" instance-id))
        data (for [[name value] values
                   dimensions (if (= name "UptimeSeconds")
                                [instance-dimensions]
                                [instance-dimensions asg-dimensions])]
               (-> (MetricDatum/builder)
                   (.metricName name)
                   (.value (double value))
                   (.unit (if (= name "UptimeSeconds") StandardUnit/SECONDS StandardUnit/PERCENT))
                   (.timestamp recorded-at)
                   (.dimensions (ucoll/array-of Dimension dimensions))
                   (.build)))
        request (-> (PutMetricDataRequest/builder)
                    (.namespace "Instant/JVM")
                    (.metricData (ucoll/array-of MetricDatum data))
                    (.build))]
    (.putMetricData client ^PutMetricDataRequest request)))

(def ^:private api-timeouts
  (-> (ClientOverrideConfiguration/builder)
      (.apiCallTimeout (Duration/ofSeconds 5))
      (.apiCallAttemptTimeout (Duration/ofSeconds 2))
      (.build)))

(defonce ^:private write-client
  (delay (if (config/aws-env?)
           (-> (CloudWatchClient/builder)
               (.overrideConfiguration ^ClientOverrideConfiguration api-timeouts)
               (.build))
           @cloudwatch/write-cloudwatch-client)))

(defonce ^:private target (atom nil))

(defn- metric-target []
  (or @target
      (let [instance-id @config/instance-id
            asg-name (when instance-id
                       (aws-util/get-tag "aws:autoscaling:groupName" instance-id api-timeouts))]
        (when-not (and instance-id (seq asg-name))
          (throw (ex-info "Missing instance ID or Auto Scaling group for JVM metrics" {})))
        (reset! target {:asg-name asg-name :instance-id instance-id}))))

(defonce ^:private executor (atom nil))

(defn stop []
  (when-let [^ScheduledExecutorService pool @executor]
    (.shutdownNow pool)
    (reset! executor nil)))

(defn start []
  (when (config/aws-env?)
    (stop)
    (let [previous (atom nil)
          pool (Executors/newSingleThreadScheduledExecutor
                (reify ThreadFactory
                  (newThread [_ runnable]
                    (doto (Thread. runnable "jvm-cloudwatch-metrics")
                      (.setDaemon true)))))
          publish (fn []
                    (try
                      (let [destination (metric-target)
                            current (snapshot)
                            recorded-at (Instant/now)
                            values (metrics @previous current)]
                        (reset! previous current)
                        (record-metrics! @write-client destination recorded-at values))
                      (catch Throwable t
                        (tracer/record-exception-span! t {:name "jvm-metrics/publish"}))))]
      (reset! executor pool)
      ;; This thread owns polling and bounded network calls. It shares no request
      ;; executor or GC notification thread, and catches failures before retrying.
      (.scheduleWithFixedDelay pool ^Runnable publish 0 30 TimeUnit/SECONDS))))
