(ns instant.machine-summaries
  (:require
   [instant.flags :as flags]
   [instant.reactive.ephemeral :as eph]
   [instant.reactive.store :as rs]
   [instant.util.cache :as cache]
   [instant.util.hazelcast :as hz])
  (:import
   (com.hazelcast.cluster Member)
   (com.hazelcast.core HazelcastInstance IExecutorService)))

;; session reports

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

(defn get-session-reports [hz]
  (let [executor (HazelcastInstance/.getExecutorService hz "session-report-executor")
        futures  (IExecutorService/.submitToAllMembers executor (hz/->Task #'session-report-task))]
    (into {} (for [[member fut] futures]
               [(str (or (Member/.getAttribute member "instance-id")
                         (Member/.getAddress member)))
                @fut]))))

(comment
  (get-session-reports (eph/get-hz)))

(def session-reports-cache
  (atom {:ttl nil
         :cache nil}))

(defn get-session-reports-cached []
  (let [target-ttl (flags/flag :session-reports-cache-ttl 5000)]
    (when-not (= target-ttl (:ttl @session-reports-cache))
      (reset! session-reports-cache
              {:ttl   target-ttl
               :cache (cache/make {:ttl target-ttl})}))
    (cache/get (:cache @session-reports-cache)
               :session-reports
               (fn [_]
                 (get-session-reports (eph/get-hz))))))

;; num sessions

(defn num-sessions-task
  []
  (rs/num-sessions rs/store))

(defn get-num-sessions [hz]
  (let [executor (HazelcastInstance/.getExecutorService hz "session-nums-executor")
        futures  (IExecutorService/.submitToAllMembers executor (hz/->Task #'num-sessions-task))]
    (into {} (for [[member fut] futures]
               [(str member) @fut]))))

(comment
  (get-num-sessions (eph/get-hz)))

(def num-sessions-cache
  (cache/make
   {:ttl      5000
    :value-fn (fn [_]
                (->> (get-num-sessions (eph/get-hz))
                     vals
                     (reduce +)))}))

(defn get-num-sessions-cached []
  (cache/get num-sessions-cache :total-count))
