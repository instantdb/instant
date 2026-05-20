(ns instant.work-queue-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [instant.work-queue :as wq])
  (:import
   (instant.work_queue WorkQueue)
   (java.util.concurrent ConcurrentHashMap ConcurrentLinkedQueue CountDownLatch ExecutorService Executors TimeUnit)
   (java.util.concurrent.atomic AtomicInteger)
   (java.util.function BiFunction)))

;; ---- Helpers

(defn make-drain-queue
  "Work queue that uses a ConcurrentLinkedQueue per key and drains it fully
   each invocation."
  [pool process-item-fn]
  (wq/create-work-queue
   pool
   {:init-fn (fn [_k] (ConcurrentLinkedQueue.))
    :add-fn (fn [_k ^ConcurrentLinkedQueue clq item]
              (.offer clq item)
              clq)
    :process-fn (fn [k ^ConcurrentLinkedQueue clq]
                  (loop []
                    (when-let [i (.poll clq)]
                      (process-item-fn k i)
                      (recur))))
    :empty?-fn (fn [_k ^ConcurrentLinkedQueue clq]
                 (.isEmpty clq))}))

(defn make-single-item-queue
  "Work queue that processes one item per process-fn invocation. Useful for
   exercising the work-queue's requeue mechanism between items."
  [pool process-item-fn]
  (wq/create-work-queue
   pool
   {:init-fn (fn [_k] (ConcurrentLinkedQueue.))
    :add-fn (fn [_k ^ConcurrentLinkedQueue clq item]
              (.offer clq item)
              clq)
    :process-fn (fn [k ^ConcurrentLinkedQueue clq]
                  (when-let [i (.poll clq)]
                    (process-item-fn k i)))
    :empty?-fn (fn [_k ^ConcurrentLinkedQueue clq]
                 (.isEmpty clq))}))

(defn limiter-size [^WorkQueue q]
  (.size ^ConcurrentHashMap (.-limiter q)))

;; ---- Tests

(deftest basic-test
  (let [pool (Executors/newFixedThreadPool 4)
        n 100
        output (atom [])
        latch (CountDownLatch. n)
        q (make-drain-queue pool
                            (fn [_k item]
                              (swap! output conj item)
                              (.countDown latch)))]
    (try
      (doseq [i (range n)]
        (wq/offer-work q :k i))
      (is (.await latch 5 TimeUnit/SECONDS))
      (is (= (range n) @output))
      (finally
        (.shutdown pool)))))

(deftest multi-key-test
  (let [pool (Executors/newFixedThreadPool 4)
        groups "abcde"
        n 100
        output (atom [])
        latch (CountDownLatch. (* (count groups) n))
        q (make-drain-queue pool
                            (fn [k item]
                              (swap! output conj [k item])
                              (.countDown latch)))]
    (try
      (doseq [g groups
              i (range n)]
        (wq/offer-work q g i))
      (is (.await latch 5 TimeUnit/SECONDS))
      (is (= (* (count groups) n) (count @output)))
      (doseq [g groups]
        (is (= (range n)
               (->> @output
                    (filter #(= g (first %)))
                    (mapv second)))
            (str "group " g)))
      (finally
        (.shutdown pool)))))

(defn executor-options []
  [{:name "single-thread" :pool-fn #(Executors/newSingleThreadExecutor)}
   {:name "fixed-10" :pool-fn #(Executors/newFixedThreadPool 10)}
   {:name "virtual-per-task" :pool-fn #(Executors/newVirtualThreadPerTaskExecutor)}])

(deftest executor-matrix-test
  (doseq [{:keys [name pool-fn]} (executor-options)]
    (testing name
      (let [pool (pool-fn)
            groups 5
            n 50
            output (atom [])
            latch (CountDownLatch. (* groups n))
            q (make-drain-queue pool
                                (fn [k item]
                                  (swap! output conj [k item])
                                  (.countDown latch)))]
        (try
          (doseq [g (range groups)
                  i (range n)]
            (wq/offer-work q g i))
          (is (.await latch 10 TimeUnit/SECONDS))
          (doseq [g (range groups)]
            (is (= (range n)
                   (->> @output
                        (filter #(= g (first %)))
                        (mapv second)))
                (str "group " g)))
          (finally
            (ExecutorService/.shutdown pool)))))))

(deftest per-key-serialization-test
  (let [pool (Executors/newFixedThreadPool 8)
        in-flight (ConcurrentHashMap.)
        violations (AtomicInteger. 0)
        inc-bif (reify BiFunction (apply [_ _ v] (inc (or v 0))))
        dec-bif (reify BiFunction (apply [_ _ v] (dec v)))
        groups 5
        per-group 50
        latch (CountDownLatch. (* groups per-group))
        q (make-drain-queue pool
                            (fn [k _item]
                              (let [n (.compute in-flight k inc-bif)]
                                (when (> n 1)
                                  (.incrementAndGet violations)))
                              (Thread/sleep 1)
                              (.compute in-flight k dec-bif)
                              (.countDown latch)))]
    (try
      (let [fs (doall (for [g (range groups)]
                        (future
                          (doseq [i (range per-group)]
                            (wq/offer-work q g i)))))]
        (run! deref fs))
      (is (.await latch 30 TimeUnit/SECONDS))
      (is (zero? (.get violations))
          (str "per-key serialization violated " (.get violations) " times"))
      (finally
        (.shutdown pool)))))

(deftest cross-key-parallelism-test
  (let [pool (Executors/newFixedThreadPool 2)
        sleep-ms 100
        per-key 3
        latch (CountDownLatch. (* 2 per-key))
        q (make-drain-queue pool
                            (fn [_k _item]
                              (Thread/sleep sleep-ms)
                              (.countDown latch)))]
    (try
      (let [t0 (System/currentTimeMillis)]
        (doseq [k [:a :b]
                i (range per-key)]
          (wq/offer-work q k i))
        (is (.await latch 5 TimeUnit/SECONDS))
        (let [elapsed (- (System/currentTimeMillis) t0)
              serial (* 2 per-key sleep-ms)]
          (is (< elapsed (* 0.75 serial))
              (str "expected parallel execution, got " elapsed "ms (serial would be ~" serial "ms)"))))
      (finally
        (.shutdown pool)))))

(deftest drain-race-recovery-test
  ;; With single-item process-fn, the work-queue's finally must re-queue the
  ;; key after each item if more items are still in the container. We block
  ;; the first invocation, offer more items, then release — verifying the
  ;; requeue mechanism picks them up rather than stranding them.
  (let [pool (Executors/newFixedThreadPool 2)
        in-process (CountDownLatch. 1)
        more-offered (CountDownLatch. 1)
        processed (atom [])
        done (CountDownLatch. 4)
        first? (atom true)
        q (make-single-item-queue
           pool
           (fn [_k item]
             (swap! processed conj item)
             (.countDown done)
             (when @first?
               (reset! first? false)
               (.countDown in-process)
               (.await more-offered 5 TimeUnit/SECONDS))))]
    (try
      (wq/offer-work q :k 1)
      (is (.await in-process 5 TimeUnit/SECONDS))
      (wq/offer-work q :k 2)
      (wq/offer-work q :k 3)
      (wq/offer-work q :k 4)
      (.countDown more-offered)
      (is (.await done 10 TimeUnit/SECONDS))
      (is (= [1 2 3 4] @processed))
      (finally
        (.shutdown pool)))))

(deftest empty-removes-entry-test
  (let [pool (Executors/newFixedThreadPool 4)
        groups 5
        n 10
        latch (CountDownLatch. (* groups n))
        q (make-drain-queue pool (fn [_k _item] (.countDown latch)))]
    (try
      (doseq [g (range groups)
              i (range n)]
        (wq/offer-work q g i))
      (is (.await latch 5 TimeUnit/SECONDS))
      ;; The finally block for the last drained worker still needs to run.
      (let [deadline (+ (System/currentTimeMillis) 5000)]
        (while (and (pos? (limiter-size q))
                    (< (System/currentTimeMillis) deadline))
          (Thread/sleep 10)))
      (is (zero? (limiter-size q)))
      (finally
        (.shutdown pool)))))

(deftest exception-in-process-fn-test
  ;; A throwing process-fn should not lock the key or kill the worker.
  ;; Items offered after the poison item must still get processed.
  (let [pool (Executors/newFixedThreadPool 2)
        processed (atom [])
        items-done (CountDownLatch. 4)
        q (make-drain-queue pool
                            (fn [_k item]
                              (when (= item :poison)
                                (throw (ex-info "boom" {})))
                              (swap! processed conj item)
                              (.countDown items-done)))]
    (try
      (wq/offer-work q :k 1)
      (wq/offer-work q :k :poison)
      (wq/offer-work q :k 2)
      (wq/offer-work q :k 3)
      (wq/offer-work q :k 4)
      (is (.await items-done 5 TimeUnit/SECONDS))
      (is (= [1 2 3 4] @processed))
      (finally
        (.shutdown pool)))))

(deftest concurrent-producers-no-loss-test
  (let [pool (Executors/newFixedThreadPool 8)
        n-keys 16
        per-producer 100
        n-producers 8
        expected (* n-keys per-producer n-producers)
        processed (AtomicInteger. 0)
        per-key (ConcurrentHashMap.)
        append-bif (fn [item]
                     (reify BiFunction
                       (apply [_ _ v] (conj (or v []) item))))
        q (make-drain-queue pool
                            (fn [k item]
                              (.compute per-key k (append-bif item))
                              (.incrementAndGet processed)))]
    (try
      (let [fs (doall (for [p (range n-producers)]
                        (future
                          (doseq [k (range n-keys)
                                  i (range per-producer)]
                            (wq/offer-work q k {:p p :i i})))))]
        (run! deref fs))
      (let [deadline (+ (System/currentTimeMillis) 30000)]
        (while (and (< (.get processed) expected)
                    (< (System/currentTimeMillis) deadline))
          (Thread/sleep 10)))
      (is (= expected (.get processed)))
      (doseq [k (range n-keys)]
        (let [items (.get per-key k)]
          (doseq [p (range n-producers)]
            (is (= (range per-producer)
                   (map :i (filter #(= p (:p %)) items)))
                (str "key " k ", producer " p)))))
      (finally
        (.shutdown pool)))))

(deftest fairness-test
  ;; Single-thread pool, single-item processing. The queue's order-q is FIFO,
  ;; and after each item we requeue if the key isn't empty — so the alternation
  ;; :a :b :a :b … falls out of strict FIFO scheduling between keys.
  (let [pool (Executors/newSingleThreadExecutor)
        q-promise (promise)
        processed (atom [])
        stopping? (atom false)
        stopped (promise)
        q (make-single-item-queue
           pool
           (fn [k _item]
             (when-not @stopping?
               (let [seen (swap! processed conj k)]
                 (if (>= (count seen) 5)
                   (do
                     (reset! stopping? true)
                     (deliver stopped true))
                   (do
                     (wq/offer-work @q-promise :b 1)
                     (wq/offer-work @q-promise :a 1)))))))]
    (deliver q-promise q)
    (try
      (wq/offer-work q :a 1)
      (is (not= ::timeout (deref stopped 5000 ::timeout)))
      (is (= [:a :b :a :b :a] (take 5 @processed)))
      (finally
        (.shutdownNow pool)))))
