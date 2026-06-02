(ns instant.async-profiler-test
  (:require
   [clojure.test :refer [deftest is]]
   [clj-async-profiler.core :as prof]))

(deftest clj-async-profiler-works
  (is (prof/profile (inc 1))))
