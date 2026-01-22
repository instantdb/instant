(ns instant.db.model.transaction
  (:require
   [instant.config :as config]
   [instant.flags :as flags]
   [instant.isn :refer [->ISN]]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql])
  (:import
   (com.google.common.collect MapMaker)
   (java.util.concurrent ConcurrentMap)
   (java.util.concurrent.atomic AtomicLong)))

;; WeakMap to store tx-id -> instant.isn promise
;; Autoevicts when the promise is GC'd
(defonce isn-promise-map (-> (MapMaker.)
                             (.weakValues)
                             (.makeMap)))

(defn deliver-isn [tx-id isn]
  (when-let [p (ConcurrentMap/.get isn-promise-map tx-id)]
    (deliver p isn)))

(defonce -max-seen-tx-id (AtomicLong. 0))

(defn max-seen-tx-id []
  (.get ^AtomicLong -max-seen-tx-id))

(defn set-max-seen-tx-id [^long v]
  (.set ^AtomicLong -max-seen-tx-id v))

(defn create!
  ([params] (create! (aurora/conn-pool :write) params))
  ([conn {:keys [app-id]}]
   (let [{:keys [id
                 pg_current_wal_insert_lsn] :as res}
         (sql/execute-one! ::create!
                           conn
                           (if (flags/enable-wal-entity-log? app-id)
                             ["with setting as materialized (
                                 select set_config('instant.wal_msg_app_id', ?::text, true) as app_id_config,
                                        set_config('instant.wal_msg_log_to_table', ?::text, true) as log_to_table_config
                               ),
                               tx as (
                                 insert into transactions (app_id) values (?::uuid) returning *
                               )
                               select tx.*,
                                      pg_current_wal_insert_lsn(),
                                      (select app_id_config from setting) as _,
                                      (select log_to_table_config from setting) as _
                               from tx"
                              (str app-id)
                              (str (flags/log-to-wal-log-table?))
                              app-id]
                             ["with tx as (
                                insert into transactions (app_id) values (?::uuid) returning *
                              )
                              select tx.*, pg_current_wal_insert_lsn() from tx"
                              app-id]))
         isn-promise (promise)
         fallback-isn (->ISN config/invalidator-slot-num pg_current_wal_insert_lsn)]
     (ConcurrentMap/.put isn-promise-map id isn-promise)
     (assoc res
            ;; Used as a fallback in handle-transact if we're unable to get the
            ;; isn from the invalidator in time.
            :fallback-isn fallback-isn
            :isn-promise isn-promise))))

(defn max-tx-id [conn]
  (or (:max_id (sql/select-one ::max-tx-id conn ["select max(id) as max_id from transactions"]))
      0))

(defn init [conn]
  (set-max-seen-tx-id (max-tx-id conn)))
