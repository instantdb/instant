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

(defn- poll
  "Gets 0..∞ items from group, fetching as many combinable items as possible in a row.
   Returns 1 (possibly combined) item or nil"
  [group combine-fn]
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

(defn- process
  "Main worker process fn"
  [{:keys [groups process-fn combine-fn workers items running?] :as q} key group]
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

(defn put!
  "Schedule item for execution on q"
  [{:keys [executor groups group-key-fn items running?] :as q} item]
  (when @running?
    (let [item (assoc item ::put-at (System/currentTimeMillis))
          key  (or (group-key-fn item) ::default)]
      (locking q
        (if-some [group (Map/.get groups key)]
          (Queue/.offer group item)
          (let [group (ConcurrentLinkedQueue. [item])]
            (Map/.put groups key group)
            (ExecutorService/.submit executor ^Runnable #(process q key group))))
        (AtomicInteger/.incrementAndGet items)))))

(defn- longest-wait-time [groups]
  (when-some [items (->> groups
                         (Map/.values)
                         (keep Queue/.peek)
                         not-empty)]
    (- (System/currentTimeMillis) (transduce (map ::put-at) min items))))

(defn start
  "Options:

     :group-key-fn :: (fn [item]) -> Any

   A function to determine to which “track” to send item for processing.
   All tracks are processed in parallel, items inside one track are processed sequentially.

     :combine-fn   :: (fn [item1 item2]) -> item | nil

   A function that can optionally combine two items into one before processing.
   Return nil if items shouldn’t be combined.

     :process-fn   :: (fn [group-key item])

   Main processing function. Item passed to it might have additional ::combined and ::put-at keys.

     :executor     :: ExecutorService | nil

   An exectutor to use to run worker threads. Should support unbounded task queue.

     :max-workers  :: long | nil

   If exectutor is not provided, ~ cached thread pool will be created with at most this many threads.

     :metrics-path :: String | nil

   A string to report gauge metrics to. If skipped, no reporting"
  [{:keys [group-key-fn combine-fn process-fn executor max-workers metrics-path]}]
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
                          (when-some [t (longest-wait-time groups)]
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
    {:group-key-fn (or group-key-fn identity)
     :combine-fn   (or combine-fn (fn [_ _] nil))
     :process-fn   process-fn
     :groups       groups
     :running?     running?
     :items        items
     :workers      workers
     :executor     executor
     :shutdown-fn  shutdown-fn}))
