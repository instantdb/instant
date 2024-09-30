(ns instant.db.cel-test
  (:require [clojure.test :as test :refer [deftest is testing]]
            [instant.db.cel :as cel])
  (:import (dev.cel.parser CelStandardMacro)))

(deftest test-standard-macros
  (testing "STANDARD_MACROS set contains expected macros"
    (let [standard-macros (set (map #(.getFunction %) (CelStandardMacro/STANDARD_MACROS)))
          expected-macros #{"has" "all" "exists" "exists_one" "map" "filter"}]
      (is (every? standard-macros expected-macros)))))

(deftest test-cel-evaluation
  (testing "Evaluation of CEL expressions with standard macros"
    (let [program (cel/->program (cel/->ast "has({'name': 'Alice'}.bob)"))]
      (is (true? (cel/eval-program! {:cel-program program} {}))))
    (let [program (cel/->program (cel/->ast "[1, 2, 3].all(x, x > 0)"))]
      (is (true? (cel/eval-program! {:cel-program program} {}))))

    (let [program (cel/->program (cel/->ast "[1, 2, 3].exists(x, x > 2)"))]
      (is (true? (cel/eval-program! {:cel-program program} {}))))

    (let [program (cel/->program (cel/->ast "[1, 2, 3].exists_one(x, x > 2)"))]
      (is (true? (cel/eval-program! {:cel-program program} {}))))

    (let [program (cel/->program (cel/->ast "[1, 2, 3].map(x, x * 2)"))]
      (is (= [2 4 6] (cel/eval-program! {:cel-program program} {}))))

    (let [program (cel/->program (cel/->ast "[1, 2, 3, 4].filter(x, x % 2 == 0)"))]
      (is (= [2 4] (cel/eval-program! {:cel-program program} {}))))))

(comment
  (test/run-tests *ns*))
