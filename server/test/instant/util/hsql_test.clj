(ns instant.util.hsql-test
  (:require
   [clojure.test :refer [deftest is]]
   [honey.sql :as hsql]
   [instant.util.hsql :as uhsql]))

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
