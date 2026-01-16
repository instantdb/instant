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
   [instant.util.crypt :refer [bytes->hex-string]]
   [instant.util.lang :as lang]
   [next.jdbc]
   [next.jdbc.result-set :as rs])
  (:import
   (java.sql ResultSet ResultSetMetaData)
   (org.postgresql.jdbc PgConnection)))

(defn start-new-pool [aurora-config]
  (let [conn-pool-size (config/get-connection-pool-size)]
    (aurora/start-pool conn-pool-size aurora-config)))

;; Keep this here just in case
(declare previous-conn-pool)

;; ---------------------
;; Invalidator migration

;; TODO
;; Notes on implementation:
;;  1. Should operate similarly to the aggregator migration
;;  2. Needs to increment invalidator/slot-num
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
  (with-open [pool (aurora/start-pool 1 (config/get-next-aurora-config))]
    (let [res (sql/select ::replication-origin-status pool ["select * from pg_replication_origin_status"])]
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
                                                  :slot-num (unchecked-inc-int aggregator/global-slot-num)})]
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
                                                                     (config/get-next-aurora-config))})]
    ;; Intentional def-locals so that we have a way to shut it down if something goes wrong
    (tool/def-locals)
    (alter-var-root #'aggregator/shutdown (fn [_] (:shutdown listener)))))

(defn migrate-aggregator-to-replica
  "Migrates aggregator to a slot on the replice.
   Should be called from an nrepl session on a production instance.
   After running the migration, deploy a change that defaults to the replica when
   choosing the slot, then set the `disable-aggregator` flag to false once it is fully
   deployed."
  []
  (create-aggregator-on-replica)
  (pause-aggregator-on-primary)
  (let [{:keys [remote_lsn local_lsn]} (replication-origin-status)]
    (println "remote_lsn:" (str remote_lsn))
    (println "local_lsn:" (str local_lsn))
    (advance-primary-aggregator-to-lsn remote_lsn)
    (set-wal-aggregator-lsn-to-local-lsn local_lsn))
  (start-aggregator-on-replica-slot))


;; --------
;; Failover

(defn do-failover-to-new-db
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
