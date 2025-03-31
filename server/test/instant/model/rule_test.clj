(ns instant.model.rule-test
  (:require [clojure.test :as test :refer [deftest is]]
            [instant.model.rule :as rule]))


(deftest binds-works
  (is (= "cel.bind(test, true, test)"
         (:code
          (rule/get-program! {:code {"myetype"
                                     {"bind" ["test" "true"]
                                      "allow" {"view" "test"}}}}
                             "myetype"
                             "view"))))

  (is (= "cel.bind(test, true, cel.bind(test2, false, test && test2))"
         (:code
          (rule/get-program! {:code {"myetype"
                                     {"bind" ["test" "true"
                                              "test2" "false"]
                                      "allow" {"view" "test && test2"}}}}
                             "myetype"
                             "view")))))

(deftest binds-can-reference-other-binds
  (is (= "cel.bind(parent, true, cel.bind(child, parent || true, child))"
         (:code
          (rule/get-program! {:code {"myetype"
                                     {"bind" ["parent" "true"
                                              "child" "parent || true"]
                                      "allow" {"view" "child"}}}}
                             "myetype"
                             "view")))))

(deftest ignores-unused-binds
  (is (= "true"
         (:code
          (rule/get-program! {:code {"myetype"
                                     {"bind" ["parent" "true"
                                              "child" "parent || true"]
                                      "allow" {"view" "true"}}}}
                             "myetype"
                             "view"))))
  (is (= "cel.bind(parent, true, parent)"
         (:code
          (rule/get-program! {:code {"myetype"
                                     {"bind" ["parent" "true"
                                              "child" "parent || true"]
                                      "allow" {"view" "parent"}}}}
                             "myetype"
                             "view")))))

(comment
  (test/run-tests *ns*))
