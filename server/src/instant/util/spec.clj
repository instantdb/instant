(ns instant.util.spec
  (:require
   [clojure.spec.alpha :as s]
   [clojure.string :as string]))

(s/def ::non-blank-string
  (s/and string? (complement string/blank?)))

(defn conform-throwing [spec value]
  (let [parsed (s/conform spec value)]
    (if (s/invalid? parsed)
      (throw (ex-info "Invalid input" (s/explain-data spec value)))
      parsed)))

(defn tagged-as?
  "Given a tagged tuple: [:foo v], returns true if the tag matches"
  [tag x]
  (and (coll? x) (= tag (first x))))

(defn tagged-unwrap
  "Unwraps a tagged tuple: [:foo v] => v"
  [x]
  (and (coll? x) (second x)))
