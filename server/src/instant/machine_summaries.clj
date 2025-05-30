(ns instant.machine-summaries
  (:require
   [instant.util.hazelcast :as hz]
   [instant.reactive.ephemeral :as eph]
   [instant.reactive.store :as rs])
  (:import
   (com.hazelcast.cluster Member)
   (com.hazelcast.core HazelcastInstance IExecutorService)))

(defn app-sessions->report [app-sessions]
  (let [[{:keys [app-id app-title creator-email]}] app-sessions
        cnt (count app-sessions)
        origins (frequencies (keep :socket-origin app-sessions))]
    {:app-id app-id
     :app-title app-title
     :creator-email creator-email
     :count cnt
     :origins origins}))

(defn store->session-report [store]
  (->> (rs/report-active-sessions store)
       (filter :app-id)
       (group-by :app-id)
       (map (fn [[app-id app-sessions]]
              [app-id (app-sessions->report app-sessions)]))
       (into {})))

(defn session-report-task
  []
  (store->session-report rs/store))

(defn get-all-session-reports [hz]
  (let [executor (HazelcastInstance/.getExecutorService hz "session-report-executor")
        futures  (IExecutorService/.submitToAllMembers executor (hz/->Task #'session-report-task))]
    (into {} (for [[member fut] futures]
               [(str (or (Member/.getAttribute member "instance-id")
                         (Member/.getAddress member)))
                @fut]))))

(comment
  (get-all-session-reports (eph/get-hz)))

(defn num-sessions-task
  []
  (rs/num-sessions rs/store))

(defn get-all-num-sessions [hz]
  (let [executor (HazelcastInstance/.getExecutorService hz "session-nums-executor")
        futures  (IExecutorService/.submitToAllMembers executor (hz/->Task #'num-sessions-task))]
    (into {} (for [[member fut] futures]
               [(str member) @fut]))))

(comment
  (get-all-num-sessions (eph/get-hz)))
