(ns instant.util.uuid
  (:import
   (java.util UUID)
   (java.nio ByteBuffer))
  (:require
   [clojure.string :as string]))

(defn coerce [x]
  (cond (uuid? x) x
        (string? x) (parse-uuid (string/trim x))
        :else nil))

(defn ->bytes
  "Converts a java.util.UUID into a byte array"
  ^bytes [^UUID uuid]
  (let [byte-buffer (ByteBuffer/allocate 16)]
    (.putLong byte-buffer (.getMostSignificantBits uuid))
    (.putLong byte-buffer (.getLeastSignificantBits uuid))
    (.array byte-buffer)))

(defn <-bytes
  "Converts a byte array into a java.util.UUID"
  [^bytes bytes]
  (let [buf (ByteBuffer/wrap bytes)]
    (UUID. (.getLong buf) (.getLong buf))))

(defn pg-compare
  "Compares two uuids, returning the same order that postgres would return"
  [^UUID a ^UUID b]
  (let [s-a (str a)
        s-b (str b)]
    (reduce (fn [_ i]
              ;; It's probably more efficient to do some bit twiddling instead
              ;; of converting to a string, but I couldn't figure it out
              (let [m (compare (Integer/parseInt (subs s-a i (+ i 2)) 16)
                               (Integer/parseInt (subs s-b i (+ i 2)) 16))]
                (if (zero? m)
                  0
                  (reduced m))))
            0
            ;; starting indexes of each hex-pair
            [0 2 4 6 9 11 14 16 19 21 24 26 28 30 32 34])))
