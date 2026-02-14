(ns instant.model.rule-test
  (:require [clojure.test :as test :refer [deftest is]]
            [instant.model.rule :as rule]
            [instant.util.test :as test-util]
            [instant.util.exception :as ex]))

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

  (is (= "cel.bind(test2, false, cel.bind(test, true, test && test2))"
         (:code
          (rule/get-program! {:code {"myetype"
                                     {"bind" ["test" "true"
                                              "test2" "false"]
                                      "allow" {"view" "test && test2"}}}}
                             "myetype"
                             "view")))))

(deftest binds-works-with-kv-format
  (is (= "cel.bind(test, true, test)"
         (:code
          (rule/get-program! {:code {"myetype"
                                     {"bind" {"test" "true"}
                                      "allow" {"view" "test"}}}}
                             "myetype"
                             "view"))))

  (is (= () (rule/validation-errors {"myetype"
                                     {"bind" {"test" "true"}
                                      "allow" {"view" "test"}}}))))

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

(deftest does-not-allow-cyclic-dependencies
  (is (= [{:message "The binds have a cyclic dependency a -> b -> a",
           :in ["myetype" "allow" "view"]}]
         (rule/validation-errors {"myetype"
                                  {"bind" ["a" "b"
                                           "b" "a"]
                                   "allow" {"view" "a"}}})))

  (is (= [{:message "The binds have a cyclic dependency d -> e -> a -> b -> c -> d",
           :in ["myetype" "allow" "view"]}]
         (rule/validation-errors {"myetype"
                                  {"bind" ["a" "b"
                                           "b" "c"
                                           "c" "d"
                                           "d" "e"
                                           "e" "a"]
                                   "allow" {"view" "e"}}}))))

(deftest validation-errors-passes
  (is (= () (rule/validation-errors {"myetype"
                                     {"bind" ["parent" "true"
                                              "child" "parent || true"]
                                      "allow" {"view" "parent"}}}))))

(deftest can-only-create-view-update-rules-for-users
  (is (= [{:message
           "The $users namespace doesn't support permissions for create. Set `$users.allow.create` to `\"false\"`.",
           :in ["$users" "allow" "create"]}]
         (rule/validation-errors {"$users" {"allow" {"create" "true"}}}))
      (= [{:message
           "The $users namespace doesn't support permissions for delete. Set `$users.allow.delete` to `\"false\"`.",
           :in ["$users" "allow" "delete"]}]
         (rule/validation-errors {"$users" {"allow" {"delete" "true"}}}))))

(deftest cant-write-rules-for-system-attrs
  (is (= [{:message
           "The $codes namespace is a reserved internal namespace that does not yet support rules.",
           :in ["$codes" "allow" "view"]}
          {:message
           "The $codes namespace is a reserved internal namespace that does not yet support rules.",
           :in ["$codes" "allow" "create"]}
          {:message
           "The $codes namespace is a reserved internal namespace that does not yet support rules.",
           :in ["$codes" "allow" "update"]}
          {:message
           "The $codes namespace is a reserved internal namespace that does not yet support rules.",
           :in ["$codes" "allow" "delete"]}]
         (rule/validation-errors {"$codes" {"allow" {"update" "true"}}}))))

(deftest invalid-syntax-fails
  (is (= [{:message
           "found no matching overload for '!_' applied to '(int)' (candidates: (bool))",
           :in ["myetype" "allow" "view"]}]
         (rule/validation-errors {"myetype" {"allow" {"view" "!10"}}}))))

(deftest invalid-auth-ref-fails
  (is (= [{:message "auth.ref arg must start with `$user.`",
           :in ["myetype" "allow" "view"]}]
         (rule/validation-errors {"myetype" {"allow" {"view" "1 in auth.ref('$users.id')"}}}))))

(deftest duplicate-bind-fails
  (is (= [{:message "bind should only contain a given variable name once",
           :in ["myetype" "bind" "duplicate"]}]
         (rule/validation-errors {"myetype" {"bind" ["duplicate" "true" "duplicate" "false"]
                                             "allow" {"view" "duplicate"}}}))))

(deftest uneven-binds-fail
  (is (= [{:message "bind should have an even number of elements",
           :in ["myetype" "bind"]}
          {:message "bind should have an even number of elements",
           :in ["myetype" "allow" "view"]}]
         (rule/validation-errors {"myetype" {"bind" ["duplicate"]
                                             "allow" {"view" "duplicate"}}})))

  (is (= [{:message "bind should have an even number of elements",
           :in ["myetype" "bind"]}
          {:message "bind should have an even number of elements",
           :in ["myetype" "allow" "view"]}]
         (rule/validation-errors  {"myetype" {"bind" ["duplicate"]
                                              "allow" {"view" "true"}}
                                   "new-etype" {"allow" {"view" "true"}}}))))

(defn pretty-program [p]
  (select-keys p [:etype :action :code]))

(deftest field-programs-compile
  (is (= {:etype "myetype"
          :action "view"
          :code "1 + 1"}
         (pretty-program
          (rule/get-field-program! {:code
                                    {"myetype"
                                     {"fields" {"email" "1 + 1"}}}} "myetype" "email")))))

(deftest field-programs-can-use-bind
  (is (= {:etype "myetype", :action "view", :code "cel.bind(test, 1 + 1, test)"}
         (pretty-program
          (rule/get-field-program! {:code {"myetype"
                                           {"bind" ["test" "1 + 1"]
                                            "fields" {"email" "test"}}}}
                                   "myetype"
                                   "email")))))

(deftest fields-cannot-set-id
  (is (= [{:in ["myetype" "fields"],
           :message
           "You cannot set field rules for `id`. Use myetype -> allow -> view instead"}]
         (rule/validation-errors {"myetype" {"fields" {"id" "1 + 1"}}}))))

(deftest fields-cannot-get-id
  (is (= {:data-type :permission,
          :input ["myetype" "fields" "id"],
          :errors
          {:message
           "You cannot set field rules for `id`. Use myetype -> allow -> view instead"}}
         (-> (test-util/instant-ex-data
              (rule/get-field-program!
               {:code {"myetype"
                       {"fields" {"id" "true"}}}}
               "myetype"
               "id"))
             ::ex/hint))))

(deftest field-programs-validate
  (is (= [{:message
           "found no matching overload for '!_' applied to '(int)' (candidates: (bool))",
           :in ["myetype" "fields" "email"]}]
         (rule/validation-errors {"myetype" {"fields" {"email" "!10"}}}))))

;; --------
;; $rooms

(deftest rooms-valid-rules-pass-validation
  (is (= () (rule/validation-errors
             {"$rooms" {"chat" {"allow" {"join" "auth.id != null"}}}}))))

(deftest rooms-invalid-cel-produces-errors
  (is (seq (rule/validation-errors
            {"$rooms" {"chat" {"allow" {"join" "invalid !!!"}}}}))))

(deftest rooms-with-bind-works
  (is (= () (rule/validation-errors
             {"$rooms" {"chat" {"allow" {"join" "isMember"}
                                "bind" ["isMember" "auth.id != null"]}}}))))

(deftest rooms-with-odd-bind-elements-produces-error
  (is (seq (rule/validation-errors
            {"$rooms" {"chat" {"allow" {"join" "true"}
                               "bind" ["isMember"]}}}))))

(deftest rooms-default-fallback-passes-validation
  (is (= () (rule/validation-errors
             {"$rooms" {"$default" {"allow" {"join" "auth.id != null"}}}}))))

(deftest rooms-does-not-interfere-with-entity-rules
  (is (= () (rule/validation-errors
             {"$rooms" {"chat" {"allow" {"join" "true"}}}
              "docs" {"allow" {"view" "true"}}}))))

(deftest get-room-program-returns-nil-when-no-rooms-key
  (is (nil? (rule/get-room-program! {:code {}} "chat" "join"))))

(deftest get-room-program-returns-nil-when-no-rooms-rules
  (is (nil? (rule/get-room-program! {:code {"docs" {"allow" {"view" "true"}}}} "chat" "join"))))

(deftest get-room-program-compiles-correct-program
  (let [program (rule/get-room-program!
                 {:code {"$rooms" {"chat" {"allow" {"join" "auth.id != null"}}}}}
                 "chat" "join")]
    (is (some? program))
    (is (= "auth.id != null" (:code program)))))

(deftest get-room-program-falls-back-to-default
  (let [program (rule/get-room-program!
                 {:code {"$rooms" {"$default" {"allow" {"join" "auth.id != null"}}}}}
                 "chat" "join")]
    (is (some? program))
    (is (= "auth.id != null" (:code program)))))

(deftest get-room-program-prefers-specific-over-default
  (let [program (rule/get-room-program!
                 {:code {"$rooms" {"chat" {"allow" {"join" "true"}}
                                   "$default" {"allow" {"join" "false"}}}}}
                 "chat" "join")]
    (is (some? program))
    (is (= "true" (:code program)))))

(deftest get-room-program-returns-nil-when-no-matching-rule
  (is (nil? (rule/get-room-program!
             {:code {"$rooms" {"chat" {"allow" {"join" "true"}}}}}
             "video" "join"))))

(deftest get-room-program-with-bind
  (let [program (rule/get-room-program!
                 {:code {"$rooms" {"chat" {"allow" {"join" "isMember"}
                                           "bind" ["isMember" "auth.id != null"]}}}}
                 "chat" "join")]
    (is (some? program))
    (is (= "cel.bind(isMember, auth.id != null, isMember)" (:code program)))))

(comment
  (test/run-tests *ns*))
