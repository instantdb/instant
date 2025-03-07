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
    (let [program (cel/->program (cel/->ast "has({'name': 'Alice'}.name)"))]
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

(deftest test-nulls-work
  (testing "nulls are safe"
    ;; Missing properties are treated as false
    (let [program (cel/->program (cel/->ast "data.isFavorite"))
          bindings {"data" (cel/->cel-map {} {})}]
      (is (false? (cel/eval-program! {:cel-program program} bindings))))

    ;; Null values are treated as false
    (let [program (cel/->program (cel/->ast "data.isVerified == null"))
          bindings {"data" (cel/->cel-map {} {})}]
      (is (true? (cel/eval-program! {:cel-program program} bindings))))

    ;; Direct comparison with null works
    (let [program (cel/->program (cel/->ast "data.isVerified == null"))
          bindings {"data" (cel/->cel-map {} {"isVerified" nil})}]
      (is (true? (cel/eval-program! {:cel-program program} bindings))))
    (let [program (cel/->program (cel/->ast "data.isVerified == null"))
          bindings {"data" (cel/->cel-map {} {"isVerified" true})}]
      (is (false? (cel/eval-program! {:cel-program program} bindings))))))

(deftest test-nullsafe-not
  (testing "! operator handles null values correctly"
    ;; not is null-safe when property is missing
    (let [program (cel/->program (cel/->ast "!data.isFavorite"))
          bindings {"data" (cel/->cel-map {} {})}]
      (is (true? (cel/eval-program! {:cel-program program} bindings))))

    ;; not is null-safe when property is null
    (let [program (cel/->program (cel/->ast "!data.isFavorite"))
          bindings {"data" (cel/->cel-map {} {"isFavorite" nil})}]
      (is (true? (cel/eval-program! {:cel-program program} bindings))))

    ;; not works with booleans
    (let [program (cel/->program (cel/->ast "!data.isFavorite"))
          bindings {"data" (cel/->cel-map {} {"isFavorite" false})}]
      (is (true? (cel/eval-program! {:cel-program program} bindings))))
    (let [program (cel/->program (cel/->ast "!data.isFavorite"))
          bindings {"data" (cel/->cel-map {} {"isFavorite" true})}]
      (is (false? (cel/eval-program! {:cel-program program} bindings))))

    ;; double negation works
    (let [program (cel/->program (cel/->ast "!!data.isFavorite"))
          bindings {"data" (cel/->cel-map {} {"isFavorite" true})}]
      (is (true? (cel/eval-program! {:cel-program program} bindings))))

    ;; not works with nested properties
    (let [program (cel/->program (cel/->ast "!(data.isFavorite || data.isPopular)"))
          bindings {"data" (cel/->cel-map {} {"isFavorite" nil, "isPopular" nil})}]
      (is (true? (cel/eval-program! {:cel-program program} bindings))))

    ;; Test and with both null values
    (let [program (cel/->program (cel/->ast "!data.isVerified && !data.isActive"))
          bindings {"data" (cel/->cel-map {} {"isVerified" nil, "isActive" nil})}]
      (is (true? (cel/eval-program! {:cel-program program} bindings))))))

(deftest test-nullsafe-or
  (testing "or operator handles null values correctly"
    ;; Test with one null value
    (let [program (cel/->program (cel/->ast "data.isVerified || data.isActive"))
          bindings {"data" (cel/->cel-map {} {"isVerified" nil, "isActive" true})}]
      (is (true? (cel/eval-program! {:cel-program program} bindings))))

    ;; Test and with both null values
    (let [program (cel/->program (cel/->ast "data.isVerified || data.isActive"))
          bindings {"data" (cel/->cel-map {} {"isVerified" nil, "isActive" nil})}]
      (is (false? (cel/eval-program! {:cel-program program} bindings))))

    ;; Works with explcit null check
    (let [program (cel/->program (cel/->ast "data.isVerified == null || data.isActive == null"))
          bindings {"data" (cel/->cel-map {} {"isVerified" true})}]
      (is (true? (cel/eval-program! {:cel-program program} bindings))))))

(deftest test-nullsafe-and
  (testing "and operator handles null values correctly"
    ;; Test with one null value
    (let [program (cel/->program (cel/->ast "data.isVerified && data.isActive"))
          bindings {"data" (cel/->cel-map {} {"isVerified" nil, "isActive" true})}]
      (is (false? (cel/eval-program! {:cel-program program} bindings))))

    ;; Test and with both null values
    (let [program (cel/->program (cel/->ast "data.isVerified && data.isActive"))
          bindings {"data" (cel/->cel-map {} {"isVerified" nil, "isActive" nil})}]
      (is (false? (cel/eval-program! {:cel-program program} bindings))))

    ;; Works with explcit null check
    (let [program (cel/->program (cel/->ast "data.isVerified == null && data.isActive == null"))
          bindings {"data" (cel/->cel-map {} {"isVerified" nil})}]
      (is (true? (cel/eval-program! {:cel-program program} bindings))))))

(comment
  (test/run-tests *ns*))
