(ns instant.grouped-queue-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [instant.grouped-queue :as grouped-queue]
   [instant.util.test :refer [wait-for]])
  (:import
   (java.time Duration Instant)
   (java.util.concurrent CountDownLatch Executors)
   (java.util.concurrent.atomic AtomicInteger)))

(def groups
  "abcdefghijklmnopqrstuvwxyz")

(def ids
  (range 1000))

(defn make-opts []
  [{}
   {:max-workers 1}
   {:max-workers 10}
   {:max-workers 100}
   {:executor (Executors/newSingleThreadExecutor)}
   {:executor (Executors/newFixedThreadPool 10)}
   {:executor (Executors/newCachedThreadPool)}
   {:executor (Executors/newVirtualThreadPerTaskExecutor)}])

(defn wait-for-queue-to-drain [q timeout]
  (let [wait-fut (future (while (not= 0 (AtomicInteger/.get (:num-items q)))
                           (Thread/sleep 1)))]
    (when (= ::timeout (deref wait-fut timeout ::timeout))
      (future-cancel wait-fut)
      (throw (Error. "timeout while waiting for queue to drain.")))))

(deftest basic-test
  (doseq [opts (make-opts)]
    (testing (pr-str opts)
      (let [input (for [group groups
                        id    ids]
                    {:group group :id id})
            output (atom [])
            q (grouped-queue/start
               (merge
                {:group-key-fn (fn [_ item]
                                 (:group item))
                 :process-fn (fn [_ctx _group item]
                               (swap! output conj item))}
                opts))]
        (try
          (doseq [item input]
            (grouped-queue/put! q item))
          (wait-for-queue-to-drain q 1000)
          (finally
            (is (= :shutdown (grouped-queue/stop q {:timeout-ms 1000})))
            (is (= (count @output) (* (count groups) (count ids))))
            (doseq [group groups
                    :let [filtered (filterv #(= group (:group %)) @output)]]
              (testing group
                (is (= ids (mapv :id filtered)))))))))))

(deftest combine-test
  (doseq [opts (make-opts)]
    (testing (pr-str opts)
      (let [input (for [group groups
                        id    ids]
                    {:group group :id id})
            output (atom [])
            q (grouped-queue/start
               (merge
                {:group-key-fn (fn [_ctx item]
                                 (:group item))
                 :combine-fn   (fn [_ item1 item2]
                                 (when (= (:id item2) (inc (:id item1)))
                                   item2))
                 :process-fn   (fn [_ _group item]
                                 (swap! output conj item))}
                opts))]
        (try
          (doseq [item input]
            (grouped-queue/put! q item))
          (wait-for-queue-to-drain q 1000)
          (finally
            (is (= :shutdown (grouped-queue/stop q {:timeout-ms 1000})))
            (doseq [group groups
                    :let [filtered  (filterv #(= group (:group %)) @output)
                          processed (transduce (map #(::grouped-queue/combined % 1)) + 0 filtered)]]
              (testing group
                (is (= (count ids) processed))))))))))

(deftest thread-pool-size-test
  (let [input (for [group [1 2 3 4 5]
                    id    (range 100)]
                {:group group :id id})
        latch (CountDownLatch. 500)
        q     (grouped-queue/start
               {:group-key-fn (fn [_ctx item]
                                (:group item))
                :max-workers  10
                :process-fn   (fn [_ctx _group _item]
                                (Thread/sleep 10)
                                (.countDown latch))})
        t0    (System/currentTimeMillis)]
    (try
      (doseq [item input]
        (grouped-queue/put! q item))
      (testing "put! is not blocked by execution"
        (is (< (- (System/currentTimeMillis) t0) 250)))
      ;; give threads a chance to start
      (Thread/sleep (- 500 (- (System/currentTimeMillis) t0)))
      (testing "More than 1 thread spawned, but no more than 1 per group"
        (is (<= 2 (grouped-queue/num-workers q) 5)))
      (.await latch)
      (testing "Total exec time more than 10 threads but less than 1 threads"
        (is (< 1000 (- (System/currentTimeMillis) t0) 5000)))
      (finally
        (grouped-queue/stop q)))))

(deftest the-queue-is-fair
  (let [q-promise (promise)
        processed (atom [])
        stopped (promise)
        q (grouped-queue/start
           {:group-key-fn (fn [_ctx item]
                            (:group item))
            :max-workers  1
            :process-fn   (fn [_ctx _group items]
                            (if (< 3 (count (swap! processed conj items)))
                              (do
                                (deliver stopped true)
                                (grouped-queue/stop @q-promise))
                              (do
                                (grouped-queue/put! @q-promise {:group 2})
                                (grouped-queue/put! @q-promise {:group 1}))))
            :error-fn     (fn [_ctx _])})]
    (deliver q-promise q)

    (grouped-queue/put! q {:group 1})

    (when (= ::timeout (deref stopped 1000 ::timeout))
      (throw (Error. "Timeout while waiting for queue to process")))

    (is (= (map :group @processed)
           [1 2 1 2]))))

(deftest throttle
  (let [throttled? (atom false)
        processed (atom [])
        q (grouped-queue/start
           {:group-key-fn (fn [_ctx item]
                            (:group item))

            :max-workers  1
            :process-fn   (fn [_ctx _group items]
                            (println "ITEMS" items)
                            (swap! processed conj {:items items
                                                   :time (Instant/now)})
                            (when-not @throttled?
                              (reset! throttled? true)
                              (grouped-queue/return-throttle 500)))
            :error-fn     (fn [_ctx _])})]

    (grouped-queue/put! q {:group 1})
    (grouped-queue/put! q {:group 1})
    (grouped-queue/put! q {:group 1})

    (wait-for (fn []
                (<= 3 (count @processed)))
              1000)

    (is (= 3 (count @processed)))

    (let [[a b c] @processed]
      (testing "throttles the next execution"
        (is (<= 500 (.toMillis (Duration/between (:time a)
                                                 (:time b))))))
      (testing "normal execution is still fast"
        (is (> 250 (.toMillis (Duration/between (:time b)
                                                (:time c)))))))))

;; ---------------------------------------------------------------------------
;; A group's items are drained by a self-rescheduling task chain: each pass
;; processes one item and re-executes itself while the group is non-empty, and
;; `put!` only starts a chain when the group does not exist yet. So if a pass
;; dies before rescheduling, the group stays registered, `put!` keeps offering
;; into it, and nothing ever drains it again -- the items leak for the life of
;; the process.
;;
;; Only `process-fn` was wrapped in a try. These tests throw from the two other
;; places a pass can die, using OutOfMemoryError because that is what does it in
;; production: it is an Error, so the `catch Exception` in `execute` does not
;; stop it either.

(defn- assert-group-still-drains [q output n]
  (wait-for-queue-to-drain q 5000)
  ;; The group must still be live: a fresh put after the failure is processed.
  (grouped-queue/put! q {:group "a" :id ::after})
  (wait-for-queue-to-drain q 5000)
  (is (some #(= ::after (:id %)) @output)
      "an item put after the failure must still be processed")
  (is (= n (count (filter #(number? (:id %)) @output)))
      "no item may be lost")
  (is (= 0 (AtomicInteger/.get (:num-workers q)))
      "worker count must return to zero"))

(deftest combine-fn-error-does-not-orphan-group
  (let [n      100
        output (atom [])
        thrown (atom false)
        q (grouped-queue/start
           {:group-key-fn (fn [_ item] (:group item))
            ;; poll runs combine-fn outside process-fn's try. Throw once, the
            ;; way an allocation failure while merging records would.
            :combine-fn   (fn [_ _item1 _item2]
                            (when (compare-and-set! thrown false true)
                              (throw (OutOfMemoryError. "simulated: combine-fn")))
                            nil)
            :process-fn   (fn [_ _group item] (swap! output conj item))
            :max-workers  1})]
    (try
      (doseq [id (range n)]
        (grouped-queue/put! q {:group "a" :id id}))
      (assert-group-still-drains q output n)
      (is @thrown "the test must actually have thrown")
      (finally
        (grouped-queue/stop q {:timeout-ms 1000})))))

(deftest reschedule-error-does-not-orphan-group
  (let [n         100
        output    (atom [])
        calls     (AtomicInteger. 0)
        delegate  (Executors/newSingleThreadExecutor)
        ;; Fail the SECOND execute only. The first is put!'s, which starts the
        ;; chain; the second is the chain rescheduling itself mid-drain, which
        ;; is the step that has to survive.
        ;; A full ExecutorService, because stop shuts the executor down.
        executor  (proxy [java.util.concurrent.AbstractExecutorService] []
                    (execute [task]
                      (if (= 2 (AtomicInteger/.incrementAndGet calls))
                        (throw (OutOfMemoryError. "simulated: execute"))
                        (.execute delegate task)))
                    (shutdown [] (.shutdown delegate))
                    (shutdownNow [] (.shutdownNow delegate))
                    (isShutdown [] (.isShutdown delegate))
                    (isTerminated [] (.isTerminated delegate))
                    (awaitTermination [t u] (.awaitTermination delegate t u)))
        q (grouped-queue/start
           {:group-key-fn (fn [_ item] (:group item))
            :process-fn   (fn [_ _group item]
                            (swap! output conj item)
                            ;; keep the group non-empty between passes
                            (Thread/sleep 1))
            :get-executor (fn [] executor)})]
    (try
      (doseq [id (range n)]
        (grouped-queue/put! q {:group "a" :id id}))
      (assert-group-still-drains q output n)
      (is (< 2 (AtomicInteger/.get calls)) "the failing execute must have been reached")
      (finally
        (grouped-queue/stop q {:timeout-ms 1000})))))
