(ns instant.hard-deletion-sweeper
  (:require
   [chime.core :as chime-core]
   [instant.custodian :as custodian]
   [instant.flags :as flags]
   [instant.jdbc.sql :as sql]
   [instant.model.app :as app-model]
   [instant.util.date :as date-util]
   [instant.util.lang :as lang]
   [instant.util.tracer :as tracer]
   [instant.db.model.attr :as attr-model]
   [instant.jdbc.aurora :as aurora])
  (:import
   (java.time Duration Period ZonedDateTime)))

;; -------- 
;; Config 

(def grace-period-days 2)

(defn period []
  (let [now (date-util/pt-now)
        ten-am (-> now
                   (.withHour 10)
                   (.withMinute 0))
        periodic-seq (chime-core/periodic-seq
                      ten-am
                      (Period/ofDays 1))]

    (->> periodic-seq
         (filter (fn [x] (ZonedDateTime/.isAfter x now))))))

(comment
  (first (period)))

(def delete-timeout-seconds (.getSeconds (Duration/ofMinutes 5)))

;; ---------- 
;; Sweep 

(defn straight-jacket-delete-app! [{:keys [id] :as app}]
  (tracer/with-span! {:name "hard-deletion-sweeper/delete-app"
                      :attributes app}
    (try
      (binding [sql/*query-timeout-seconds* delete-timeout-seconds]
        (app-model/delete-immediately-by-id!
         {:id id}))
      (catch Throwable e
        (tracer/add-exception! e {:escaping? false})))))

(defn straight-jacket-delete-attr! [{app-id :app_id id :id :as attr}]
  (tracer/with-span! {:name "hard-deletion-sweeper/delete-attr"
                      :attributes attr}
    (try
      (binding [sql/*query-timeout-seconds* delete-timeout-seconds]
        (attr-model/hard-delete-multi!
         (aurora/conn-pool :write)
         app-id
         #{id}))
      (catch Throwable e
        (tracer/add-exception! e {:escaping? false})))))

(defn handle-sweep [_]
  (when-not (flags/failing-over?)
    (tracer/with-span! {:name "hard-deletion-sweeper/sweep"}
      (when-not (flags/hard-deletion-sweeper-disabled?)
        (let [maximum-marked-date (-> (date-util/pt-now)
                                      (.minus (Duration/ofDays grace-period-days)))

              attrs-to-delete (attr-model/get-for-hard-delete {:maximum-deletion-marked-at
                                                               (.toInstant maximum-marked-date)})
              apps-to-delete (app-model/get-apps-to-hard-delete {:maximum-deletion-marked-at
                                                                 (.toInstant maximum-marked-date)})]
          (tracer/add-data! {:attributes {:attrs-count (count attrs-to-delete)
                                          :apps-count (count apps-to-delete)}})

          (doseq [{:keys [id app_id]} attrs-to-delete]
            (custodian/enqueue-attr-deletion! {:app-id app_id :attr-id id}))
          (doseq [{:keys [id]} apps-to-delete]
            (custodian/enqueue-app-deletion! {:app-id id})))))))

(defn start []
  (tracer/record-info! {:name "app-deletion-sweeper/schedule"})
  (def schedule
    (chime-core/chime-at (period) handle-sweep)))

(defn stop []
  (tracer/record-info! {:name "app-deletion-sweeper/stop"})
  (lang/close schedule))

(defn before-ns-unload []
  (stop))

(defn after-ns-reload []
  (start))

(defn restart []
  (stop)
  (start))

