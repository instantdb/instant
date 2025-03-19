(ns instant.app-deletion-sweeper
  (:require
   [chime.core :as chime-core]
   [instant.flags :as flags]
   [instant.grab :as grab]
   [instant.jdbc.sql :as sql]
   [instant.model.app :as app-model]
   [instant.util.date :as date-util]
   [instant.util.lang :as lang]
   [instant.util.tracer :as tracer])
  (:import
   (java.time Duration Period ZonedDateTime)))

;; -------- 
;; Config 

(def grace-period-days 2)

(defn period []
  (let [now (date-util/pst-now)
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
  (tracer/with-span! {:name "app-deletion-sweeper/delete-app"
                      :attributes app}
    (try
      (binding [sql/*query-timeout-seconds* delete-timeout-seconds]
        (app-model/delete-immediately-by-id!
         {:id id}))
      (catch Throwable e
        (tracer/add-exception! e {:escaping? false})))))

(defn handle-sweep [_]
  (tracer/with-span! {:name "app-deletion-sweeper/sweep"}
    (when-not (flags/app-deletion-sweeper-disabled?)
      (let [maximum-marked-date (-> (date-util/pst-now)
                                    (.minus (Duration/ofDays grace-period-days)))

            apps-to-delete (app-model/get-apps-to-delete {:maximum-deletion-marked-at
                                                          (.toInstant maximum-marked-date)})]
        (tracer/add-data! {:attributes {:count (count apps-to-delete)}})
        (doseq [{:keys [id] :as app} apps-to-delete]
          (grab/run-once!
           (format "delete-app-%s-%s" id (date-util/numeric-date-str maximum-marked-date))
           (fn [] (straight-jacket-delete-app! app))))))))

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

