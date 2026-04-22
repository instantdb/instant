(ns instant.model.app-authorized-redirect-origin-test
  (:require [instant.model.app-authorized-redirect-origin :as sut]
            [clojure.test :as test :refer [deftest are is testing]]))

(deftest find-match
  (testing "find-match"
    (let [generic {:id (random-uuid) :service "generic" :params ["example.com"]}
          netlify {:id (random-uuid) :service "netlify" :params ["mysitename"]}
          vercel {:id (random-uuid) :service "vercel" :params ["vercel.app" "some-project-name"]}]
      (are [url result] (= result (sut/find-match [generic netlify vercel] url))
        "https://example.com/oauth/callback" generic
        "https://random-url.com/oauth/callback" nil
        "https://mysitename.netlify.app" netlify
        "https://deploy-preview-42--mysitename.netlify.app" netlify
        "https://some-project-name.vercel.app" vercel
        "https://some-project-name-git-some-branch-name.vercel.app" vercel))))

(deftest shared-credentials-default-match
  (testing "accepts http/https on loopback hosts and exp://"
    (are [url service] (= service (:service (sut/shared-credentials-default-match url)))
      "http://localhost"                "localhost"
      "http://localhost:3000"           "localhost"
      "https://localhost"               "localhost"
      "https://localhost:8443/foo"      "localhost"
      "http://127.0.0.1"                "localhost"
      "http://127.0.0.1:3000"           "localhost"
      "https://127.0.0.1:8443"          "localhost"
      "http://[::1]"                    "localhost"
      "http://[::1]:3000"               "localhost"
      "http://0.0.0.0"                  "localhost"
      "http://0.0.0.0:3000"             "localhost"
      "exp://"                          "custom-scheme"
      "exp://192.168.1.5:8081"          "custom-scheme"
      "exp://exp.host/@user/slug"       "custom-scheme"))
  (testing "rejects other schemes on loopback hosts, non-exp custom schemes, and arbitrary domains"
    (are [url] (nil? (sut/shared-credentials-default-match url))
      "file://localhost"
      "custom://localhost"
      "ftp://localhost"
      "file://127.0.0.1"
      "https://example.com"
      "https://localhost.example.com"
      "https://127.0.0.1.nip.io"
      "myapp://"
      "")))

(deftest authorized-origin?
  (testing "delegates to find-match first"
    (let [generic {:id (random-uuid) :service "generic" :params ["example.com"]}]
      (is (true?  (sut/authorized-origin? [generic] "https://example.com" false)))
      (is (false? (sut/authorized-origin? [generic] "https://other.com"   false)))))
  (testing "without shared credentials, localhost and exp:// are not auto-allowed"
    (is (false? (sut/authorized-origin? [] "http://localhost:3000" false)))
    (is (false? (sut/authorized-origin? [] "exp://"                false))))
  (testing "with shared credentials, localhost and exp:// fall back to default-match"
    (is (true?  (sut/authorized-origin? [] "http://localhost:3000" true)))
    (is (true?  (sut/authorized-origin? [] "exp://"                true)))
    (is (false? (sut/authorized-origin? [] "https://example.com"   true)))))
