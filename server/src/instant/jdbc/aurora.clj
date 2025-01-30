(ns instant.jdbc.aurora
  (:require
   [instant.aurora-config :refer [secret-arn->db-creds]]
   [instant.config :as config]
   [instant.util.tracer :as tracer]
   [next.jdbc :as next-jdbc]
   [next.jdbc.connection :as connection])
  (:import
   (com.zaxxer.hikari HikariConfig HikariDataSource)
   (javax.sql DataSource)))

(set! *warn-on-reflection* true)

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

(defn datasource-with-secretsmanager
  "Creates a datasource that is resilent to password rotations in aurora"
  [secret-arn aurora-config]
  (let [get-creds (creds-provider secret-arn)
        login-timeout (atom nil)]
    (reify DataSource
      (getConnection [_]
        (tracer/with-span! {:name "aurora/get-connection"}
          (loop [attempt 1
                 failed-credentials nil]
            (let [{:keys [username password] :as creds}
                  (get-creds {:failed-credentials failed-credentials
                              :attempts 3})
                  conn (try (next-jdbc/get-connection aurora-config username password)
                            (catch Exception e
                              (let [throwing? (>= attempt 3)]
                                (tracer/record-exception-span! e {:name "aurora/get-conn"
                                                                  :attempt attempt
                                                                  :throwing? throwing?})
                                (when throwing?
                                  (throw e)))))]
              (if conn
                conn
                ;; If we fail with these credentials, try to fetch new ones
                (recur (inc attempt)
                       creds))))))
      (getConnection [_ user pass]
        (next-jdbc/get-connection aurora-config user pass))
      (getLoginTimeout [_] (or @login-timeout 0))
      (setLoginTimeout [_ seconds] (reset! login-timeout seconds))
      (toString [_] (connection/jdbc-url aurora-config)))))

(declare -conn-pool)
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
        _ (if-let [secret-arn (:secret-arn aurora-config)]
            (.setDataSource hikari-config (datasource-with-secretsmanager secret-arn config))
            (.setJdbcUrl hikari-config (connection/jdbc-url config)))

        pool (HikariDataSource. hikari-config)]
    ;; Check that the pool is working
    (.close (next-jdbc/get-connection pool))
    pool))

(defn start []
  (let [conn-pool-size (config/get-connection-pool-size)]
    (tracer/record-info!
     {:name "aurora/start-conn-pool" :attributes {:size conn-pool-size}})
    (def -conn-pool (start-pool conn-pool-size (config/get-aurora-config)))))

(defn stop []
  (.close ^HikariDataSource -conn-pool))

(defn restart []
  (stop)
  (start))

(defn before-ns-unload []
  (stop))

(defn after-ns-reload []
  (start))
