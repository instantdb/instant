(ns instant.storage.s3-test
  (:require [clojure.test :as test :refer [deftest is]]
            [instant.storage.s3 :as storage-s3]
            [instant.util.date :as date-util])
  (:import [java.time ZonedDateTime]))

(deftest bucketed-zdate
  (let [mon-9am (ZonedDateTime/parse "2025-03-04T21:19:48.467889Z[UTC]")
        start-of-day-instant (.toInstant (ZonedDateTime/parse "2025-03-04T00:00:00.000000Z[UTC]"))]
    (with-redefs [date-util/utc-now (fn [] mon-9am)]
      (is (= start-of-day-instant (storage-s3/bucketed-signing-instant))))))

(comment
  (test/run-tests *ns*))
