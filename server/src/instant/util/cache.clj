(ns instant.util.cache
  (:require
   [clojure.core.cache :as c :refer [CacheProtocol defcache]]
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
  (atom (c/seed (MultiEvictLRUCache. {}
                                     (priority-map/priority-map)
                                     {}
                                     mapping-fn
                                     0
                                     threshold)
                    base)))

(def ^{:private true} default-wrapper-fn #(%1 %2))

;; Copy of `clojure.core.cache.wrapped`, but evicts errors.
;; The default will keep the error in the cache forever, for example
;; (wrapped/lookup-or-miss cache :k (fn [_] (throw (Exception. "oops"))))
;; => (wrapped/lookup cache :k) => throws
;; (lookup-or-miss cache :k (fn [_] (throw (Exception. "oops"))))
;; => (wrapped/lookup cache :k) => nil
(defn lookup-or-miss
  "Retrieve the value associated with `e` if it exists, else compute the
  value (using value-fn, and optionally wrap-fn), update the cache for `e`
  and then perform the lookup again.

  value-fn (and wrap-fn) will only be called (at most) once even in the
  case of retries, so there is no risk of cache stampede.

  Since lookup can cause invalidation in some caches (such as TTL), we
  trap that case and retry (a maximum of ten times)."
  ([cache-atom e value-fn]
   (lookup-or-miss cache-atom e default-wrapper-fn value-fn))
  ([cache-atom e wrap-fn value-fn]
   (let [d-new-value (delay (wrap-fn value-fn e))
         res (loop [n 0
                    v (c/lookup (swap! cache-atom
                                       c/through-cache
                                       e
                                       default-wrapper-fn
                                       (fn [_] d-new-value))
                                e
                                ::expired)]
               (when (< n 10)
                 (if (= ::expired v)
                   (recur (inc n)
                          (c/lookup (swap! cache-atom
                                           c/through-cache
                                           e
                                           default-wrapper-fn
                                           (fn [_] d-new-value))
                                    e
                                    ::expired))
                   v)))]
     (if (identical? res d-new-value)
       (try
         (force res)
         (catch Throwable t
           (swap! cache-atom
                  (fn [a]
                    (if (and (c/has? a e)
                             (identical? d-new-value (c/lookup a e)))
                      (c/evict a e)
                      a)))
           (throw t)))
       (force res)))))

(defn lookup-or-miss-batch
  "Like lookup-or-miss, but takes a coll of keys and returns a map
   of key to result.
   Expects batch-value-fn to take a list of keys that are missing
   from the cache and return a map of key to result."
  [cache-atom es batch-value-fn]
  (let [results (volatile! {})
        our-results (volatile! #{})
        _a (locking cache-atom
             (swap! cache-atom (fn [a]
                                 (let [{:keys [missing a]}
                                       (reduce (fn [acc e]
                                                 (let [existing (c/lookup a e ::not-found)]
                                                   (if (= ::not-found existing)
                                                     (update acc :missing conj e)
                                                     (do
                                                       ;; exisiting will be a delay
                                                       (vswap! results assoc e existing)
                                                       (update acc :a c/hit e)))))
                                               {:missing #{}
                                                :a a}
                                               (set es))

                                       new-values (when (seq missing)
                                                    (delay (batch-value-fn missing)))]
                                   (reduce (fn [a e]
                                             (let [v (delay (get @new-values e))]
                                               (vswap! our-results conj v)
                                               (vswap! results assoc e v)
                                               (c/miss a e v)))
                                           a
                                           missing)))))

        ;; Force all of the results and evict any errors that we put in the cache
        res (reduce-kv (fn [acc e v]
                         (let [result (try
                                        {:type :ok
                                         :result (force v)}
                                        (catch Throwable t
                                          (when (contains? @our-results v)
                                            (swap! cache-atom
                                                   (fn [a]
                                                     (if (and (c/has? a e)
                                                              (contains? @our-results (c/lookup a e)))
                                                       (c/evict a e)
                                                       a))))
                                          {:type :error
                                           :error t}))]
                           (case (:type acc)
                             :ok (case (:type result)
                                   :ok (update acc :result assoc e (:result result))
                                   :error {:type :error :error (:error result)})
                             :error (case (:type result)
                                      :ok acc
                                      :error (update acc :error (fn [^Throwable t]
                                                                  (.addSuppressed t (:error result))))))))
                       {:type :ok
                        :result {}}
                       @results)]
    (case (:type res)
      :error (throw (:error res))
      :ok (:result res))))
