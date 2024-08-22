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
  [^UUID uuid]
  (let [byte-buffer (ByteBuffer/allocate 16)]
    (.putLong byte-buffer (.getMostSignificantBits uuid))
    (.putLong byte-buffer (.getLeastSignificantBits uuid))
    (.array byte-buffer)))
