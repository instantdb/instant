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
   [instant.flags :as flags])
  (:import
   (java.time Period DayOfWeek)))

(defn find-new-users
  ([] (find-new-users (aurora/conn-pool :read)))
  ([conn]
   (sql/select
    :welcome-email-users
    conn
    ["SELECT email
     FROM instant_users
     WHERE created_at BETWEEN (CURRENT_TIMESTAMP - INTERVAL '2 days')
                          AND (CURRENT_TIMESTAMP - INTERVAL '1 day')"])))

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
         (let [emails (map :email (find-new-users))
               shuffled (cond->> (shuffle emails)
                          limit (take limit))]
           (run! (fn [to]
                   (postmark/send! {:from "founders@pm.instantdb.com"
                                    :to to
                                    :reply-to "founders@instantdb.com"
                                    :subject "Welcome to Instant!"
                                    :html html-body
                                    :text text-body})) shuffled)))))))

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

(def schedule (atom nil))

(defn start []
  (log/info "Starting welcome email daemon")
  (reset! schedule (chime-core/chime-at (period) send-welcome-email!)))

(defn stop []
  (when @schedule
    (.close @schedule)
    (reset! schedule nil)))

(defn restart []
  (stop)
  (start))
