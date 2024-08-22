(ns instant.util.json
  (:require [cheshire.core :as cheshire]))

(def ->json
  "Converts a Clojure data structure to a JSON string."
  cheshire/generate-string)

(def <-json
  "Converts a JSON string to a Clojure data structure."
  cheshire/parse-string)

