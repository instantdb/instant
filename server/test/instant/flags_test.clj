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

(deftest magic-code-rate-limit
  (testing "positive integers are accepted"
    (with-redefs [flags/flag (constantly 10)]
      (is (= 10 (flags/magic-code-rate-limit-per-hour)))))

  (testing "invalid values use the safe default"
    (doseq [value [nil 0 -1 1.5 "10"]]
      (with-redefs [flags/flag (constantly value)]
        (is (= 20 (flags/magic-code-rate-limit-per-hour)))))))

(deftest ephemeral-apps-enabled
  (testing "temporary apps are enabled by default"
    (with-redefs [flags/flag (fn [_key not-found] not-found)]
      (is (true? (flags/ephemeral-apps-enabled?)))))

  (testing "temporary apps can be disabled"
    (with-redefs [flags/flag (constantly false)]
      (is (false? (flags/ephemeral-apps-enabled?))))))

(deftest scoped-write-plans-require-explicit-opt-in
  (let [app-id #uuid "1c436238-c543-44d0-9a6b-51f7e5b840e3"
        enabled {(str app-id) {"bitcoin-prices" true}}]
    (with-redefs [flags/query-result (constantly {})]
      (binding [flags/*flag-overrides* {:scoped-write-plans enabled}]
        (is (true? (flags/scoped-write-plan-enabled? app-id :bitcoin-prices)))
        (is (false? (flags/scoped-write-plan-enabled? (random-uuid) :bitcoin-prices)))
        (is (false? (flags/scoped-write-plan-enabled? app-id :citybikes-free-bikes)))
        (doseq [kill-switch [:disable-scoped-write-plans :disable-pg-hints]]
          (binding [flags/*toggle-overrides* {kill-switch true}]
            (is (false? (flags/scoped-write-plan-enabled? app-id :bitcoin-prices))))))
      (doseq [value [nil {} {(str app-id) {"bitcoin-prices" false}}
                    {(str app-id) {"bitcoin-prices" "true"}}
                    {(str app-id) {"bitcoin-prices" 1}}]]
        (binding [flags/*flag-overrides* {:scoped-write-plans value}]
          (is (false? (flags/scoped-write-plan-enabled? app-id :bitcoin-prices))))))))

(deftest pkey-null-padding-apps-are-listed-explicitly
  (let [app-id (random-uuid)]
    (with-redefs [flags/query-result (constantly {})]
      (binding [flags/*flag-overrides* {:pkey-null-padding-apps #{app-id}}]
        (is (true? (flags/pkey-null-padding-app? app-id)))
        (is (false? (flags/pkey-null-padding-app? (random-uuid))))
        (doseq [kill-switch [:disable-scoped-write-plans :disable-pg-hints]]
          (binding [flags/*toggle-overrides* {kill-switch true}]
            (is (false? (flags/pkey-null-padding-app? app-id))))))
      (is (false? (flags/pkey-null-padding-app? app-id)))
      (is (= #{app-id}
             (-> (flags/transform-query-result
                  {"flags" [{"setting" "pkey-null-padding-apps"
                             "value" [(str app-id) "not-a-uuid"]}]})
                 :flags
                 :pkey-null-padding-apps))))))

(deftest query-circuit-breaker-flag-parsing
  (let [app-id (random-uuid)]
    (is (nil? (flags/parse-query-circuit-breaker-flag nil)))
    (is (nil? (flags/parse-query-circuit-breaker-flag "true")))
    (is (= {:enabled? false
            :failure-threshold 3
            :window-ms 600000
            :open-ms 300000
            :apps #{}}
           (flags/parse-query-circuit-breaker-flag {})))
    (is (= {:enabled? true
            :failure-threshold 2
            :window-ms 60000
            :open-ms 1000
            :apps #{app-id}}
           (flags/parse-query-circuit-breaker-flag
            {"enabled" true "failure-threshold" 2 "window-ms" 60000
             "open-ms" 1000.0 "apps" [(str app-id)]})))
    (testing "junk values fall back to defaults"
      (is (= 3 (:failure-threshold
                (flags/parse-query-circuit-breaker-flag {"failure-threshold" "2"})))))
    (with-redefs [flags/query-result (constantly {})]
      (let [global (flags/parse-query-circuit-breaker-flag {"enabled" true})
            scoped (flags/parse-query-circuit-breaker-flag {"enabled" true "apps" [(str app-id)]})
            disabled (flags/parse-query-circuit-breaker-flag {"apps" [(str app-id)]})]
        (binding [flags/*flag-overrides* {:query-circuit-breaker global}]
          (is (= global (flags/query-circuit-breaker-config (random-uuid)))))
        (binding [flags/*flag-overrides* {:query-circuit-breaker scoped}]
          (is (= scoped (flags/query-circuit-breaker-config app-id)))
          (is (nil? (flags/query-circuit-breaker-config (random-uuid)))))
        (binding [flags/*flag-overrides* {:query-circuit-breaker disabled}]
          (is (nil? (flags/query-circuit-breaker-config app-id))))
        (is (nil? (flags/query-circuit-breaker-config app-id)))))))
