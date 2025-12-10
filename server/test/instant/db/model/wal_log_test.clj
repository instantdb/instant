(ns instant.db.model.wal-log-test
  (:require [instant.db.model.wal-log :as wal-log]
            [clojure.test :refer [deftest is testing]])
  (:import (java.time ZonedDateTime ZoneOffset)))

(deftest partitions-to-truncate-does-second-oldest-partitions
  (doseq [[hour expected] [[0 [2 3]]
                           [1 [3 4]]
                           [2 [4 5]]
                           [3 [5 6]]
                           [4 [6 7]]
                           [5 [7 0]]
                           [6 [0 1]]
                           [7 [1 2]]
                           [8 [2 3]]
                           [9 [3 4]]
                           [10 [4 5]]
                           [11 [5 6]]
                           [12 [6 7]]
                           [13 [7 0]]
                           [14 [0 1]]
                           [15 [1 2]]
                           [16 [2 3]]
                           [17 [3 4]]
                           [18 [4 5]]
                           [19 [5 6]]
                           [20 [6 7]]
                           [21 [7 0]]
                           [22 [0 1]]
                           [23 [1 2]]]]
    (testing (format "Hour %s should be %s" hour expected)
      (is (= expected (wal-log/partitions-to-truncate (.withHour (ZonedDateTime/now ZoneOffset/UTC)
                                                                 hour)))))))
