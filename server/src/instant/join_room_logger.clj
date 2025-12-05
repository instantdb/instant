(ns instant.join-room-logger
  "Logs join-room events. 
  
   This can be useful for analytics, when we want to know which apps use presence."
  (:require
   [honey.sql :as hsql]
   [instant.flags :as flags]
   [instant.grouped-queue :as grouped-queue]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.util.tracer :as tracer]))

(declare log-q)

;; ------
;; Queue

(defn group-key
  [{:keys [app-id]}]
  app-id)

(defn combine
  [item1 item2]
  (-> item1
      (update :join-count + (:join-count item2))))

(defn process
  "Insert the join-room log into the database."
  [_group-key {:keys [app-id join-count]}]
  (tracer/with-span! {:name "join-room-logger/process"
                      :attributes {:app-id app-id
                                   :join-count join-count}}
    (try
      (sql/execute! ::insert-join-room-log
                    (aurora/conn-pool :write)
                    (hsql/format
                     {:insert-into :join-room-logs
                      :values [{:app-id app-id
                                :join-count join-count}]}))
      (catch Exception e
        (tracer/record-exception-span! e {:name "join-room-logger/process-error"
                                          :attributes {:app-id app-id}
                                          :escaping? false})))))

;; ------
;; Public API

(defn log-join-room!
  "Queue a join-room event for logging. Non-blocking."
  [app-id]
  (when (and (bound? #'log-q)
             (flags/toggled? :join-room-logging-enabled?))
    (grouped-queue/put! log-q {:app-id app-id
                               :join-count 1})))

;; ------
;; Lifecycle

(defn start []
  (tracer/record-info! {:name "join-room-logger/start"})
  (.bindRoot #'log-q
             (grouped-queue/start
              {:group-key-fn #'group-key
               :combine-fn #'combine
               :process-fn #'process
               :max-workers 2
               :metrics-path "instant.join-room-logger"})))

(defn stop []
  (when (bound? #'log-q)
    (grouped-queue/stop log-q)
    (.unbindRoot #'log-q)))
