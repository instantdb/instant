(ns instant.jdbc.sql-test
  (:require
   [honey.sql :as hsql]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.util.test :refer [wait-for]]
   [clojure.test :refer [deftest testing is are]])
  (:import
   [clojure.lang ExceptionInfo]))

(deftest ->pgobject
  (testing "formats text[]"
    (are [input result] (= (.getValue (sql/->pgobject (with-meta input {:pgtype "text[]"})))
                           result)
      ["a" "b" "c"] "{\"a\",\"b\",\"c\"}"
      ["a\"b"] "{\"a\"b\"}")))

(deftest in-progress-stmts
  (let [in-progress (sql/make-statement-tracker)]
    (binding [sql/*in-progress-stmts* in-progress]
      (let [query (future (sql/select (aurora/conn-pool :read) ["select pg_sleep(3)"]))]
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
      (sql/select (aurora/conn-pool :read) ["select 1"])
      (is (= 0 (count @(:stmts in-progress)))))))

(deftest cant-write-on-a-readonly-connection
  (is (thrown-with-msg? clojure.lang.ExceptionInfo
                        #"read-only-sql-transaction"
                        (sql/execute! (aurora/conn-pool :read)
                                      ["insert into config (k, v) values ('a', '\"b\"'::jsonb)"]))))

(deftest elementset-test
  (let [xs [1 2 3]
        column {:as 'id, :type :int}
        expected [{:id 1} {:id 2} {:id 3}]]
    (is (= expected
           (sql/do-execute!
            (aurora/conn-pool :read)
            (hsql/format
             (sql/elementset xs column)))))
    (is (= []
           (sql/do-execute!
            (aurora/conn-pool :read)
            (hsql/format
             (sql/elementset [] column)))))))

(deftest tupleset-test
  (let [ts [[1 "Ivan" 85]
            [2 "Oleg" 92]
            [3 "Petr" 68]]
        columns [{:as 'id, :type :int}
                 {:as 'full-name}
                 {:as 'score, :type :int}]
        expected [{:id 1, :full_name "Ivan", :score 85}
                  {:id 2, :full_name "Oleg", :score 92}
                  {:id 3, :full_name "Petr", :score 68}]]
    (is (= expected
           (sql/do-execute!
            (aurora/conn-pool :read)
            (hsql/format
             (sql/tupleset ts columns)))))
    (is (= []
           (sql/do-execute!
            (aurora/conn-pool :read)
            (hsql/format
             (sql/tupleset [] columns)))))))

(deftest recordset-test
  (let [rs [{:id 1, :name "Ivan", :score 85}
            {:id 2, :name "Oleg", :score 92}
            {:id 3, :name "Petr", :score 68}]
        columns {'id    {:type :int}
                 'name  {:as 'full-name}
                 'score {:type :int}}
        expected [{:id 1, :full_name "Ivan", :score 85}
                  {:id 2, :full_name "Oleg", :score 92}
                  {:id 3, :full_name "Petr", :score 68}]]
    (is (= expected
           (sql/do-execute!
            (aurora/conn-pool :read)
            (hsql/format
             (sql/recordset rs columns)))))
    (is (= []
           (sql/do-execute!
            (aurora/conn-pool :read)
            (hsql/format
             (sql/recordset [] columns)))))))

(deftest format-test
  (testing "static"
    (is (= ["WHERE ? = ? OR ? = ?" 1 2 1 3]
           (sql/format "WHERE ?a = ?b OR ?a = ?c" {"?a" 1, "?b" 2, "?c" 3})))
    (is (thrown-with-msg? ExceptionInfo #"Missing parameter: \?b"
                          (sql/format "WHERE ?a = ?b" {"?a" 1}))))
  (testing "dynamic"
    (is (= ["WHERE ? = ? OR ? = ?" 1 2 1 3]
           (let [q "WHERE ?a = ?b OR ?a = ?c"]
             (sql/format q {"?a" 1, "?b" 2, "?c" 3}))))
    (is (thrown-with-msg? ExceptionInfo #"Missing parameter: \?b"
                          (let [q "WHERE ?a = ?b"]
                            (sql/format q {"?a" 1}))))))
