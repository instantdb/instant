(ns instant.util.uuid-test
  (:require
   [honey.sql :as hsql]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.util.uuid :as uuid-util]
   [clojure.test :refer [deftest is]]))

(deftest pg-compare
  (let [ids (repeatedly 10000 #(random-uuid))]
    (is (= (sort uuid-util/pg-compare ids)
           (map :id
                (sql/select (aurora/conn-pool)
                            (hsql/format {:select :id

                                          :from [[[:unnest [:array
                                                            (with-meta ids {:pgtype "uuid[]"})]]
                                                  :id]]
                                          :order-by [[:id :asc]]})))))
    (is (= (reverse (sort uuid-util/pg-compare ids))
           (map :id
                (sql/select (aurora/conn-pool)
                            (hsql/format {:select :id

                                          :from [[[:unnest [:array
                                                            (with-meta ids {:pgtype "uuid[]"})]]
                                                  :id]]
                                          :order-by [[:id :desc]]})))))))
