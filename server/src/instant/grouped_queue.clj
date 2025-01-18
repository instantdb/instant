(ns instant.grouped-queue
  (:refer-clojure :exclude [peek])
  (:require
   [instant.util.async :as ua]
   [instant.util.tracer :as tracer])
  (:import
   (java.util.concurrent ConcurrentLinkedQueue Semaphore)
   (java.util.concurrent.atomic AtomicInteger)
   (clojure.lang PersistentQueue)))

;; --------------
;; inflight-queue

(def persisted-q-empty PersistentQueue/EMPTY)

(defn pop-times [n coll]
  (reduce (fn [coll _] (pop coll)) coll (range n)))

(comment
  (def x (into persisted-q-empty [1 2 3]))
  (pop-times 2 x)
  (take 2 x))

(def inflight-queue-empty
  {:pending persisted-q-empty
   :working []})

(defn inflight-queue-put [inflight-queue item]
  (update inflight-queue :pending conj item))

(defn inflight-queue-empty? [{:keys [pending working] :as _inflight-queue}]
  (and (empty? pending) (empty? working)))

(defn inflight-queue-workset [{:keys [working]}]
  working)

(defn inflight-queue-workset-clear [inflight-queue]
  (assoc inflight-queue :working []))

(defn inflight-queue-peek-pending [{:keys [pending] :as _inflight-queue}]
  (first pending))

(defn inflight-queue-reserve [max-items {:keys [pending working]}]
  {:pending (pop-times max-items pending)
   :working (into working (take max-items pending))})

(defn inflight-queue-reserve-all [{:keys [pending working]}]
  {:pending persisted-q-empty
   :working (into working pending)})

;; -------------
;; grouped-queue

(defn create [{:keys [group-fn
                      on-add]}]
  {:size (AtomicInteger. 0)
   :group-fn group-fn
   :group-key->subqueue (atom {})
   :dispatch-queue (ConcurrentLinkedQueue.)
   :on-add on-add})

(defn size [{:keys [^AtomicInteger size] :as _grouped-q}]
  (.get size))

(defn put! [{:keys [group-fn
                    ^ConcurrentLinkedQueue dispatch-queue
                    group-key->subqueue
                    ^AtomicInteger size
                    on-add]
             :as _grouped-q} item]
  (let [group-key (group-fn item)
        added (if (nil? group-key)
                ;; This item is not to be grouped.
                (do (.incrementAndGet size)
                    (.add dispatch-queue [:item item]))

                ;; This item will be grouped on `group-key`
                (let [_ (.incrementAndGet size)
                      [prev] (locking group-key->subqueue
                               (swap-vals! group-key->subqueue
                                           update
                                           group-key
                                           (fnil inflight-queue-put
                                                 inflight-queue-empty)
                                           item))
                      prev-subqueue (get prev group-key)
                      first-enqueue? (inflight-queue-empty? prev-subqueue)]
                  (when first-enqueue?
                    (.add dispatch-queue [:group-key group-key]))))]
    (when (and added on-add)
      (on-add))
    added))

(defn peek [{:keys [^ConcurrentLinkedQueue dispatch-queue
                    group-key->subqueue] :as _grouped-q}]
  (let [[t arg :as entry] (.peek dispatch-queue)]
    (cond
      (nil? entry) nil
      (= t :item) arg
      (= t :group-key) (inflight-queue-peek-pending (get @group-key->subqueue arg)))))

(defn default-reserve-fn [_ inflight-q] (inflight-queue-reserve 1 inflight-q))

(defn clear-subqueue [state group-key]
  (let [subqueue (get state group-key)
        cleared-subqueue (inflight-queue-workset-clear subqueue)]
    (if (inflight-queue-empty? cleared-subqueue)
      (dissoc state group-key)
      (assoc state group-key cleared-subqueue))))

(defn process!
  [{:keys [^ConcurrentLinkedQueue dispatch-queue
           group-key->subqueue
           ^AtomicInteger size] :as _grouped-q}
   {:keys [reserve-fn
           process-fn]
    :or {reserve-fn default-reserve-fn}}]
  (let [[t arg :as entry] (.poll dispatch-queue)]
    (cond
      (nil? entry) nil

      (= t :item)
      (do
        (process-fn nil [arg])
        (.decrementAndGet size)
        true)

      (= t :group-key)
      (let [group-key arg

            reserved (locking group-key->subqueue
                       (swap! group-key->subqueue update group-key (partial reserve-fn group-key)))

            reserved-subqueue (get reserved group-key)

            workset (inflight-queue-workset reserved-subqueue)]

        (try
          (process-fn group-key workset)
          true
          (finally
            (let [cleared (locking group-key->subqueue
                            (swap! group-key->subqueue clear-subqueue group-key))
                  cleared-subqueue (get cleared group-key)]
              (.addAndGet size (- (count workset)))
              (when (inflight-queue-peek-pending cleared-subqueue)
                (.add dispatch-queue [:group-key group-key])))))))))

(defn start-grouped-queue-with-workers [{:keys [group-fn
                                                reserve-fn
                                                process-fn
                                                max-workers]
                                         :or {max-workers 2}}]
  (let [executor (ua/make-virtual-thread-executor)
        workers (atom #{})
        ;; Use a promise so we can access it in the `on-add` function
        grouped-queue (promise)
        on-add (fn []
                 (when (< (count @workers) max-workers)
                   (ua/worker-vfuture
                    executor
                    (loop [worker-id (Object.)]
                      (when (contains? (swap! workers
                                              (fn [workers]
                                                (if (= (count workers) max-workers)
                                                  workers
                                                  (conj workers worker-id))))
                                       worker-id)
                        (try
                          (loop []
                            (when (process! @grouped-queue {:reserve-fn reserve-fn
                                                            :process-fn process-fn})
                              ;; Continue processing items until the queue is empty
                              (recur)))
                          (catch Throwable t
                            (tracer/record-exception-span! t {:name "grouped-queue/process-error"}))
                          (finally
                            (swap! workers disj worker-id)))
                        ;; One last check to prevent a race where something is added to the queue
                        ;; while we're removing ourselves from the workers
                        (when (and (peek @grouped-queue)
                                   (< (count @workers) max-workers))
                          (recur worker-id)))))))]
    (deliver grouped-queue (create {:group-fn group-fn
                                    :on-add on-add}))
    {:grouped-queue @grouped-queue
     :get-worker-count (fn [] (count @workers))
     :virtual-thread-executor executor}))

(defn start-grouped-queue-with-cpu-workers [{:keys [group-fn
                                                    reserve-fn
                                                    process-fn
                                                    worker-count]
                                             :or {worker-count 2}}]
  (let [executor (ua/make-virtual-thread-executor)
        semaphore (Semaphore. 0)
        grouped-queue (create {:group-fn group-fn
                               :on-add (fn []
                                         (.release semaphore))})
        shutdown? (atom false)
        workers (mapv (fn [_i]
                        (future
                          (loop []
                            (.acquire semaphore)
                            (when-not @shutdown?
                              (try
                                (loop []
                                  (when (process! grouped-queue {:reserve-fn reserve-fn
                                                                 :process-fn process-fn})
                                    (recur)))
                                (catch Throwable t
                                  (tracer/record-exception-span! t {:name "grouped-queue-with-cpu-workers/process-error"})))
                              (recur)))))
                      (range worker-count))]
    {:grouped-queue grouped-queue
     :get-worker-count (fn [] worker-count)
     :workers workers
     :shutdown (fn []
                 (reset! shutdown? true)
                 (.release semaphore (* 2 worker-count))
                 (doseq [w workers]
                   (when (= :timeout (deref w 1000 :timeout))
                     (future-cancel w))))}))

(comment
  (def gq (create {:group-fn :k}))
  (put! gq {:k :refresh})
  (put! gq {:k :refresh})
  (put! gq {:k :add-query})
  (put! gq {:k :refresh})
  (put! gq {:k :remove-query})
  (peek gq)
  gq
  (future
    (process! gq
              {:reserve-fn (fn [group-key inflight-queue]
                             (if (= group-key :refresh)
                               (inflight-queue-reserve-all inflight-queue)
                               (inflight-queue-reserve 1 inflight-queue)))

               :process-fn (fn [k workset]
                             (println "processing..." k workset)
                             #_(Thread/sleep 10000)
                             (println "done"))}))

  (require 'clojure.tools.logging)

  (defn test-grouped-queue []
    (let [finished (promise)
          started (promise)
          total-items (AtomicInteger. 0)
          process-total (AtomicInteger. 0)
          gq (promise)
          q (start-grouped-queue-with-workers
             {:group-fn :k
              :reserve-fn (fn [_ iq]
                            (inflight-queue-reserve (max 1 (rand-int 25)) iq))
              :process-fn (fn [_ workset]
                            @started
                            (clojure.tools.logging/info {:name "workset"
                                                         :attributes {:workset-count (count workset)
                                                                      :total total-items
                                                                      :worker-count ((:get-worker-count @gq))}})
                            (.addAndGet process-total (count workset))
                            (when (zero? (.addAndGet total-items (- (count workset))))
                              (deliver finished true))
                            nil)
              :max-workers 1000})
          _ (deliver gq q)

          wait (future
                 @started
                 (let [start (. System (nanoTime))

                       _ @finished
                       end (. System (nanoTime))
                       ms (/ (double (- end start)) 1000000.0)]
                   (tool/def-locals)
                   (println (format "Elapsed %.2fms, total %d, %.2f / ms"
                                    ms
                                    (.get process-total)
                                    (/ (.get process-total) ms)))))]
      (dotimes [x 100]
        (dotimes [y 100000]
          (.incrementAndGet total-items)
          (put! (:grouped-queue q) {:k y :i x})))
      (deliver started true)
      (tool/def-locals)
      @wait))

  (test-grouped-queue)

  (defn test-cpu-grouped-queue []
    (let [finished (promise)
          started (promise)
          total-items (AtomicInteger. 0)
          process-total (AtomicInteger. 0)
          gq (promise)
          q (start-grouped-queue-with-cpu-workers
             {:group-fn :k
              :reserve-fn (fn [_ iq]
                            (inflight-queue-reserve (max 1 (rand-int 25)) iq))
              :process-fn (fn [_ workset]
                            @started
                            (clojure.tools.logging/info {:name "workset"
                                                         :attributes {:workset-count (count workset)
                                                                      :total total-items
                                                                      :worker-count ((:get-worker-count @gq))}})
                            (.addAndGet process-total (count workset))
                            (when (zero? (.addAndGet total-items (- (count workset))))
                              (deliver finished true))
                            nil)
              :worker-count 8})
          _ (deliver gq q)

          wait (future
                 @started
                 (let [start (. System (nanoTime))

                       _ @finished
                       end (. System (nanoTime))
                       ms (/ (double (- end start)) 1000000.0)]
                   (tool/def-locals)
                   (println (format "Elapsed %.2fms, total %d, %.2f / ms"
                                    ms
                                    (.get process-total)
                                    (/ (.get process-total) ms)))))]
      (dotimes [x 100]
        (dotimes [y 10000]
          (.incrementAndGet total-items)
          (put! (:grouped-queue q) {:k y :i x})))
      (deliver started true)
      (tool/def-locals)
      @wait
      ((:shutdown q)))))
