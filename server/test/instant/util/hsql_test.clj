(ns instant.util.hsql-test
  (:require
   [clojure.test :refer [deftest is]]
   [honey.sql :as hsql]
   [instant.util.hsql :as uhsql]
   [instant.util.pg-hint-plan :as pg-hint]))

(deftest join-order-hints-preserve-pair-direction
  (doseq [[hint expected]
          [[(pg-hint/leading :m-7 :t8) "Leading(m_7 t8)"]
           [(pg-hint/leading [:m-7 :t8]) "Leading((m_7 t8))"]
           [(pg-hint/leading [[:m-7 :t8] :t9]) "Leading(((m_7 t8) t9))"]
           [(pg-hint/leading [:m-7 [:t8 :t9]]) "Leading((m_7 (t8 t9)))"]
           [(pg-hint/nest-loop :m-7 :t8) "NestLoop(m_7 t8)"]
           [(pg-hint/rows :m-7 :t8 1000) "Rows(m_7 t8 #1000)"]
           [(pg-hint/parallel :t8 2 :hard) "Parallel(t8 2 hard)"]]]
    (is (= [(str "/*+\n" expected "\n*/ SELECT * FROM triples")]
           (hsql/format {:select :* :from :triples :pg-hints [hint]})))))

(deftest join-order-hints-reject-malformed-pairs
  (doseq [hint [(pg-hint/leading [:m-7])
                (pg-hint/leading [:m-7 :t8 :t9])
                (pg-hint/leading :m-7 [:t8 :t9])
                (pg-hint/leading [[:m-7] :t8])]]
    (is (thrown? AssertionError
                 (hsql/format {:select :* :from :triples :pg-hints [hint]})))))

(deftest formatp-works-the-same-as-format
  (doseq [{:keys [query params]}
          [{:query {:select :* :from :apps}}
           {:query {:select :* :from :apps :where [:= :id :?id]}
            :params {:id 1}}]
          :let [preformatted (uhsql/preformat query)]]
    (is (= (hsql/format query {:params params})
           (uhsql/formatp preformatted params))
        (str "query did not match, query=" query))))

(deftest preformat-rejects-non-named-parameters
  (is (thrown? AssertionError
               (uhsql/preformat {:select :* :from :apps :where [:= :id 1]}))))
