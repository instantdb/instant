(ns instant.util.async
  (:refer-clojure :exclude [future-call])
  (:require
   [clojure.core.async :as a]
   [clojure.core.async.impl.buffers]
   [clojure.core.async.impl.protocols :as a-impl]
   [instant.gauges :as gauges]
   [instant.util.tracer :as tracer])
  (:import
   (java.util.concurrent Executors ExecutorService)
   (clojure.core.async.impl.buffers FixedBuffer
                                    DroppingBuffer
                                    SlidingBuffer
                                    PromiseBuffer)))

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

(defmacro vfut-bg
  "Futures only throw when de-referenced. vfut-bg writes a future with a
  top-level try-catch, so you can run code asynchronously, without
  _ever_ de-referencing them"
  [& forms]
  `(vfuture
     (try
       ~@forms
       (catch Exception e#
         (tracer/record-exception-span! e# {:name "vfut-bg"
                                            :escaping?  true
                                            :attributes {:forms (pr-str '~forms)}})
         (throw e#)))))

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


(defn buf-capacity [buf]
  (cond (instance? FixedBuffer buf)
        (.n ^FixedBuffer buf)

        (instance? SlidingBuffer buf)
        (.n ^SlidingBuffer buf)

        (instance? DroppingBuffer buf)
        (.n ^DroppingBuffer buf)

        (instance? PromiseBuffer buf)
        1

        :else -1))

(defn gauged-chan
  "Creates a channel that will publish its size in gauges.
   chan-name should be a namespaced keyword, e.g. ::my-channel

   There's a small cost to setting it up and it adds 3 attrs per
   channel, so should be used sparingling with long-running channels."
  ([chan-name] (gauged-chan chan-name nil))
  ([chan-name buf-or-n] (gauged-chan chan-name buf-or-n nil))
  ([chan-name buf-or-n xform] (gauged-chan chan-name buf-or-n xform nil))
  ([chan-name buf-or-n xform ex-handler]
   (assert (keyword? chan-name) "chan-name must be a namespaced keyword")
   (assert (namespace chan-name) "chan-name must be a namespaced keyword")
   (when xform (assert buf-or-n "buffer must be supplied when transducer is"))
   (let [buf-or-n (or buf-or-n 1)
         buf (if (number? buf-or-n) (a/buffer buf-or-n) buf-or-n)
         chan (a/chan xform ex-handler)]
     (gauges/add-gauge-metrics-fn
      (fn [{:keys [cleanup]}]
        (if (a-impl/closed? chan)
          (cleanup)
          [{:path (format "%s.%s.count"
                          (namespace chan-name)
                          (name chan-name))
            :value (count buf)}
           {:path (format "%s.%s.capacity"
                          (namespace chan-name)
                          (name chan-name))
            :value (buf-capacity buf)}
           {:path (format "%s.%s.full"
                          (namespace chan-name)
                          (name chan-name))
            :value (a-impl/full? buf)}])))
     chan)))
