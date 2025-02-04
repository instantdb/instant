(ns instant.machine-summaries
  (:require
   [instant.util.hazelcast :as hz]
   [instant.reactive.ephemeral :as eph]
   [instant.reactive.store :as rs]))

(defn store->session-report [db]
  (->> (rs/report-active-sessions db)
       (filter :app-id)
       (map (juxt :app-id :app-title :creator-email))
       frequencies
       (map (fn [[[app-id app-title creator-email] cnt]]
              [app-id
               {:app-title app-title
                :creator-email creator-email
                :count cnt}]))
       (into {})))

(defn session-report-task
  []
  (store->session-report @rs/store-conn))

(defn get-all-session-reports [hz]
  (let [executor (.getExecutorService hz "session-report-executor")
        futures  (.submitToAllMembers executor (hz/->Task #'session-report-task))]
    (into {} (for [[member fut] futures]
               [(str member) @fut]))))

(comment
  (get-all-session-reports (eph/get-hz)))

(defn num-sessions-task
  []
  (rs/num-sessions @rs/store-conn))

(defn get-all-num-sessions [hz]
  (let [executor (.getExecutorService hz "session-nums-executor")
        futures  (.submitToAllMembers executor (hz/->Task #'num-sessions-task))]
    (into {} (for [[member fut] futures]
               [(str member) @fut]))))

(comment
  (get-all-num-sessions (eph/get-hz)))
