(ns instant.util.string
  (:import
   (java.util.zip CRC32))
  (:require
   [clojure.string :as string]))

(defn safe-name [x]
  (condp = (type x)
    clojure.lang.Symbol (name x)
    clojure.lang.Keyword (name x)
    String x
    (str x)))

(defn rand-num-str
  "Generates a random string composed of size len with all numbers"
  [len]
  (apply str (take len (repeatedly #(rand-nth (range 0 9))))))

(defn unique-int
  "Converts a string/kw name/symbol to a unique int"
  [s]
  (let [bytes (.getBytes ^String (name s) "UTF-8")
        crc (new CRC32)]
    (.update ^CRC32 crc bytes)
    (.getValue ^CRC32 crc)))

(defn coerce-non-blank-str [s]
  (cond
    (number? s) (str s)
    (string? s) (when-not (string/blank? s)
                  (string/trim s))

    :else nil))

(defn multiline->single-line
  "Helper to remove extra spaces from multiline strings. Lets you spread the
   string across multiple lines to meet line-width requirements in code."
  [s]
  (string/replace s #"\s+" (fn [_] " ")))
