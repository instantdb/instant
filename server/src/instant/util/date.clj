(ns instant.util.date
  (:import
   (java.io Writer)
   (java.time Instant ZoneId ZonedDateTime ZoneRegion LocalDate)
   (java.time.format DateTimeFormatter)
   (java.time.temporal TemporalAdjusters)))

(def ^ZoneRegion pt-zone (ZoneId/of "America/Los_Angeles"))
(def ^ZoneRegion et-zone (ZoneId/of "America/New_York"))
(def ^ZoneRegion utc-zone (ZoneId/of "UTC"))

(defn utc-now ^ZonedDateTime []
  (ZonedDateTime/now utc-zone))

(defn pt-now ^ZonedDateTime []
  (ZonedDateTime/now pt-zone))

(defn et-now ^ZonedDateTime []
  (ZonedDateTime/now et-zone))

(def numeric-date-pattern
  "i.e 2020-07-01"
  "yyyy-MM-dd")

(defn fmt-with-pattern
  [str-pattern zoned-date]
  (-> (DateTimeFormatter/ofPattern str-pattern)
      (.format zoned-date)))

(defn numeric-date-str [date]
  (fmt-with-pattern numeric-date-pattern date))

(defn first-of-next-month-est ^ZonedDateTime []
  (let [today (et-now)
        first-of-next-month (.with (LocalDate/from today) (TemporalAdjusters/firstDayOfNextMonth))
        start-of-day (.atStartOfDay first-of-next-month et-zone)]
    start-of-day))

(defmethod print-method Instant [o ^Writer w]
  (.write w (str "#instant \"" o "\"")))

(defn parse-instant [x]
  (Instant/parse x))

(comment
  (first-of-next-month-est))
