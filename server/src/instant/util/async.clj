(ns instant.util.async
  (:refer-clojure :exclude [future-call pmap])
  (:require
   [clojure.core.async :as a]
   [clojure.core.async.impl.buffers]
   [clojure.core.async.impl.protocols :as a-impl]
   [instant.gauges :as gauges]
   [instant.util.tracer :as tracer])
  (:import
   (java.util.concurrent ConcurrentHashMap
                         Executors
                         ExecutorService
                         Future)
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

(defn wrap-catch-unhandled-exceptions [f]
  (fn [& args]
    (try
      (apply f args)
      (catch Throwable t
        (when-some [handler (.getUncaughtExceptionHandler (Thread/currentThread))]
          (.uncaughtException handler (Thread/currentThread) t))
        (throw t)))))

;; ---------------
;; virtual-threads

(defn make-virtual-thread-executor ^ExecutorService []
  (Executors/newVirtualThreadPerTaskExecutor))

(defonce ^ExecutorService default-virtual-thread-executor (make-virtual-thread-executor))

(defn ^:private deref-future
  "Private function copied from clojure.core;

  A helper that derefs a future in the shape that IBlockingDeref needs."
  ([^java.util.concurrent.Future fut]
   (.get fut))
  ([^java.util.concurrent.Future fut timeout-ms timeout-val]
   (try (.get fut timeout-ms java.util.concurrent.TimeUnit/MILLISECONDS)
        (catch java.util.concurrent.TimeoutException _
          timeout-val))))

(defn worker-vfuture-call [^ExecutorService executor f]
  (let [f   (wrap-catch-unhandled-exceptions f)
        fut (.submit executor ^Callable f)]
    (reify
      clojure.lang.IDeref
      (deref [_] (deref-future fut))
      clojure.lang.IBlockingDeref
      (deref [_ timeout-ms timeout-val]
        (deref-future fut timeout-ms timeout-val))
      clojure.lang.IPending
      (isRealized [_] (.isDone fut))
      java.util.concurrent.Future
      (get [_] (.get fut))
      (get [_ timeout unit] (.get fut timeout unit))
      (isCancelled [_] (.isCancelled fut))
      (isDone [_] (.isDone fut))
      (cancel [_ interrupt?]
        (.cancel fut interrupt?)))))

(defmacro worker-vfuture
  "Creates a vfuture that does not propagate bindings and does not
   track immediate children. Useful for starting a background worker."
  [^ExecutorService executor & body]
  `(worker-vfuture-call ~executor (^{:once true} fn* [] ~@body)))

;; Keeps track of child futures so that we can cancel them if the
;; parent is canceled.
(def ^:dynamic *child-vfutures* nil)

(defn new-child-vfutures ^ConcurrentHashMap []
  (ConcurrentHashMap.))

(defn cancel-children [^ConcurrentHashMap child-vfutures interrupt?]
  (doseq [^Future child (.values child-vfutures)]
    (.cancel child interrupt?)))

(defn future-call
  "Like clojure.core/future-call, but accepts an Executor"
  [^ExecutorService executor {:keys [dont-track-immediate-children?]} f]
  (let [fut-id (Object.)
        ;; Use a ConcurrentHashMap because it plays more nicely with
        ;; virtual threads
        children (new-child-vfutures)
        ^ConcurrentHashMap parent-vfutures *child-vfutures*
        f (wrap-catch-unhandled-exceptions f)
        f (bound-fn* (^{:once true} fn* []
                      (if dont-track-immediate-children?
                        (f)
                        (binding [*child-vfutures* children]
                          (let [res (f)]
                            (when parent-vfutures
                              (.remove parent-vfutures fut-id))
                            res)))))
        fut (.submit executor ^Callable f)
        wrapped-fut (reify
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
                      (cancel [_ interrupt?]
                        (cancel-children children interrupt?)
                        (.cancel fut interrupt?)))]
    (when parent-vfutures
      (.put parent-vfutures fut-id wrapped-fut))
    wrapped-fut))

(defmacro tracked-future [& body]
  `(future-call clojure.lang.Agent/soloExecutor nil (^{:once true} fn* [] ~@body)))

(defmacro vfuture
  "Takes a body of expressions and yields a future object that will
  invoke the body in a **virtual thread**, and will cache the result and
  return it on all subsequent calls to deref/@. If the computation has
  not yet finished, calls to deref/@ will block, unless the variant of
  deref with timeout is used. See also - realized?."
  [& body]
  `(future-call default-virtual-thread-executor nil (^{:once true} fn* [] ~@body)))

(defmacro severed-vfuture
  "Like vfuture, but won't get canceled if the parent is canceled."
  [& body]
  `(binding [*child-vfutures* nil]
     (future-call default-virtual-thread-executor nil (^{:once true} fn* [] ~@body))))

(defn pmap
  "Like pmap, but uses vfutures to parallelize the work.

  Why would you want to use this instead of pmap?

  pmap has a fixed size threadpool. This means that if you have a recursive
  function that uses `pmap`, you can run into a deadlock.

  vfutures on the other hand use a virtual-thread-per-task executor. 
  This executor is unbounded, so even if you have a recursive function, 
  you won't deadlock."
  [f coll]
  (->> coll
       ;; mapv to force entire seq
       (mapv #(vfuture (f %)))
       (mapv deref)))

(defmacro vfut-bg
  "Futures only throw when de-referenced. vfut-bg writes a future with a
  top-level try-catch, so you can run code asynchronously, without
  _ever_ de-referencing them"
  [& forms]
  `(future-call
    default-virtual-thread-executor
    ;; These aren't regularly canceled, so don't incur the
    ;; overhead of tracking child futures
    {:dont-track-immediate-children? true}
    (^{:once true} fn* []
     (try
       ~@forms
       (catch Exception e#
         (tracer/record-exception-span! e# {:name "vfut-bg"
                                            :escaping?  true
                                            :attributes {:forms (pr-str '~forms)}})
         (throw e#))))))

;; Only supports what we currently need for the datalog query cache
;; See https://docs.oracle.com/javase/8/docs/api/java/util/concurrent/ExecutorService.html
;; for the rest of the interface we might want to implement
(deftype VFutureExecutor []
  ExecutorService
  (^Future submit [_ ^Callable callable]
   (vfuture (.call callable)))

  (^Future submit [_ ^Runnable runnable]
   (vfuture (.run runnable)))

  (^void execute [_ ^Runnable runnable]
   (vfuture (.run runnable))
   nil)

  (shutdown [_]
    nil))

(defn make-vfuture-executor []
  (VFutureExecutor.))

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

(defn all-of [& futures]
  (future
    (doseq [f futures]
      (deref f))))

(defmacro >!-close-safe
  "Prevents hangs when putting to a channel that is later closed.
   Takes a close-signal-ch channel that will interrupt the stuck
   put when the channel is closed.

   This only works if you remember to close the close-signal channel
   when you close the channel itself."
  [close-signal-ch ch val]
  `(a/alt! [[~ch ~val]] ([res#] res#)
           ~close-signal-ch false))

(defn chunked-chan
  "Takes a `flush-ms` and a `max-size`. Returns an `in` and `out` chan.

   Put new items in `in`, `out` will receive the items combined with the
   `combine` function after the buffer length (determined by calling `size`)
   exceeds `max-items` or when it has not flushed in more than `flush-ms` (and
   the buffer is not empty).

   `combine` should accept two arguments, the accumulator and the next item."
  [{:keys [flush-ms
           max-size
           combine
           init
           size]
    :or {combine (fn [acc xs] (apply conj acc xs))
         init []
         size count}}]
  (let [in (a/chan)
        out (a/chan)
        shutdown-ch (a/chan)
        process
        (a/go-loop [items init
                    timeout-ch nil]
          (let [[vs ch] (a/alts! (remove nil? [in timeout-ch]))
                timeout? (= ch timeout-ch)]
            (cond timeout?
                  (when (>!-close-safe shutdown-ch out items)
                    (recur init nil))

                  (nil? vs)
                  (do
                    (when (and (not (nil? items))
                               (not (identical? items init)))
                      (>!-close-safe shutdown-ch out items))
                    (a/close! out))

                  :else
                  (let [items' (combine items vs)]
                    (if (>= (size items') max-size)
                      (when (>!-close-safe shutdown-ch out items')
                        (recur init nil))
                      (recur items' (or timeout-ch
                                        (a/timeout flush-ms))))))))]
    {:in in
     :out out
     :shutdown (fn []
                 (a/close! in)
                 (a/close! out)
                 (a/close! shutdown-ch)
                 process)}))
