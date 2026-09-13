(ns instant.jdbc.query-shadow-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [instant.jdbc.query-shadow :as query-shadow]
   [instant.aurora-config :as aurora-config]
   [next.jdbc :as jdbc])
  (:import
   (com.zaxxer.hikari HikariDataSource)
   (java.net SocketTimeoutException)
   (java.sql Connection PreparedStatement ResultSet SQLException SQLTimeoutException SQLTransientConnectionException)
   (java.time Instant)
   (java.util.concurrent ArrayBlockingQueue Executors)
   (org.postgresql.ds PGSimpleDataSource)
   (org.postgresql.util PGobject)))

(def trial-deadline-ms
  (.toEpochMilli (Instant/parse "2026-09-13T23:06:21Z")))

(def trial-config
  {:enabled true
   :candidate-instance-id "instant-8-shadow-20260913"
   :host-ids ["i-a"]
   :sample-rate 0.01
   :qps 2
   :workers 2
   :expires-at "2026-09-13T23:06:21Z"})

(deftest disabled-and-invalid-config
  (let [now-ms (- trial-deadline-ms 60000)]
    (doseq [raw [nil false "{}" {} (assoc trial-config :enabled false)
                 (assoc trial-config :enabled "true")]]
      (is (nil? (query-shadow/config-for-host raw "i-a" now-ms))))
    (testing "hosts and candidate must be explicitly allowlisted"
      (is (nil? (query-shadow/config-for-host trial-config "i-other" now-ms)))
      (is (nil? (query-shadow/config-for-host
                 (assoc trial-config :candidate-instance-id "writer") "i-a" now-ms))))
    (testing "invalid or excessive global bounds fail closed"
      (doseq [[k invalid-values] [[:sample-rate [-1 1.0001 "0.01" Double/NaN]]
                                 [:qps [-1 200.1 "2" Double/POSITIVE_INFINITY]]
                                 [:workers [0 5 1.5 "2"]]
                                 [:host-ids [[] ["i-a" "i-a"] ["i-a" "i-b" "i-c"]
                                             ["i-a" "i-b" "i-c" "i-d" "i-e"]]]
                                 [:expires-at [nil "invalid"]]]
              value invalid-values]
        (is (nil? (query-shadow/config-for-host
                   (assoc trial-config k value) "i-a" now-ms))
            (str k "=" value))))))

(deftest config-expiration
  (is (some? (query-shadow/config-for-host trial-config "i-a" (dec trial-deadline-ms))))
  (is (nil? (query-shadow/config-for-host trial-config "i-a" trial-deadline-ms)))
  (is (nil? (query-shadow/config-for-host trial-config "i-a" (inc trial-deadline-ms))))
  (testing "a flag cannot extend the hard trial deadline"
    (let [config (assoc trial-config :expires-at "2026-09-14T23:06:21Z")]
      (is (= trial-deadline-ms
             (:expires-at-ms (query-shadow/config-for-host config "i-a" (dec trial-deadline-ms)))))
      (is (nil? (query-shadow/config-for-host config "i-a" trial-deadline-ms)))))
  (testing "an earlier configured expiry takes effect"
    (is (nil? (query-shadow/config-for-host
               (assoc trial-config :expires-at "2026-09-13T22:06:21Z")
               "i-a" (- trial-deadline-ms 1000))))))

(deftest global-budget-allocation
  (let [now-ms (dec trial-deadline-ms)
        single (query-shadow/config-for-host trial-config "i-a" now-ms)]
    (is (= 0.01 (:sample-rate single)))
    (is (== 2 (:qps single)))
    (is (= 2 (:workers single)))
    (is (= 32 (:queue-size single)))
    (testing "the flag API may provide string keys"
      (is (= single
             (query-shadow/config-for-host
              (into {} (map (fn [[k v]] [(name k) v])) trial-config)
              "i-a" now-ms))))
    (testing "host allocations share one global cap"
      (let [hosts ["i-a" "i-b" "i-c" "i-d"]
            raw (assoc trial-config :host-ids hosts :sample-rate 1.0 :qps 200 :workers 4)
            configs (mapv #(query-shadow/config-for-host raw % now-ms) hosts)]
        (is (every? some? configs))
        (is (every? #(== 50 (:qps %)) configs))
        (is (every? #(= 1 (:workers %)) configs))
        (is (= 32 (reduce + (map :queue-size configs))))
        (is (every? #(= 1.0 (:sample-rate %)) configs))))))

(defn read-only-connection [read-only?]
  (proxy [Connection] []
    (isReadOnly [] read-only?)))

(deftest audited-query-scope
  (let [ctx {:query-normalized {:goals {}} :request (Object.)}
        expected {:origin :nested-read :app-id "test-app" :query-hash "test-query"}]
    (is (= expected (query-shadow/metadata-for-query ctx "test-app" "test-query")))
    (doseq [ctx [nil {} {:query-normalized false}
                 (assoc ctx :skip-app-status-read-check? true)
                 (assoc ctx :instant.db.datalog/permission-entity-fetch? true)]]
      (is (nil? (query-shadow/metadata-for-query ctx "test-app" "test-query"))))))

(deftest source-eligibility
  (let [metadata {:origin :nested-read}
        reader (read-only-connection true)
        writer (read-only-connection false)]
    (is (query-shadow/source-eligible? metadata reader true))
    (testing "caller-owned connections may read uncommitted transaction writes"
      (is (not (query-shadow/source-eligible? metadata reader false))))
    (testing "the actual source connection must be read-only"
      (is (not (query-shadow/source-eligible? metadata writer true))))
    (testing "only audited nested reads are eligible"
      (doseq [metadata [nil {} {:origin :read} {:origin :transaction}]]
        (is (not (query-shadow/source-eligible? metadata reader true)))))
    (testing "a failed connection check excludes the query"
      (let [connection (proxy [Connection] []
                         (isReadOnly [] (throw (SQLException. "closed"))))]
        (is (not (query-shadow/source-eligible? metadata connection true)))))))

(deftest bind-snapshot
  (let [ids (with-meta [#uuid "c94c255f-9f2f-4484-9868-54a41786b613"
                       #uuid "6454f319-e532-4955-b93a-654e6baedde7"]
              {:pgtype "uuid[]"})
        query ["select ?, ?, ?, ?, ?, ?" ids nil true 42 1.5
               (Instant/parse "2026-09-13T20:00:00Z")]
        snapshot (query-shadow/snapshot-job query nil)]
    (is (= query (:query snapshot)))
    (is (= {:pgtype "uuid[]"} (meta (second (:query snapshot))))))
  (testing "unknown mutable objects cannot enter the worker queue"
    (is (nil? (query-shadow/snapshot-job ["select ?" (Object.)] nil))))
  (testing "an oversized SQL string or bind is dropped"
    (let [oversized (apply str (repeat (inc (* 256 1024)) "a"))]
      (is (nil? (query-shadow/snapshot-job [oversized] nil)))
      (is (nil? (query-shadow/snapshot-job ["select ?" oversized] nil))))))

(deftest snapshot-does-not-retain-request-state
  (let [request (Object.)
        bind (with-meta ["a" "b"] {:pgtype "text[]" :request request})
        query (with-meta ["select ?" bind] {:request request})
        snapshot (:query (query-shadow/snapshot-job query nil))]
    (is (= ["select ?" ["a" "b"]] snapshot))
    (is (nil? (:request (meta snapshot))))
    (is (= {:pgtype "text[]"} (meta (second snapshot)))))
  (testing "lazy binds are rejected without realization"
    (let [realized? (atom false)
          bind (lazy-seq (reset! realized? true) (list 1))]
      (is (nil? (query-shadow/snapshot-job ["select ?" bind] nil)))
      (is (false? @realized?))))
  (testing "mutable JDBC values must be explicitly supported"
    (doseq [bind [(byte-array [1 2 3]) (java.util.Date. 0)]]
      (is (nil? (query-shadow/snapshot-job ["select ?" bind] nil)))))
  (testing "PGobject values are copied before the source can mutate them"
    (let [bind (doto (PGobject.) (.setType "jsonb") (.setValue "{\"a\":1}"))
          ^PGobject copied (second (:query (query-shadow/snapshot-job ["select ?" bind] nil)))]
      (is (not (identical? bind copied)))
      (.setValue bind "{\"a\":2}")
      (is (= "jsonb" (.getType copied)))
      (is (= "{\"a\":1}" (.getValue copied))))))

(deftest snapshot-size-bounds
  (testing "the whole bind tree shares one memory budget"
    (let [value (apply str (repeat (* 40 1024) "a"))]
      (is (some? (query-shadow/snapshot-job ["select ?" value] nil)))
      (is (nil? (query-shadow/snapshot-job ["select ?, ?, ?" value value value] nil)))))
  (testing "multibyte strings count toward the byte bound"
    (let [value (apply str (repeat (* 100 1024) "\u20ac"))]
      (is (nil? (query-shadow/snapshot-job ["select ?" value] nil)))))
  (testing "deep nesting is rejected without exhausting the caller stack"
    (let [value (nth (iterate vector 1) 1000)]
      (is (nil? (query-shadow/snapshot-job ["select ?" value] nil))))))

(deftest snapshot-postgres-settings
  (let [settings [{:setting "enable_nestloop" :value "off"}
                  {:setting "plan_cache_mode" :value "force_custom_plan"}]]
    (is (= settings (:postgres-config (query-shadow/snapshot-job ["select 1"] settings)))))
  (testing "settings outside the planner allowlist are excluded"
    (is (nil? (query-shadow/snapshot-job
               ["select 1"] [{:setting "search_path" :value "public"}])))))

(deftest rate-reservations
  (let [next-ns (atom 0)]
    (is (query-shadow/reserve! next-ns 2 0))
    (is (not (query-shadow/reserve! next-ns 2 0)))
    (is (not (query-shadow/reserve! next-ns 2 499999999)))
    (is (query-shadow/reserve! next-ns 2 500000000))
    (testing "unused capacity does not accumulate into a burst"
      (is (query-shadow/reserve! next-ns 2 10000000000))
      (is (not (query-shadow/reserve! next-ns 2 10000000000)))))
  (testing "concurrent attempts cannot reserve the same capacity"
    (let [next-ns (atom 0)
          attempts (doall (repeatedly 16 #(future (query-shadow/reserve! next-ns 2 0))))]
      (is (= 1 (count (filter true? (map deref attempts))))))))

(deftest candidate-identity
  (let [replica {:cluster-id "instant-8"
                 :instance-id "instant-8-shadow-20260913"
                 :host "candidate.example.test" :port 5432 :dbname "instant"
                 :other-setting "must not be copied"}
        db-config {:cluster-id "instant-8" :instance-id "writer"
                   :secret-arn "test-secret" :replica replica}
        expected {:instance-id "instant-8-shadow-20260913"
                  :host "candidate.example.test" :port 5432 :dbname "instant"
                  :secret-arn "test-secret"}]
    (is (= expected (query-shadow/candidate-config db-config "instant-8-shadow-20260913")))
    (is (nil? (query-shadow/candidate-config db-config "writer")))
    (doseq [invalid [(dissoc db-config :replica)
                     (assoc db-config :cluster-id "other")
                     (assoc db-config :instance-id "instant-8-shadow-20260913")
                     (assoc-in db-config [:replica :cluster-id] "other")
                     (assoc-in db-config [:replica :instance-id] "other-reader")]]
      (is (nil? (query-shadow/candidate-config invalid "instant-8-shadow-20260913"))))))

(defn test-session []
  {:config {:sample-rate 0.01 :qps 2 :expires-at-ms (+ (System/currentTimeMillis) 60000)}
   :source-pool (Object.)
   :queue (ArrayBlockingQueue. 1)
   :running? (atom true)
   :statements (atom {})
   :admission (atom 0)
   :execution (atom 0)})

(defn with-shadow-state [s f]
  (with-redefs-fn {#'query-shadow/session (atom s)
                  #'query-shadow/controller (atom nil)
                  #'query-shadow/stats (atom {:counts {} :families {}})
                  #'clojure.core/rand (constantly 0)}
    f))

(defn offer-query! [s]
  (query-shadow/offer! {:origin :nested-read :app-id "test-app" :query-hash "test-query"}
                       (:source-pool s) (read-only-connection true) true
                       ["select ?" 1] nil 4))

(deftest successful-timings-use-the-same-query-cohort
  (with-shadow-state nil
    (fn []
      (let [family ["test-app" "test-query"]
            completed {:family family :primary-ms 4 :queue-ms 50 :query ["select ?" "private-bind"]}
            failed (assoc completed :primary-ms 100 :queue-ms 150)]
        (#'query-shadow/outcome! completed :attempted nil)
        (#'query-shadow/outcome! completed :completed 7)
        (#'query-shadow/outcome! failed :attempted nil)
        (#'query-shadow/outcome! failed :failed nil)
        (let [snapshot (query-shadow/snapshot)
              family-stats (get-in snapshot [:families family])]
          (doseq [timing [(:timing snapshot) family-stats]]
            (is (= {:count 2 :sum-ms 104} (select-keys (:primary timing) [:count :sum-ms])))
            (is (= {:count 2 :sum-ms 200} (select-keys (:queue-delay timing) [:count :sum-ms])))
            (is (= {:count 1 :sum-ms 4} (select-keys (:primary-completed timing) [:count :sum-ms])))
            (is (= {:count 1 :sum-ms 7} (select-keys (:candidate timing) [:count :sum-ms]))))
          (is (= {:attempted 2 :completed 1 :failed 1} (:counts snapshot)))
          (is (= (:counts snapshot) (:counts family-stats)))
          (is (not-any? #{"select ?" "private-bind"} (tree-seq coll? seq snapshot))))))))

(deftest bounded-queue-admission
  (let [s (test-session)]
    (with-shadow-state s
      (fn []
        (with-redefs [query-shadow/reserve! (constantly true)]
          (offer-query! s)
          (offer-query! s))
        (is (= 1 (.size ^ArrayBlockingQueue (:queue s))))
        (is (= 1 (get-in (query-shadow/snapshot) [:counts :queued])))
        (is (= 1 (get-in (query-shadow/snapshot) [:counts :dropped]))))))
  (testing "rate-limited calls do not copy bind values"
    (let [s (assoc (test-session) :admission (atom Long/MAX_VALUE))]
      (with-shadow-state s
        (fn []
          (with-redefs [query-shadow/snapshot-job (fn [& _] (throw (AssertionError. "should not copy")))]
            (offer-query! s))
          (is (zero? (.size ^ArrayBlockingQueue (:queue s))))
          (is (= 1 (get-in (query-shadow/snapshot) [:counts :rate-limited])))
          (is (nil? (get-in (query-shadow/snapshot) [:counts :capture-failed]))))))))

(deftest disabled-and-stopped-capture
  (doseq [s [nil
             (assoc (test-session) :running? (atom false))
             (assoc-in (test-session) [:config :expires-at-ms] 0)]]
    (with-shadow-state s
      (fn []
        (offer-query! s)
        (is (= {} (:counts (query-shadow/snapshot)))))))
  (testing "disabling capture while copying prevents enqueue"
    (let [s (test-session)]
      (with-shadow-state s
        (fn []
          (with-redefs [query-shadow/snapshot-job
                        (fn [query settings]
                          (reset! (:running? s) false)
                          {:query query :postgres-config settings})]
            (offer-query! s))
          (is (zero? (.size ^ArrayBlockingQueue (:queue s))))
          (is (= 1 (get-in (query-shadow/snapshot) [:counts :dropped]))))))))

(deftest worker-expiry-and-failure
  (doseq [[scenario expected] [[:expired :expired]
                               [:limited :execution-rate-limited]
                               [:timeout :timed-out]
                               [:failure :failed]]]
    (let [s (cond-> (test-session)
              (= scenario :limited) (assoc :execution (atom Long/MAX_VALUE)))
          counts (atom [])
          job {:query ["select 1"] :primary-ms 4 :queue-ms 0 :family ["test-app" "test-query"]
               :created-ms (if (= scenario :expired) 0 (System/currentTimeMillis))}]
      (.offer ^ArrayBlockingQueue (:queue s) job)
      (with-redefs-fn
        {#'query-shadow/count! (fn [k] (swap! counts conj k) (reset! (:running? s) false))
         #'query-shadow/outcome! (fn [_ outcome _]
                                  (swap! counts conj outcome)
                                  (when-not (= outcome :attempted)
                                    (reset! (:running? s) false)))
         #'query-shadow/execute-job! (fn [& _]
                                      (if (= scenario :timeout)
                                        (throw (SQLException. "timeout" "57014"))
                                        (throw (Exception. "candidate unavailable"))))}
        #(#'query-shadow/worker! s))
      (is (= (if (#{:timeout :failure} scenario) [:attempted expected] [expected]) @counts)
          (name scenario))))
  (testing "a stopped or expired trial never dequeues work"
    (doseq [s [(assoc (test-session) :running? (atom false))
               (assoc-in (test-session) [:config :expires-at-ms] 0)]]
      (.offer ^ArrayBlockingQueue (:queue s) {:created-ms (System/currentTimeMillis)})
      (#'query-shadow/worker! s)
      (is (= 1 (.size ^ArrayBlockingQueue (:queue s)))))))

(deftest stop-clears-and-cancels-work
  (let [canceled? (atom false)
        closed? (atom false)
        workers (Executors/newSingleThreadExecutor)
        statement (proxy [PreparedStatement] [] (cancel [] (reset! canceled? true)))
        pool (proxy [HikariDataSource] [] (close [] (reset! closed? true)))
        s (assoc (test-session) :pool pool :workers workers :statements (atom {1 statement}))]
    (.offer ^ArrayBlockingQueue (:queue s) {:query ["select 1"]})
    (try
      (with-shadow-state s
        (fn []
          (query-shadow/stop)
          (is (false? @(:running? s)))
          (is (zero? (.size ^ArrayBlockingQueue (:queue s))))
          (is @canceled?)
          (is @closed?)
          (is (.isShutdown workers))
          (is (false? (:active? (query-shadow/snapshot))))))
      (finally (.shutdownNow workers)))))

(deftest stopped-setup-cannot-publish-a-session
  (let [opened (promise)
        release (promise)
        closed? (atom false)
        started? (atom false)
        token (Executors/newSingleThreadScheduledExecutor)
        pool (proxy [HikariDataSource] [] (close [] (reset! closed? true)))
        config {:workers 1 :queue-size 1 :qps 2 :expires-at-ms (+ (System/currentTimeMillis) 60000)}]
    (try
      (with-shadow-state nil
        (fn []
          (reset! @#'query-shadow/controller token)
          (with-redefs-fn
            {#'query-shadow/open-pool (fn [& _] (deliver opened true) @release pool)
             #'query-shadow/worker! (fn [_] (reset! started? true))}
            (fn []
              (let [setup (future (#'query-shadow/start-session! config {} (Object.) token))]
                (try
                  (is (= true (deref opened 5000 :timed-out)))
                  (query-shadow/stop)
                  (deliver release true)
                  (is (not= :timed-out (deref setup 5000 :timed-out)))
                  (is @closed?)
                  (is (false? @started?))
                  (is (false? (:active? (query-shadow/snapshot))))
                  (is (nil? (:config (query-shadow/snapshot))))
                  (finally
                    (deliver release true)
                    (future-cancel setup))))))))
      (finally
        (deliver release true)
        (.shutdownNow token)))))

(deftest stop-after-statement-registration-prevents-execution
  (let [canceled? (atom false)
        executed? (atom false)
        timeout (atom nil)
        workers (Executors/newSingleThreadExecutor)
        pool (proxy [HikariDataSource] [] (close [] nil))
        statement (proxy [PreparedStatement] []
                    (setQueryTimeout [seconds] (reset! timeout seconds))
                    (cancel [] (reset! canceled? true)))
        s (assoc (test-session) :pool pool :workers workers)]
    (try
      (with-shadow-state s
        (fn []
          (add-watch (:statements s) ::stop
                     (fn [_ _ _ statements]
                       (when (seq statements) (query-shadow/stop))))
          (#'query-shadow/with-statement
           s {:created-ms (System/currentTimeMillis)} statement
           (fn [_] (reset! executed? true)))
          (is (= 2 @timeout))
          (is @canceled?)
          (is (false? @executed?))
          (is (empty? @(:statements s)))))
      (finally (.shutdownNow workers)))))

(defn result-limit-error []
  (doto (SQLException. "private driver details" "08S01")
    (.setStackTrace (into-array StackTraceElement
                                [(StackTraceElement. "org.postgresql.core.PGStream"
                                                     "increaseByteCounter" "PGStream.java" 1)]))))

(deftest bounded-failure-classification
  (doseq [[phase error reason] [[:query (result-limit-error) :result-too-large]
                               [:query (SQLException. "private" "08S01") :connection-failure]
                               [:query (SQLException. "private" "57014") :statement-timeout-or-cancel]
                               [:settings (SQLException. "private" "55P03") :lock-timeout]
                               [:connection (SQLTransientConnectionException. "private") :pool-timeout]
                               [:query (SQLException. "private" "08006" (SocketTimeoutException. "private")) :connection-timeout]
                               [:query (SQLTimeoutException. "private") :statement-timeout-or-cancel]
                               [:query (SQLException. "private" "42P01") :sql-error]
                               [:query (Exception. "private") :other]]]
    (is (= reason (first (#'query-shadow/failure-kind phase error)))))
  (testing "classification does not retain arbitrary error or phase data"
    (is (= [:sql-error :unknown :other :sql]
           (#'query-shadow/failure-kind "private phase" (SQLException. "private message" "private state")))))
  (testing "wrapped driver errors are recognized without inspecting messages"
    (is (= :result-too-large
           (first (#'query-shadow/failure-kind :query (Exception. "private" (result-limit-error)))))))
  (testing "cause traversal terminates on cycles"
    (let [a (Exception. "a") b (Exception. "b")]
      (.initCause a b)
      (.initCause b a)
      (is (= :other (first (#'query-shadow/failure-kind :query a)))))))

(deftest failure-breakdown-reconciles-with-terminal-counts
  (with-shadow-state nil
    (fn []
      (let [family ["test-app" "test-query"]
            job {:family family :primary-ms 4 :queue-ms 0 :phase (volatile! :query)
                 :query ["private SQL" "private bind"]}]
        (doseq [error [(result-limit-error) (SQLException. "private" "57014")
                       (SQLException. "private" "55P03")]]
          (#'query-shadow/outcome! job :attempted nil)
          (#'query-shadow/failure! job error))
        (let [snapshot (query-shadow/snapshot)]
          (is (= {:attempted 3 :failed 2 :timed-out 1} (:counts snapshot)))
          (is (= 3 (reduce + (vals (:failures snapshot)))))
          (is (= (:failures snapshot) (get-in snapshot [:families family :failures])))
          (is (not-any? #{"private SQL" "private bind" "private" "private driver details"}
                        (tree-seq coll? seq snapshot))))))))

(deftest cleanup-preserves-query-failure-and-phase
  (let [primary-error (result-limit-error)
        cleanup-error (SQLException. "connection closed" "08003")
        cleaned (atom [])
        identity-rs (proxy [ResultSet] []
                      (next [] true)
                      (getBoolean [_] true)
                      (getString [_] query-shadow/candidate-instance-id)
                      (close [] nil))
        identity-ps (proxy [PreparedStatement] []
                      (setQueryTimeout [_] nil)
                      (executeQuery [] identity-rs)
                      (close [] nil))
        settings-ps (proxy [PreparedStatement] []
                      (setQueryTimeout [_] nil)
                      (setString [_ _] nil)
                      (execute [] true)
                      (close [] nil))
        query-ps (proxy [PreparedStatement] []
                   (setQueryTimeout [_] nil)
                   (executeQuery [] (throw primary-error))
                   (close [] (swap! cleaned conj :statement) (throw cleanup-error)))
        conn (proxy [Connection] []
               (prepareStatement [sql]
                 (if (= sql "select set_config(?, ?, true)") settings-ps identity-ps))
               (rollback [] (swap! cleaned conj :rollback) (throw cleanup-error))
               (close [] (swap! cleaned conj :connection) (throw cleanup-error)))
        pool (proxy [HikariDataSource] [] (getConnection [] conn))
        phase (volatile! :connection)
        s (assoc (test-session) :pool pool)
        job {:created-ms (System/currentTimeMillis) :phase phase :query ["select 1"]}]
    (with-redefs [jdbc/prepare (fn [& _] query-ps)]
      (is (identical? primary-error
                      (try (#'query-shadow/execute-job! s job)
                           (catch SQLException e e)))))
    (is (= [:statement :rollback :connection] @cleaned))
    (is (= :query @phase))
    (is (empty? @(:statements s))))
  (testing "a cleanup error after a successful body remains visible"
    (let [phase (volatile! :query)
          error (SQLException. "private" "08003")]
      (is (identical? error
                      (try (#'query-shadow/with-cleanup phase :rollback (constantly 1) #(throw error))
                           (catch SQLException e e))))
      (is (= :rollback @phase)))))

(deftest candidate-result-buffer-remains-bounded
  (with-redefs [aurora-config/secret-arn->db-creds (constantly {:user "test" :password "test"})]
    (with-open [^HikariDataSource pool
                (#'query-shadow/open-pool
                 {:candidate-instance-id query-shadow/candidate-instance-id :workers 4}
                 {:cluster-id "instant-8" :instance-id "writer" :secret-arn "test"
                  :replica {:cluster-id "instant-8" :instance-id query-shadow/candidate-instance-id
                            :host "candidate.example.test" :port 5432 :dbname "test"}})]
      (let [^PGSimpleDataSource ds (.getDataSource pool)]
        (is (= "536870912" (.getMaxResultBuffer ds)))
        (is (= 4 (.getMaximumPoolSize pool)))
        (is (= 3 (.getSocketTimeout ds)))
        (is (= "secondary" (.getTargetServerType ds)))
        (is (.isReadOnly pool))
        (is (false? (.isAutoCommit pool)))))))
