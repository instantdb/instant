(ns instant.flags-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [instant.flags :as flags])
  (:import
   (java.net URI)))

(defn- transform-app-proxy-targets [targets]
  (get-in (flags/transform-query-result
           {"flags" [{"setting" "app-proxy-targets"
                      "value" targets}]})
          [:flags :app-proxy-targets]))

(deftest parses-app-proxy-targets
  (let [app-id (random-uuid)]
    (is (= {app-id (URI. "https://selfhostedinstant.example.com")}
           (transform-app-proxy-targets
            {(str app-id) "https://selfhostedinstant.example.com/"})))
    (testing "invalid app ids and non-origin targets are ignored"
      (is (= {}
             (transform-app-proxy-targets
              {"not-an-app" "https://selfhostedinstant.example.com"
               (str app-id) "https://user@selfhostedinstant.example.com/path?query=yes"}))))))
