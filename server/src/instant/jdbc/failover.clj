(ns instant.jdbc.failover
  (:require [instant.config :as config]
            [instant.db.model.transaction :as transaction-model]
            [instant.jdbc.sql :as sql]
            [instant.jdbc.aurora :as aurora]
            [instant.util.tracer :as tracer]))

(defn start-new-pool [aurora-config]
  (let [conn-pool-size (config/get-connection-pool-size)]
    (sql/start-pool
     (assoc aurora-config
            :maxLifetime (* 10 60 1000)
            :maximumPoolSize conn-pool-size
            :targetServerType "primary"))))

;; Keep this here just in case
(declare previous-conn-pool)

(defn do-failover-to-new-db []
  (println "Failing over to new db")
  (let [next-config (config/get-next-aurora-config)
        _ (assert next-config "missing next database config")
        next-pool (start-new-pool next-config)
        conn-pool-fn-before aurora/conn-pool
        prev-pool aurora/-conn-pool
        next-pool-promise (promise)]
    (tool/def-locals)
    (println "Started next pool")
    ;; Make the connections wait. For a future improvement, we could have the
    ;; caller tell us if they wanted a read-only connection and then we wouldn't
    ;; have to pause reads until after we waited for writes to complete
    (alter-var-root #'aurora/conn-pool (fn [_] (fn [] @next-pool-promise)))
    ;; Give transactions half the receive-timeout to complete
    (println "Waiting for 2.5 seconds for transactions to complete")
    (Thread/sleep 2500)
    (println "Canceling in-progress transactions"
             (count @(:stmts sql/default-statement-tracker)))
    (sql/cancel-in-progress @(:stmts sql/default-statement-tracker))
    ;; Create a transaction we can use as a proxy for everything syncing over to
    ;; the new instance
    (let [tx (transaction-model/create! aurora/-conn-pool
                                        {:app-id (config/instant-config-app-id)})
          quit (fn []
                 (println "Abandoning failover")
                 (.close next-pool)
                 (deliver next-pool-promise prev-pool)
                 (alter-var-root #'aurora/conn-pool (fn [_] conn-pool-fn-before))
                 (throw (Exception. "Abandoning failover, somehow the writes aren't in sync.")))]
      (loop [i 0]
        (if-let [row (sql/select-one next-pool ["select * from transactions where app_id = ?::uuid"
                                                (config/instant-config-app-id)])]
          (when (not= (:app_id row) (config/instant-config-app-id))
            (println "Got a bad tx row" row)
            (quit))
          (do
            (when (> i 600)
              (println "Waited to long for data to sync")
              (quit))
            (println "Not yet synced, waiting for 50ms, i =" i)
            (Thread/sleep 50)
            (recur (inc i))))))
    (println "Synced!")
    ;; Give it an extra second just for good measure
    (println "Sleeping for another second")
    (Thread/sleep 1000)
    (println "Continuing with all queries and transactions on the new db.")
    (deliver next-pool-promise next-pool)
    (alter-var-root #'aurora/-conn-pool (fn [_] next-pool))
    (alter-var-root #'aurora/conn-pool (fn [_] conn-pool-fn-before))
    (def previous-conn-pool prev-pool)
    (println "Reset variables, waiting 30 seconds for any in-progress queries to complete")
    (Thread/sleep 30001)
    (println "Closing the old connection pool.")
    (.close prev-pool)
    (println "NEXT STEPS:")
    (println "  1. Put the old database to sleep so that it doesn't accidentally get written to.")
    (println "  2. Update the config so that old db is now new db and redeploy")))
