(ns instant.util.date
  (:import
   (java.time ZoneId ZonedDateTime ZoneRegion LocalDate)
   (java.time.format DateTimeFormatter)
   (java.time.temporal TemporalAdjusters)))

(def ^ZoneRegion est-zone (ZoneId/of "America/New_York"))

(defn est-now ^ZonedDateTime []
  (ZonedDateTime/now est-zone))

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
  (let [today (est-now)
        first-of-next-month (.with (LocalDate/from today) (TemporalAdjusters/firstDayOfNextMonth))
        start-of-day (.atStartOfDay first-of-next-month est-zone)]
    start-of-day))

(comment
  (first-of-next-month-est))
