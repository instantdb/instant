(ns instant.grouped-queue-test
  (:require
   [clojure.test :refer [deftest testing is]]
   [instant.grouped-queue :as grouped-queue])
  (:import
   (java.util.concurrent CountDownLatch Executors)))

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

(deftest basic-test
  (doseq [opts (make-opts)]
    (testing (pr-str opts)
      (let [input (for [group groups
                        id    ids]
                    {:group group :id id})
            output (atom [])
            q (grouped-queue/start
               (merge
                {:group-key-fn :group
                 :process-fn   (fn [_group item]
                                 (swap! output conj item))}
                opts))]
        (try
          (doseq [item input]
            (grouped-queue/put! q item))
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
                {:group-key-fn :group
                 :combine-fn   (fn [item1 item2]
                                 (when (= (:id item2) (inc (:id item1)))
                                   item2))
                 :process-fn   (fn [_group item]
                                 (swap! output conj item))}
                opts))]
        (try
          (doseq [item input]
            (grouped-queue/put! q item))
          (finally
            (is (= :shutdown (grouped-queue/stop q {:timeout-ms 1000})))
            (doseq [group groups
                    :let [filtered  (filterv #(= group (:group %)) @output)
                          processed (transduce (map #(::grouped-queue/combined % 1)) + 0 filtered)]]
              (when-not (= (count ids) processed)
                (println group (count ids) processed filtered))
              (testing group
                (is (= (count ids) processed))))))))))

(deftest thread-pool-size-test
  (let [input (for [group [1 2 3 4 5]
                    id    (range 100)]
                {:group group :id id})
        latch (CountDownLatch. 500)
        q     (grouped-queue/start
               {:group-key-fn :group
                :max-workers  10
                :process-fn   (fn [_group _item]
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
