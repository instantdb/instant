(ns instant.util.cache
  (:refer-clojure :exclude [get])
  (:import
   [com.github.benmanes.caffeine.cache AsyncLoadingCache AsyncCache Cache Caffeine LoadingCache Policy$Eviction]
   [com.github.benmanes.caffeine.cache.stats CacheStats]
   [java.lang Iterable]
   [java.time Duration]
   [java.util OptionalLong]
   [java.util.concurrent CompletableFuture]
   [java.util.function Function]))

(defn make
  ":max-size   <number>
   :max-weight <number>          must be used with :weigher
   :weigher    <fn [k v]>        must be used with :max-weight
   :ttl        <number>          eviction time, ms
   :on-remove  <fn [k v cause]>  removal listener
   :value-fn   <fn [k]>          if provided, you can use get/2"
  ^Cache [{:keys [value-fn max-size max-weight weigher ttl on-remove]}]
  (cond-> (Caffeine/newBuilder)
    max-size       (.maximumSize max-size)
    max-weight     (.maximumWeight max-weight)
    weigher        (.weigher weigher)
    ttl            (.expireAfterWrite (Duration/ofMillis ttl))
    on-remove      (.removalListener on-remove)
    value-fn       (.build value-fn)
    (not value-fn) (Caffeine/.build)))

(defn make-async
  ":max-size   <number>
   :max-weight <number>          must be used with :weigher
   :weigher    <fn [k v]>        must be used with :max-weight
   :ttl        <number>          eviction time, ms
   :on-remove  <fn [k v cause]>  removal listener
   :executor   <Executor>        executor to use for async tasks"
  ^AsyncLoadingCache [{:keys [max-size
                              max-weight
                              weigher ttl
                              on-remove
                              executor
                              record-stats]}]
  (cond-> (Caffeine/newBuilder)
    max-size   (.maximumSize max-size)
    max-weight (.maximumWeight max-weight)
    weigher    (.weigher weigher)
    ttl        (.expireAfterWrite (Duration/ofMillis ttl))
    on-remove  (.removalListener on-remove)
    executor   (.executor executor)
    record-stats (.recordStats)
    true       (Caffeine/.buildAsync)))

(defn invalidate
  "Discards any cached value for the key. The behavior of this operation is
   undefined for an entry that is being loaded (or reloaded) and is otherwise
   not present"
  [^Cache cache key]
  (when (some? key)
    (.invalidate cache key)))

(defn invalidate-async
  "Discards any cached value for the key. The behavior of this operation is
   undefined for an entry that is being loaded (or reloaded) and is otherwise
   not present"
  ^Void [^AsyncCache cache key]
  (when (some? key)
    (.invalidate (.synchronous cache) key)))

(defn invalidate-all
  "invalidate-all/1 invalidates all keys.
   invalidate-all/2 invalidates only passed keys."
  ([^Cache cache]
   (.invalidateAll cache))
  ([^Cache cache keys]
   (when-some [keys' (not-empty (filter some? keys))]
     (.invalidateAll cache keys'))))

(defn invalidate-all-async
  "invalidate-all/1 invalidates all keys.
   invalidate-all/2 invalidates only passed keys."
  ([^AsyncCache cache]
   (.invalidateAll (.synchronous cache)))
  ([^AsyncCache cache keys]
   (when-some [keys' (not-empty (filter some? keys))]
     (.invalidateAll (.synchronous cache) keys'))))

(defn reset
  "Invalidates the entire cache."
  [^Cache cache]
  (.invalidateAll cache))

(defn get
  "Returns the value associated with the key in this cache, obtaining that value
   from the mappingFunction if necessary. This method provides a simple substitute
   for the conventional “if cached, return; otherwise create, cache and return” pattern.

   Use get/2 if cache was created with :value-fn. get/3 works either way."
  ([^LoadingCache cache key]
   (when (some? key)
     (.get cache key)))
  ([^Cache cache key value-fn]
   (when (some? key)
     (.get cache key value-fn))))

(defn get-async
  "Returns a completeable future with the value associated with the key
   in this async cache. This method provides a simple substitute for the
   conventional “if cached, return; otherwise create, cache and return”
   pattern."
  ^CompletableFuture [^AsyncLoadingCache cache key ^Function value-fn]
  (if (some? key)
    (.get cache key value-fn)
    (CompletableFuture/completedFuture nil)))

(defn get-if-present
  "Returns the value associated with the key in this cache, or null if there is no cached value for the key."
  [^Cache cache key]
  (when (some? key)
    (.getIfPresent cache key)))

(defn get-if-present-async
  "Returns a completeable future with the value associated with the key
   in this cache, or null if there is no cached value for the key."
   ^CompletableFuture [^AsyncLoadingCache cache key]
  (if (some? key)
    (.getIfPresent cache key)
    (CompletableFuture/completedFuture nil)))

(defn get-all
  "Returns a map of the values associated with the keys, creating or retrieving
   those values if necessary. The returned map contains entries that were already
   cached, combined with the newly loaded entries; it will never contain null keys or values.

   A single request to the mappingFunction is performed for all keys which are
   not already present in the cache. All entries returned by mappingFunction will
   be stored in the cache, over-writing any previously cached values."
  [^Cache cache keys values-fn]
  (when-some [keys' (not-empty (filter some? keys))]
    (.getAll cache keys' values-fn)))

(defn get-all-async
  "Returns a completeable future with a map of the values associated
   with the keys, creating or retrieving those values if necessary. The
   returned map contains entries that were already cached, combined
   with the newly loaded entries; it will never contain null keys or
   values.

   A single request to the mappingFunction is performed for all keys which are
   not already present in the cache. All entries returned by mappingFunction will
   be stored in the cache, over-writing any previously cached values."
   ^CompletableFuture [^AsyncCache cache ^Iterable keys ^Function values-fn]
  (if-some [keys' ^Iterable (not-empty (filter some? keys))]
    (.getAll cache keys' values-fn)
    (CompletableFuture/completedFuture nil)))

(defn put
  "Associates the value with the key in this cache. If the cache previously
   contained a value associated with the key, the old value is replaced
   by the new value"
  [^Cache cache key value]
  (when (some? key)
    (.put cache key value)))

(defn put-async
  "Associates the value with the key in this cache. If the cache previously
   contained a value associated with the key, the old value is replaced
   by the new value"
  [^AsyncCache cache key value]
  (when (some? key)
    (.put cache key (CompletableFuture/completedFuture value))))

(defn as-map
  "Snapshot of a cache as an immutable map. Creates a shallow copy just in case"
  [^Cache cache]
  (into {} (Cache/.asMap cache)))

(defn as-map-async
  "Snapshot of a cache as an immutable map. Creates a shallow copy just in case"
  [^AsyncCache cache]
  (into {} (Cache/.asMap (.synchronous cache))))

(defn stats-async
  "Returns CacheStats for the async cache. If the cache was not created with
   `:record-stats`, all values will be zero."
  ^CacheStats [^AsyncCache cache]
  (.stats (.synchronous cache)))

(defn weight-async
  "Returns the weight of all of the items in the cache. If the cache was
   not created with `:record-stats`, it will return zero."
  ^Long [^AsyncCache cache]
  (-> cache
      (.synchronous)
      (.policy)
      (.eviction)
      (.map (fn [^Policy$Eviction e]
              (.weightedSize e)))
      ^OptionalLong (.orElse (OptionalLong/empty))
      (.orElse 0)))
