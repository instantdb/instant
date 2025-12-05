(ns instant.join-room-logger
  "Logs join-room events.

   This can be useful for analytics, when we want to know which apps use presence."
  (:require
   [instant.flags :as flags]
   [instant.grouped-queue :as grouped-queue]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.util.hsql :as uhsql]
   [instant.util.tracer :as tracer]))

(declare log-q)

(def upsert-q
  (uhsql/preformat
   {:insert-into :join-room-logs
    :values [{:app-id :?app-id
              :join-count :?join-count}]
    :on-conflict :app-id
    :do-update-set {:join-count [:+ :join-room-logs.join-count :excluded.join-count]}}))

(defn- group-key
  [{:keys [app-id]}]
  app-id)

(defn- combine
  [item1 item2]
  (-> item1
      (update :join-count + (:join-count item2))))

(defn- process
  [_group-key {:keys [app-id join-count]}]
  (tracer/with-span! {:name "join-room-logger/process"
                      :attributes {:app-id app-id
                                   :join-count join-count}}
    (try
      (sql/execute! ::upsert-join-room-log
                    (aurora/conn-pool :write)
                    (uhsql/formatp upsert-q {:app-id app-id
                                             :join-count join-count}))
      (catch Exception e
        (tracer/record-exception-span! e {:name "join-room-logger/process-error"
                                          :attributes {:app-id app-id}
                                          :escaping? false})))))

(defn log-join-room!
  [app-id]
  (when (and (bound? #'log-q)
             (flags/toggled? :join-room-logging-enabled?))
    (grouped-queue/put! log-q {:app-id app-id
                               :join-count 1})))

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
