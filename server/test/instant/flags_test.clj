(ns instant.flags-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [instant.flags :as flags]))

(deftest dashboard-signup-settings
  (testing "open is the default"
    (let [result (flags/transform-query-result {})]
      (is (= :open (:dashboard-signup-mode result)))
      (is (= #{} (:dashboard-allowed-emails result)))))

  (testing "settings and allowed emails are normalized"
    (let [result
          (flags/transform-query-result
           {"flags" [{"setting" "dashboard-signups"
                      "value" {"mode" "restricted"
                               "allowedEmails" [" Admin@Example.com "
                                                "person@example.com"
                                                nil]}}]})]
      (is (= :restricted (:dashboard-signup-mode result)))
      (is (= #{"admin@example.com" "person@example.com"}
             (:dashboard-allowed-emails result)))))

  (testing "malformed settings fall back to open"
    (let [result
          (flags/transform-query-result
           {"flags" [{"setting" "dashboard-signups"
                      "value" {"mode" "invalid"
                               "allowedEmails" "person@example.com"}}]})]
      (is (= :open (:dashboard-signup-mode result)))
      (is (= #{} (:dashboard-allowed-emails result)))))

  (testing "the policy matches each mode"
    (with-redefs [flags/query-result
                  (constantly
                   {:dashboard-signup-mode :open
                    :dashboard-allowed-emails #{}})]
      (is (flags/dashboard-signup-allowed? "anyone@example.com")))

    (with-redefs [flags/query-result
                  (constantly
                   {:dashboard-signup-mode :restricted
                    :dashboard-allowed-emails #{"person@example.com"}})]
      (is (flags/dashboard-signup-allowed? " Person@Example.com "))
      (is (not (flags/dashboard-signup-allowed? "other@example.com"))))

    (with-redefs [flags/query-result
                  (constantly
                   {:dashboard-signup-mode :closed
                    :dashboard-allowed-emails #{"person@example.com"}})]
      (is (not (flags/dashboard-signup-allowed? "person@example.com"))))))
