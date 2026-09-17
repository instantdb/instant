(ns instant.lib.ring.websocket-test
  (:require [clojure.test :refer [deftest is testing]]
            [instant.lib.ring.websocket :as ws]))

(deftest inactive?-needs-an-unanswered-ping
  (let [idle-timeout-ms 15000]
    (testing "no ping has been sent yet"
      (is (not (ws/inactive? 100000 0 0 idle-timeout-ms))))
    (testing "the ping was answered, even if the next check runs late"
      (is (not (ws/inactive? 40000 10100 10000 idle-timeout-ms))))
    (testing "any message after the ping counts as an answer"
      (is (not (ws/inactive? 30000 12000 10000 idle-timeout-ms))))
    (testing "an unanswered ping inside the timeout"
      (is (not (ws/inactive? 25000 5000 10000 idle-timeout-ms))))
    (testing "an unanswered ping past the timeout"
      (is (ws/inactive? 25001 5000 10000 idle-timeout-ms)))))
