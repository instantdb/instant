(ns instant.grouped-queue
  (:import
   (java.util.concurrent LinkedBlockingQueue TimeUnit)
   (clojure.lang PersistentQueue)))

(def empty-q PersistentQueue/EMPTY)

(defn create [group-fn]
  {:group-fn group-fn
   :group-key->subqueue (atom {})
   :main-queue (LinkedBlockingQueue.)})

(defn enqueue! [{:keys [group-fn main-queue group-key->subqueue]
                 :as _grouped-q} item]
  (let [group-key (group-fn item)]
    (if (nil? group-key)
      ;; This item is not to be grouped.
      (.put main-queue [:item item])
      ;; This item will be grouped on `group-key` 
      (let [[prev] (swap-vals! group-key->subqueue
                               update
                               group-key
                               (fn [subqueue]
                                 (conj (or subqueue empty-q)
                                       item)))
            prev-subqueue (get prev group-key)
            first-enqueue? (empty? prev-subqueue)]
        (when first-enqueue?
          (.put main-queue [:group-key group-key]))))))

(defn process-polling! [{:keys [main-queue group-key->subqueue]
                         :as _grouped-q} process-fn]
  (let [[t arg :as entry] (.poll main-queue 1000 TimeUnit/MILLISECONDS)]
    (cond
      (nil? entry) nil

      (= t :item)
      (process-fn arg)
      (= t :group-key)
      (let [group-key arg
            item (first (get @group-key->subqueue group-key))]
        (try
          (process-fn item)
          (finally
            (let [curr (swap! group-key->subqueue update group-key pop)
                  curr-subqueue (get curr group-key)]
              (when (seq curr-subqueue)
                (.put main-queue [:group-key group-key])))))))))

(comment
  (def gq (create :k))
  (enqueue! gq {:k :a})
  (enqueue! gq {:k :a})
  (enqueue! gq {:k :b})
  (enqueue! gq {:not-grouped :c})
  (process-polling! gq println))
