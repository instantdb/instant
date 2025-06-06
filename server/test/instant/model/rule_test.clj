(ns instant.model.rule-test
  (:require [clojure.test :as test :refer [deftest is]]
            [instant.model.rule :as rule]))

(deftest allow-booleans
  (let [code {"myetype"
              {"allow" {"view" true}}}]
    (is (= "true"
           (:code
            (rule/get-program! {:code code}
                               "myetype"
                               "view"))))

    (is (= () (rule/validation-errors code)))))

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

(deftest validation-errors-passes
  (is (= () (rule/validation-errors {"myetype"
                                     {"bind" ["parent" "true"
                                              "child" "parent || true"]
                                      "allow" {"view" "parent"}}}))))

(deftest can-only-create-view-rules-for-users
  (is (= [{:message
           "The $users namespace is read-only. Set `$users.allow.create` to `\"false\"`.",
           :in ["$users" :allow "create"]}]
         (rule/validation-errors {"$users" {"allow" {"create" "true"}}}))))

(deftest cant-write-rules-for-system-attrs
  (is (= [{:message
           "The $codes namespace is a reserved internal namespace that does not yet support rules.",
           :in ["$codes" :allow "view"]}
          {:message
           "The $codes namespace is a reserved internal namespace that does not yet support rules.",
           :in ["$codes" :allow "create"]}
          {:message
           "The $codes namespace is a reserved internal namespace that does not yet support rules.",
           :in ["$codes" :allow "update"]}
          {:message
           "The $codes namespace is a reserved internal namespace that does not yet support rules.",
           :in ["$codes" :allow "delete"]}]
         (rule/validation-errors {"$codes" {"allow" {"update" "true"}}}))))

(deftest invalid-syntax-fails
  (is (= [{:message
           "found no matching overload for '!_' applied to '(int)' (candidates: (bool))",
           :in ["myetype" :allow "view"]}]
         (rule/validation-errors {"myetype" {"allow" {"view" "!10"}}}))))

(deftest invalid-auth-ref-fails
  (is (= [{:message "auth.ref arg must start with `$user.`",
           :in ["myetype" :allow "view"]}]
         (rule/validation-errors {"myetype" {"allow" {"view" "1 in auth.ref('$users.id')"}}}))))

(deftest duplicate-bind-fails
  (is (= [{:message "bind should only contain a given variable name once",
           :in ["myetype" :bind "duplicate"]}]
         (rule/validation-errors {"myetype" {"bind" ["duplicate" "true" "duplicate" "false"]
                                             "allow" {"view" "duplicate"}}}))))

(deftest uneven-binds-fail
  (is (= [{:message "bind should have an even number of elements",
           :in ["myetype" :bind]}
          {:message "There was an unexpected error evaluating the rules",
           :in ["myetype" :allow "view"]}]
         (rule/validation-errors {"myetype" {"bind" ["duplicate"]
                                             "allow" {"view" "duplicate"}}}))))

(comment
  (test/run-tests *ns*))
