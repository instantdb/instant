(ns instant.util.coll
  (:require [medley.core :as medley]))

(defn split-last [coll]
  (list (butlast coll)
        (last coll)))

(defn split-last-vec [arr]
  (let [n (count arr)]
    [(subvec arr 0 (dec n)) (nth arr (dec n))]))

(defn index-of [x coll]
  (let [idx? (fn [i a] (when (= x a) i))]
    (first (keep-indexed idx? coll))))

(defn seek
  "Returns first item from coll for which (pred item) returns true.
   Returns nil if no such item is present, or the not-found value if supplied."
  ([pred coll] (seek pred coll nil))
  ([pred coll not-found]
   (reduce (fn [_ x]
             (if (pred x)
               (reduced x)
               not-found))
           not-found coll)))

(defn exists?
  "Returns true if any item in the coll matches (pred item), otherwise false."
  [pred coll]
  (reduce (fn [acc x]
            (if (pred x)
              (reduced true)
              acc))
          false coll))

(defn pad [n val coll]
  (let [cnt (- n (count coll))]
    (concat coll (repeat cnt val))))

(defn indexes
  "ex:
   coll [{:id 1 :ident [:users :post]}
         {:id 1 :ident [:users :name]}]

   bys [:id :id] [:ident :ident]

   Takes coll and creates named indexes for each of the bys"
  [coll & bys]
  (let [indexes
        (->> bys
             (map (fn [[k f]]
                    [k (group-by f coll)]))
             (into {}))]
    {:coll coll
     :indexes indexes}))

(defn by-index [coll index-k k]
  (get-in coll [:indexes index-k k]))

(comment
  (def x (indexes
          [{:id 1 :ident [:users :post]}
           {:id 1 :ident [:users :name]}]
          [:id :id]
          [:ident :ident]))
  (by-index x :id 1)
  (by-index x :ident [:users :post]))

(def ^:private not-found (Object.))

(defn update-in-when
  "Like update-in, but only updates when `ks` is present"
  [m ks f & args]
  (let [old-v (get-in m ks not-found)]
    (if (identical? old-v not-found)
      m
      (assoc-in m ks (apply f old-v args)))))

(defn update-when
  "Like update, but only updates when `k` is present"
  [m k f & args]
  (let [old-v (get m k not-found)]
    (if (identical? old-v not-found)
      m
      (assoc m k (apply f old-v args)))))

(comment
  (update-in-when {:a {:b 1}} [:a :b] + 1)
  (update-in-when {:a {:b 1}} [:a :c] + 1))

(defn assoc-in-when
  "Like assoc-in, but only assocs when `ks` is present"
  [m ks new-v]
  (let [old-v (get-in m ks not-found)]
    (if (identical? old-v not-found)
      m
      (assoc-in m ks new-v))))

(defn zip [& colls]
  (apply map vector colls))

(defn dissoc-in
  "Dissociates a key from a nested map given a path."
  [m [first-key & rest-keys]]
  (if (empty? rest-keys)
    (dissoc m first-key)
    (update m first-key dissoc-in rest-keys)))

(defn disj-in
  "Calls dissoc-in to clean up the map when the item at path is empty after
   calling disj. Useful for cleaning up the room and session maps."
  [m path item]
  (let [new-m (update-in m path disj item)]
    (if (empty? (get-in new-m path))
      (medley/dissoc-in new-m path)
      new-m)))

(comment
  (def my-map {:a {:b {:c 3 :d 4}} :e 5})
  (dissoc-in my-map [:a :b :c]))

(defn select-keys-no-ns
  "Selects only the keys with the given namespace and removes the namespace.
   Doesn't work with multiple namespaces, e.g. you can't pass
   :a/b with {:a/b/c 1} to get {:c 1}"
  [m ns-prefix]
  (let [ns-str (cond (string? ns-prefix)
                     ns-prefix

                     (keyword? ns-prefix)
                     (name ns-prefix)

                     :else (throw (IllegalArgumentException.
                                   "ns-prefix must be a string or keyword")))
        ns-keys (filter #(= (namespace %) ns-str) (keys m))
        remove-ns (fn [[k v]] [(keyword (name k)) v])]
    (into (with-meta {} (meta m))
          (map remove-ns (select-keys m ns-keys)))))

(comment
  (select-keys-no-ns {:a/b 1 :c/d 2 :e/f 3} "a")
  ;; => {:b 1}

  (select-keys-no-ns {:a/b 1 :c/d 2 :e/f 3} :a)
  ;; => {:b 1}
  )

(defn split-map-by-namespace
  "Splits a map into multiple maps by the namespace of each key.
   Only handles a single level.
   Example:
     {:a/b 1 :a/c 2, :d/e 3 :d/f 4 :g 5}
       -> {:a {:b 1 :c 2} :d {:e 3 :f 4} nil {:g 5}}"
  [m]
  (when m
    (reduce-kv (fn [acc k v]
                 (if-not (keyword? k)
                   (assoc-in acc [nil k] v)
                   (assoc-in acc [(keyword (namespace k)) (keyword (name k))] v)))
               (empty {})
               m)))

(defmacro array-of
  [klass vals]
  (let [^Class resolved (resolve klass)]
    (with-meta
      (list 'into-array resolved vals)
      {:tag (str "[L" (.getName resolved) ";")})))

(defn third
  "Returns the third element in a collection."
  [coll]
  (nth coll 2))

(defn map-invert-key-set
  "Like clojure.set/map-invert, but the resulting values are sets.
  {:a :b, :c :b, :e :f} => {:b #{:a :c} :f #{:e}}"
  [m]
  (reduce (fn [acc [k v]]
            (update acc v (fnil conj #{}) k))
          {}
          m))

(defn map-keys
  "Apply `f` to keys of `m`"
  [f m]
  (persistent!
   (reduce-kv
    (fn [m k v]
      (assoc! m (f k) v))
    (transient (empty m)) m)))

(defn filter-keys
  "Only keep keys in `m` that return truthy for `(pred key)`"
  [pred m]
  (persistent!
   (reduce-kv
    (fn [m key _]
      (if (pred key)
        m
        (dissoc! m key)))
    (transient m) m)))

(defn every?-var-args [pred & colls]
  (if (= 1 (count colls))
    (every? pred (first colls))
    (every? (fn [args] (apply pred args))
            (apply map vector colls))))

(defn split-by
  "Returns [(filter pred xs) (remove pred xs)]"
  [pred xs]
  (let [[f r] (reduce
               (fn [[f r] x]
                 (if (pred x)
                   [(conj! f x) r]
                   [f (conj! r x)]))
               [(transient []) (transient [])] xs)]
    [(persistent! f) (persistent! r)]))

(defn map-by
  "Given xs, builds a map of {(key-fn x) x}"
  [key-fn xs]
  (persistent!
   (reduce
    (fn [m x]
      (assoc! m (key-fn x) x))
    (transient {}) xs)))

(defn group-by-to
  "Like group-by but applies (val-fn x) to values"
  ([key-fn val-fn xs]
   (group-by-to key-fn val-fn [] xs))
  ([key-fn val-fn container xs]
   (persistent!
    (reduce
     (fn [m x]
       (let [k (key-fn x)
             v (val-fn x)
             old-v (get m k container)]
         (assoc! m k (conj old-v v))))
     (transient {}) xs))))

(defn reduce-tr
  "Like reduce but makes acc transient/persistent automatically"
  [f init xs]
  (persistent!
   (reduce f (transient init) xs)))
