(ns instant.grouped-queue
  (:import
   (java.util.concurrent LinkedBlockingQueue)
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

(defn process! [{:keys [main-queue group-key->subqueue]
                 :as _grouped-q} process-fn]
  (let [[t arg] (.take main-queue)]
    (case t
      :item
      (let [item arg]
        (process-fn item))
      :group-key
      (let [group-key arg
            [prev curr] (swap-vals! group-key->subqueue update group-key pop)
            prev-subqueue (get prev group-key)
            item (first prev-subqueue)
            curr-subqueue (get curr group-key)]
        (process-fn item)
        (when (seq curr-subqueue)
          (.put main-queue [:group-key group-key]))))))

(comment
  (def gq (create :k))
  (enqueue! gq {:k :a})
  (enqueue! gq {:k :a})
  (enqueue! gq {:k :b})
  (enqueue! gq {:not-grouped :c})
  (process! gq println))
