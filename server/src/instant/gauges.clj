(ns instant.gauges
  "Repeatedly saves metric information in `tracer/last-calculated-metrics`."
  (:require
   [clojure.string :as str]
   [instant.config :as config]
   [instant.util.delay :as delay]
   [instant.util.tracer :as tracer])
  (:import
   (com.sun.management GarbageCollectionNotificationInfo)
   (java.lang.management GarbageCollectorMXBean ManagementFactory ThreadInfo)
   (java.util.concurrent ScheduledFuture ThreadPoolExecutor)
   (javax.management NotificationEmitter NotificationListener)
   (javax.management.openmbean CompositeData)))

(defonce gauge-metric-fns (atom {}))

(defn add-gauge-metrics-fn
  "Takes a function that should return a list of maps with `path` and `value`.
   Will run every second and be appended to gauges.  The function
   should take a single argument, which contains a `cleanup` function
   it can call to remove itself. `add-gauge-metrics-fn` returns the
   same cleanup function."
  [f]
  (let [id (random-uuid)
        cleanup (fn []
                  (swap! gauge-metric-fns dissoc id))]
    (swap! gauge-metric-fns assoc id (partial f {:cleanup cleanup}))
    cleanup))

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
                  (let [thread-groups (group-by (fn [^ThreadInfo thread-info]
                                                  (when thread-info
                                                    (.getThreadState thread-info)))
                                                (.getThreadInfo thread
                                                                (.getAllThreadIds thread)))]
                    (for [thread-state (Thread$State/values)]
                      {:path (str "jvm.thread." (-> thread-state str str/lower-case) ".count")
                       :value (count (get thread-groups thread-state))}))
                  (for [[^ThreadPoolExecutor executor description]
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
                    (try
                      (metric-fn)
                      (catch Throwable t
                        [{:path "instant.gauges.metric-fn-error"
                          :value (.getMessage t)}])))])]
    (into {} (keep (juxt :path :value) metrics))))

(comment
  (gauges))

(defn straight-jacket-record-gauges []
  (try
    (if (config/aws-env?)
      (tracer/record-info! {:name "gauges"
                            :attributes (gauges)})
      ;; Run them in dev so any issues will bubble up, but don't bother
      ;; sending anything to honeycomb
      (gauges))
    (catch Throwable t
      (tracer/record-exception-span! t {:name "gauges/straight-jacket-record-gauges"}))))

(defn make-gc-listener []
  (reify NotificationListener
    (handleNotification [_ notification _]
      (when (= (.getType notification)
               GarbageCollectionNotificationInfo/GARBAGE_COLLECTION_NOTIFICATION)
        (let [gc-info (GarbageCollectionNotificationInfo/from
                       ^CompositeData (.getUserData notification))]
          (tracer/record-info!
           {:name "gc"
            :attributes {:gc-name (.getGcName gc-info)
                         :action (.getGcAction gc-info)
                         :cause (.getGcCause gc-info)
                         :duration-ms (.getDuration (.getGcInfo gc-info))}})
          (straight-jacket-record-gauges))))))

(defn add-gc-listeners []
  (let [cleanup-fns
        (doall
         (for [gc-bean (ManagementFactory/getGarbageCollectorMXBeans)
               :when (instance? NotificationEmitter gc-bean)]
           (let [emitter ^NotificationEmitter gc-bean
                 listener (make-gc-listener)]
             (.addNotificationListener emitter listener nil nil)
             (fn []
               (.removeNotificationListener emitter listener)))))]
    (fn []
      (doseq [f cleanup-fns]
        (f)))))

(defonce delay-pool (delay/make-pool! :thread-count 1))

(defn start []
  (tracer/record-info! {:name "gauges/start"})
  (def record-job (delay/repeat-fn delay-pool
                                   30000 ;; 30 seconds
                                   #'straight-jacket-record-gauges))
  (def cleanup-gc-listeners (add-gc-listeners)))

(defn stop []
  (when (bound? #'record-job)
    (.cancel ^ScheduledFuture record-job true))
  (when (bound? #'cleanup-gc-listeners)
    (cleanup-gc-listeners)))

(defn restart []
  (stop)
  (start))
