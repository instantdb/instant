(ns instant.storage.s3-test
  (:require [clojure.test :as test :refer [deftest are]]
            [instant.storage.s3 :as storage-s3])
  (:import [java.time ZonedDateTime]))

(deftest bucketed-zdate
  (let [start-of-week (ZonedDateTime/parse
                       "2025-03-03T00:00-08:00[America/Los_Angeles]")
        mid-week (ZonedDateTime/parse
                  "2025-03-06T12:00-08:00[America/Los_Angeles]")
        mon-9am (ZonedDateTime/parse
                 "2025-03-03T09:00-08:00[America/Los_Angeles]")
        tue-3pm (ZonedDateTime/parse
                 "2025-03-04T15:00-08:00[America/Los_Angeles]")
        wed-11pm (ZonedDateTime/parse
                  "2025-03-05T23:00-08:00[America/Los_Angeles]")
        thu-1am (ZonedDateTime/parse
                 "2025-03-06T01:00-08:00[America/Los_Angeles]")
        thu-2pm (ZonedDateTime/parse
                 "2025-03-06T14:00-08:00[America/Los_Angeles]")
        sat-11pm (ZonedDateTime/parse
                  "2025-03-08T23:00-08:00[America/Los_Angeles]")
        sun-midnight (ZonedDateTime/parse
                      "2025-03-09T00:00-08:00[America/Los_Angeles]")]

    (are
     [date expected] (= expected (storage-s3/bucketed-zdate date))
      start-of-week start-of-week
      mon-9am start-of-week
      tue-3pm start-of-week
      wed-11pm start-of-week
      thu-1am start-of-week
      mid-week mid-week
      thu-2pm mid-week
      sat-11pm mid-week
      sun-midnight mid-week)))

(comment
  (test/run-tests *ns*))
