(ns instant.dash.ephemeral-app
  (:require
   [chime.core :as chime-core]
   [instant.config :as config]
   [instant.model.app :as app-model]
   [instant.model.instant-user :as instant-user-model]
   [instant.model.rule :as rule-model]
   [instant.model.schema :as schema-model]
   [instant.util.date :as date]
   [instant.util.exception :as ex]
   [instant.util.lang :as lang]
   [instant.util.string :as string-util]
   [instant.util.tracer :as tracer]
   [instant.util.uuid :as uuid-util]
   [ring.util.http-response :as response])
  (:import
   (java.time Period ZonedDateTime)
   (java.time.temporal ChronoUnit)
   (java.util Date UUID)))

(def ephemeral-creator-email (if (= (config/get-env) :dev)
                               "hello+ephemeralappsdev@instantdb.com"
                               "hello+ephemeralapps@instantdb.com"))

(def ephemeral-creator
  (delay
    (instant-user-model/get-by-email {:email ephemeral-creator-email})))

(defn create!
  [{:keys [title]}]
  (app-model/create!
   {:id (UUID/randomUUID)
    :title title
    :creator-id (:id @ephemeral-creator)
    :admin-token (UUID/randomUUID)}))

(def expiration-days 14)

(defn app-expires-ms [app]
  (-> app
      ^Date (:created_at)
      (.toInstant)
      (.plus (long expiration-days) ChronoUnit/DAYS)
      (.toEpochMilli)))

;; -----------
;; HTTP Handler

(defn http-post-handler [req]
  (let [title (ex/get-param! req [:body :title] string-util/coerce-non-blank-str)
        schema (get-in req [:body :schema])
        rules-code (get-in req [:body :rules :code])
        _ (when rules-code
            (ex/assert-valid! :rule rules-code (rule-model/validation-errors
                                                rules-code)))
        app (create! {:title title})]
    (when rules-code
      (rule-model/put! {:app-id (:id app)
                        :code rules-code}))
    (when schema
      (->> schema
           (schema-model/plan! {:app-id (:id app)
                                :check-types? true
                                :background-updates? false})
           (schema-model/apply-plan! (:id app))))
    (response/ok {:app app
                  :expires_ms (app-expires-ms app)})))

(comment
  (http-post-handler {:body {:title "my-app"}}))

(defn http-get-handler [req]
  (let [app-id (ex/get-param! req [:params :app_id] uuid-util/coerce)
        {app-creator-id :creator_id :as app} (app-model/get-by-id! {:id app-id})]
    (ex/assert-permitted!
     :ephemeral-app?
     app-id
     (= (:id @ephemeral-creator) app-creator-id))
    (response/ok {:app app
                  :expires_ms (app-expires-ms app)})))

(comment
  (def res (http-post-handler {:body {:title "my-app"}}))
  (http-get-handler {:params {:app_id (-> res :body :app :id str)}}))

;; ----------- 
;; Sweeper 

(defn period []
  (let [now (date/est-now)
        five-am (-> now
                    (.withHour 5)
                    (.withMinute 0))
        periodic-seq (chime-core/periodic-seq
                      five-am
                      (Period/ofDays 1))]

    (->> periodic-seq
         (filter (fn [x] (ZonedDateTime/.isAfter x now))))))

(comment
  (first (period)))

(defn sweep-for-apps-created-before [created-before]
  (let [app-ids (app-model/get-app-ids-created-before {:creator-id (:id @ephemeral-creator)
                                                       :created-before created-before})]
    (tracer/add-data!
     {:attributes
      {:created-before created-before
       :num-apps (count app-ids)}})
    (when (seq app-ids)
      (app-model/delete-by-ids! {:creator-id (:id @ephemeral-creator)
                                 :ids app-ids}))))

(defn handle-sweep [_]
  (tracer/with-span! {:name "ephemeral-app-sweeper/sweep"}
    (sweep-for-apps-created-before
     (-> (date/est-now)
         ;; give 1 extra day as a grace period
         (.minusDays (inc expiration-days))
         (.toInstant)))))

(defn start []
  (tracer/record-info! {:name "ephemeral-app-sweeper/schedule"})
  (def schedule
    (chime-core/chime-at (period) handle-sweep)))

(defn stop []
  (lang/close schedule))

(defn restart []
  (stop)
  (start))

(comment
  (def res (http-post-handler {:body {:title "my-app"}}))
  (def ex-app (:app (:body res)))
  (= (:creator_id ex-app) (:id @ephemeral-creator))
  (sweep-for-apps-created-before (.toInstant (date/est-now)))
  (sweep-for-apps-created-before (.toInstant (.minusHours (date/est-now) 4))))
