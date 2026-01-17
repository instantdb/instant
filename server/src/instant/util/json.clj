(ns instant.util.json
  (:require [cheshire.core :as cheshire]
            [cheshire.generate :refer [encode-nil]]
            [cheshire.factory :as factory]
            [cheshire.parse :as parse])
  (:import (com.google.protobuf NullValue)
           (dev.cel.expr Value)
           (com.fasterxml.jackson.core JsonGenerator JsonFactory)
           (com.google.protobuf.util JsonFormat)
           (java.time Instant)
           (java.util Map List)))

(def add-encoder cheshire.generate/add-encoder)
(def encode-str cheshire.generate/encode-str)
(def encode-java-map (fn [^Map m ^JsonGenerator jg]
                       (cheshire.generate/encode-map (into {} m) jg)))
(def encode-java-list (fn [^List l ^JsonGenerator jg]
                       (cheshire.generate/encode-seq (seq l) jg)))

;; Encode NullValue as nil
(add-encoder NullValue encode-nil)

(add-encoder Instant encode-str)

(defn encode-cel-expr-value
  "Encode cel expression values using the protobuf json encoder"
  [v ^JsonGenerator jg]
  (let [json-printer (JsonFormat/printer)
        json-str (.print json-printer v)]
    (.writeRawValue jg json-str)))

(add-encoder Value encode-cel-expr-value)

(def ->json
  "Converts a Clojure data structure to a JSON string."
  cheshire/generate-string)

(def <-json
  "Converts a JSON string to a Clojure data structure."
  cheshire/parse-string)

(def <-json-stream
  cheshire/parse-stream)

(def big-factory (factory/make-json-factory
                               ;; default is 20000000
                  {:max-input-string-length 200000000}))

(defn <-json-big
  "Converts a JSON string to a Clojure data structure.
   Allows for larger stings than <-json.

   Used to parse wal records that are very large, to prevent a large
   string from stopping the entire wal parser. Should not be used
   for user-facing input in general."
  ([s]
   (<-json-big s nil))
  ([s key-fn]
   (binding [factory/*json-factory* big-factory]
     (<-json s key-fn))))

(defn parse-bytes [^bytes bytes ^Integer offset ^Integer len]
  (parse/parse
   (.createParser ^JsonFactory (or factory/*json-factory*
                                   factory/json-factory)
                  bytes
                  offset
                  len)
   nil nil nil))


(defn json-type-of-clj [v]
  (cond (string? v)
        "string"
        (number? v)
        "number"
        (boolean? v)
        "boolean"
        (nil? v)
        "null"
        (or (vector? v)
            (list? v)
            (seq? v))
        "array"
        :else "object"))
