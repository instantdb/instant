(ns instant.jdbc.sql-test
  (:require
   [honey.sql :as hsql]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.util.test :refer [wait-for]]
   [clojure.test :refer [deftest testing is]])
  (:import
   (java.time Instant)
   (java.time.temporal ChronoUnit)
   (java.sql Timestamp)
   (clojure.lang ExceptionInfo)))

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

(deftest coercion
  (testing "text[]"
    (is (= {:v ["hello" "world"]}
           (sql/select-one (aurora/conn-pool :read)
                           ["select ? as v" (with-meta ["hello" "world"] {:pgtype "text[]"})]))))

  (testing "uuid[]"
    (let [ids [#uuid "c94c255f-9f2f-4484-9868-54a41786b613"
               #uuid "6454f319-e532-4955-b93a-654e6baedde7"]]
      (is (= {:v ids}
             (sql/select-one (aurora/conn-pool :read)
                             ["select ? as v" (with-meta ids {:pgtype "uuid[]"})])))))

  (testing "jsonb[]"
    (let [vs [{"a" 1} nil [{"b" 2}]]]
      (is (= {:v vs}
             (sql/select-one (aurora/conn-pool :read)
                             ["select ? as v" (with-meta vs {:pgtype "jsonb[]"})])))))

  (testing "jsonb[]"
    (let [vs [{"a" 1} nil [{"b" 2}]]]
      (is (= {:v vs}
             (sql/select-one (aurora/conn-pool :read)
                             ["select ? as v" (with-meta vs {:pgtype "jsonb[]"})])))))

  (testing "timestamptz[]"
    (let [vs [(Instant/now)
              (Instant/now)]
          vs-res (:v (sql/select-one (aurora/conn-pool :read)
                                     ["select ? as v" (with-meta vs {:pgtype "timestamptz[]"})]))]
      (is (= 2 (count vs-res)))
      (is (= (-> vs
                 ^Instant first
                 (.truncatedTo ChronoUnit/MICROS)
                 (Timestamp/from))
             (first vs-res)))
      (is (= (-> vs
                 ^Instant second
                 (.truncatedTo ChronoUnit/MICROS)
                 (Timestamp/from))
             (second vs-res)))))

  (testing "float8[]"
    (let [vs [1.0 0.5 -10.0]]
      (is (= {:v vs}
             (sql/select-one (aurora/conn-pool :read)
                             ["select ? as v" (with-meta vs {:pgtype "float8[]"})])))))

  (testing "boolean[]"
    (let [vs [true false true]]
      (is (= {:v vs}
             (sql/select-one (aurora/conn-pool :read)
                             ["select ? as v" (with-meta vs {:pgtype "boolean[]"})]))))))

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
