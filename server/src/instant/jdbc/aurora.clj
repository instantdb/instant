(ns instant.jdbc.aurora
  (:require
   [instant.aurora-config :refer [rds-cluster-id->db-config secret-arn->db-creds]]
   [instant.config :as config]
   [instant.util.async :as ua]
   [instant.util.lang :as lang]
   [instant.util.tracer :as tracer]
   [next.jdbc :as next-jdbc]
   [next.jdbc.connection :as connection])
  (:import
   (com.zaxxer.hikari HikariConfig HikariDataSource)
   (com.zaxxer.hikari.pool HikariPool)
   (java.sql Connection
             SQLException
             SQLFeatureNotSupportedException)
   (java.util WeakHashMap)
   (java.util.function BiConsumer)
   (javax.sql DataSource)
   (org.postgresql PGConnection)))

(set! *warn-on-reflection* true)

;; Stores a single memoized value for the read-only
;; connection.
(defonce read-only-memoize
  (atom nil))

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
      (.getHikariPoolMXBean pool))
    (evictConnection [c]
      (.evictConnection pool c))))

(defn memoized-read-only-wrapper [^HikariDataSource pool]
  (if-let [wrapper (when-let [[memo-pool wrapper] @read-only-memoize]
                     (when (= memo-pool pool)
                       wrapper))]
    wrapper
    (let [wrapper (read-only-wrapper pool)]
      (reset! read-only-memoize [pool wrapper])
      wrapper)))

(defn filter-closed-connections-wrapper
  "Evicts the connections we closed on aurora failover from the pool."
  [on-close ^HikariDataSource pool]
  (proxy [HikariDataSource] []
    (getConnection
      ([]
       (loop [conn (.getConnection pool)]
         (if (.isClosed ^Connection (.unwrap conn PGConnection))
           (do
             (.evictConnection pool conn)
             (recur (.getConnection pool)))
           conn)))
      ([user pass]
       ;; Hikari doesn't support this
       (throw (SQLFeatureNotSupportedException.))))
    (unwrap [iface]
      (.unwrap pool iface))
    (isWrapperFor [iface]
      (.isWrapperFor pool iface))
    (getHikariPoolMXBean []
      (.getHikariPoolMXBean pool))
    (evictConnection [c]
      (.evictConnection pool c))
    (close []
      (.close pool)
      (on-close))))

(defn creds-provider
  "Given the secretsmanager secret arn, will create a function that acts like a delay,
   but has the ability to refetch if notified that the credentials are invalid.
   Pass in the failed result as `failed-credentials` and it will retry, being careful
   to only make one API call to the secretsmanager in the face of concurrent execution."
  [secret-arn]
  (let [secret-value (atom nil) ;; atom that holds a promise
        get-creds*
        (fn [{:keys [failed-credentials]}]
          (let [unwrap-promise (fn [p]
                                 (let [res @p]
                                   (if (:ok res)
                                     (:result res)
                                     (throw (:result res)))))
                our-p (promise)
                next-p (swap! secret-value
                              (fn [existing]
                                (if (or (not existing)
                                        ;; retries on error
                                        (and (realized? existing)
                                             (or (not (:ok @existing))
                                                 ;; retry on failed credentials
                                                 ;; this catches secret rotation
                                                 (= (:result @existing)
                                                    failed-credentials))))
                                  our-p
                                  existing)))]

            (when (= our-p next-p)
              (try
                (deliver our-p {:ok true
                                :result (secret-arn->db-creds secret-arn)})
                (catch Throwable t
                  (deliver our-p {:ok false
                                  :result t}))))
            (unwrap-promise next-p)))]

    ;; Try 3 times in case of some networking error
    (fn [{:keys [failed-credentials
                 attempts]
          :or {attempts 3}}]
      (loop [attempt 1]
        (if-let [creds (try (get-creds* {:failed-credentials failed-credentials})
                            (catch Exception e
                              (let [throwing? (>= attempt attempts)]
                                (tracer/record-exception-span! e {:name "aurora/get-creds"
                                                                  :attributes {:attempt attempt
                                                                               :throwing? throwing?}})
                                (when throwing?
                                  (throw e)))))]
          creds
          (recur (inc attempt)))))))

(defn- safe-close [^Connection conn]
  (when (and conn (try (not (.isClosed conn)) (catch SQLException _ false)))
    (try (.close conn) (catch SQLException _
                         nil))))

(defn make-failover-watcher
  "Polls the RDS api for changes to the primary instance.
   Updates the aurora-config and closes all of the connections
   to the old instance when we detect a new primary.

   The pool needs to be wrapped with `filter-closed-connections-wrapper`
   to remove the closed connections before we try to query against them."
  [weak-conn-tracker aurora-config]
  (let [cluster-id (:cluster-id aurora-config)
        current-config (atom aurora-config)
        shutdown? (atom false)
        default-sleep-ms 1000
        config-watcher (ua/fut-bg
                         (loop [last-config aurora-config
                                sleep-ms default-sleep-ms]
                           (when-not @shutdown?
                             (Thread/sleep sleep-ms)
                             (let [next-config (try (merge aurora-config
                                                           (rds-cluster-id->db-config cluster-id))
                                                    (catch Exception e
                                                      (tracer/record-exception-span! e {:name "failover-watcher-error"})
                                                      last-config))]

                               (when (and (not= (:instance-id next-config)
                                                (:instance-id last-config))
                                          (:instance-id next-config))
                                 (tracer/with-span! {:name "aurora/handle-failover"
                                                     :attributes {:from-instance-id (:instance-id last-config)
                                                                  :to-instance-id (:instance-id next-config)
                                                                  :cluster-status (:cluster-status next-config)}}
                                   (reset! current-config next-config)
                                   (when-let [^WeakHashMap m (get @weak-conn-tracker (:instance-id last-config))]
                                     (.forEach m (reify BiConsumer
                                                   (accept [_ k _v]
                                                     (safe-close k)))))))
                               (recur next-config
                                      (if (not= "available" (:cluster-status next-config))
                                        100
                                        default-sleep-ms))))))]
    {:shutdown (fn []
                 (reset! shutdown? true)
                 (try @config-watcher
                      (catch Exception _e nil)))
     :get-config (fn [] @current-config)}))

(defn aurora-cluster-datasource
  "Creates a datasource that is resilent to password rotations and failover in aurora"
  [add-conn-to-tracker get-config]
  (let [secret-arn (:secret-arn (get-config))
        get-creds (creds-provider secret-arn)
        login-timeout (atom nil)]
    (reify DataSource
      (getConnection [_]
        (tracer/with-span! {:name "aurora/get-connection"}
          (loop [attempt 1
                 failed-credentials nil]
            (let [{:keys [user password] :as creds}
                  (get-creds {:failed-credentials failed-credentials
                              :attempts 3})
                  config (get-config)
                  conn (try (next-jdbc/get-connection config user password)
                            (catch Exception e
                              (let [throwing? (>= attempt 3)]
                                (tracer/record-info! {:name "aurora/get-conn-error"
                                                      :attributes {:attempt attempt
                                                                   :throwing? throwing?
                                                                   :err (.getMessage e)}})
                                (when throwing?
                                  (throw e)))))]
              (add-conn-to-tracker (:instance-id config) conn)
              (if conn
                conn
                ;; If we fail with these credentials, try to fetch new ones
                (recur (inc attempt)
                       creds))))))
      (getConnection [_ user pass]
        (next-jdbc/get-connection (get-config) user pass))
      (getLoginTimeout [_] (or @login-timeout 0))
      (setLoginTimeout [_ seconds] (reset! login-timeout seconds))
      (toString [_] (connection/jdbc-url (get-config))))))

(defonce -conn-pool nil)

(defn conn-pool
  "Takes a single argument that should be either :read for a read-only connection
   or :write for a read-write connection."
  [rw]
  (if (= rw :read)
    (memoized-read-only-wrapper -conn-pool)
    -conn-pool))

(defn patch-hikari []
  ;; Hikari will send an extra query to ensure the connection is valid
  ;; if it has been idle for half a second. This raises the limit so
  ;; that it only checks every minute.
  ;; This shouldn't be necessary at all--the connection should be able
  ;; to tell when it's closed. But even if it can't tell if it's closed,
  ;; the connection pool should use the query you want to send as the
  ;; validation check. If it gets a retryable error, like connection_closed,
  ;; then it can try again on another connection.
  (System/setProperty "com.zaxxer.hikari.aliveBypassWindowMs" "60000"))

(defn start-pool ^HikariDataSource [pool-size aurora-config]
  (patch-hikari)
  (tracer/record-info! {:name "aurora/start-conn-pool"
                        :attributes {:size pool-size}})
  (let [config (assoc aurora-config
                      :targetServerType "primary")
        hikari-config (doto (HikariConfig.)
                        (.setMaxLifetime (* 10 60 1000))
                        (.setMaximumPoolSize pool-size))
        pool (if (:cluster-id config)
               (let [weak-conn-tracker (atom {})
                     track-conn-lock (Object.)
                     add-conn-to-tracker (fn [instance-id conn]
                                           (locking track-conn-lock
                                             (swap! weak-conn-tracker
                                                    update
                                                    instance-id
                                                    (fn [m]
                                                      (let [^WeakHashMap m (or m (WeakHashMap.))]
                                                        (.put m conn true)
                                                        m)))))
                     {:keys [shutdown get-config]} (make-failover-watcher weak-conn-tracker config)
                     ds (aurora-cluster-datasource add-conn-to-tracker get-config)
                     pool (HikariDataSource. (doto hikari-config
                                               (.setDataSource ds)))]
                 (filter-closed-connections-wrapper shutdown pool))
               (HikariDataSource.
                (doto hikari-config
                  (.setUsername (:user config))
                  (.setPassword (:password config))
                  (.setJdbcUrl (connection/jdbc-url (dissoc config
                                                            :user :password))))))]
    ;; Check that the pool is working
    (.close (next-jdbc/get-connection pool))
    pool))

(defn start []
  (let [conn-pool-size (config/get-connection-pool-size)]
    (lang/set-var! -conn-pool
      (start-pool conn-pool-size (config/get-aurora-config)))))

(defn stop []
  (lang/clear-var! -conn-pool (fn [^HikariDataSource d]
                                (.close d)
                                (.shutdown ^HikariPool (.getHikariPoolMXBean d)))))

(defn restart []
  (stop)
  (start))

(defn before-ns-unload []
  (stop))

(defn after-ns-reload []
  (start))
