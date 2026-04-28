(ns instant.util.memoize
  (:require [instant.util.cache :as c]))

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

(defn safe-memoize
  "Like clojure.core/memoize, but uses a limited cache instead of an atom."
  [f]
  (let [mem (c/make {:max-size 1024})]
    (fn [& args]
      (c/get mem args (fn [_]
                        (apply f args))))))
