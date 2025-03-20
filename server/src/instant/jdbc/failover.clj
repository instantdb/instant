(ns instant.jdbc.failover
  (:require
   [honey.sql :as hsql]
   [instant.config :as config]
   [instant.db.model.transaction :as transaction-model]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.util.crypt :refer [bytes->hex-string]]
   [instant.util.lang :as lang]
   [next.jdbc :as next-jdbc]
   [next.jdbc.result-set :as rs])
  (:import
   (java.sql ResultSet ResultSetMetaData)))

(defn start-new-pool [aurora-config]
  (let [conn-pool-size (config/get-connection-pool-size)]
    (aurora/start-pool conn-pool-size aurora-config)))

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
    (alter-var-root #'aurora/conn-pool (fn [_] (fn [rw]
                                                 (if (= :read rw)
                                                   (aurora/memoized-read-only-wrapper prev-pool)
                                                   @next-pool-promise))))
    ;; Give transactions half the receive-timeout to complete
    (println "Waiting for 2.5 seconds for transactions to complete")
    (Thread/sleep 2500)
    (println "Canceling in-progress transactions"
             (count @(:stmts sql/default-statement-tracker)))
    (sql/cancel-in-progress sql/default-statement-tracker)
    ;; Create a transaction we can use as a proxy for everything syncing over to
    ;; the new instance
    (let [tx (transaction-model/create! aurora/-conn-pool
                                        {:app-id (config/instant-config-app-id)})
          quit (fn []
                 (println "Abandoning failover")
                 (lang/close next-pool)
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
    (lang/close prev-pool)
    (println "NEXT STEPS:")
    (println "  1. Put the old database to sleep so that it doesn't accidentally get written to.")
    (println "  2. Update the config so that old db is now new db and redeploy")))

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
                                (with-open [conn (next-jdbc/get-connection
                                                  primary-conn
                                                  ;; required to make postgres stream results
                                                  {:auto-commit false})]
                                  (next-jdbc/plan conn
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
