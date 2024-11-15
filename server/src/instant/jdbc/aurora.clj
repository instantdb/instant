(ns instant.jdbc.aurora
  (:require
   [instant.config :as config]
   [instant.jdbc.sql :as sql]
   [instant.util.tracer :as tracer]))

(declare conn-pool)

(defn start []
  (let [conn-pool-size (config/get-connection-pool-size)]
    (tracer/record-info!
     {:name "aurora/start-conn-pool" :attributes {:size conn-pool-size}})
    (def conn-pool (sql/start-pool
                    (assoc (config/get-aurora-config)
                           :maxLifetime (* 10 60 1000)
                           :maximumPoolSize conn-pool-size
                           :targetServerType "primary")))))

(defn stop []
  (.close conn-pool))

(defn restart []
  (stop)
  (start))
