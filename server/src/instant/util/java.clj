(ns instant.util.java
  (:import
   (java.lang AutoCloseable)))

(defn close [o]
  (when o
    (AutoCloseable/.close o)
    o))
