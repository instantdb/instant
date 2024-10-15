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
   :main-queue (LinkedBlockingQueue.)})

(defn size [{:keys [size] :as _grouped-q}]
  (.get size))

(defn add! [{:keys [group-fn main-queue group-key->subqueue size]
             :as _grouped-q} item]
  (let [group-key (group-fn item)]
    (if (nil? group-key)
      ;; This item is not to be grouped.
      (do (.incrementAndGet size)
          (.put main-queue [:item item]))

      ;; This item will be grouped on `group-key` 
      (let [_ (.incrementAndGet size)
            [prev] (swap-vals! group-key->subqueue
                               update
                               group-key
                               (fn [subqueue]
                                 (conj (or subqueue empty-q)
                                       item)))
            prev-subqueue (get prev group-key)
            first-enqueue? (empty? prev-subqueue)]
        (when first-enqueue?
          (.put main-queue [:group-key group-key]))))))

(defn peek [{:keys [main-queue group-key->subqueue] :as _grouped-q}]
  (let [[t arg :as entry] (.peek main-queue)]
    (cond
      (nil? entry) nil
      (= t :item) arg
      (= t :group-key) (first (get @group-key->subqueue arg)))))

(defn process-polling!
  ([gq process-fn] (process-polling! gq process-fn {:poll-ms 1000}))
  ([{:keys [main-queue group-key->subqueue size] :as _grouped-q}
    process-fn
    {:keys [poll-ms]}]
   (let [[t arg :as entry] (.poll main-queue poll-ms TimeUnit/MILLISECONDS)]
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
             (let [curr (swap! group-key->subqueue update group-key pop)
                   curr-subqueue (get curr group-key)]
               (.decrementAndGet size)
               (when (seq curr-subqueue)
                 (.put main-queue [:group-key group-key])))))
         true)))))

(comment
  (def gq (create {:group-fn :k}))
  (add! gq {:k :a})
  (add! gq {:k :a})
  (add! gq {:k :b})
  (add! gq {:not-grouped :c})
  (peek gq)
  (process-polling! gq println))
