(ns instant.grouped-queue-2
  (:require
   [clojure+.core :as clojure+]
   [instant.config :as config]
   [instant.gauges :as gauges]
   [instant.util.tracer :as tracer])
  (:import
   (java.util Map Queue)
   (java.util.concurrent ConcurrentHashMap ConcurrentLinkedQueue Executors ExecutorService LinkedBlockingQueue ThreadPoolExecutor TimeUnit)
   (java.util.concurrent.atomic AtomicInteger)))

(defn- poll [group combine-fn]
  (loop [item1 (Queue/.poll group)]
    (clojure+/cond+
     (nil? item1) nil
     :let [item2 (Queue/.peek group)]
     (nil? item2) item1
     :let [item12 (combine-fn item1 item2)]
     (nil? item12) item1
     :else (do
             (Queue/.remove group) ;; remove item2
             (recur (update item12 ::combined (fnil inc 1)))))))

(defn- process [{:keys [groups process-fn combine-fn workers items running?] :as q} key group]
  (AtomicInteger/.incrementAndGet workers)
  (loop []
    (when @running?
      (if-some [item (poll group combine-fn)]
        (do
          (try
            (process-fn key item)
            (catch Throwable t
              (tracer/record-exception-span! t {:name "grouped-queue/process-error"})))
          (AtomicInteger/.addAndGet items (- (::combined item 1)))
          (recur))
        (when (= ::loop (locking q
                          (if (some? (Queue/.peek group))
                            ::loop
                            (Map/.remove groups key))))
          (recur)))))
  (AtomicInteger/.decrementAndGet workers))

(defn put! [{:keys [executor groups group-fn items running?] :as q} item]
  (when @running?
    (let [item (assoc item ::put-at (System/currentTimeMillis))
          key  (or (group-fn item) ::default)]
      (locking q
        (if-some [group (Map/.get groups key)]
          (Queue/.offer group item)
          (let [group (ConcurrentLinkedQueue. [item])]
            (Map/.put groups key group)
            (ExecutorService/.submit executor ^Runnable #(process q key group))))
        (AtomicInteger/.incrementAndGet items)))))

(defn- wait-time [groups]
  (when-some [items (->> groups
                         (Map/.values)
                         (keep Queue/.peek)
                         not-empty)]
    (- (System/currentTimeMillis) (transduce (map ::put-at) min items))))

(defn start [{:keys [group-fn combine-fn process-fn executor metrics-path max-workers]}]
  (let [groups      (ConcurrentHashMap.)
        running?    (atom true)
        items       (AtomicInteger. 0)
        workers     (AtomicInteger. 0)
        executor    (cond
                      (some? executor)
                      executor

                      config/fewer-vfutures?
                      (ThreadPoolExecutor. 0 (or max-workers 2) 1 TimeUnit/SECONDS (LinkedBlockingQueue.))

                      :else
                      (Executors/newVirtualThreadPerTaskExecutor))
        cleanup-fn  (when metrics-path
                      (gauges/add-gauge-metrics-fn
                       (fn [_]
                         [{:path  (str metrics-path ".size")
                           :value (AtomicInteger/.get items)}
                          (when-some [t (wait-time groups)]
                            {:path  (str metrics-path ".longest-waiting-ms")
                             :value t})
                          {:path (str metrics-path ".worker-count")
                           :value (AtomicInteger/.get workers)}])))
        shutdown-fn (fn []
                      (when cleanup-fn
                        (cleanup-fn))
                      (reset! running? false)
                      (ExecutorService/.shutdown executor)
                      (when-not (ExecutorService/.awaitTermination executor 1 TimeUnit/SECONDS)
                        (ExecutorService/.shutdownNow executor)
                        (ExecutorService/.awaitTermination executor 1 TimeUnit/SECONDS)))]
    {:group-fn    (or group-fn identity)
     :combine-fn  (or combine-fn (fn [_ _] nil))
     :process-fn  process-fn
     :groups      groups
     :running?    running?
     :items       items
     :workers     workers
     :executor    executor
     :shutdown-fn shutdown-fn}))
