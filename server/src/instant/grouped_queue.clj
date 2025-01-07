(ns instant.grouped-queue
  (:refer-clojure :exclude [peek])
  (:import
   (java.util.concurrent TimeUnit ConcurrentLinkedQueue)
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

(defn size [{:keys [size] :as _grouped-q}]
  (.get size))

(defn put! [{:keys [group-fn dispatch-queue group-key->subqueue size on-add]
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

(defn peek [{:keys [dispatch-queue group-key->subqueue] :as _grouped-q}]
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

(defn process-polling!
  [{:keys [dispatch-queue group-key->subqueue size] :as _grouped-q}
   {:keys [reserve-fn
           process-fn
           poll-ms]
    :or {poll-ms 1000
         reserve-fn default-reserve-fn}}]
  (let [[t arg :as entry] (.poll dispatch-queue ;; poll-ms TimeUnit/MILLISECONDS
                                 )]
    (cond
      (nil? entry)
      (do
        (Thread/sleep 10)
        nil)

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

(defn process!
  [{:keys [dispatch-queue group-key->subqueue size] :as _grouped-q}
   {:keys [reserve-fn
           process-fn
           poll-ms]
    :or {poll-ms 1000
         reserve-fn default-reserve-fn}}]
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
  ;; XXX: How am I going to make sure that my worker doesn't die
  ;;      while I'm in the middle of an add??????
  (let [worker-count (AtomicInteger. 0)
        grouped-queue (promise)
        on-add (fn []
                 (println "ON ADD")
                 (if-not (< (.get worker-count) max-workers)
                   (println "TOO MANY WORKERS")
                   (let [worker-id (random-uuid)]
                     (.incrementAndGet worker-count)
                     (instant.util.async/vfuture
                       (try
                         (loop []
                           (when (process! @grouped-queue {:reserve-fn reserve-fn
                                                           :process-fn process-fn})
                             (recur)))
                         (catch Throwable t
                           (println "THROWABLE!!!!!!!!!!!!!!!!!" t))
                         (finally
                           (.decrementAndGet worker-count)))))))]
    (deliver grouped-queue (create {:group-fn group-fn
                                    :on-add on-add}))
    {:grouped-queue @grouped-queue
     :shutdown nil ;; XXX
     :worker-count worker-count}
    ))

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
    (process-polling! gq
                      {:reserve-fn (fn [group-key inflight-queue]
                                     (if (= group-key :refresh)
                                       (inflight-queue-reserve-all inflight-queue)
                                       (inflight-queue-reserve 1 inflight-queue)))

                       :process-fn (fn [k workset]
                                     (println "processing..." k workset)
                                     #_(Thread/sleep 10000)
                                     (println "done"))})))

(defn test-grouped-queue []
  (let [q (create {:group-fn :k})
        finished (promise)
        total-items (AtomicInteger. 0)
        process-total (AtomicInteger. 0)
        wait (future
               (let [start (. System (nanoTime))
                     _ @finished
                     end (. System (nanoTime))
                     ms (/ (double (- end start)) 1000000.0)]
                 (tool/def-locals)
                 (println (format "Elapsed %.2fms, total %d, %.2f / ms"
                                  ms
                                  (.get process-total)
                                  (/ (.get process-total) ms)))))]
    (dotimes [x 10000]
      (dotimes [y 100]
        (.incrementAndGet total-items)
        (put! q {:k x :i y})))
    (tool/def-locals)
    (dotimes [x 100000]
      (instant.util.async/vfuture
        (loop []
          (when-not (realized? finished)
            (process-polling! q
                              {:reserve-fn (fn [k iq]
                                             (inflight-queue-reserve (max 1 (rand-int 25)) iq))
                               :process-fn (fn [_ workset]
                                             #_(dotimes [_ (rand-int 5)]
                                                 (.incrementAndGet total-items)
                                                 (put! q {:k (rand-int 10)}))
                                             (clojure.tools.logging/info "workset" (count workset) (.get total-items))
                                             (.addAndGet total-items (- (count workset)))
                                             (.addAndGet process-total (count workset))
                                             nil)})
            (when (zero? (.get total-items))
              (deliver finished true))
            (recur)))))
    @wait))
