(ns instant.util.delay
  (:import
   (java.util.concurrent Callable ScheduledFuture ScheduledThreadPoolExecutor TimeUnit)))

(defn cpu-count []
  (.availableProcessors (Runtime/getRuntime)))

(defn make-pool! [& {:keys [thread-count]
                     :or {thread-count (+ 2 (cpu-count))}}]
  (ScheduledThreadPoolExecutor. thread-count))

(defn delay-fn ^ScheduledFuture [^ScheduledThreadPoolExecutor thread-pool ^Long delay-ms ^Callable f]
  (.schedule thread-pool f delay-ms TimeUnit/MILLISECONDS))

(defn repeat-fn ^ScheduledFuture [^ScheduledThreadPoolExecutor thread-pool delay-ms f]
  (.scheduleAtFixedRate thread-pool f delay-ms delay-ms TimeUnit/MILLISECONDS))

(defn shutdown-pool! [^ScheduledThreadPoolExecutor pool]
  (.shutdown pool))
