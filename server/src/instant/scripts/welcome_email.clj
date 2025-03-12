(ns instant.scripts.welcome-email
  "Send welcome emails to our users"
  (:require
   [instant.util.date :as date]
   [instant.postmark :as postmark]
   [chime.core :as chime-core]
   [clojure.tools.logging :as log]
   [instant.grab :as grab]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.flags :as flags]
   [instant.util.tracer :as tracer])
  (:import
   (java.lang AutoCloseable)
   (java.time Period DayOfWeek)))

;; Find recent users and set the welcome-email flag to ensure
;; we don't send multiple emails to the same user.
(def set-welcome-users-query
  ["WITH recent_users AS (
      SELECT id, email
      FROM instant_users u
      WHERE u.created_at BETWEEN (CURRENT_TIMESTAMP - INTERVAL '2 days')
                          AND (CURRENT_TIMESTAMP - INTERVAL '1 day')
    )
    INSERT INTO user_flags (id, user_id, flag_name)
    SELECT
      gen_random_uuid(),
      ru.id,
      'welcome-email'
    FROM recent_users ru
    ON CONFLICT (user_id, flag_name) DO NOTHING
    RETURNING
      (SELECT email FROM recent_users WHERE id = user_flags.user_id) as email"])

(defn find-welcome-users
  ([] (find-welcome-users (aurora/conn-pool :write)))
  ([conn]
   (sql/select :welcome-email-users conn set-welcome-users-query)))

(def html-body
  "<p>Hey there! Welcome to Instant! Full disclosure: this is an automated
email, but if you respond, a real human (likely Joe or Stopa, the
founders) will read it and get back to you!</p>
<p>How’s your experience with Instant been so far? Any feedback to
share?</p>")

(def text-body
  "Hey there! Welcome to Instant! Full disclosure: this is an automated email, but
if you respond, a real human (likely Joe or Stopa, the founders) will read it and get back to you!

How's your experience with Instant been so far? Any feedback to share?")

(defn send-welcome-email! []
  (let [{:keys [enabled? limit]} (flags/welcome-email-config)
        date-str (-> (date/pst-now)
                     date/numeric-date-str)]
    (when enabled?
      (grab/run-once!
       (str "welcome-email-" date-str)
       (fn []
         (tracer/with-span! {:name "welcome-email/send-emails"}
           (let [emails (map :email (find-welcome-users))
                 shuffled (cond->> (shuffle emails)
                            limit (take limit))]
             (tracer/add-data! {:attributes {:emails shuffled
                                             :limit limit
                                             :num-emails (count shuffled)}})
             (doseq [to shuffled]
               (try
                 (postmark/send! {:from "founders@pm.instantdb.com"
                                  :to to
                                  :reply-to "founders@instantdb.com"
                                  :subject "Welcome to Instant!"
                                  :html html-body
                                  :text text-body})
                 (catch Exception e
                   (tracer/add-exception! e {:escaping? false})
                   ;; send next email
                   nil))))))))))

(defn period []
  (let [now (date/pst-now)
        send-at-pst (-> (date/pst-now)
                        (.withHour 8) ;; send at 8am pst
                        (.withMinute 0))
        periodic-seq (chime-core/periodic-seq
                      send-at-pst
                      (Period/ofDays 1))]
    (->> periodic-seq
         (filter (fn [x] (.isAfter x now)))
         ;; Only run Monday through Friday
         (filter (fn [x]
                   (let [day-of-week (.getDayOfWeek x)]
                     (not (contains? #{DayOfWeek/SATURDAY DayOfWeek/SUNDAY}
                                     day-of-week))))))))

(defonce schedule (atom nil))

(defn start []
  (log/info "Starting welcome email daemon")
  (swap! schedule (fn [curr-schedule]
                    (if curr-schedule
                      curr-schedule
                      (chime-core/chime-at
                       (period)
                       (fn [_time]
                         (send-welcome-email!)))))))

(defn stop []
  (when-let [curr-schedule @schedule]
    (.close ^AutoCloseable curr-schedule)
    (reset! schedule nil)))

(defn restart []
  (stop)
  (start))
