(ns instant.scripts.analytics
  (:require
   [chime.core :as chime-core]
   [clojure.tools.logging :as log]
   [instant.flags :refer [get-emails]]
   [instant.grab :as grab]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.postmark :as postmark]
   [instant.util.date :as date]
   [instant.util.lang :as lang])
  (:import
   (java.time LocalDate Period Instant ZonedDateTime)))

(defn get-num-users
  "Total number of users, -2 for stopa, joe, and testuser"
  []
  (:count (sql/select-one (aurora/conn-pool :read) ["SELECT COUNT(*) - 3 as count FROM instant_users"])))

(defn get-num-users-yday
  "Number of users who signed up yesterday"
  []
  (:count (sql/select-one (aurora/conn-pool :read) ["SELECT COUNT(*) as count
                                            FROM instant_users
                                            WHERE created_at::date >= (current_date - 1)"])))

(defn get-num-apps []
  (:count (sql/select-one
           (aurora/conn-pool :read)
           ["select count(*)
              from apps a join instant_users u on a.creator_id = u.id
              where u.email not in ('joe@instantdb.com', 'stopa@instantdb.com', 'testuser@instantdb.com')"])))

(defn get-num-apps-yday []
  (:count (sql/select-one
           (aurora/conn-pool :read)
           ["select count(*) from apps a join instant_users u on a.creator_id = u.id
              where u.email not in ('joe@instantdb.com', 'stopa@instantdb.com', 'testuser@instantdb.com')
              and a.created_at::date >= current_date - 1;"])))

(defn get-email-app-creators-yday []
  (sql/select
   (aurora/conn-pool :read)
   ["SELECT distinct(u.email) from apps a join instant_users u on a.creator_id = u.id
      where a.created_at::date >= current_date - 1;"]))

(defn excluded-emails []
  (let [{:keys [test team friend power-user]} (get-emails)]
    (vec (concat test team friend power-user))))

(defn top-recent-users []
  (sql/select
   (aurora/conn-pool :read)
   ["WITH app_counts AS (
     SELECT app_id, COUNT(*) as app_count
       FROM triples t
       WHERE to_timestamp(created_at / 1000)::date >= NOW() - INTERVAL '14 days'
       GROUP BY app_id
     ), instant_users AS (
       SELECT * FROM instant_users
       WHERE email NOT IN (SELECT unnest(?::text[]))
     ) SELECT iu.email, a.title, ac.app_count as n
     FROM apps a
     JOIN app_counts ac ON a.id = ac.app_id
     JOIN instant_users iu ON a.creator_id = iu.id
     ORDER BY ac.app_count DESC;"
    (with-meta (excluded-emails) {:pgtype "text[]"})]))

(defn get-num-triples []
  (:count
   (sql/select-one (aurora/conn-pool :read)
                   ["WITH filtered_users AS (
                       SELECT id FROM instant_users
                       WHERE email NOT IN ('joe@instantdb.com', 'stopa@instantdb.com', 'testuser@instantdb.com')
                     ) SELECT COUNT(*) from triples t
                     JOIN apps a ON t.app_id = a.id
                     JOIN filtered_users fu ON a.creator_id = fu.id"])))

(comment
  (get-num-users)
  (get-num-users-yday)
  (get-num-apps)
  (get-num-users-yday)
  (get-num-triples))

;; --------
;; Email

(defn build-data []
  {:num-users (get-num-users)
   :new-users (get-num-users-yday)
   :num-apps (get-num-apps)
   :new-apps (get-num-apps-yday)
   :num-triples (get-num-triples)
   :new-emails (get-email-app-creators-yday)})

(comment
  (build-data))

(defn metric-row [label value]
  (str "<p style='margin:0;padding:0'>"
       label
       ": "
       value
       "</p>"))

(defn email-row [{:keys [email]}]
  (str "<p style='margin:0;padding:0'>"
       email
       "</p>"))

(defn top-table []
  (str
   "<table style='text-align:left'>"
   "<thead>"
   "<tr>"
   "<th style='width:120px;'>email</th>"
   "<th style='width:120px;'>app</th>"
   "<th style='width:50px'>num-triples</th>"
   "</tr>"
   "</thead>"
   "<tbody>"
   (apply str (map (fn [{:keys [email title n]}]
                     (str "<tr>"
                          "<td style='width:120px;'>" email "</td>"
                          "<td style='width:120px;'>" title "</td>"
                          "<td style='width:100px'>" n "</td>"
                          "</tr>")) (take 10 (top-recent-users))))
   "</tbody>"
   "</table>"))

(comment
  (top-table))

(defn html-body [{:keys [num-triples num-users new-users num-apps new-apps new-emails]}]
  (str
   "<h2>Analytics for: " (date/numeric-date-str (LocalDate/now)) "</h2>"
   (metric-row "num-triples" num-triples)
   (metric-row "num-users" num-users)
   (metric-row "new-users" new-users)
   (metric-row "num-apps" num-apps)
   (metric-row "new-apps" new-apps)
   "<h3>Transactors Leaderboard</h3>" (top-table)
   "<h3>Users who made new apps</h3>"
   (apply str (map email-row new-emails))))

(comment
  (html-body (build-data)))

(defn prepare-email []
  (let [report-date (date/numeric-date-str (LocalDate/now))]
    {:from "assistant@pm.instantdb.com"
     :to "stopa@instantdb.com, joe@instantdb.com"
     :subject (str "Instant Summary: " report-date)
     :html (apply postmark/standard-body (html-body (build-data)))}))

(defn period []
  (let [now (date/est-now)
        four-am (-> now
                    (.withHour 4)
                    (.withMinute 0))
        periodic-seq (chime-core/periodic-seq
                      four-am
                      (Period/ofDays 1))]

    (->> periodic-seq
         (filter (fn [x] (ZonedDateTime/.isAfter x now))))))

(defn handle-email [_]
  (let [date-str (date/numeric-date-str (LocalDate/now))]
    (grab/run-once!
     (str "analytics-" date-str)
     (fn []
       (log/infof "Sending analytics email %s" date-str)
       (postmark/send! (prepare-email))))))

(comment
  (chime-core/chime-at [(Instant/now)] handle-email))

(defn start []
  (log/info "Starting analytics daemon")
  (def schedule
    (chime-core/chime-at (period) handle-email)))

(defn stop []
  (lang/close schedule))

(defn restart []
  (stop)
  (start))
