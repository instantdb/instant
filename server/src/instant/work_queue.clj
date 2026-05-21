(ns instant.work-queue
  (:require
   [instant.util.defrecord :refer [defrecord-once]])
  (:import
   (java.util.concurrent ConcurrentHashMap ConcurrentLinkedQueue ExecutorService)))

(defrecord-once WorkQueue [^ConcurrentHashMap limiter
                           ^ConcurrentLinkedQueue order-q
                           ^ExecutorService pool
                           init-fn
                           add-fn
                           process-fn
                           empty?-fn]
  Runnable
  (run [this]
       (when-let [next-key (.poll order-q)]
         (when-let [item (.get limiter next-key)]
           (try
             (process-fn next-key item)
             (finally
               (let [requeue? (volatile! false)]
                 (.computeIfPresent limiter
                                    next-key
                                    (fn [k v]
                                      (when-not (empty?-fn k v)
                                        (vreset! requeue? true)
                                        v)))
                 (when @requeue?
                   (.offer order-q next-key)
                   (.submit pool this)))))))))

(defn create-work-queue
  "Creates a queue similar to a grouped-queue, but it's up to the caller how the
   items are combined.

   It uses a ConcurrentLinkedQueue to distribute the work, a ConcurrentHashMap to ensure
   that two processes never work on the same key at the same time, and a thread pool to
   do the work.


   :init-fn - function that takes a key and should return the initial value, only called
              when the key is not already in the queue. If you wanted a queue of queues,
              you might return a `(LinkedBlockingQueue.)` from this function.
   :add-fn - function that takes a key, the current value in the queue, and the item
             to be added. Should return the value to be added to the queue, or nil if
             you want the key to be removed from the map.
   :process-fn - function that takes the key and the current value of the key (the return value
                 of :add-fn) and executes some work. The value should be mutable--this is a
                 good place to reset the value (but your reset needs to be thread-safe)
   :empty?-fn - function that takes a key and a value. Return true if the value is completed,
                serves as a signal that we are done with this item and the key will be removed
                from the map. If it returns `true`, then the key will be requeued.

   :init-fn, :add-fn, and :empty?-fn are protected by ConcurrentHashMap locks and are guaranteed
    to run serially"
  [^ExecutorService pool {:keys [init-fn add-fn process-fn empty?-fn]}]
  (->WorkQueue (ConcurrentHashMap.)
               (ConcurrentLinkedQueue.)
               pool
               init-fn
               add-fn
               process-fn
               empty?-fn))

(defn offer-work [^WorkQueue q key item]
  (let [{:keys [^ConcurrentHashMap limiter
                ^ConcurrentLinkedQueue order-q
                ^ExecutorService pool
                init-fn
                add-fn]} q
        new? (volatile! false)]
    (.compute limiter
              key
              (fn [k v]
                (when (nil? v)
                  (vreset! new? true))
                (add-fn k (or v (init-fn k)) item)))
    (when @new?
      (.offer order-q key)
      (.submit pool ^Runnable q))))

(defn shutdown [^WorkQueue q]
  (ExecutorService/.shutdown (:pool q)))
