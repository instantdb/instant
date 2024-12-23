(ns instant.jdbc.sql-test
  (:require [instant.jdbc.aurora :as aurora]
            [instant.jdbc.sql :as sql]
            [instant.util.test :refer [wait-for]]
            [clojure.test :refer [deftest testing is are]]))

(deftest ->pgobject
  (testing "formats text[]"
    (are [input result] (= (.getValue (sql/->pgobject (with-meta input {:pgtype "text[]"})))
                           result)
      ["a" "b" "c"] "{\"a\",\"b\",\"c\"}"
      ["a\"b"] "{\"a\"b\"}")))

(deftest in-progress-stmts
  (let [in-progress (sql/make-statement-tracker)]
    (binding [sql/*in-progress-stmts* in-progress]
      (let [query (future (sql/select (aurora/conn-pool) ["select pg_sleep(3)"]))]
        (wait-for (fn []
                    (= 1 (count @(:stmts in-progress))))
                  1000)
        (is (= 1 (count @(:stmts in-progress))))
        (is (not (future-done? query)))
        (sql/cancel-in-progress in-progress)
        (wait-for (fn []
                    (future-done? query))
                  1000)
        (is (future-done? query))
        (is (thrown? Exception @query))
        (is (= 0 (count @(:stmts in-progress))))))))

(deftest in-progress-removes-itself-on-query-completion
  (let [in-progress (sql/make-statement-tracker)]
    (binding [sql/*in-progress-stmts* in-progress]
      (let [query (sql/select (aurora/conn-pool) ["select 1"])]
        (is (= 0 (count @(:stmts in-progress))))))))
