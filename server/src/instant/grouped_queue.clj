(ns instant.grouped-queue
  (:refer-clojure :exclude [peek])
  (:import
   (java.util.concurrent LinkedBlockingQueue TimeUnit)
   (java.util.concurrent.atomic AtomicInteger)
   (clojure.lang PersistentQueue)))

(def empty-q PersistentQueue/EMPTY)

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
                                 (fnil conj empty-q)
                                 item))
            prev-subqueue (get prev group-key)
            first-enqueue? (empty? prev-subqueue)]
        (when first-enqueue?
          (.put dispatch-queue [:group-key group-key]))))))

(defn peek [{:keys [dispatch-queue group-key->subqueue] :as _grouped-q}]
  (let [[t arg :as entry] (.peek dispatch-queue)]
    (cond
      (nil? entry) nil
      (= t :item) arg
      (= t :group-key) (first (get @group-key->subqueue arg)))))

(defn process-polling!
  ([gq process-fn] (process-polling! gq process-fn {:poll-ms 1000}))
  ([{:keys [dispatch-queue group-key->subqueue size] :as _grouped-q}
    process-fn
    {:keys [poll-ms]}]
   (let [[t arg :as entry] (.poll dispatch-queue poll-ms TimeUnit/MILLISECONDS)]
     (cond
       (nil? entry) nil

       (= t :item)
       (do
         (process-fn arg)
         (.decrementAndGet size)
         true)

       (= t :group-key)
       (let [group-key arg
             item (first (get @group-key->subqueue group-key))]
         (try
           (process-fn item)
           (finally
             (let [curr (locking group-key->subqueue
                          (swap! group-key->subqueue update group-key pop))
                   curr-subqueue (get curr group-key)]
               (.decrementAndGet size)
               (when (seq curr-subqueue)
                 (.put dispatch-queue [:group-key group-key])))))
         true)))))

(comment
  (def gq (create {:group-fn :k}))
  (put! gq {:k :a})
  (put! gq {:k :a})
  (put! gq {:k :b})
  (put! gq {:not-grouped :c})
  (peek gq)
  (process-polling! gq println))
