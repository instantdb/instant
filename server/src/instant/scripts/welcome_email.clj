(ns instant.scripts.welcome-email
  "Send welcome emails to our users"
  (:require
   [instant.util.date :as date]
   [instant.postmark :as postmark]
   [chime.core :as chime-core]
   [clojure.string :as string]
   [clojure.tools.logging :as log]
   [instant.grab :as grab]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.flags :as flags]
   [instant.util.tracer :as tracer])
  (:import
   (java.lang AutoCloseable)
   (java.time Period ZonedDateTime)))

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

(def html-body-personal
  "<p>Hey there! Welcome to Instant! Full disclosure: this is an automated
email, but if you respond, a real human (likely Joe or Stopa, the
founders) will read it and get back to you!</p>
<p>How’s your experience with Instant been so far? Any feedback to
share?</p>")

(def text-body-personal
  "Hey there! Welcome to Instant! Full disclosure: this is an automated email, but
if you respond, a real human (likely Joe or Stopa, the founders) will read it and get back to you!

How's your experience with Instant been so far? Any feedback to share?")

(def html-body-business
  "<p>Hey there! Welcome to Instant! Full disclosure: this is an automated
email, but if you respond, a real human (likely Joe or Stopa, the
founders) will read it and get back to you!</p>
<p>Were you thinking of using Instant for your company? How's your experience been so far? If you're up for it, we'd love to talk :)</p>")

(def text-body-business
  "Hey there! Welcome to Instant! Full disclosure: this is an automated email, but
if you respond, a real human (likely Joe or Stopa, the founders) will read it and get back to you!

Were you thinking of using Instant for your company? How's your experience been so far? If you're up for it, we'd love to talk :)")

(defn personal-email? [email]
  (let [personal-domains #{"gmail.com" "yahoo.com" "hotmail.com" "outlook.com" "aol.com"
                           "icloud.com" "protonmail.com" "mail.com" "zoho.com" "yandex.com"
                           "gmx.com" "live.com" "me.com" "inbox.com" "hey.com"}
        domain (-> (string/split email #"@") last)]
    (contains? personal-domains domain)))

(def limit 10)
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
                 business-emails (remove personal-email? emails)
                 personal-emails (filter personal-email? emails)
                 shuffled (cond->> (shuffle personal-emails)
                            limit (take limit))
                 all-emails (concat shuffled business-emails)]
             (tracer/add-data! {:attributes {:personal-emails shuffled
                                             :business-emails business-emails
                                             :limit limit
                                             :num-emails (count all-emails)}})
             (doseq [to all-emails]
               (let [[html text] (if (personal-email? to)
                                   [html-body-personal text-body-personal]
                                   [html-body-business text-body-business])]
                 (try
                   (postmark/send! {:from "founders@pm.instantdb.com"
                                    :to to
                                    :reply-to "founders@instantdb.com"
                                    :subject "Welcome to Instant!"
                                    :html html
                                    :text text})
                   (catch Exception e
                     (tracer/add-exception! e {:escaping? false})
                     ;; send next email
                     nil)))))))))))

(defn period []
  (let [now (date/pst-now)
        send-at-pst (-> (date/pst-now)
                        (.withHour 8) ;; send at 8am pst
                        (.withMinute 0))
        periodic-seq (chime-core/periodic-seq
                      send-at-pst
                      (Period/ofDays 1))]
    (->> periodic-seq
         (filter (fn [^ZonedDateTime x] (.isAfter x now))))))

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
