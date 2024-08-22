(ns instant.jdbc.sql-test
  (:require [instant.jdbc.sql :as sql]
            [clojure.test :refer [deftest testing are]]))

(deftest ->pgobject
  (testing "formats text[]"
    (are [input result] (= (.getValue (sql/->pgobject (with-meta input {:pgtype "text[]"})))
                           result)
      ["a" "b" "c"] "{\"a\",\"b\",\"c\"}"
      ["a\"b"] "{\"a\"b\"}")))
