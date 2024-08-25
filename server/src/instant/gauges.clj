(ns instant.gauges
  "Repeatedly saves metric information in `tracer/last-calculated-metrics`."
  (:require
   [clojure.string :as str]
   [instant.util.tracer :as tracer]
   [instant.util.delay :as delay])
  (:import
   (java.lang.management ManagementFactory GarbageCollectorMXBean)))

(defonce gauge-metric-fns (atom {}))

(defn add-gauge-metrics-fn
  "Takes a function of no args that should return a list of maps with
  `path` and `value`. Will run every second and be appended to gauges."
  [f]
  (let [id (random-uuid)]
    (swap! gauge-metric-fns assoc id f)
    (fn []
      (swap! gauge-metric-fns dissoc id))))

(defn gauges []
  (let [memory (ManagementFactory/getMemoryMXBean)
        gcs (ManagementFactory/getGarbageCollectorMXBeans)
        thread (ManagementFactory/getThreadMXBean)
        solo-executor clojure.lang.Agent/soloExecutor
        pooled-executor clojure.lang.Agent/pooledExecutor
        metrics (flatten
                 [{:path "jvm.gauges.calculated.ms"
                   :value (System/currentTimeMillis)}
                  {:path "jvm.memory.total.init"
                   :value (+ (-> memory .getHeapMemoryUsage .getInit)
                             (-> memory .getNonHeapMemoryUsage .getInit))}
                  {:path "jvm.memory.total.used"
                   :value (+ (-> memory .getHeapMemoryUsage .getUsed)
                             (-> memory .getNonHeapMemoryUsage .getUsed))}
                  {:path "jvm.memory.total.max"
                   :value (+ (-> memory .getHeapMemoryUsage .getMax)
                             (-> memory .getNonHeapMemoryUsage .getMax))}
                  {:path "jvm.memory.total.committed"
                   :value (+ (-> memory .getHeapMemoryUsage .getCommitted)
                             (-> memory .getNonHeapMemoryUsage .getCommitted))}
                  {:path "jvm.memory.heap.init"
                   :value (-> memory .getHeapMemoryUsage .getInit)}
                  {:path "jvm.memory.heap.used"
                   :value (-> memory .getHeapMemoryUsage .getUsed)}
                  {:path "jvm.memory.heap.max"
                   :value (-> memory .getHeapMemoryUsage .getMax)}
                  {:path "jvm.memory.heap.committed"
                   :value (-> memory .getHeapMemoryUsage .getCommitted)}
                  {:path "jvm.memory.non-heap.init"
                   :value (-> memory .getNonHeapMemoryUsage .getInit)}
                  {:path "jvm.memory.non-heap.used"
                   :value (-> memory .getNonHeapMemoryUsage .getUsed)}
                  {:path "jvm.memory.non-heap.max"
                   :value (-> memory .getNonHeapMemoryUsage .getMax)}
                  {:path "jvm.memory.non-heap.committed"
                   :value (-> memory .getNonHeapMemoryUsage .getCommitted)}
                  (for [^GarbageCollectorMXBean gc gcs]
                    [{:path (str "jvm.gc." (-> gc .getName str/lower-case) ".count")
                      :value (-> gc .getCollectionCount)}
                     {:path (str "jvm.gc." (-> gc .getName str/lower-case) ".time")
                      :value (-> gc .getCollectionTime)}])
                  {:path "jvm.thread.count"
                   :value (-> thread .getThreadCount)}
                  {:path "jvm.thread.daemon.count"
                   :value (-> thread .getDaemonThreadCount)}
                  (for [thread-state (Thread$State/values)]
                    {:path (str "jvm.thread." (-> thread-state str str/lower-case) ".count")
                     :value (count
                             (filter #(and % (= thread-state (.getThreadState %)))
                                     (.getThreadInfo thread
                                                     (-> thread .getAllThreadIds))))})
                  (for [[executor description]
                        [[solo-executor "agent-pool.send-off"]
                         [pooled-executor "agent-pool.send"]]]
                    [{:path (str "jvm." description ".queue-depth")
                      :value (-> executor .getQueue .size)}
                     {:path (str "jvm." description ".active")
                      :value (.getActiveCount executor)}
                     {:path (str "jvm." description ".tasks")
                      :value (.getTaskCount executor)}
                     {:path (str "jvm." description ".completed-tasks")
                      :value (.getCompletedTaskCount executor)}
                     {:path (str "jvm." description ".size")
                      :value (.getPoolSize executor)}
                     {:path (str "jvm." description ".core-size")
                      :value (.getCorePoolSize executor)}
                     {:path (str "jvm." description ".largest-size")
                      :value (.getLargestPoolSize executor)}
                     {:path (str "jvm." description ".maximum-size")
                      :value (.getMaximumPoolSize executor)}])
                  (for [[_k metric-fn] @gauge-metric-fns]
                    (metric-fn))])]
    (into {} (map (juxt :path :value) metrics))))

(comment
  (gauges))

(defn straight-jacket-record-gauges []
  (try
    (reset! tracer/last-calculated-metrics (gauges))
    (catch Throwable t
      (tracer/record-exception-span! t {:name "gauges/straight-jacket-record-gauges"}))))

(defonce delay-pool (delay/make-pool! :thread-count 1))

(defn start []
  (tracer/record-info! {:name "gauges/start"})
  (def record-job (delay/repeat-fn delay-pool
                                   1000
                                   #'straight-jacket-record-gauges)))

(defn stop []
  (.cancel record-job true))

(defn restart []
  (stop)
  (start))

