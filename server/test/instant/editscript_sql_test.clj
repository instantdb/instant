(ns instant.editscript-sql-test
  (:require [clojure.test :refer [deftest is testing]]
            [editscript.core :as es]
            [instant.jdbc.sql :as sql]
            [instant.jdbc.aurora :as aurora]
            [instant.util.json :refer [->json]]))

;; ---------------------------------------------------------------------------
;; Helpers
;; ---------------------------------------------------------------------------

(defn- sql-diff
  "Forward diff: produces edits to transform a -> b."
  [a b]
  (let [res (sql/select-one (aurora/conn-pool :read)
                            ["SELECT generate_editscript_edits(?::jsonb, ?::jsonb) as edits"
                             (->json a) (->json b)])]
    (vec (:edits res))))

(defn- sql-patch
  "Apply an editscript to target."
  [target script]
  (let [res (sql/select-one (aurora/conn-pool :read)
                            ["SELECT editscript_patch(?::jsonb, ?::jsonb) as result"
                             (->json target) (->json script)])]
    (:result res)))

(defn- test-forward
  "Test that patch(a, diff(a, b)) == b."
  [a b]
  (let [script (sql-diff a b)
        patched (sql-patch a script)]
    (is (= b patched)
        (str "Forward failed for a=" (pr-str a) " b=" (pr-str b)
             "\nScript: " (pr-str script)))))

(defn- test-reverse
  "Test that patch(b, diff(b, a)) == a."
  [a b]
  (let [script (sql-diff b a)
        patched (sql-patch b script)]
    (is (= a patched)
        (str "Reverse failed for a=" (pr-str a) " b=" (pr-str b)
             "\nScript: " (pr-str script)))))

(defn- sql-edits->es-edits
  "Convert SQL editscript edits (string ops) to editscript library format (keyword ops).
   Paths stay as-is (strings for object keys, ints for array indices).
   Only the op string like \":+\" becomes the keyword :+."
  [edits]
  (mapv (fn [edit]
          (let [path (vec (first edit))
                op (keyword (subs (second edit) 1))]
            (if (> (count edit) 2)
              [path op (nth edit 2)]
              [path op])))
        edits))

(defn- test-es-patch
  "Test that the editscript library can patch using our SQL-generated edits."
  [a b]
  (let [sql-edits (sql-diff a b)
        es-edits (sql-edits->es-edits sql-edits)
        es-script (es/edits->script es-edits)
        patched (es/patch a es-script)]
    (is (= b patched)
        (str "Editscript patch failed for a=" (pr-str a) " b=" (pr-str b)
             "\nSQL edits: " (pr-str sql-edits)
             "\nES edits: " (pr-str es-edits)))))

(defn- test-roundtrip
  "Test SQL forward, reverse, and editscript library patch all agree."
  [a b]
  (test-forward a b)
  (test-reverse a b)
  (test-es-patch a b))

;; ---------------------------------------------------------------------------
;; Scalar tests
;; ---------------------------------------------------------------------------

(deftest test-scalars
  (testing "Number to number"
    (test-roundtrip 1 2))
  (testing "String to string"
    (test-roundtrip "hello" "world"))
  (testing "Boolean to boolean"
    (test-roundtrip true false))
  (testing "Type changes"
    (test-roundtrip 1 "one")
    (test-roundtrip "hello" 42)
    (test-roundtrip true 1)
    (test-roundtrip 1 [1 2 3])
    (test-roundtrip "x" {"a" 1})
    (test-roundtrip [1] {"a" 1})))

;; ---------------------------------------------------------------------------
;; Object tests
;; ---------------------------------------------------------------------------

(deftest test-objects
  (testing "Add key"
    (test-roundtrip {"a" 1} {"a" 1 "b" 2}))
  (testing "Remove key"
    (test-roundtrip {"a" 1 "b" 2} {"a" 1}))
  (testing "Change value"
    (test-roundtrip {"a" 1} {"a" 2}))
  (testing "Multiple changes"
    (test-roundtrip {"a" 1 "b" 2} {"a" 3 "c" 4}))
  (testing "Nested object change"
    (test-roundtrip {"a" {"o" 4} "b" "b"}
                    {"a" {"o" 3} "b" "c" "c" 42}))
  (testing "Deep nesting"
    (test-roundtrip {"a" {"b" {"c" {"d" 1}}}}
                    {"a" {"b" {"c" {"d" 2 "e" 3}}}}))
  (testing "Empty objects"
    (test-roundtrip {} {"a" 1})
    (test-roundtrip {"a" 1} {}))
  (testing "Object with array values"
    (test-roundtrip {"a" [3 4] "b" [1 2]}
                    {"a" [3] "b" {"a" 3} "c" 42})))

;; ---------------------------------------------------------------------------
;; Array tests
;; ---------------------------------------------------------------------------

(deftest test-arrays-same-length
  (testing "Single element replace"
    (test-roundtrip [1] [2]))
  (testing "Element-by-element changes"
    (test-roundtrip [1 2 3] [4 5 6]))
  (testing "Partial changes"
    (test-roundtrip [1 2 3] [1 3 4])))

(deftest test-arrays-different-length
  (testing "Shrink"
    (test-roundtrip [1 2 3] [1])
    (test-roundtrip [1 2 3] []))
  (testing "Grow"
    (test-roundtrip [1] [1 2 3])
    (test-roundtrip [] [1 2 3]))
  (testing "Empty arrays"
    (test-roundtrip [] [])
    (test-roundtrip [] [1])
    (test-roundtrip [1] []))
  (testing "Shift detection via LCS"
    ;; LCS should detect that elements shifted rather than all changed
    (test-roundtrip [1 2 3] [0 1 2 3])
    (test-roundtrip [1 2 3] [1 2 3 4])
    (test-roundtrip [0 1 2 3] [1 2 3])
    (test-roundtrip [1 2 3 4] [1 2 3])))

(deftest test-arrays-nested
  (testing "Array of objects"
    (test-roundtrip [{"a" 1} {"b" 2}] [{"a" 1} {"b" 3} {"c" 4}]))
  (testing "Nested arrays"
    (test-roundtrip [[1 2] [3 4]] [[1 2 3] [4]]))
  (testing "Mixed nesting"
    (test-roundtrip [{"a" [1 2 3]} "b"]
                    [{"a" [2 3]} "c" "d"])))

;; ---------------------------------------------------------------------------
;; Null handling
;; ---------------------------------------------------------------------------

(deftest test-null-handling
  (testing "JSON null values in objects"
    (test-roundtrip {"a" nil "b" 2} {"a" 1 "b" nil "c" 3}))
  (testing "JSON null values in arrays"
    (test-roundtrip [nil 1 nil] [1 nil 2]))
  (testing "Null to value"
    (test-roundtrip {"a" nil} {"a" 1}))
  (testing "Value to null"
    (test-roundtrip {"a" 1} {"a" nil})))

;; ---------------------------------------------------------------------------
;; Ported from editscript quick_test.clj - diff-patch-test
;; (Adapted for JSON: keywords->strings, symbols->strings, sets->arrays)
;; ---------------------------------------------------------------------------

(deftest test-ported-quick-diff-patch
  (testing "Map diff (editscript quick diff-patch-test a/b)"
    (test-roundtrip {"a" {"o" 4} "b" "b"}
                    {"a" {"o" 3} "b" "c" "c" 42}))

  (testing "Array with nil and map changes (editscript quick c/d)"
    (test-roundtrip [nil 3 "c" {"a" 3} 4]
                    [3 "c" {"b" 3} 4]))

  (testing "Array with string and nested changes (editscript quick e/f)"
    ;; Original: ["abc" 24 23 {:a [1 2 3]} 1 3 #{1 2}]
    ;;           [24 23 {:a [2 3]} 1 3 #{1 2 3}]
    ;; Adapted: sets -> sorted arrays
    (test-roundtrip ["abc" 24 23 {"a" [1 2 3]} 1 3 [1 2]]
                    [24 23 {"a" [2 3]} 1 3 [1 2 3]]))

  (testing "Map with nil key (editscript quick g/h - using string key)"
    (test-roundtrip {"k" 1} {"k" 2}))

  (testing "Map value nil (editscript quick k/l)"
    (test-roundtrip {"1" 3} {"1" nil})))

;; ---------------------------------------------------------------------------
;; Ported from editscript a_star_test.clj - vec-diff-test
;; (All keywords/chars converted to strings for JSON compatibility.
;;  We test roundtrip correctness, not specific edit sequences.)
;; ---------------------------------------------------------------------------

(deftest test-ported-vec-diff
  (testing "vec-diff case 1: ab -> bc"
    (test-roundtrip ["a" "b"] ["b" "c"]))

  (testing "vec-diff case 2: abd -> bc"
    (test-roundtrip ["a" "b" "d"] ["b" "c"]))

  (testing "vec-diff case 3: [[0,0,0]] -> [[-1], 1]"
    (test-roundtrip [[0 0 0]] [[-1] 1]))

  (testing "vec-diff case 4: [a, null, [b,c]] -> [d, a, b, null]"
    (test-roundtrip ["a" nil ["b" "c"]] ["d" "a" "b" nil]))

  (testing "vec-diff case 5: [[d],[e],f] -> [[e],[f],d]"
    (test-roundtrip [["d"] ["e"] "f"] [["e"] ["f"] "d"]))

  (testing "vec-diff case 6: nested with restructure"
    (test-roundtrip [["a"] "b" ["c" ["d"] ["e"] "f"]]
                    [["b"] ["c" ["e"] ["f"] "d"]]))

  (testing "vec-diff case 7"
    (test-roundtrip ["a" ["b" "c" "d"] "e" "f"]
                    [["b" "c" "d" "e"] ["f"]]))

  (testing "vec-diff case 8"
    (test-roundtrip ["e" ["a" "b"] "c"]
                    ["a" ["b" "c"] "d"]))

  (testing "vec-diff case 9: [[u]] -> [s, t]"
    (test-roundtrip [["u"]] ["s" "t"]))

  (testing "vec-diff case 10: complex restructure"
    (test-roundtrip [["a" ["b" "c"] "d"] "e" "f"]
                    ["b" "c" ["e"] "f" "g"]))

  (testing "vec-diff case 11: reorder"
    (test-roundtrip [["a" "b"] "c" ["d"]]
                    ["c" ["d"] ["a" "b"]]))

  (testing "vec-diff case 12"
    (test-roundtrip [["s" "t"] ["u"]]
                    [["s"] "t" "s"]))

  (testing "vec-diff case 13"
    (test-roundtrip ["a" ["s" "t"] "u"]
                    [["b"] ["s" "t" "u"]]))

  (testing "vec-diff case 14"
    (test-roundtrip ["a" ["s" "t"] ["u"]]
                    [["s" "u"] "t" "s"]))

  (testing "vec-diff case 15"
    (test-roundtrip ["a" ["b" ["c" ["d" "e"] "f"]]]
                    ["a" ["b" "c" "d"] "e"])))

;; ---------------------------------------------------------------------------
;; Ported from editscript a_star_test.clj - mix-diff-test
;; (JSON-compatible cases only)
;; ---------------------------------------------------------------------------

(deftest test-ported-mix-diff
  (testing "Scalar replace"
    (test-roundtrip 1 2))

  (testing "Array shrink with change"
    (test-roundtrip [0 -1] [1]))

  (testing "Array of objects"
    (test-roundtrip [{} {"0" 0}] [{"1" 1}]))

  (testing "Empty to nested"
    (test-roundtrip [] [[{"_1" 3}]]))

  (testing "Map with nested map changes"
    (test-roundtrip {"a" {"o" 4} "b" "b"}
                    {"a" {"o" 3} "b" "c" "c" 42}))

  (testing "Map with array-to-map type change"
    (test-roundtrip {"a" [3 4] "b" [1 2]}
                    {"a" [3] "b" {"a" 3} "c" 42}))

  (testing "Array with type change at index"
    (test-roundtrip ["zero" {"x" "y"}]
                    ["zero" {"a" "a" "b" "b"}]))

  (testing "Array scalar to map"
    (test-roundtrip ["zero" "one"]
                    ["zero" {"a" "a" "b" "b"}]))

  (testing "Array map to scalar"
    (test-roundtrip ["zero" {"a" "a" "b" "b"}]
                    ["zero" "one"]))

  (testing "Nested array shrink"
    (test-roundtrip ["zero" ["a" "b" "c" "d" "e" "f"]]
                    ["zero" ["a"]])))

;; ---------------------------------------------------------------------------
;; Ported from editscript core_test.clj - readme-test
;; (Adapted: sets -> arrays, keywords -> strings)
;; ---------------------------------------------------------------------------

(deftest test-ported-readme
  (testing "Readme example 1 (sans sets)"
    (test-roundtrip ["Hello word" 24 22 {"a" [1 2 3]} 1 3 [1 2]]
                    ["Hello world" 24 23 {"a" [2 3]} 1 3 [1 2 3]]))

  (testing "Readme example 2: large structural change"
    (test-roundtrip [2 {"a" 42} 3 {"b" 4} {"c" 29}]
                    [{"a" 5} {"b" 5}])))

;; ---------------------------------------------------------------------------
;; Specific edit sequence tests (simple cases where result is deterministic)
;; ---------------------------------------------------------------------------

(deftest test-specific-edits
  (testing "Identical data produces empty script"
    (is (= [] (sql-diff {"a" 1} {"a" 1})))
    (is (= [] (sql-diff [1 2 3] [1 2 3])))
    (is (= [] (sql-diff 42 42)))
    (is (= [] (sql-diff "hello" "hello"))))

  (testing "Root scalar replace"
    (is (= [[[] ":r" 2]] (sql-diff 1 2))))

  (testing "Object key add"
    (let [script (sql-diff {"a" 1} {"a" 1 "b" 2})]
      (is (= 1 (count script)))
      (is (= ":+" (get-in script [0 1])))))

  (testing "Object key remove"
    (let [script (sql-diff {"a" 1 "b" 2} {"a" 1})]
      (is (= 1 (count script)))
      (is (= ":-" (get-in script [0 1])))))

  (testing "Array element delete via LCS"
    ;; [1 2 3] -> [1 3] should produce a delete, not two replaces
    (let [script (sql-diff [1 2 3] [1 3])]
      (is (= 1 (count script)) (str "Expected 1 edit, got: " (pr-str script)))
      (is (= ":-" (get-in script [0 1]))))))

;; ---------------------------------------------------------------------------
;; Edge cases
;; ---------------------------------------------------------------------------

(deftest test-edge-cases
  (testing "Deeply nested change"
    (test-roundtrip {"a" {"b" {"c" {"d" {"e" 1}}}}}
                    {"a" {"b" {"c" {"d" {"e" 2}}}}}))

  (testing "Large flat object"
    (let [a (into {} (map (fn [i] [(str "k" i) i]) (range 50)))
          b (-> a (dissoc "k0") (assoc "k1" 999 "k50" 50))]
      (test-roundtrip a b)))

  (testing "Array of arrays"
    (test-roundtrip [[1 2] [3 4] [5 6]]
                    [[1 2] [3 5] [5 6] [7 8]]))

  (testing "Boolean and number mix"
    (test-roundtrip {"flag" true "count" 0}
                    {"flag" false "count" 100 "new" "field"}))

  (testing "String with special characters"
    (test-roundtrip {"text" "hello \"world\""}
                    {"text" "goodbye 'world'"}))

  (testing "Numeric precision"
    (test-roundtrip {"val" 1.5} {"val" 2.7}))

  (testing "Negative numbers"
    (test-roundtrip [-1 -2 -3] [-3 -2 -1])))
