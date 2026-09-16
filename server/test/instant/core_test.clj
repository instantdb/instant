(ns instant.core-test
  (:require
   [clojure.string :as string]
   [clojure.test :refer [deftest is testing]]
   [instant.core :as core]))

(defn- csp [resp]
  (get-in (core/add-security-headers resp) [:headers "Content-Security-Policy"]))

(deftest add-security-headers-csp
  (testing "denies by default and keeps script-src self"
    (let [policy (csp {:headers {}})]
      (is (string/includes? policy "default-src 'none'"))
      (is (string/includes? policy "script-src 'self'"))
      (is (string/includes? policy "object-src 'none'"))
      (is (string/includes? policy "base-uri 'self'"))
      (is (string/includes? policy "frame-ancestors 'none'"))))

  (testing "hashes inline scripts in script-src"
    (let [policy (csp {:headers {} :inline-scripts ["alert(1)"]})]
      (is (re-find #"script-src 'self' 'sha256-[A-Za-z0-9+/=]+'" policy))
      (is (string/includes? policy "default-src 'none'")))))
