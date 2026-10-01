(ns instant.grouped-queue
  (:require
   [clojure+.core :as clojure+]
   [instant.config :as config]
   [instant.gauges :as gauges]
   [instant.util.async :as ua]
   [instant.util.tracer :as tracer])
  (:import
   (java.util Map Queue)
   (java.util.concurrent ConcurrentHashMap ConcurrentLinkedQueue Executor Executors ExecutorService ScheduledThreadPoolExecutor TimeUnit)
   (java.util.concurrent.atomic AtomicInteger)))

(defn- execute [{:keys [get-executor error-fn ctx]} ^Runnable task]
  (try
    (Executor/.execute (get-executor) task)
    (catch Exception e
      (if error-fn
        (error-fn ctx e)
        (throw e)))))

(defn- schedule [{:keys [scheduled-thread-pool-executor error-fn ctx] :as q}
                 ^Long delay-ms
                 ^Runnable task]
  (try
    (ScheduledThreadPoolExecutor/.schedule
     scheduled-thread-pool-executor
     (reify Runnable
       (run [_]
         (execute q task)))
     delay-ms
     TimeUnit/MILLISECONDS)
    (catch Exception e
      (if error-fn
        (error-fn ctx e)
        (throw e)))))

(defn- record-error
  "Records t, but can never itself throw. Recovery code calls this first, so if
   recording could fail -- under memory pressure it allocates, and before the
   tracer is initialised it throws -- the failure would skip the recovery it was
   meant to log, and orphan the group anyway."
  [t span-name]
  (try
    (tracer/record-exception-span! t {:name span-name})
    (catch Throwable _ nil)))

(defn- poll
  "Gets 0..∞ items from group, fetching as many combinable items as possible in a row.
   Returns 1 (possibly combined) item or nil"
  [ctx group combine-fn]
  (loop [item1 (Queue/.poll group)]
    (clojure+/cond+
      (nil? item1) nil
      :let [item2 (Queue/.peek group)]
      (nil? item2) item1
      ;; combine-fn runs outside process-fn's try. If it throws, treat the
      ;; pair as not combinable: return item1 on its own and leave item2
      ;; queued. Letting it escape would kill the pass and orphan the group.
      :let [item12 (try
                     (combine-fn ctx item1 item2)
                     (catch Throwable t
                       (record-error t "grouped-queue/combine-error")
                       nil))]
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

(defn- recover-chain
  "A pass died before it could reschedule. Try once more to keep the chain
   going. If that fails as well, unregister the group so that the next put!
   starts a fresh chain. That drops the group's backlog, which is better than
   the alternative: a group that stays registered with nothing draining it,
   so that put! appends to it for the life of the process."
  [process-task {:keys [groups num-items] :as q} group key]
  (try
    (clean-or-reschedule process-task q group key)
    (catch Throwable t
      (record-error t "grouped-queue/orphaned-group-dropped")
      (locking q
        (Map/.remove groups key group))
      (let [dropped (loop [n 0]
                      (if-some [item (Queue/.poll group)]
                        (recur (+ n (::combined item 1)))
                        n))]
        (AtomicInteger/.addAndGet num-items (- dropped))))))

(def throttle-key ::throttle-ms)

(defn return-throttle [^long throttle-ms]
  {throttle-key throttle-ms})

(defn- process
  "Main worker process function"
  [process-task
   {:keys [ctx
           process-fn
           combine-fn
           num-workers
           num-items
           processing?] :as q}
   key
   group]
  (AtomicInteger/.incrementAndGet num-workers)
  ;; Each pass must end by rescheduling the chain or unregistering the group.
  ;; put! only starts a chain for a group it has not seen, so a pass that dies
  ;; in between orphans the group for good. Throwable rather than Exception:
  ;; the realistic failure is OutOfMemoryError, which escapes the pooled
  ;; worker without taking the JVM down.
  (try
    (when @processing?
      (if-some [item (poll ctx group combine-fn)]
        (let [process-result (try
                               (process-fn ctx key item)
                               (catch Throwable t
                                 (record-error t "grouped-queue/process-error")))]
          (AtomicInteger/.addAndGet num-items (- (::combined item 1)))
          (if-let [throttle-ms (throttle-key process-result)]
            (schedule q throttle-ms process-task)
            (if (some? (Queue/.peek group))
              (execute q process-task)
              (clean-or-reschedule process-task q group key))))
        (clean-or-reschedule process-task q group key)))
    (catch Throwable t
      (record-error t "grouped-queue/process-chain-error")
      (recover-chain process-task q group key))
    (finally
      (AtomicInteger/.decrementAndGet num-workers))))

(defn put!
  "Schedule item for execution on q"
  [{:keys [ctx groups group-key-fn num-items num-puts accepting?] :as q} item]
  (when @accepting?
    (let [item   (assoc item ::put-at (System/currentTimeMillis))
          key    (or (group-key-fn ctx item) ::default)
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
     :ctx :: Ctx

   A context variable that will be passed as the first arg to group-key-fn, combine-fn, process-fn,
   and error-fn

     :group-key-fn :: (fn [ctx item]) -> Any

   A function to determine to which “track” to send item for processing.
   All tracks are processed in parallel, items inside one track are processed sequentially.

     :combine-fn   :: (fn [ctx item1 item2]) -> item | nil

   A function that can optionally combine two items into one before processing.
   Return nil if items shouldn’t be combined.

     :process-fn   :: (fn [ctx group-key item])

   Main processing function. Item passed to it might have additional ::combined and ::put-at keys.

     :executor     :: ExecutorService | nil

   An executor to use to run worker threads. Should support unbounded task queue.

     :get-executor :: (fn []) -> ExecutorService

   Function that returns an executor, used for testing different executors

     :scheduled-thread-pool-executor :: ScheduledThreadPoolExecutor | nil

   A ScheduledThreadPoolExecutor to handle continuing throttled queues

     :max-workers  :: long | nil

   If exectutor is not provided, ~ cached thread pool will be created with at most this many threads.

     :metrics-path :: String | nil

   A string to report gauge metrics to. If skipped, no reporting"
  [{:keys [ctx group-key-fn combine-fn process-fn error-fn
           executor get-executor scheduled-thread-pool-executor
           max-workers metrics-path]
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

                       get-executor nil

                       config/fewer-vfutures?
                       (Executors/newFixedThreadPool max-workers)

                       :else
                       (ua/make-limited-concurrency-executor max-workers))
        get-executor (or get-executor (fn [] executor))
        [scheduled-thread-pool-executor shutdown-scheduled-executor?]
        (if scheduled-thread-pool-executor
          [scheduled-thread-pool-executor false]
          [(ScheduledThreadPoolExecutor. 1) true])
        cleanup-fn   (when metrics-path
                       (gauges/add-gauge-metrics-fn
                        (fn [_]
                          [{:path  (str metrics-path ".size")
                            :value (AtomicInteger/.get num-items)}
                           (when-some [t (longest-wait-time groups)]
                             {:path  (str metrics-path ".longest-waiting-ms")
                              :value t})
                           {:path (str metrics-path ".executor-class")
                            :value (.getName (class (get-executor)))}
                           {:path (str metrics-path ".worker-count")
                            :value (AtomicInteger/.get num-workers)}
                           {:path (str metrics-path ".num-puts")
                            :value (AtomicInteger/.getAndSet num-puts 0)}])))
        shutdown-fn  (fn [{:keys [timeout-ms]
                           :or {timeout-ms 1000}}]
                       (when cleanup-fn
                         (cleanup-fn))
                       (reset! accepting? false)
                       (ExecutorService/.shutdown (get-executor))
                       (when shutdown-scheduled-executor?
                         (ScheduledThreadPoolExecutor/.shutdownNow scheduled-thread-pool-executor))

                       (if (ExecutorService/.awaitTermination (get-executor) timeout-ms TimeUnit/MILLISECONDS)
                         :shutdown
                         (do
                           (reset! processing? false)
                           (if (ExecutorService/.awaitTermination (get-executor) timeout-ms TimeUnit/MILLISECONDS)
                             :shutdown
                             (do
                               (ExecutorService/.shutdownNow (get-executor))
                               :terminated)))))]
    {:group-key-fn (or group-key-fn identity)
     :ctx          ctx
     :combine-fn   (or combine-fn (fn [_ _ _] nil))
     :process-fn   process-fn
     :error-fn     error-fn
     :groups       groups
     :accepting?   accepting?
     :processing?  processing?
     :num-items    num-items
     :num-puts     num-puts
     :num-workers  num-workers
     :get-executor get-executor
     :scheduled-thread-pool-executor scheduled-thread-pool-executor
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
