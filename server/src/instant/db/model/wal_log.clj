(ns instant.db.model.wal-log
  (:require
   [chime.core :as chime-core]
   [honey.sql :as hsql]
   [instant.flags :as flags]
   [instant.jdbc.sql :as sql]
   [instant.jdbc.aurora :as aurora]
   [instant.util.lang :as lang]
   [instant.util.tracer :as tracer])

  (:import
   (java.time Duration ZonedDateTime ZoneOffset)))

(defn partitions-to-truncate [^ZonedDateTime utc-now]
  (let [current-partition (-> utc-now
                              (.getHour)
                              (mod 8))]
    ;; Truncate the two oldest partitions that aren't the next partition
    ;; We don't want to truncate the next partition because we might be
    ;; executing this near the end of the hour.
    ;; We want to truncate two partitions in case we're late by a minute
    [(mod (+ current-partition 2) 8)
     (mod (+ current-partition 3) 8)]))

(defn truncate-old-partitions!
  "Truncates the second-oldest and third-oldest wal-log partitions (not the oldest
   becuase we'll be writing to that one next)."
  ([] (truncate-old-partitions! (aurora/conn-pool :write)))
  ([conn]
   (let [truncate-partitions (partitions-to-truncate (ZonedDateTime/now ZoneOffset/UTC))]
     (doseq [part truncate-partitions]
       (sql/do-execute! ::truncate-old-partitions! conn (hsql/format {:truncate (keyword (str "wal_logs_" part))}))))))

(defn handle-truncate [_]
  (when-not (flags/failing-over?)
    (truncate-old-partitions!)))

(defn period []
  (rest (chime-core/periodic-seq
         (ZonedDateTime/now ZoneOffset/UTC)
         (Duration/ofHours 1))))

(defn start []
  (tracer/record-info! {:name "wal-log-truncator/start"})
  (def schedule
    (chime-core/chime-at (period) handle-truncate)))

(defn stop []
  (tracer/record-info! {:name "wal-log-truncator/stop"})
  (lang/close schedule))
