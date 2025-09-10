(ns instant.util.cache
  (:refer-clojure :exclude [get])
  (:import
   [com.github.benmanes.caffeine.cache Cache Caffeine LoadingCache]
   [java.time Duration]))

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

(defn get-if-present
  "Returns the value associated with the key in this cache, or null if there is no cached value for the key."
  [^Cache cache key]
  (when (some? key)
    (.getIfPresent cache key)))

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

(defn get-all-sync
  "Version of get-all that wraps each key in a delay and getAll in a syncrhonized
   section to ensure same key is never calculated twice"
  [^Cache cache keys values-fn]
  (when-some [keys' (not-empty (filter some? keys))]
    (->>
     (locking cache
       (.getAll cache keys'
                (fn [keys]
                  (let [d (delay (values-fn keys))]
                    (into {} (for [k keys]
                               [k (delay (clojure.core/get @d k))]))))))
     (reduce-kv (fn [m k v] (assoc! m k @v)) (transient {}))
     (persistent!))))

(defn invalidate
  "Discards any cached value for the key. The behavior of this operation is
   undefined for an entry that is being loaded (or reloaded) and is otherwise
   not present"
  [^Cache cache key]
  (when (some? key)
    (.invalidate cache key)))

(defn invalidate-all
  "invalidate-all/1 invalidates all keys.
   invalidate-all/2 invalidates only passed keys."
  ([^Cache cache]
   (.invalidateAll cache))
  ([^Cache cache keys]
   (when-some [keys' (not-empty (filter some? keys))]
     (.invalidateAll cache keys'))))

(defn put
  "Associates the value with the key in this cache. If the cache previously
   contained a value associated with the key, the old value is replaced
   by the new value"
  [^Cache cache key value]
  (when (some? key)
    (.put cache key value)))

(defn as-map
  "Snapshot of a cache as an immutable map. Creates a shallow copy just in case"
  [^Cache cache]
  (into {} (Cache/.asMap cache)))
