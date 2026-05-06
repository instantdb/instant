(ns instant.pg.timestamp-test
  "Regression suite for `instant.pg.PgTimestamp`, the Java port of PostgreSQL's
   `timestamp with time zone` input parser. The fixtures in
   `timestamptz_cases.edn` were extracted from PostgreSQL's own regression
   tests (`src/test/regress/sql/{timestamptz,horology}.sql`) and run through a
   live `psql` with `DateStyle='ISO,MDY'` and `TimeZone='UTC'` to capture
   canonical results."
  (:require
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.test :refer [deftest is testing]])
  (:import
   (instant.pg PgTimestamp PgTimestamp$PgDateTimeException)
   (java.time Instant)))

(def ^:private cases
  (-> "instant/pg/timestamptz_cases.edn"
      io/resource
      slurp
      edn/read-string))

(defn- instant->usec
  "Convert a `java.time.Instant` to total microseconds since the Unix epoch.
   Uses auto-promoting arithmetic so very-far-future fixtures (PG accepts
   year ~294276) don't overflow Long."
  [^Instant inst]
  (+' (*' (.getEpochSecond inst) 1000000)
      (quot (.getNano inst) 1000)))

(defn- run-case
  "Returns one of:
     {:status :ok       :usec n}
     {:status :infinity :which :pos|:neg}
     {:status :error    :msg \"...\"}"
  [^String input]
  (try
    (let [^Instant inst (PgTimestamp/extractDateValue input)]
      (cond
        (= inst Instant/MAX) {:status :infinity :which :pos}
        (= inst Instant/MIN) {:status :infinity :which :neg}
        :else {:status :ok :usec (instant->usec inst)}))
    (catch PgTimestamp$PgDateTimeException e
      {:status :error :msg (.getMessage e)})))

;; XXX: For each test case, pass it through the database also

(deftest extract-date-value-matches-postgres
  (testing "every PostgreSQL regression-test literal gives the same result as psql"
    (doseq [c cases]
      (let [{:keys [input usec error infinity]} c]
        (testing (str input)
          (let [actual (run-case input)]
            (cond
              ;; expected: error
              error
              (is (= :error (:status actual))
                  (format "input %s should error but got %s" (pr-str input) actual))

              ;; expected: +infinity / -infinity
              infinity
              (is (= {:status :infinity :which infinity} actual)
                  (format "input %s expected infinity %s but got %s"
                          (pr-str input) infinity actual))

              ;; expected: a specific epoch microsecond value
              (some? usec)
              (is (= {:status :ok :usec usec} actual)
                  (format "input %s expected %s µs but got %s"
                          (pr-str input) usec actual)))))))))

(deftest json-dispatch
  (testing "extractDateValue dispatches like triples_extract_date_value"
    (is (= 0 (instant->usec (PgTimestamp/extractDateValue (Long/valueOf 0)))))
    (is (= 1700000000000000
           (instant->usec (PgTimestamp/extractDateValue (Long/valueOf 1700000000000)))))
    (is (= 1700000000123456
           (instant->usec (PgTimestamp/extractDateValue (Double/valueOf 1700000000123.456)))))
    (testing "non-number, non-string returns null"
      (is (nil? (PgTimestamp/extractDateValue nil)))
      (is (nil? (PgTimestamp/extractDateValue Boolean/TRUE)))
      (is (nil? (PgTimestamp/extractDateValue [1 2 3]))))))
