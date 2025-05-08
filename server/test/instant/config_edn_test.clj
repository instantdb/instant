(ns instant.config-edn-test
  (:require [instant.config-edn :as config-edn]
            [clojure.test :refer [deftest testing is]]))

(deftest config-smoketest
  (testing "dev config"
    ;; If this test fails, then there is either something wrong
    ;; with the types in instant.config-edn or with the config in
    ;; resources/config/dev.edn
    (is (config-edn/valid-config? false (config-edn/read-config :dev))))
  (testing "prod config"
    ;; If this test fails, then there is either something wrong
    ;; with the types in instant.config-edn or with the config in
    ;; resources/config/prod.edn
    (is (config-edn/valid-config? true (config-edn/read-config :prod))))
  (testing "staging config"
    ;; If this test fails, then there is either something wrong
    ;; with the types in instant.config-edn or with the config in
    ;; resources/config/staging.edn
    (is (config-edn/valid-config? true (config-edn/read-config :staging)))))
