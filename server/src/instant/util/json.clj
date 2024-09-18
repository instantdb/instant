(ns instant.util.json
  (:require [cheshire.core :as cheshire]
            [cheshire.generate :refer [add-encoder encode-nil]])
  (:import (com.google.protobuf NullValue)
           (dev.cel.expr Value)
           (com.fasterxml.jackson.core JsonGenerator)
           (com.google.protobuf.util JsonFormat)))

;; Encode NullValue as nil
(add-encoder NullValue encode-nil)

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
