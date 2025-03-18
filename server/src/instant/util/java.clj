(ns instant.util.java
  (:import
   (clojure.lang Var$Unbound)
   (java.lang AutoCloseable)))

(defn close [o]
  (when (and o (not (instance? Var$Unbound o)))
    (AutoCloseable/.close o))
  o)
