(ns instant.jdbc.query-shadow
  (:require
   [instant.aurora-config :as aurora-config]
   [next.jdbc :as jdbc])
  (:import
   (clojure.lang IPersistentList IPersistentMap IPersistentSet IPersistentVector)
   (com.zaxxer.hikari HikariConfig HikariDataSource)
   (java.sql Connection PreparedStatement SQLException)
   (java.time Instant LocalDate LocalDateTime)
   (java.util UUID)
   (java.util.concurrent ArrayBlockingQueue Executors ExecutorService ScheduledExecutorService ThreadFactory TimeUnit)
   (org.postgresql.ds PGSimpleDataSource)
   (org.postgresql.util PGobject)))

(set! *warn-on-reflection* true)

;; This one-off trial cannot be extended by changing a flag.
(def ^Instant trial-deadline (Instant/parse "2026-09-13T23:06:21Z"))
(def candidate-instance-id "instant-8-shadow-20260913")
(def max-job-bytes (* 256 1024))
(def job-ttl-ms 10000)
(def histogram-ms [1 2 5 10 20 50 100 200 500 1000 2000 5000 10000])

(defonce ^:private session (atom nil))
(defonce ^:private controller (atom nil))
(defonce ^:private lifecycle-lock (Object.))
(defonce ^:private stats (atom {:counts {} :families {}}))

(defn config-for-host [raw host-id now-ms]
  (try
    (let [config (into {} (map (fn [k] [k (get raw k (get raw (name k)))])
                             [:enabled :candidate-instance-id :host-ids :sample-rate
                              :qps :workers :expires-at]))
          {:keys [enabled host-ids sample-rate qps workers expires-at]} config
          n (count host-ids)
          host-index (.indexOf ^java.util.List host-ids host-id)
          expires-at-ms (min (.toEpochMilli trial-deadline)
                             (.toEpochMilli (Instant/parse expires-at)))]
      (when (and (true? enabled)
                 (= candidate-instance-id (:candidate-instance-id config))
                 (vector? host-ids) (<= 1 n 4) (= n (count (set host-ids)))
                 (every? #(and (string? %) (re-matches #"i-[a-zA-Z0-9]+" %)) host-ids)
                 (<= 0 host-index)
                 (integer? workers) (<= n workers 4)
                 (number? qps) (< 0 qps) (<= qps 20)
                 (number? sample-rate) (< 0 sample-rate) (<= sample-rate 0.1)
                 (< now-ms expires-at-ms))
        {:candidate-instance-id candidate-instance-id
         :sample-rate sample-rate
         :qps (/ (double qps) n)
         :workers (+ (quot workers n) (if (< host-index (mod workers n)) 1 0))
         :queue-size (+ (quot 32 n) (if (< host-index (mod 32 n)) 1 0))
         :expires-at-ms expires-at-ms}))
    (catch Exception _ nil)))

(defn source-eligible? [metadata ^Connection source created?]
  (try
    (and (= :nested-read (:origin metadata)) created? (.isReadOnly source))
    (catch Exception _ false)))

(defn metadata-for-query [ctx app-id query-hash]
  ;; query-normal adds this marker only to the main datalog invocation, not
  ;; permission prefetches. System catalog/auth callers bypass the status check.
  (when (and (:query-normalized ctx)
             (not (:skip-app-status-read-check? ctx))
             (not (:instant.db.datalog/permission-entity-fetch? ctx)))
    {:origin :nested-read :app-id app-id :query-hash query-hash}))

(def ^:private planner-settings
  #{"enable_hashjoin" "enable_mergejoin" "enable_nestloop" "enable_seqscan"
    "enable_indexscan" "enable_indexonlyscan" "enable_bitmapscan"
    "enable_memoize" "enable_material" "enable_sort" "enable_incremental_sort"
    "join_collapse_limit" "from_collapse_limit" "geqo_threshold"
    "random_page_cost" "seq_page_cost" "cpu_tuple_cost" "cpu_index_tuple_cost"
    "cpu_operator_cost" "effective_cache_size" "plan_cache_mode" "jit"})

(defn snapshot-job
  "Copy bounded bind values without retaining request metadata or lazy sequences."
  [query postgres-config]
  (try
    (let [budget (volatile! max-job-bytes)
          nodes (volatile! 4096)
          charge! (fn [n]
                    (when (or (neg? (vswap! budget - n))
                              (neg? (vswap! nodes dec)))
                      (throw (ex-info "Shadow capture limit" {}))))]
      (letfn [(copy [x depth]
                (when (> depth 16) (throw (ex-info "Shadow capture depth" {})))
                (charge! 16)
                (cond
                  (string? x) (do (charge! (* 3 (count x))) x)
                  (keyword? x) (do (charge! (* 3 (count (str x)))) x)
                  (or (nil? x) (boolean? x) (instance? UUID x)
                      (instance? Instant x) (instance? LocalDate x)
                      (instance? LocalDateTime x)
                      (instance? Long x) (instance? Integer x)
                      (instance? Double x) (instance? Float x)
                      (instance? Short x) (instance? Byte x)) x
                  (instance? PGobject x)
                  (doto (PGobject.)
                    (.setType (copy (.getType ^PGobject x) (inc depth)))
                    (.setValue (copy (.getValue ^PGobject x) (inc depth))))
                  (or (instance? IPersistentMap x) (instance? IPersistentVector x)
                      (instance? IPersistentSet x) (instance? IPersistentList x))
                  (let [res (cond
                              (map? x) (into {} (map (fn [[k v]] [(copy k (inc depth))
                                                                  (copy v (inc depth))])) x)
                              (vector? x) (mapv #(copy % (inc depth)) x)
                              (set? x) (into #{} (map #(copy % (inc depth))) x)
                              :else (apply list (map #(copy % (inc depth)) x)))
                        pgtype (:pgtype (meta x))]
                    (if pgtype
                      (with-meta res {:pgtype (copy pgtype (inc depth))})
                      res))
                  :else (throw (ex-info "Unsupported shadow bind" {}))))]
        (when-not (and (vector? query) (string? (first query)))
          (throw (ex-info "Unsupported shadow query" {})))
        (when-not (or (nil? postgres-config) (vector? postgres-config))
          (throw (ex-info "Unsupported shadow settings" {})))
        {:query (copy query 0)
         :postgres-config
         (mapv (fn [{:keys [setting value]}]
                 (when-not (and (contains? planner-settings setting) (string? value))
                   (throw (ex-info "Unsupported shadow setting" {})))
                 {:setting (copy setting 0) :value (copy value 0)})
               postgres-config)}))
    (catch Exception _ nil)))

(defn reserve!
  "A nonblocking, burst-free per-host rate limit."
  [next-ns qps now-ns]
  (let [previous @next-ns]
    (and (>= now-ns previous)
         (compare-and-set! next-ns previous
                           (+ now-ns (long (Math/ceil (/ 1e9 (double qps)))))))))

(defn- count! [k]
  (swap! stats update-in [:counts k] (fnil inc 0)))

(defn- observe [m kind elapsed-ms]
  (let [bucket (count (take-while #(< % elapsed-ms) histogram-ms))]
    (-> m
        (update-in [kind :count] (fnil inc 0))
        (update-in [kind :sum-ms] (fnil + 0) elapsed-ms)
        (update-in [kind :buckets bucket] (fnil inc 0)))))

(defn- outcome! [{:keys [family primary-ms queue-ms]} outcome candidate-ms]
  (swap! stats
         (fn [s]
           (let [family (if (or (contains? (:families s) family)
                                (< (count (:families s)) 64)) family :other)]
             (-> s
                 (update-in [:counts outcome] (fnil inc 0))
                 (update-in [:families family :counts outcome] (fnil inc 0))
                 (cond-> (= :attempted outcome)
                   (update :timing observe :primary primary-ms)
                   (= :attempted outcome)
                   (update-in [:families family] observe :primary primary-ms)
                   (= :attempted outcome)
                   (update :timing observe :queue-delay queue-ms)
                   (= :attempted outcome)
                   (update-in [:families family] observe :queue-delay queue-ms)
                   (= :completed outcome)
                   (update :timing observe :primary-completed primary-ms)
                   (= :completed outcome)
                   (update-in [:families family] observe :primary-completed primary-ms)
                   candidate-ms
                   (update :timing observe :candidate candidate-ms)
                   candidate-ms
                   (update-in [:families family] observe :candidate candidate-ms)))))))

(defn snapshot []
  (let [s @session]
    (assoc @stats
           :histogram-upper-bounds-ms histogram-ms
           :timing-definition {:primary "all attempted shadows: primary execute and decode"
                               :queue-delay "all attempted shadows: enqueue to dequeue wait"
                               :primary-completed "successful shadows only: primary execute and decode"
                               :candidate "successful shadows only: execute and raw drain; excludes connection/setup/decode"}
           :active? (boolean (and s @(:running? s)))
           :config (:config s)
           :queued (if s (.size ^ArrayBlockingQueue (:queue s)) 0)
           :in-flight (if s (count @(:statements s)) 0))))

(defn enabled? []
  (when-let [{:keys [running? config]} @session]
    (and @running? (< (System/currentTimeMillis) (:expires-at-ms config)))))

(defn offer!
  "Never wait for the candidate or retain the primary result. Fail closed."
  [metadata connectable connection created? query postgres-config primary-ms]
  (try
    (when-let [{:keys [config source-pool running? admission queue] :as s} @session]
      (when (and @running? (< (System/currentTimeMillis) (:expires-at-ms config)))
        (count! :seen)
        (if-not (and (identical? connectable source-pool)
                     (source-eligible? metadata connection created?))
          (count! :ineligible)
          (do
            (count! :eligible)
            (when (< (rand) (:sample-rate config))
              (count! :sampled)
              (if-not (reserve! admission (:qps config) (System/nanoTime))
                (count! :rate-limited)
                (if-let [job (snapshot-job query postgres-config)]
                  (if (and @running? (identical? s @session)
                           (.offer ^ArrayBlockingQueue queue
                                   (assoc job :created-ms (System/currentTimeMillis)
                                          :family [(:app-id metadata) (:query-hash metadata)]
                                          :primary-ms primary-ms)))
                    (count! :queued)
                    (count! :dropped))
                  (count! :unsupported))))))))
    (catch Throwable _ (count! :capture-failed))))

(defn candidate-config [db-config candidate-id]
  (when (and (= "instant-8" (:cluster-id db-config))
             (= candidate-instance-id candidate-id)
             (= candidate-id (get-in db-config [:replica :instance-id]))
             (= "instant-8" (get-in db-config [:replica :cluster-id]))
             (not= candidate-id (:instance-id db-config))
             (string? (:secret-arn db-config))
             (string? (get-in db-config [:replica :host])))
    (assoc (select-keys (:replica db-config) [:host :port :dbname :instance-id])
           :secret-arn (:secret-arn db-config))))

(defn- open-pool ^HikariDataSource [config db-config]
  (let [{:keys [host port dbname secret-arn] :as candidate}
        (candidate-config db-config (:candidate-instance-id config))]
    (when-not candidate (throw (ex-info "Shadow candidate mismatch" {})))
    (let [{:keys [user password]} (aurora-config/secret-arn->db-creds secret-arn)
          ds (doto (PGSimpleDataSource.)
               (.setServerNames (into-array String [host]))
               (.setPortNumbers (int-array [port]))
               (.setDatabaseName dbname)
               (.setUser user)
               (.setPassword password)
               (.setApplicationName "instant-aurora-reader-shadow")
               (.setTargetServerType "secondary")
               (.setSslMode "require")
               (.setConnectTimeout 2)
               (.setSocketTimeout 3)
               (.setMaxResultBuffer "2097152")
               (.setLogServerErrorDetail false)
               (.setCancelSignalTimeout 1))
          hikari (doto (HikariConfig.)
                   (.setPoolName "aurora-reader-shadow")
                   (.setDataSource ds)
                   (.setMaximumPoolSize (:workers config))
                   (.setMinimumIdle 0)
                   (.setConnectionTimeout 500)
                   (.setValidationTimeout 500)
                   (.setInitializationFailTimeout -1)
                   (.setReadOnly true)
                   (.setAutoCommit false))]
      (HikariDataSource. hikari))))

(defn- daemon-threads [^String prefix]
  (reify ThreadFactory
    (newThread [_ runnable]
      (doto (Thread. ^Runnable runnable prefix) (.setDaemon true)))))

(defn- live? [{:keys [config running?]} job]
  (let [now (System/currentTimeMillis)]
    (and @running? (< now (:expires-at-ms config))
         (< (- now (:created-ms job)) job-ttl-ms))))

(defn- with-statement [s job ^PreparedStatement ps f]
  (let [worker-id (.threadId (Thread/currentThread))]
    (.setQueryTimeout ps 2)
    (swap! (:statements s) assoc worker-id ps)
    (try
      (when (live? s job) (f ps))
      (finally (swap! (:statements s) dissoc worker-id)))))

(defn- execute-job! [{:keys [pool running?] :as s} job]
  (with-open [^Connection conn (.getConnection ^HikariDataSource pool)]
    (try
      (with-open [ps (.prepareStatement conn "select pg_is_in_recovery(), aurora_db_instance_identifier()")]
        (with-statement s job ps
          (fn [^PreparedStatement ps]
            (with-open [rs (.executeQuery ps)]
              (when-not (and (.next rs) (.getBoolean rs 1)
                             (= candidate-instance-id (.getString rs 2)))
                (reset! running? false)
                (throw (ex-info "Shadow candidate role changed" {})))))))
      (with-open [ps (.prepareStatement conn "select set_config(?, ?, true)")]
        (doseq [{:keys [setting value]}
                (concat (:postgres-config job)
                        [{:setting "statement_timeout" :value "2000"}
                         {:setting "lock_timeout" :value "250"}])]
          (with-statement s job ps
            (fn [^PreparedStatement ps]
              (.setString ps 1 setting)
              (.setString ps 2 value)
              (.execute ps)))))
      (when (live? s job)
        (with-open [^PreparedStatement ps (jdbc/prepare conn (:query job) {:timeout 2})]
          (with-statement s job ps
            (fn [^PreparedStatement ps]
              (let [start (System/nanoTime)]
                (with-open [rs (.executeQuery ps)]
                  (while (.next rs)))
                (/ (- (System/nanoTime) start) 1e6))))))
      (finally (.rollback conn)))))

(defn- worker! [{:keys [queue running? config execution] :as s}]
  (while (and @running? (< (System/currentTimeMillis) (:expires-at-ms config)))
    (try
      (when-let [job (.poll ^ArrayBlockingQueue queue 250 TimeUnit/MILLISECONDS)]
        (cond
          (>= (- (System/currentTimeMillis) (:created-ms job)) job-ttl-ms)
          (count! :expired)

          (not (reserve! execution (:qps config) (System/nanoTime)))
          (count! :execution-rate-limited)

          :else (let [job (assoc job :queue-ms (max 0 (- (System/currentTimeMillis)
                                                        (:created-ms job))))]
                  (outcome! job :attempted nil)
                  (try
                    (if-let [elapsed-ms (execute-job! s job)]
                      (outcome! job :completed elapsed-ms)
                      (outcome! job :cancelled nil))
                    (catch SQLException e
                      (outcome! job (if (= "57014" (.getSQLState e)) :timed-out :failed) nil))
                    (catch Exception _ (outcome! job :failed nil))))))
      (catch InterruptedException _ (reset! running? false)))))

(defn- stop-session! [s]
  (when s
    (reset! (:running? s) false)
    (.clear ^ArrayBlockingQueue (:queue s))
    (doseq [^PreparedStatement ps (vals @(:statements s))]
      (try (.cancel ps) (catch Exception _ nil)))
    (.shutdownNow ^ExecutorService (:workers s))
    (.close ^HikariDataSource (:pool s))))

(defn- start-session! [config db-config source-pool token]
  (let [pool (open-pool config db-config)
        workers (Executors/newFixedThreadPool (:workers config) (daemon-threads "aurora-shadow-worker"))
        s {:config config :source-pool source-pool :pool pool :workers workers
           :queue (ArrayBlockingQueue. (int (:queue-size config)))
           :statements (atom {}) :running? (atom true)
           :admission (atom 0) :execution (atom 0)}]
    (if (locking lifecycle-lock
          (when (and (identical? token @controller)
                     (< (System/currentTimeMillis) (:expires-at-ms config)))
            (reset! session s)
            (dotimes [_ (:workers config)]
              (.submit ^ExecutorService workers ^Runnable #(worker! s)))
            true))
      s
      (stop-session! s))))

(defn stop []
  (let [[executor s] (locking lifecycle-lock
                       (let [current [@controller @session]]
                         (reset! controller nil)
                         (reset! session nil)
                         current))]
    (when executor (.shutdownNow ^ScheduledExecutorService executor))
    (stop-session! s)))

(defn start [{:keys [flag-fn host-id db-config-fn source-pool-fn]}]
  (stop)
  (let [executor (Executors/newSingleThreadScheduledExecutor (daemon-threads "aurora-shadow-control"))
        last-attempt (atom nil)
        tick (fn []
               (try
                 (let [config (config-for-host (flag-fn) host-id (System/currentTimeMillis))
                       s @session]
                   (when (or (not= config (:config s)) (and s (not @(:running? s))))
                     (when (locking lifecycle-lock
                             (when (identical? executor @controller)
                               (reset! session nil)
                               true))
                       (stop-session! s))
                     ;; A failed setup requires a flag change. Never retry against production.
                     (when (and config (identical? executor @controller)
                                (not= config @last-attempt))
                       (reset! last-attempt config)
                       (let [db-config (db-config-fn)]
                         (when (= config (config-for-host (flag-fn) host-id (System/currentTimeMillis)))
                           (start-session! config db-config (source-pool-fn) executor)))))
                   (when-not config (reset! last-attempt nil)))
                 (catch Exception _ (count! :setup-failed))))]
    (reset! controller executor)
    (.scheduleWithFixedDelay executor ^Runnable tick 0 1 TimeUnit/SECONDS)))
