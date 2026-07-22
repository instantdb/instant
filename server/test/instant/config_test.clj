(ns instant.config-test
  (:require [clojure.test :refer [deftest is testing]]
            [instant.config :as config]
            [instant.util.crypt :as crypt-util]))

(deftest google-oauth-client-test
  (let [config-client {:client-id "config-client-id"
                       :client-secret (crypt-util/obfuscate "config-client-secret")}]
    (with-redefs [config/config-map (delay {:google-oauth-client config-client})]
      (testing "uses the existing config when environment variables are blank"
        (is (= config-client (config/get-google-oauth-client nil nil)))
        (is (= config-client (config/get-google-oauth-client "" " "))))

      (testing "environment variables override the existing config"
        (let [client (config/get-google-oauth-client "env-client-id" "env-client-secret")]
          (is (= "env-client-id" (:client-id client)))
          (is (= "env-client-secret"
                 (crypt-util/secret-value (:client-secret client))))))

      (testing "both environment variables are required"
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"must be set together"
             (config/get-google-oauth-client "env-client-id" nil)))
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"must be set together"
             (config/get-google-oauth-client nil "env-client-secret")))))))
