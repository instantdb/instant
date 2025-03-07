(ns instant.app-deletion-sweeper
  (:require
   [chime.core :as chime-core]
   [instant.util.tracer :as tracer]
   [instant.model.app :as app-model]
   [instant.jdbc.sql :as sql]
   [instant.grab :as grab]
   [instant.util.date :as date-util]
   [instant.flags :as flags])
  (:import
   (java.time Duration Period)))

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
         (filter (fn [x] (.isAfter x now))))))

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
  (def schedule (chime-core/chime-at (period) handle-sweep)))

(defn stop []
  (tracer/record-info! {:name "app-deletion-sweeper/stop"})
  (.close schedule))

(defn restart []
  (stop)
  (start))

