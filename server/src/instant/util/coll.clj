(ns instant.util.coll)

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
        _         (println ns-str)
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
