(ns instant.scripts.daily-metrics
  "Job to ping discord with daily active metrics. We also use this job to
  populate the daily_app_transactions table with new transactions."
  (:require
   [instant.jdbc.aurora :as aurora]
   [instant.util.date :as date]
   [clojure.tools.logging :as log]
   [instant.discord :as discord]
   [chime.core :as chime-core]
   [instant.flags :refer [get-emails]]
   [instant.config :as config]
   [instant.jdbc.sql :as sql]
   [instant.grab :as grab])
  (:import
   (java.time Period LocalDate)))

(defn excluded-emails []
  (let [{:keys [test team friend]} (get-emails)]
    (vec (concat test team friend))))

(defn get-daily-actives
  "Returns the number of active devs and apps for a day"
  ([date-str]
   (get-daily-actives (aurora/conn-pool) date-str))
  ([conn date-str]
   (sql/select-one conn
                   ["SELECT
                  dat.date as date_start,
                  COUNT(dat.count) AS total_transactions,
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

(defn send-discord!
  "Ping the discord channel with the metrics for a specific date"
  [stats date-str]
  (let [{:keys [distinct_users distinct_apps]} stats
        message (str "🎯 Daily metrics for " date-str
                     ": Active Devs: **" distinct_users
                     "**, Active Apps: **" distinct_apps
                     "**")]
    (discord/send! config/discord-teams-channel-id message)))

(defn insert-new-activity
  "Insert new transactions into the daily_app_transactions table.
  This is intended to run daily to speed up monthly metrics generation."
  ([] (insert-new-activity (aurora/conn-pool)))
  ([conn]
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
                  FROM new_transactions;"])))

(defn daily-job!
  ([] (daily-job! (-> (LocalDate/now) (.minusDays 1))))
  ([date-obj]
   (let [date-str (date/numeric-date-str date-obj)]
     (grab/run-once!
      (str "daily-metrics-" date-str)
      (fn []
        (insert-new-activity)
        (let [stats (get-daily-actives date-str)]
          (send-discord! stats date-str)))))))

(comment
  (def t1 (first (period)))
  (def t2 (LocalDate/parse "2024-10-05"))
  (date/numeric-date-str t1)
  (daily-job! t2))

(defn period []
  (let [now (date/pst-now)
        nine-am-pst (-> now
                        (.withHour 9)
                        (.withMinute 0))
        periodic-seq (chime-core/periodic-seq
                      nine-am-pst
                      (Period/ofDays 1))]

    (->> periodic-seq
         (filter (fn [x] (.isAfter x now))))))

(defn start []
  (log/info "Starting daily metrics daemon")
  (def schedule (chime-core/chime-at (period) daily-job!)))

(defn stop []
  (when (bound? #'schedule)
    (.close schedule)))

(defn restart []
  (stop)
  (start))
