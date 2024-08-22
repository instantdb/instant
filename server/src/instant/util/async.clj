(ns instant.util.async
  (:refer-clojure :exclude [future-call])
  (:require
   [clojure.core.async :as a]
   [instant.util.tracer :as tracer])
  (:import [java.util.concurrent Executors ExecutorService]))

(defmacro fut-bg
  "Futures only throw when de-referenced. fut-bg writes a future
  with a top-level try-catch, so you can run code asynchronously,
  without _ever_ de-referencing them"
  [& forms]
  `(future
     (try
       ~@forms
       (catch Exception e#
         (tracer/record-exception-span! e# {:name       "fut-bg"
                                            :escaping?  true
                                            :attributes {:forms (pr-str '~forms)}})
         (throw e#)))))

(defn logging-uncaught-exception-handler
  "Creates a new Thread$UncaughtExceptionHandler, which simply
   logs the exception and the thread name"
  []
  (reify Thread$UncaughtExceptionHandler
    (uncaughtException [_ thread ex]
      (tracer/record-exception-span! ex {:name        "uncaught-exception"
                                         :escaping?   false
                                         :thread-name (.getName thread)}))))

;; --------------- 
;; virtual-threads 

(def ^ExecutorService default-virtual-thread-executor (Executors/newVirtualThreadPerTaskExecutor))

(defn ^:private deref-future
  "Private function copied from clojure.core;

  A helper that derefs a future in the shape that IBlockingDeref needs."
  ([^java.util.concurrent.Future fut]
   (.get fut))
  ([^java.util.concurrent.Future fut timeout-ms timeout-val]
   (try (.get fut timeout-ms java.util.concurrent.TimeUnit/MILLISECONDS)
        (catch java.util.concurrent.TimeoutException _
          timeout-val))))

(defn future-call
  "Like clojure.core/future-call, but accepts an Executor"
  [^ExecutorService executor f]
  (let [f (bound-fn* f)
        fut (.submit executor ^Callable f)]
    (reify
      clojure.lang.IDeref
      (deref [_] (deref-future fut))
      clojure.lang.IBlockingDeref
      (deref
        [_ timeout-ms timeout-val]
        (deref-future fut timeout-ms timeout-val))
      clojure.lang.IPending
      (isRealized [_] (.isDone fut))
      java.util.concurrent.Future
      (get [_] (.get fut))
      (get [_ timeout unit] (.get fut timeout unit))
      (isCancelled [_] (.isCancelled fut))
      (isDone [_] (.isDone fut))
      (cancel [_ interrupt?] (.cancel fut interrupt?)))))

(defmacro vfuture
  "Takes a body of expressions and yields a future object that will
  invoke the body in a **virtual thread**, and will cache the result and
  return it on all subsequent calls to deref/@. If the computation has
  not yet finished, calls to deref/@ will block, unless the variant of
  deref with timeout is used. See also - realized?."
  [& body]
  `(future-call default-virtual-thread-executor (^{:once true} fn* [] ~@body)))

(defn vfuture-pmap
  "Like pmap, but uses vfutures to parallelize the work.

  Why would you want to use this instead of pmap?

  pmap has a fixed size threadpool. This means that if you have a recursive
  function that uses `pmap`, you can run into a deadlock.

  vfutures on the other hand use a virtual-thread-per-task executor. 
  This executor is unbounded, so even if you have a recursive function, 
  you won't deadlock."
  [f coll]
  (let [futs (mapv #(vfuture (f %)) coll)]
    (mapv deref futs)))

;; ----
;; core.async

(defn <!!-timeout
  "Like <!!, but returns :timeout if `ch` doesn't return in `timeout-ms`.
  This is useful for executing go-loops in the REPL.
  If something hangs, your REPL won't be blocked forever."
  ([ch] (<!!-timeout ch 5000))
  ([ch timeout-ms]
   (a/<!! (a/go
            (let [timeout-ch (a/timeout timeout-ms)]
              (a/alt!
                ch ([v] v)
                timeout-ch :timeout))))))


