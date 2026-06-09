(ns instant.jdbc.failover
  (:require
   [clojure.core.async :as a]
   [honey.sql :as hsql]
   [instant.config :as config]
   [instant.db.model.attr :as attr-model]
   [instant.db.model.transaction :as transaction-model]
   [instant.db.transaction :as tx]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.jdbc.wal :as wal]
   [instant.reactive.aggregator :as aggregator]
   [instant.reactive.ephemeral :as eph]
   [instant.reactive.invalidator :as invalidator]
   [instant.util.crypt :refer [bytes->hex-string]]
   [instant.util.lang :as lang]
   [next.jdbc]
   [next.jdbc.result-set :as rs])
  (:import
   (com.hazelcast.map IMap)
   (com.hazelcast.map.impl DataAwareEntryEvent)
   (com.hazelcast.map.listener EntryAddedListener EntryRemovedListener EntryUpdatedListener)
   (java.sql ResultSet ResultSetMetaData)
   (java.util.function BiFunction)
   (org.postgresql.jdbc PgConnection)))

(defn start-new-pool [aurora-config]
  (let [conn-pool-size (config/get-connection-pool-size)]
    (aurora/start-pool conn-pool-size aurora-config)))

;; Keep this here just in case
(declare previous-conn-pool)

;; ---------------
;; Testing locally

;; If you want to test locally, make sure you set up a local replica inside of a
;; separate postgres instance (not just a separate db), because postgres slot names
;; are global across all dbs on the instance.

;; ---------------------
;; Invalidator migration

;; TODO
;; Notes on implementation:
;;  1. Should operate similarly to the aggregator migration
;;  2. Needs to increment instant.config/invalidator-slot-num
;;  3. Instead a disable-invalidator flag, we should set the
;;     slot num somewhere and any machine whose slot num does not equal
;;     the current slot num won't run the invalidator. This way when we deploy
;;     the updated code, the new machines will take over invalidation without any downtime.

;; --------------------
;; Aggregator migration

;; We need to move the aggregator slot from the primary to the replica before we failover.
;;
;; The replica is using logical replication, so the LSN on the replica won't match the LSN
;; on the primary (it should be much smaller)
;;
;; We use the LSN to know where to restart the aggregator, so we need to translate the lsn on
;; the primary to the equivalent lsn on the replica.
;;
;; Luckily, postgres has `pg_replication_origin_status` that has a mapping of the latest remote_lsn to local_lsn.
;;
;; All steps for moving the aggregator slot to the replica:
;;  1. Create an aggregator slot on the replica
;;  2. Pause the aggregator on the primary
;;  3. Call `pg_replication_origin_status` on the replica to get the `remote_lsn` and `local_lsn`
;;  4. Sync the aggregator on the primary up to `remote_lsn`, then shut down the aggregator process
;;  5. Check that `lsn` in the `wal_aggregator_status` table is equal to `remote_lsn`
;;  6. Update `lsn` in the `wal_aggregator_status` table to `local_lsn`
;;  7. Start the aggregator on the replica
;;  8. If the primary is going to be around for a while, drop the aggregator slot on the primary
;;
;;  Be careful to write to the `wal_aggregator_status` table on the primary even though the slot is on the replica
;;
;;  Pause the aggregator while performing the failover--probably best to wait until a new machine is deployed with
;;  no next-aurora-config before re-enabling it.

(defn create-aggregator-on-replica []
  (let [{:keys [connection]} (wal/create-sync-db-replication-slot-and-connection (config/get-next-aurora-config)
                                                                                 "aggregator")]
    (.close ^PgConnection connection)))

(defn pause-aggregator-on-primary []
  (let [attrs (attr-model/get-by-app-id (config/instant-config-app-id))
        setting-aid (:id (attr-model/seek-by-fwd-ident-name ["toggles" "setting"] attrs))
        toggle-aid (:id (attr-model/seek-by-fwd-ident-name ["toggles" "toggled"] attrs))]
    (tx/transact! (aurora/conn-pool :write)
                  attrs
                  (config/instant-config-app-id)
                  [[:add-triple [setting-aid "disable-aggregator"] toggle-aid true]])

    (loop [i 0]
      (if (> i 100)
        (throw (ex-info "Time out waiting for aggregator to stop" {}))
        (let [inactive? (= false (:active (sql/select-one ::aggregator-status
                                                          (aurora/conn-pool :read)
                                                          ["select active from pg_replication_slots where slot_name = 'aggregator'"])))]
          (when-not inactive?
            (println "Waiting for aggregator to stop" i)
            (Thread/sleep 1000)
            (recur (inc i))))))))

(defn replication-origin-status []
  (with-open [conn (next.jdbc/get-connection (config/get-next-aurora-config))]
    (let [res (sql/select ::replication-origin-status conn ["select * from pg_replication_origin_status"])]
      (assert (= 1 (count res)))
      (first res))))

(defn advance-primary-aggregator-to-lsn [remote-lsn]
  (let [listener (aggregator/start-slot-listener {:acquire-slot-interval-ms 1000
                                                  :sketch-flush-ms 1000
                                                  :sketch-flush-max-items 500
                                                  :process-id @config/process-id
                                                  :skip-empty-updates false
                                                  :stop-lsn remote-lsn
                                                  :check-disabled (fn [] false)
                                                  :get-conn-config (fn []
                                                                     (config/get-aurora-config))
                                                  :slot-num aggregator/global-slot-num})]
    ;; Intentional def-locals so that we have a way to shut it down if something goes wrong
    (tool/def-locals)
    (a/<!! (:completed-chan listener))))

(defn primary-aggregator-restart-lsn []
  (:restart_lsn (sql/select-one ::primary-aggregator-restart-lsn
                                (aurora/conn-pool :read)
                                ["select restart_lsn from pg_replication_slots where slot_name = 'aggregator'"])))

(defn wal-aggregator-lsn []
  (:lsn (sql/select-one :wal-aggregator-lsn
                        (aurora/conn-pool :read)
                        ["select lsn from wal_aggregator_status where slot_name = 'aggregator'"])))

(defn set-wal-aggregator-lsn-to-local-lsn [local-lsn]
  (let [previous-lsn (wal-aggregator-lsn)]
    (println "Updating wal aggregator lsn from" (str previous-lsn) "to" (str local-lsn))
    (sql/execute-one! ::set-wal-aggregator-lsn-to-local-lsn
                      (aurora/conn-pool :write)
                      ["update wal_aggregator_status set lsn = ? where slot_name = 'aggregator'" local-lsn])))

(defn start-aggregator-on-replica-slot []
  (aggregator/stop-global)
  (let [listener (aggregator/start-slot-listener {:acquire-slot-interval-ms (* 1000 60)
                                                  :sketch-flush-ms (* 1000 10)
                                                  :sketch-flush-max-items 500
                                                  :process-id @config/process-id
                                                  :skip-empty-updates (= :dev (config/get-env))
                                                  :check-disabled (fn [] false)
                                                  :get-conn-config (fn []
                                                                     (config/get-next-aurora-config))
                                                  :slot-num (unchecked-inc aggregator/global-slot-num)})]
    ;; Intentional def-locals so that we have a way to shut it down if something goes wrong
    (tool/def-locals)
    (alter-var-root #'aggregator/shutdown (fn [_] (:shutdown listener)))))

(defn migrate-aggregator-to-replica
  "Migrates aggregator to a slot on the replica.
   Should be called from an nrepl session on a production instance.
   Find the instance that is currently running the aggregator, then detach it from the load
   balancer before you start.
   After running the migration, deploy a change that defaults to the replica when
   choosing the slot, then set the `disable-aggregator` flag to false once it is fully
   deployed, stop the aggregator on this machine, and shut this machine down."
  []
  (create-aggregator-on-replica)
  (pause-aggregator-on-primary)
  (let [{:keys [remote_lsn local_lsn]} (replication-origin-status)]
    (println "remote_lsn:" (str remote_lsn))
    (println "local_lsn:" (str local_lsn))
    (advance-primary-aggregator-to-lsn remote_lsn)
    (set-wal-aggregator-lsn-to-local-lsn local_lsn))
  (start-aggregator-on-replica-slot))

;; -------------------------------
;; Singleton invalidator migration

;; Same idea as the aggregator, We need to move the singleton slot from the primary to the
;; replica before we failover.

(defn create-invalidator-on-replica []
  (let [{:keys [connection]} (wal/create-sync-db-replication-slot-and-connection (config/get-next-aurora-config)
                                                                                 "invalidator")]
    (.close ^PgConnection connection)))

(defn pause-invalidator-on-primary []
  (let [attrs (attr-model/get-by-app-id (config/instant-config-app-id))
        setting-aid (:id (attr-model/seek-by-fwd-ident-name ["toggles" "setting"] attrs))
        toggle-aid (:id (attr-model/seek-by-fwd-ident-name ["toggles" "toggled"] attrs))]
    (tx/transact! (aurora/conn-pool :write)
                  attrs
                  (config/instant-config-app-id)
                  [[:add-triple [setting-aid "disable-singleton-invalidator"] toggle-aid true]])

    (loop [i 0]
      (if (> i 100)
        (throw (ex-info "Time out waiting for invalidator to stop" {}))
        (let [inactive? (= false (:active (sql/select-one ::invalidator-status
                                                          (aurora/conn-pool :read)
                                                          ["select active from pg_replication_slots
                                                             where slot_name = 'invalidator'"])))]
          (when-not inactive?
            (println "Waiting for invalidator to stop" i)
            (Thread/sleep 1000)
            (recur (inc i))))))))

(defn advance-primary-invalidator-to-lsn [remote-lsn]
  (let [process (invalidator/start-singleton {:stop-lsn remote-lsn
                                              :check-disabled (fn [] false)
                                              :get-conn-config (fn []
                                                                 (config/get-aurora-config))
                                              :slot-num config/invalidator-slot-num})]
    ;; Intentional def-locals so that we have a way to shut it down if something goes wrong
    (tool/def-locals)
    (try
      (a/<!! (:completed-chan (:listener process)))
      (finally
        ((:shutdown process))))))

(defn primary-invalidator-restart-lsn []
  (:restart_lsn (sql/select-one ::primary-invalidator-restart-lsn
                                (aurora/conn-pool :read)
                                ["select restart_lsn from pg_replication_slots
                                   where slot_name = 'invalidator'"])))

(defn advance-replica-invalidator-slot-to-lsn
  "Fast-forwards the replica's invalidator slot to `local-lsn` so that when we
   start reading from it we don't redeliver events that the primary invalidator
   already wrote to history up through `remote_lsn`."
  [local-lsn]
  (with-open [conn (next.jdbc/get-connection (config/get-next-aurora-config))]
    (sql/select-one ::advance-replica-invalidator-slot
                    conn
                    ["select pg_replication_slot_advance('invalidator', ?::pg_lsn)" local-lsn])))

(defn start-invalidator-on-replica-slot []
  (invalidator/stop-singleton-global)
  (let [process (invalidator/start-singleton {:check-disabled (fn [] false)
                                              :get-conn-config (fn []
                                                                 (config/get-next-aurora-config))
                                              :slot-num (unchecked-inc config/invalidator-slot-num)})]
    ;; Intentional def-locals so that we have a way to shut it down if something goes wrong
    (tool/def-locals)
    (alter-var-root #'invalidator/singleton-process (fn [_] process))))

(defn migrate-invalidator-to-replica
  "Migrates singleton invalidator to a slot on the replica.
   Should be called from an nrepl session on a production instance.
   Find the instance that is currently running the invalidator, then detach it from the load
   balancer before you start.
   After running the migration, deploy a change that defaults to the replica when
   choosing the slot, then set the `disable-singleton-invalidator` flag to false once it is fully
   deployed, stop the singleton-invalidator on this machine, make sure it starts properly on a new
   machine and shut this machine down."
  []
  (create-invalidator-on-replica)
  (pause-invalidator-on-primary)
  (let [{:keys [remote_lsn local_lsn]} (replication-origin-status)]
    (println "remote_lsn:" (str remote_lsn))
    (println "local_lsn:" (str local_lsn))
    (advance-primary-invalidator-to-lsn remote_lsn)
    (advance-replica-invalidator-slot-to-lsn local_lsn))
  (start-invalidator-on-replica-slot))

;; --------
;; Failover

(defn my-failover-key []
  {:instance-id @config/instance-id
   :process-id @config/process-id})

(defn get-failover-map ^IMap []
  (.getMap (eph/get-hz) "failover-map"))

(defn init-hz-on-leader
  "Run once manually on the leader."
  []
  (let [m (get-failover-map)]
    (when-not (empty? m)
      (throw (Exception. "The failover-map is not empty")))
    (IMap/.set m :leader (my-failover-key))
    (IMap/.set m :status :wait-for-followers)
    m))

(defn init-hz-on-follower
  "Run once manually in a repl on each follower after running init-hz-on-leader
   Watch carefully for any errors once failover starts."
  []
  (let [next-pool aurora/-replica-conn-pool
        _ (assert next-pool "no replica conn pool")
        conn-pool-fn-before aurora/conn-pool
        prev-pool aurora/-conn-pool
        next-pool-promise (promise)
        m (get-failover-map)
        my-key (my-failover-key)
        repl-out *out*

        set-my-status (fn [status]
                        (binding [*out* repl-out]
                          (println "setting status to" status))
                        (IMap/.compute m
                                       :followers
                                       (reify BiFunction (apply [_ _k v]
                                                           (assoc-in v [my-key :status] status)))))
        finished-promise (promise)]
    (when-not (= (:status m) :wait-for-followers)
      (throw (Exception. (str "Unexpected status " (:status m) ", expected :wait-for-followers"))))
    (let [current-status (atom :wait-for-followers)
          handle-event (fn [^DataAwareEntryEvent event]
                         (let [k (.getKey event)]
                           (when (= k :status)
                             (let [[status-before status-after] (swap-vals! current-status (fn [_v] (.getValue event)))]
                               (binding [*out* repl-out]
                                 (println "status change " status-before "->" status-after))

                               (case [status-before status-after]
                                 [:wait-for-followers :pause-writes]
                                 ;; Make the write connections wait, send the read connections to the replica
                                 (do
                                   (alter-var-root #'aurora/conn-pool (fn [_] (fn [rw]
                                                                                (case rw
                                                                                  (:read :read-replica) (aurora/memoized-read-only-wrapper next-pool)
                                                                                  @next-pool-promise))))
                                   (set-my-status :pause-writes))

                                 [:pause-writes :cancel-in-progress]
                                 (do
                                   (binding [*out* repl-out]
                                     (println "Canceling in-progress transactions"
                                              (count @(:stmts sql/default-statement-tracker))))
                                   (sql/cancel-in-progress sql/default-statement-tracker)
                                   (set-my-status :cancel-in-progress))

                                 [:cancel-in-progress :resume]
                                 (do
                                   (binding [*out* repl-out]
                                     (println "resuming"))
                                   (deliver next-pool-promise next-pool)
                                   (alter-var-root #'aurora/-conn-pool (fn [_] next-pool))
                                   (alter-var-root #'aurora/conn-pool (fn [_] conn-pool-fn-before))
                                   (lang/close prev-pool)
                                   (set-my-status :resume)
                                   (deliver finished-promise {:ok true}))

                                 ([:pause-writes :rollback]
                                  [:cancel-in-progress :rollback])
                                 (do
                                   (binding [*out* repl-out]
                                     (println "Abandoning failover, got rollback"))
                                   (deliver next-pool-promise prev-pool)
                                   (alter-var-root #'aurora/conn-pool (fn [_] conn-pool-fn-before))
                                   (set-my-status :rollback)
                                   (deliver finished-promise {:ok false :error :rollback}))

                                 (do
                                   (binding [*out* repl-out]
                                     (println "UNEXPECTED STATE TRANSITION" status-before status-after))
                                   (set-my-status :failed)))))))
          listener-id (IMap/.addEntryListener m
                                              (reify
                                                EntryAddedListener
                                                (entryAdded [_ event]
                                                  (handle-event event))

                                                EntryRemovedListener
                                                (entryRemoved [_ event]
                                                  (handle-event event))

                                                EntryUpdatedListener
                                                (entryUpdated [_ event]
                                                  (handle-event event)))
                                              true)]
      ;; intentional def-locals so we can stop things if necessary
      (tool/def-locals)
      (set-my-status :ready)
      (println "Added listener, set status to ready, waiting for leader to start...")
      (println (into {} m))
      (println "Finished" @finished-promise)
      (IMap/.removeEntryListener m listener-id))))

(defn do-failover-to-new-db
  "Intended to be run from a production repl, will failover making the replica the primary.
   Before running set the `failing-over` and the `disable-aggregator` feature flags to `true`,
   then set them back to `false` after the failover is complete.

   Before running this:
   1. Run (init-hz-on-leader) on this instance
   2. Run (init-hz-on-follower) on every other instance
   3. Check that (get-failover-map) has all of the instances that you'd expect."
  []
  (println "Failing over to new db")
  (let [m (get-failover-map)
        my-key (my-failover-key)
        set-status (fn [status]
                     (IMap/.set m :status status))
        next-pool aurora/-replica-conn-pool
        _ (assert next-pool "no replica conn pool")
        conn-pool-fn-before aurora/conn-pool
        prev-pool aurora/-conn-pool
        next-pool-promise (promise)
        rollback (fn []
                   (println "Abandoning failover")
                   (deliver next-pool-promise prev-pool)
                   (alter-var-root #'aurora/conn-pool (fn [_] conn-pool-fn-before))
                   (set-status :rollback))
        wait-for-followers (fn [{:keys [expected-status
                                        previous-status
                                        timeout-ms]}]
                             (loop [start (System/currentTimeMillis)]
                               (cond (every? (fn [[_k v]]
                                               (= (:status v) expected-status))
                                             (:followers m))
                                     {:status :ok}

                                     (some (fn [[_k v]]
                                             (and (not= expected-status (:status v))
                                                  (not= previous-status (:status v))))
                                           (:followers m))
                                     {:status :invalid-status}

                                     (< timeout-ms (- (System/currentTimeMillis) start))
                                     {:status :timeout}

                                     :else (do
                                             (Thread/sleep 100)
                                             (recur start)))))]
    (when-let [not-ready (seq (filter (fn [[_k v]]
                                        (not= :ready (:status v)))
                                      (:followers m)))]
      (throw (ex-info "Some instances are not in the ready state" {:not-ready not-ready})))

    (when (not= (:leader m) my-key)
      (throw (ex-info "We're not the leader" {:leader (:leader m)})))

    (when (not= (:status m) :wait-for-followers)
      (throw (ex-info "Invalid status" {:expected :wait-for-followers
                                        :got (:status m)})))

    (when (not= (count (:followers m))
                (dec (count (.getMembers (.getCluster (eph/get-hz))))))
      (throw (ex-info "Invalid follower count" {:follower-count (count (:followers m))
                                                :member-count (dec (count (.getMembers (.getCluster (eph/get-hz)))))})))

    (tool/def-locals)
    (println "Started next pool")
    ;; Make the write connections wait, send the read connections to the replica
    (set-status :pause-writes)
    (alter-var-root #'aurora/conn-pool (fn [_] (fn [rw]
                                                 (case rw
                                                   (:read :read-replica) (aurora/memoized-read-only-wrapper next-pool)
                                                   @next-pool-promise))))

    (let [wait-res (wait-for-followers {:expected-status :pause-writes
                                        :previous-status :ready
                                        :timeout-ms 500})]
      (when-not (= (:status wait-res) :ok)
        (rollback)
        (throw (ex-info (str "Error waiting for followers " (:status wait-res)) {:wait-res wait-res}))))

    ;; Give transactions half the receive-timeout to complete
    (println "Waiting for 2.5 seconds for transactions to complete")
    (Thread/sleep 2500)
    (set-status :cancel-in-progress)
    (println "Canceling in-progress transactions"
             (count @(:stmts sql/default-statement-tracker)))
    (sql/cancel-in-progress sql/default-statement-tracker)

    (let [wait-res (wait-for-followers {:expected-status :cancel-in-progress
                                        :previous-status :pause-writes
                                        :timeout-ms 1000})]
      (when-not (= (:status wait-res) :ok)
        (rollback)
        (throw (ex-info (str "Error waiting for followers " (:status wait-res)) {:wait-res wait-res}))))
    ;; Create a transaction we can use as a proxy for everything syncing over to
    ;; the new instance
    (let [tx (transaction-model/create! prev-pool
                                        {:app-id (config/instant-config-app-id)})
          quit (fn []
                 (rollback)
                 (throw (ex-info "Abandoning failover, somehow the writes aren't in sync." {:quit? true})))]
      (try
        (loop [i 0]
          (if-let [row (sql/select-one next-pool ["select * from transactions where app_id = ?::uuid and id = ?::bigint"
                                                  (config/instant-config-app-id)
                                                  (:id tx)])]
            (if (not= (:app_id row) (config/instant-config-app-id))
              (do
                (println "Got a bad tx row" row)
                (quit))
              (sql/execute! next-pool ["SELECT setval('transactions_id_seq', ?::bigint, true)"
                                       (+ (:id row) 1000)]))
            (do
              (when (> i 100)
                (println "Waited too long for data to sync")
                (quit))
              (println "Not yet synced, waiting for 50ms, i =" i)
              (Thread/sleep 50)
              (recur (inc i)))))
        (catch Throwable t
          (when-not (-> t ex-data :quit?)
            (rollback))
          (throw t))))

    (set-status :resume)
    (println "Synced!")
    (println "Continuing with all queries and transactions on the new db.")
    (deliver next-pool-promise next-pool)
    (alter-var-root #'aurora/-conn-pool (fn [_] next-pool))
    (alter-var-root #'aurora/conn-pool (fn [_] conn-pool-fn-before))
    (def previous-conn-pool prev-pool)
    (println "Closing the old connection pool.")
    (lang/close prev-pool)
    (println "NEXT STEPS:")
    (println "  0. Check that all followers updated their status to resume and have finished")
    (println "  1. Put the old database to sleep so that it doesn't accidentally get written to.")
    (println "  2. Deploy a PR that updates the config so that replica is the primary and redeploy")
    (:followers m)))

(defn do-failover-to-new-db-single-instance-only
  "Intended to be run from a production repl, will failover making the replica the primary.
   Before running set the `failing-over` and the `disable-aggregator` feature flags to `true`,
   then set them back to `false` after the failover is complete.

   Relies on only a single instance being active."
  []
  (println "Failing over to new db")
  (let [next-pool aurora/-replica-conn-pool
        _ (assert next-pool "no replica conn pool")
        conn-pool-fn-before aurora/conn-pool
        prev-pool aurora/-conn-pool
        next-pool-promise (promise)]
    (tool/def-locals)
    (println "Started next pool")
    ;; Make the write connections wait, send the read connections to the replica
    (alter-var-root #'aurora/conn-pool (fn [_] (fn [rw]
                                                 (case rw
                                                   (:read :read-replica) (aurora/memoized-read-only-wrapper next-pool)
                                                   @next-pool-promise))))
    ;; Give transactions half the receive-timeout to complete
    (println "Waiting for 2.5 seconds for transactions to complete")
    (Thread/sleep 2500)
    (println "Canceling in-progress transactions"
             (count @(:stmts sql/default-statement-tracker)))
    (sql/cancel-in-progress sql/default-statement-tracker)
    ;; Create a transaction we can use as a proxy for everything syncing over to
    ;; the new instance
    (let [tx (transaction-model/create! prev-pool
                                        {:app-id (config/instant-config-app-id)})
          quit (fn []
                 (println "Abandoning failover")
                 (deliver next-pool-promise prev-pool)
                 (alter-var-root #'aurora/conn-pool (fn [_] conn-pool-fn-before))
                 (throw (Exception. "Abandoning failover, somehow the writes aren't in sync.")))]
      (loop [i 0]
        (if-let [row (sql/select-one next-pool ["select * from transactions where app_id = ?::uuid and id = ?::bigint"
                                                (config/instant-config-app-id)
                                                (:id tx)])]
          (if (not= (:app_id row) (config/instant-config-app-id))
            (do
              (println "Got a bad tx row" row)
              (quit))
            (sql/execute! next-pool ["SELECT setval('transactions_id_seq', ?::bigint, true)"
                                     (+ (:id row) 1000)]))
          (do
            (when (> i 100)
              (println "Waited too long for data to sync")
              (quit))
            (println "Not yet synced, waiting for 50ms, i =" i)
            (Thread/sleep 50)
            (recur (inc i))))))
    (println "Synced!")
    (println "Continuing with all queries and transactions on the new db.")
    (deliver next-pool-promise next-pool)
    (alter-var-root #'aurora/-conn-pool (fn [_] next-pool))
    (alter-var-root #'aurora/conn-pool (fn [_] conn-pool-fn-before))
    (def previous-conn-pool prev-pool)
    (println "Reset variables, waiting 30 seconds for any in-progress queries to complete")
    (Thread/sleep 30001)
    (println "Closing the old connection pool.")
    (lang/close prev-pool)
    (println "NEXT STEPS:")
    (println "  1. Put the old database to sleep so that it doesn't accidentally get written to.")
    (println "  2. Deploy a PR that updates the config so that replica is the primary and redeploy")))

;; ----------------
;; Validate replica

(def fetch-size 1000)

;; Generate the tbl-configs with:
;; WITH primary_keys AS (
;;     SELECT
;;         kcu.table_name,
;;         array_agg(kcu.column_name) AS primary_key_columns
;;     FROM
;;         information_schema.table_constraints tc
;;     JOIN
;;         information_schema.key_column_usage kcu
;;     ON
;;         tc.constraint_name = kcu.constraint_name
;;         AND tc.table_schema = kcu.table_schema
;;     WHERE
;;         tc.constraint_type = 'PRIMARY KEY'
;;     GROUP BY
;;         kcu.table_name
;; )
;; SELECT
;;     json_agg(
;;         json_build_object(
;;             'tbl', t.table_name,
;;             'primary-key', COALESCE(pk.primary_key_columns, ARRAY[]::text[])
;;         )
;;     ) AS result
;; FROM
;;     information_schema.tables t
;; LEFT JOIN
;;     primary_keys pk ON t.table_name = pk.table_name
;; WHERE
;;     t.table_schema = 'public'
;;     AND t.table_type = 'BASE TABLE';

(def tbl-configs [{:tbl :apps,
                   :primary-key [:id]}
                  {:tbl :indexing_jobs
                   :primary-key [:id]}
                  {:tbl :schema_migrations
                   :primary-key [:version]}
                  {:tbl :instant_oauth_redirects
                   :primary-key [:lookup_key]}
                  {:tbl :grabs
                   :primary-key [:id]}
                  {:tbl :app_authorized_redirect_origins
                   :primary-key [:id]}
                  {:tbl :instant_users
                   :primary-key [:id]}
                  {:tbl :app_email_senders
                   :primary-key [:id]}
                  {:tbl :app_email_templates
                   :primary-key [:id]}
                  {:tbl :app_member_invites
                   :primary-key [:id]}
                  {:tbl :app_members
                   :primary-key [:id]}
                  {:tbl :app_oauth_service_providers
                   :primary-key [:id]}
                  {:tbl :app_oauth_codes
                   :primary-key [:lookup_key]}
                  {:tbl :app_users
                   :primary-key [:id]}
                  {:tbl :app_oauth_redirects
                   :primary-key [:lookup_key]}
                  {:tbl :app_user_oauth_links
                   :primary-key [:id]}
                  {:tbl :deprecated_transaction_counters
                   :primary-key [:app_id]}
                  {:tbl :triples
                   :primary-key [:value_md5
                                 :app_id
                                 :attr_id
                                 :entity_id]}
                  {:tbl :app_admin_tokens
                   :primary-key [:token]}
                  {:tbl :app_user_refresh_tokens
                   :primary-key [:id]}
                  {:tbl :instant_user_refresh_tokens
                   :primary-key [:id]}
                  {:tbl :instant_user_magic_codes
                   :primary-key [:id]}
                  {:tbl :instant_user_outreaches
                   :primary-key [:user_id]}
                  {:tbl :app_user_magic_codes
                   :primary-key [:id]}
                  {:tbl :idents
                   :primary-key [:id]}
                  {:tbl :instant_oauth_codes
                   :primary-key [:lookup_key]}
                  {:tbl :instant_profiles
                   :primary-key [:id]}
                  {:tbl :instant_stripe_customers
                   :primary-key [:id]}
                  {:tbl :instant_subscription_types
                   :primary-key [:id]}
                  {:tbl :rules
                   :primary-key [:app_id]}
                  {:tbl :transactions
                   :primary-key [:id]}
                  {:tbl :app_oauth_clients
                   :primary-key [:id]}
                  {:tbl :attrs
                   :primary-key [:id]}
                  {:tbl :instant_subscriptions
                   :primary-key [:id]}
                  {:tbl :instant_cli_logins
                   :primary-key [:id]}
                  {:tbl :config
                   :primary-key [:k]}
                  {:tbl :instant_personal_access_tokens
                   :primary-key [:id]}])

(def bytes-class (Class/forName "[B"))

(defn bytes-column-reader
  "Converts byte arrays into hex strings so that we can compare them."
  [^ResultSet rs ^ResultSetMetaData _ ^Integer i]
  (when-let [value (.getObject rs i)]
    (if (instance? bytes-class value)
      ;; This lets us use the field as a primary key component
      [:decode (bytes->hex-string value) [:inline "hex"]]
      value)))

(def row-builder (rs/as-maps-adapter
                  rs/as-unqualified-maps
                  bytes-column-reader))

(defn find-missing-rows [replica-conn batch {:keys [tbl primary-key]}]
  (let [q (hsql/format
           {:select :*
            :from tbl
            :where (list* :or
                          (map (fn [row]
                                 (list* :and
                                        (map (fn [[k v]]
                                               [:= k v])
                                             (select-keys row primary-key))))
                               batch))})
        replica-rows (sql/select ::fetch-by-id replica-conn q {:builder-fn row-builder})]
    (apply disj (set batch) replica-rows)))

(defn recheck-missing [primary-conn
                       replica-conn
                       {:keys [tbl primary-key]}
                       rows]
  (println (format "Rechecking missing from %s (%d rows)" tbl (count rows)))
  (reduce (fn [acc row]
            (let [q (hsql/format
                     {:select :*
                      :from tbl
                      :where (list* :and
                                    (map (fn [[k v]]
                                           [:= k v])
                                         (select-keys row primary-key)))})
                  primary-row (sql/select-one ::fetch-by-id primary-conn q {:builder-fn row-builder})]
              (if (not= primary-row row)
                (do
                  (println "Row didn't match on primary" (select-keys row primary-key))
                  acc)
                (let [replica-row (sql/select-one ::fetch-by-id replica-conn q {:builder-fn row-builder})]
                  (if (not= primary-row replica-row)
                    (conj acc row)
                    acc)))))
          []
          rows))

(defn validate-replica-data [primary-conn replica-conn]
  (reduce (fn [results {:keys [tbl] :as config}]
            (println "Validating" tbl)
            (time (let [{:keys [batch invalid]}
                        (reduce (fn [{:keys [invalid batch]} row]
                                  (let [next-batch (conj batch (into {} row))]
                                    (if (> fetch-size (count next-batch))
                                      {:invalid invalid
                                       :batch next-batch}
                                      {:batch []
                                       :invalid (into invalid
                                                      (find-missing-rows replica-conn next-batch config))})))
                                {:invalid []
                                 :batch []}
                                (with-open [conn (next.jdbc/get-connection
                                                  primary-conn
                                                  ;; required to make postgres stream results
                                                  {:auto-commit false})]
                                  (next.jdbc/plan conn
                                                  (hsql/format {:select :*
                                                                :from tbl})
                                                  {:builder-fn row-builder
                                                   ;; required to make postgres stream results
                                                   :fetch-size fetch-size
                                                   :concurrency :read-only
                                                   :cursors :close
                                                   :result-type :forward-only})))

                        invalid (if (seq batch)
                                  (into invalid (find-missing-rows replica-conn batch config))
                                  invalid)
                        invalid (if (seq invalid)
                                  (recheck-missing primary-conn replica-conn config invalid)
                                  invalid)]
                    (assoc results tbl {:invalid invalid}))))
          {}
          tbl-configs))
