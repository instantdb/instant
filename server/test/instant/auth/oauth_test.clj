(ns instant.auth.oauth-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [instant.auth.oauth :as oauth]))

(deftest fetch-discovery-throws-on-invalid-urls
  (testing "unparseable / non-http(s) urls are rejected before any request"
    (is (thrown? Exception (oauth/fetch-discovery "not-a-url")))
    (is (thrown? Exception (oauth/fetch-discovery "ftp://example.com/x")))
    (is (thrown? Exception (oauth/fetch-discovery "file:///etc/passwd"))))
  (testing "urls whose host is an unsafe (SSRF) literal ip are rejected"
    (is (thrown? Exception
                 (oauth/fetch-discovery
                  "http://169.254.169.254/latest/meta-data/")))
    (is (thrown? Exception
                 (oauth/fetch-discovery
                  "http://127.0.0.1/.well-known/openid-configuration")))))

(deftest rejects-discovery-doc-with-unsafe-token-endpoint
  (testing "a safe discovery endpoint but unsafe token_endpoint is rejected"
    (is (thrown? Exception
                 (oauth/assert-safe-discovery-endpoints!
                  {:token_endpoint "http://169.254.169.254/token"
                   :userinfo_endpoint "https://safe.example.com/userinfo"}))))
  (testing "an unsafe userinfo_endpoint is rejected"
    (is (thrown? Exception
                 (oauth/assert-safe-discovery-endpoints!
                  {:token_endpoint "https://safe.example.com/token"
                   :userinfo_endpoint "http://127.0.0.1/userinfo"}))))
  (testing "an unsafe jwks_uri is rejected"
    (is (thrown? Exception
                 (oauth/assert-safe-discovery-endpoints!
                  {:token_endpoint "https://safe.example.com/token"
                   :jwks_uri "http://169.254.169.254/jwks"}))))
  (testing "a fully safe discovery document is accepted"
    (is (oauth/assert-safe-discovery-endpoints!
         {:token_endpoint "https://safe.example.com/token"
          :userinfo_endpoint "https://safe.example.com/userinfo"
          :jwks_uri "https://safe.example.com/jwks"}))))
