(ns instant.util.memoize)

(defn vmemoize
  "Like clojure.core/memoize, but uses a volatile instead of an atom.
   Only use it in places where you could use a volatile"
  [f]
  (let [mem (volatile! {})]
    (fn [& args]
      (if-let [e (find @mem args)]
        (val e)
        (let [ret (apply f args)]
          (vswap! mem assoc args ret)
          ret)))))
