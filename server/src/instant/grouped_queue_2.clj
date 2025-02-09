(ns instant.grouped-queue-2
  (:require
   [clojure+.core :as clojure+]
   [instant.config :as config])
  (:import
   (java.util Map Queue)
   (java.util.concurrent ConcurrentHashMap ConcurrentLinkedQueue Executors ExecutorService SynchronousQueue ThreadPoolExecutor TimeUnit)))

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
             (recur item12)))))

(defn- process [{:keys [groups process-fn combine-fn running?] :as q} key group]
  (loop []
    (when @running?
      (if-some [item (poll group combine-fn)]
        (do
          (process-fn key item)
          (recur))
        (when (= ::loop (locking q
                          (if (some? (Queue/.peek group))
                            ::loop
                            (Map/.remove groups key))))
          (recur))))))

(defn put! [{:keys [executor groups group-fn running?] :as q} item]
  (when @running?
    (let [key (or (group-fn item) ::default)]
      (locking q
        (if-some [group (.get groups key)]
          (Queue/.offer group item)
          (let [group (ConcurrentLinkedQueue. [item])]
            (Map/.put groups key group)
            (ExecutorService/.submit executor ^Runnable #(process q key group))))))))

(defn start [{:keys [group-fn combine-fn process-fn executor max-workers]}]
  (let [groups      (ConcurrentHashMap.)
        running?    (atom true)
        executor    (cond
                      (some? executor)
                      executor

                      config/fewer-vfutures?
                      (ThreadPoolExecutor. 0 (or max-workers 2) 60 TimeUnit/SECONDS (SynchronousQueue.))

                      :else
                      (Executors/newVirtualThreadPerTaskExecutor))
        shutdown-fn (fn []
                      (reset! running? false)
                      (ExecutorService/.shutdown executor)
                      (when-not (ExecutorService/.awaitTermination 1 TimeUnit/SECONDS)
                        (ExecutorService/.shutdownNow executor)
                        (ExecutorService/.awaitTermination 1 TimeUnit/SECONDS)))]
    {:group-fn    (or group-fn identity)
     :combine-fn  (or combine-fn (fn [_ _] nil))
     :process-fn  process-fn
     :executor    executor
     :groups      groups
     :running?    running?
     :shutdown-fn shutdown-fn}))
