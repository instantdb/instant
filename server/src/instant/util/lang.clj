(ns instant.util.lang
  (:import
   (clojure.lang Var Var$Unbound)
   (java.lang AutoCloseable)))

(defn close [o]
  (when (and o (not (instance? Var$Unbound o)))
    (AutoCloseable/.close o))
  o)

(defmacro set-var! [var val]
  `(Var/.doReset (var ~var) ~val))

(defmacro clear-var!
  ([var]
   `(clear-var ~var close))
  ([^Var var method]
   `(let [var# (var ~var)
          val# @var#]
      (when (and val# (not (instance? Var$Unbound val#)))
        (~method val#)
        (Var/.doReset var# nil)))))
