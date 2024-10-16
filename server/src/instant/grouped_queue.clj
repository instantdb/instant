(ns instant.grouped-queue
  (:refer-clojure :exclude [peek])
  (:import
   (java.util.concurrent LinkedBlockingQueue TimeUnit)
   (java.util.concurrent.atomic AtomicInteger)
   (clojure.lang PersistentQueue)))

;; ----------- 
;; inflight-queue

(def persisted-q-empty PersistentQueue/EMPTY)

(def inflight-queue-empty
  {:pending persisted-q-empty
   :working []})

(defn inflight-queue-put [inflight-queue item]
  (update inflight-queue :pending conj item))

(defn inflight-queue-empty? [{:keys [pending working] :as _inflight-queue}]
  (and (empty? pending) (empty? working)))

(defn inflight-queue-pop [{:keys [pending working]}]
  {:pending (pop pending)
   :working (if-let [item (first pending)]
              (conj working item)
              working)})

(defn inflight-queue-workset [{:keys [working]}]
  working)

(defn inflight-queue-workset-clear [inflight-queue]
  (assoc inflight-queue :working []))

(defn inflight-queue-peek-pending [{:keys [pending] :as _inflight-queue}]
  (first pending))

(defn inflight-queue-drain [{:keys [pending working]}]
  {:pending persisted-q-empty
   :working (into working pending)})

;; ----------- 
;; grouped-queue

(defn create [{:keys [group-fn]}]
  {:size (AtomicInteger. 0)
   :group-fn group-fn
   :group-key->subqueue (atom {})
   :dispatch-queue (LinkedBlockingQueue.)})

(defn size [{:keys [size] :as _grouped-q}]
  (.get size))

(defn put! [{:keys [group-fn dispatch-queue group-key->subqueue size]
             :as _grouped-q} item]
  (let [group-key (group-fn item)]
    (if (nil? group-key)
      ;; This item is not to be grouped.
      (do (.incrementAndGet size)
          (.put dispatch-queue [:item item]))

      ;; This item will be grouped on `group-key` 
      (let [_ (.incrementAndGet size)
            [prev] (locking group-key->subqueue
                     (swap-vals! group-key->subqueue
                                 update
                                 group-key
                                 (fnil inflight-queue-put inflight-queue-empty)
                                 item))
            prev-subqueue (get prev group-key)
            first-enqueue? (inflight-queue-empty? prev-subqueue)]
        (when first-enqueue?
          (.put dispatch-queue [:group-key group-key]))))))

(defn peek [{:keys [dispatch-queue group-key->subqueue] :as _grouped-q}]
  (let [[t arg :as entry] (.peek dispatch-queue)]
    (cond
      (nil? entry) nil
      (= t :item) arg
      (= t :group-key) (inflight-queue-peek-pending (get @group-key->subqueue arg)))))

(defn default-reserve-fn [_ inflight-q] (inflight-queue-pop inflight-q))

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
  (let [[t arg :as entry] (.poll dispatch-queue poll-ms TimeUnit/MILLISECONDS)]
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
                (.put dispatch-queue [:group-key group-key])))))))))

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
                                       (inflight-queue-drain inflight-queue)
                                       (inflight-queue-pop inflight-queue)))

                       :process-fn (fn [k workset]
                                     (println "processing..." k workset)
                                     #_(Thread/sleep 10000)
                                     (println "done"))})))

