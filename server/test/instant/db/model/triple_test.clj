(ns instant.db.model.triple-test
  (:require [instant.db.model.triple :as triple]
            [instant.jdbc.aurora :as aurora]
            [instant.jdbc.sql :as sql]
            [instant.util.json :refer [->json]]
            [honey.sql :as hsql]
            [clojure.test :refer [is deftest testing]])
  (:import [java.util Date]))

(deftest parse-date-value-works-for-valid-dates
  (doseq [s ["Sat, 05 Apr 2025 18:00:31 GMT"
             "2025-01-01T00:00:00Z"
             "2025-01-01"
             "2025-01-02T00:00:00-08"
             "\"2025-01-02T00:00:00-08\""
             "2025-01-15 20:53:08"
             "\"2025-01-15 20:53:08\""
             "Wed Jul 09 2025"]]
    (testing (str "Date string `" s "` parses.")
      (let [query {:select [[[:triples_extract_date_value [:cast (->json s) :jsonb]]
                             :date]]}
            pg-date (-> (sql/select-one ::parse-date-value
                                        (aurora/conn-pool :read)
                                        (hsql/format query)
                                        {:postgres-config [{:setting "timezone"
                                                            :value "UTC"}]})
                        :date
                        (Date/.toInstant))]

        (is (= pg-date
               (triple/parse-date-value s)))))))

(deftest parse-date-value-throws-for-invalid-dates
  (doseq [s ["2025-01-0"
             "\"2025-01-0\""]]
    (is (thrown-with-msg? Exception #"Unable to parse" (triple/parse-date-value s)))))
