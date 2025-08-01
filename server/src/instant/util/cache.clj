(ns instant.util.cache
  (:require
   [clojure.core.cache :as cache :refer [CacheProtocol defcache]]
   [clojure.data.priority-map :as priority-map]
   [instant.util.coll :refer [disj-in]]))

(defn- build-leastness-queue
  [base start-at]
  (into (priority-map/priority-map) (for [[k _] base] [k start-at])))

(defprotocol MultiEvictLRUCacheImpl
  (evict-impl [this key]))

;; mapping-fn takes an result in the cache and returns a new cache key
;; n.b. the mapping-fn should return a key that doesn't overlap with a
;; key that could potentially be in the cache.
;; mapping is a hash map of {(mapping-fn cache-item) -> #{cache-keys}}
(defcache MultiEvictLRUCache [cache lru mapping mapping-fn tick limit]
  CacheProtocol
  (lookup [_ item]
    (get cache item))
  (lookup [_ item not-found]
    (get cache item not-found))
  (has? [_ item]
    (contains? cache item))
  (hit [_ item]
    (let [tick+ (inc tick)]
      (MultiEvictLRUCache. cache
                           (if (contains? cache item)
                             (assoc lru item tick+)
                             lru)
                           mapping
                           mapping-fn
                           tick+
                           limit)))
  (miss [_ item result]
    (let [tick+ (inc tick)]
      (if (>= (count lru) limit)
        (let [k (if (contains? lru item)
                  item
                  (first (peek lru))) ;; minimum-key, maybe evict case
              c (-> cache (dissoc k) (assoc item result))
              l (-> lru (dissoc k) (assoc item tick+))
              m (-> mapping
                    (disj-in [(mapping-fn (get cache k))] k)
                    (update (mapping-fn result) (fnil conj #{}) item))]
          (MultiEvictLRUCache. c l m mapping-fn tick+ limit))
        (MultiEvictLRUCache. (assoc cache item result) ;; no change case
                             (assoc lru item tick+)
                             (update mapping (mapping-fn result) (fnil conj #{}) item)
                             mapping-fn
                             tick+
                             limit))))
  (evict [this key]
    (if (contains? cache key)
      (evict-impl this key)
      (if-let [keys (get mapping key)]
        (reduce evict-impl
                this
                keys)
        this)))
  (seed [_ base]
    (MultiEvictLRUCache. base
                         (build-leastness-queue base 0)
                         (reduce-kv (fn [m k v]
                                      (update m (mapping-fn v) (fnil conj #{}) k))
                                    {}
                                    base)
                         mapping-fn
                         0
                         limit))

  MultiEvictLRUCacheImpl
  (evict-impl [_ key]
    (MultiEvictLRUCache. (dissoc cache key)
                         (dissoc lru key)
                         (disj-in mapping
                                  [(mapping-fn (get cache key))]
                                  key)
                         mapping-fn
                         (inc tick)
                         limit))

  Object
  (toString [_]
    (str cache \, \space lru \, \space mapping \, \space tick \, \space limit)))

(defn multi-evict-lru-cache-factory
  "Returns a MultiEvictLRU cache with the cache and usage-table
  initialized to `base` -- each entry is initialized with the same
  usage value.

  Takes a `mapping-fn` that will be applied to the item in the
  cache. The return value of mapping-fn can be used as an alternative
  key for evicting the item from the cache.

  Takes a `:threshold` argument that defines the maximum number of
  elements in the cache before the LRU semantics apply"
  [base mapping-fn threshold]
  {:pre [(number? threshold) (< 0 threshold)]}
  (atom (cache/seed (MultiEvictLRUCache. {}
                                         (priority-map/priority-map)
                                         {}
                                         mapping-fn
                                         0
                                         threshold)
                    base)))
