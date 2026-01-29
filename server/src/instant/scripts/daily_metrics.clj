(ns instant.scripts.daily-metrics
  "Job to ping discord with daily active metrics. We also use this job to
  populate the daily_app_transactions table with new transactions."
  (:require
   [chime.core :as chime-core]
   [clojure.tools.logging :as log]
   [instant.config :as config]
   [instant.discord :as discord]
   [instant.flags :as flags :refer [get-emails]]
   [instant.grab :as grab]
   [instant.intern.metrics :as metrics]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.util.date :as date]
   [instant.util.lang :as lang])
  (:import
   (java.time Instant Period LocalDate ZonedDateTime)))

(defn excluded-emails []
  (let [{:keys [test team friend]} (get-emails)]
    (vec (concat test team friend))))

(defn get-daily-signups
  "Returns the number of signups for a day (in PST timezone)"
  ([date-str]
   (get-daily-signups (aurora/conn-pool :read) date-str))
  ([conn date-str]
   (sql/select-one conn
                   ["SELECT
                      DATE_TRUNC('day', (u.created_at at time zone 'UTC') at time zone 'America/Los_Angeles')::date AS signup_date,
                      COUNT(u.id) AS signup_count
                    FROM instant_users u
                WHERE DATE_TRUNC('day', (u.created_at at time zone 'UTC') at time zone 'America/Los_Angeles')::date = DATE(?)
                  AND u.email NOT IN (SELECT unnest(?::text[]))
                GROUP BY 1
                ORDER BY 1"
                    date-str
                    (with-meta (excluded-emails) {:pgtype "text[]"})])))

(comment
  (tool/with-prod-conn [conn]
    (get-daily-signups conn "2025-07-21")))

(defn get-daily-actives
  "Returns the number of active devs and apps for a day"
  ([date-str]
   (get-daily-actives (aurora/conn-pool :read) date-str))
  ([conn date-str]
   (sql/select-one conn
                   ["SELECT
                  dat.date as date_start,
                  COUNT(DISTINCT u.id) AS distinct_users,
                  COUNT(DISTINCT a.id) AS distinct_apps
                FROM daily_app_transactions dat
                JOIN apps a ON dat.app_id = a.id
                JOIN instant_users u ON a.creator_id = u.id
                WHERE dat.is_active
                  AND dat.date = DATE(?)
                  AND u.email NOT IN (SELECT unnest(?::text[]))
                GROUP BY 1
                ORDER BY 1"
                    date-str
                    (with-meta (excluded-emails) {:pgtype "text[]"})])))

(defn send-metrics-to-discord!
  "Send daily metrics to Discord"
  [conn charts date-str]
  (let [stats (get-daily-actives conn date-str)
        {:keys [distinct_users distinct_apps]} stats
        signups (get-daily-signups conn date-str)
        message (str "🎯 Daily active metrics for " date-str
                     ": Active Devs: **" distinct_users
                     "**, Active Apps: **" distinct_apps
                     "**, Num signups: **" (:signup_count signups)
                     "**")]
    (discord/send-with-files! config/discord-teams-channel-id
                              charts
                              message)))

(defn insert-new-activity
  "Insert new transactions into the daily_app_transactions table.
  This is intended to run daily to speed up monthly metrics generation."
  ([] (insert-new-activity (aurora/conn-pool :write)))
  ([conn]
   (binding [sql/*query-timeout-seconds* 360]
     (sql/do-execute! conn
                      ["WITH date_range AS (
                    SELECT
                      COALESCE(MAX(date) + INTERVAL '1 day', '2022-01-01') AS last_seen_date,
                      CURRENT_DATE AS max_date
                    FROM daily_app_transactions
                  ),
                  earliest_transaction_per_app AS (
                    SELECT
                      app_id,
                      MIN(created_at) AS earliest_date,
                      MIN(created_at) + INTERVAL '7 days' AS earliest_date_plus_7
                    FROM
                      transactions
                    GROUP BY
                      app_id
                  ),
                  new_transactions AS (
                    SELECT
                       DATE(t.created_at) as date,
                       t.app_id,
                       eta.earliest_date_plus_7 as active_date,
                       CASE  WHEN t.created_at > eta.earliest_date_plus_7 THEN true ELSE false END as is_active,
                       count(*)
                    FROM transactions t
                    JOIN earliest_transaction_per_app eta ON t.app_id = eta.app_id
                    CROSS JOIN date_range dr
                    WHERE t.created_at > dr.last_seen_date and t.created_at < dr.max_date AND DATE(t.created_at) NOT IN ('2024-10-28')
                    GROUP BY 1, 2, 3, 4
                  )
                  INSERT INTO daily_app_transactions (date, app_id, active_date, is_active, count)
                  SELECT date, app_id, active_date, is_active, count
                  FROM new_transactions;"]))))

(defn daily-job!
  [^Instant date]
  (when-not (flags/failing-over?)
    (let [date-minus-one (-> date (.minus (Period/ofDays 1)))
          date-fn (fn [^Instant x] (date/numeric-date-str (.atZone x date/pt-zone)))
          ;; We run this job for a particular day
          date-str (date-fn date)
          ;; But report the metrics for the previous day since we don't
          ;; have the full day's data yet
          date-minus-one-str (date-fn date-minus-one)]
      (grab/run-once!
       (str "daily-metrics-" date-str)
       (fn []
         (insert-new-activity)
         (let [conn (aurora/conn-pool :read)
               charts (->> (metrics/overview-metrics conn)
                           :charts
                           (map (fn [[k chart]]
                                  {:name (format "%s.png" (name k))
                                   :content-type "image/png"
                                   ;; 273/173 is how discord resizes images
                                   :content (metrics/chart->png-bytes chart
                                                                      (* 2 273) (* 2 173))})))]
           (send-metrics-to-discord! conn charts date-minus-one-str)))))))

(comment
  (def t1 (-> (LocalDate/parse "2024-10-09")
              (.atTime 9 0)
              (.atZone date/pt-zone)
              .toInstant))
  (daily-job! t1))

(defn period []
  (let [now (date/pt-now)
        nine-am-pst (-> now
                        (.withHour 9)
                        (.withMinute 0))
        periodic-seq (chime-core/periodic-seq
                      nine-am-pst
                      (Period/ofDays 1))]
    (->> periodic-seq
         (filter (fn [x] (ZonedDateTime/.isAfter x now))))))

(defn start []
  (log/info "Starting daily metrics daemon")
  (def schedule
    (chime-core/chime-at (period) daily-job!)))

(defn stop []
  (lang/close schedule))

(defn restart []
  (stop)
  (start))
