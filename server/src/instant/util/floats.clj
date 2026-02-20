(ns instant.util.floats)

(set! *warn-on-reflection* true)

(defn dot-product ^double [^floats v-a ^floats v-b]
  (let [len (alength v-a)]
    (loop [i (int 0)
           sum 0.0]
      (if (< i len)
        (recur (unchecked-inc i)
               (+ sum (* (aget v-a i) (aget v-b i))))
        sum))))

(defn magnitude ^double [^floats v-a]
  (let [len (alength v-a)]
    (loop [i (int 0)
           sum 0.0]
      (if (< i len)
        (let [x (aget v-a i)]
          (recur (unchecked-inc i)
                 (+ sum (* x x))))
        (Math/sqrt sum)))))

(defn normalize ^floats [^floats v]
  (let [m (magnitude v)
        len (alength v)
        res (float-array len)]
    (if (zero? m)
      res
      (do
        (dotimes [i len]
          (aset res i (float (/ (aget v i) m))))
        res))))

(defn cosine-similarity ^double [^floats v-a ^floats v-b]
  (let [denom (* (magnitude v-a) (magnitude v-b))]
    (if (zero? denom)
      0.0
      (/ (dot-product v-a v-b)
         denom))))
