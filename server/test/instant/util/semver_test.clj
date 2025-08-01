(ns instant.util.semver-test
  (:require
   [clojure.test :refer [deftest is]]
   [instant.util.semver :as semver]))

(deftest semver-parse
  (is (= {:major 1 :minor 10 :patch 1000 :dev? true}
         (semver/parse "v1.10.1000-dev")))

  (is (= {:major 1 :minor 10 :patch 1000 :dev? true}
         (semver/parse "1.10.1000-dev")))

  (is (= {:major 1 :minor 2 :patch 3 :dev? false}
         (semver/parse "1.2.3"))))

(deftest semver-compare
  (is (= ["v0.1.2" "v0.1.2-dev" "1.1.2" "1.2.3" "2.3.3-dev" "2.3.4"]
         (sort semver/compare-semver
               (shuffle ["v0.1.2"
                         "v0.1.2-dev"
                         "1.1.2"
                         "1.2.3"
                         "2.3.4"
                         "2.3.3-dev"])))))
