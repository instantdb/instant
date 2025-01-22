(ns instant.jdbc.aurora
  (:require
   [instant.config :as config]
   [instant.jdbc.sql :as sql]
   [instant.util.tracer :as tracer])
  (:import
   (com.zaxxer.hikari HikariDataSource)))

;; Stores a single memoized value for the read-only
;; connection.
(def read-only-memoize (atom nil))

(defn read-only-wrapper [^HikariDataSource pool]
  (proxy [HikariDataSource] []
    (getConnection
      ([]
       (let [conn (.getConnection pool)]
         (.setReadOnly conn true)
         (.setAutoCommit conn false)
         conn))
      ([user pass]
       (let [conn (.getConnection pool user pass)]
         (.setReadOnly conn true)
         (.setAutoCommit conn false)
         conn)))
    (unwrap [iface]
      (.unwrap pool iface))
    (isWrapperFor [iface]
      (.isWrapperFor pool iface))
    (getHikariPoolMXBean []
      (.getHikariPoolMXBean pool))))

(defn memoized-read-only-wrapper [^HikariDataSource pool]
  (if-let [wrapper (when-let [[memo-pool wrapper] @read-only-memoize]
                     (when (= memo-pool pool)
                       wrapper))]
    wrapper
    (let [wrapper (read-only-wrapper pool)]
      (reset! read-only-memoize [pool wrapper])
      wrapper)))

(declare -conn-pool)
(defn conn-pool
  "Takes a single argument that should be either :read for a read-only connection
   or :write for a read-write connection."
  [rw]
  (if (= rw :read)
    (memoized-read-only-wrapper -conn-pool)
    -conn-pool))

(defn start []
  (let [conn-pool-size (config/get-connection-pool-size)]
    (tracer/record-info!
     {:name "aurora/start-conn-pool" :attributes {:size conn-pool-size}})
    (def -conn-pool (sql/start-pool
                     (assoc (config/get-aurora-config)
                            :maxLifetime (* 10 60 1000)
                            :maximumPoolSize conn-pool-size
                            :targetServerType "primary")))))

(defn stop []
  (.close ^HikariDataSource -conn-pool))

(defn restart []
  (stop)
  (start))

(defn before-ns-unload []
  (stop))

(defn after-ns-reload []
  (start))
