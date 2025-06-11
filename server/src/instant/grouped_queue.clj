(ns instant.grouped-queue
  (:require
   [clojure+.core :as clojure+]
   [instant.config :as config]
   [instant.gauges :as gauges]
   [instant.util.tracer :as tracer])
  (:import
   (java.util Map Queue)
   (java.util.concurrent ConcurrentHashMap ConcurrentLinkedQueue Executor Executors ExecutorService TimeUnit)
   (java.util.concurrent.atomic AtomicInteger)))

(defn- execute [{:keys [executor error-fn]} ^Runnable task]
  (try
    (Executor/.execute executor task)
    (catch Exception e
      (if error-fn
        (error-fn e)
        (throw e)))))

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
             (recur (assoc item12 ::combined (inc (::combined item1 1))))))))

(declare process)

(deftype ProcessTask [q key group]
  Runnable
  (run [this]
    (process this q key group)))

(defn- clean-or-reschedule [process-task {:keys [groups] :as q} group key]
  (when (= ::reschedule (locking q
                          (if (some? (Queue/.peek group))
                            ::reschedule
                            (Map/.remove groups key))))
    (execute q process-task)))

(defn- process
  "Main worker process function"
  [process-task
   {:keys [process-fn
           combine-fn
           num-workers
           num-items
           processing?] :as q}
   key
   group]
  (AtomicInteger/.incrementAndGet num-workers)
  (when @processing?
    (if-some [item (poll group combine-fn)]
      (do
        (try
          (process-fn key item)
          (catch Throwable t
            (tracer/record-exception-span! t {:name "grouped-queue/process-error"})))
        (AtomicInteger/.addAndGet num-items (- (::combined item 1)))
        (if (some? (Queue/.peek group))
          (execute q process-task)
          (clean-or-reschedule process-task q group key)))
      (clean-or-reschedule process-task q group key)))
  (AtomicInteger/.decrementAndGet num-workers))

(defn put!
  "Schedule item for execution on q"
  [{:keys [groups group-key-fn num-items num-puts accepting?] :as q} item]
  (when @accepting?
    (let [item   (assoc item ::put-at (System/currentTimeMillis))
          key    (or (group-key-fn item) ::default)
          process-task (locking q
                         (if-some [group (Map/.get groups key)]
                           (do
                             (Queue/.offer group item)
                             nil)
                           (let [group (ConcurrentLinkedQueue. [item])]
                             (Map/.put groups key group)
                             (ProcessTask. q key group))))]
      (when process-task
        (execute q process-task))
      (AtomicInteger/.incrementAndGet num-items)
      (AtomicInteger/.incrementAndGet num-puts))))

(defn- longest-wait-time [groups]
  (when-some [items (->> groups
                         (Map/.values)
                         (keep Queue/.peek)
                         not-empty)]
    (let [now (System/currentTimeMillis)]
      (- now (transduce (map ::put-at) min now items)))))

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
  [{:keys [group-key-fn combine-fn process-fn error-fn executor max-workers metrics-path]
    :or {max-workers 2}}]
  (let [groups       (ConcurrentHashMap.)
        accepting?   (atom true)
        processing?  (atom true)
        num-items    (AtomicInteger. 0)
        num-puts     (AtomicInteger. 0)
        num-workers  (AtomicInteger. 0)
        executor     (cond
                       (some? executor)
                       executor

                       config/fewer-vfutures?
                       (Executors/newFixedThreadPool max-workers)
                       #_(doto (ThreadPoolExecutor. max-workers max-workers 60 TimeUnit/SECONDS (LinkedBlockingQueue.))
                           (.allowCoreThreadTimeOut true))

                       :else
                       (Executors/newVirtualThreadPerTaskExecutor))
        cleanup-fn   (when metrics-path
                       (gauges/add-gauge-metrics-fn
                        (fn [_]
                          [{:path  (str metrics-path ".size")
                            :value (AtomicInteger/.get num-items)}
                           (when-some [t (longest-wait-time groups)]
                             {:path  (str metrics-path ".longest-waiting-ms")
                              :value t})
                           {:path (str metrics-path ".worker-count")
                            :value (AtomicInteger/.get num-workers)}
                           #_{:path (str metrics-path ".pool-size")
                              :value (ThreadPoolExecutor/.getPoolSize executor)}
                           {:path (str metrics-path ".num-puts")
                            :value (AtomicInteger/.getAndSet num-puts 0)}])))
        shutdown-fn  (fn [{:keys [timeout-ms]
                           :or {timeout-ms 1000}}]
                       (when cleanup-fn
                         (cleanup-fn))
                       (reset! accepting? false)
                       (ExecutorService/.shutdown executor)
                       (if (ExecutorService/.awaitTermination executor timeout-ms TimeUnit/MILLISECONDS)
                         :shutdown
                         (do
                           (reset! processing? false)
                           (if (ExecutorService/.awaitTermination executor timeout-ms TimeUnit/MILLISECONDS)
                             :shutdown
                             (do
                               (ExecutorService/.shutdownNow executor)
                               :terminated)))))]
    {:group-key-fn (or group-key-fn identity)
     :combine-fn   (or combine-fn (fn [_ _] nil))
     :process-fn   process-fn
     :error-fn     error-fn
     :groups       groups
     :accepting?   accepting?
     :processing?  processing?
     :num-items    num-items
     :num-puts     num-puts
     :num-workers  num-workers
     :executor     executor
     :shutdown-fn  shutdown-fn}))

(defn stop
  "Stops grouped queue. Shuts executor down. Possible options:

     :timeout-ms :: long

   How long to wait for existing tasks to finish processing before interrupting."
  ([q]
   ((:shutdown-fn q) {}))
  ([q opts]
   ((:shutdown-fn q) opts)))

(defn num-items
  "~ Amount of items currently in all queues"
  [q]
  (AtomicInteger/.get (:num-items q)))

(defn num-workers
  "~ Amount of workers currently in all queues"
  [q]
  (AtomicInteger/.get (:num-workers q)))
