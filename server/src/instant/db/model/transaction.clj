(ns instant.db.model.transaction
  (:require
   [instant.flags :as flags]
   [instant.jdbc.sql :as sql]
   [instant.jdbc.aurora :as aurora])
  (:import (java.util.concurrent.atomic AtomicLong)))

(defonce -max-seen-tx-id (AtomicLong. 0))

(defn max-seen-tx-id []
  (.get ^AtomicLong -max-seen-tx-id))

(defn set-max-seen-tx-id [^long v]
  (.set ^AtomicLong -max-seen-tx-id v))

(defn create!
  ([params] (create! (aurora/conn-pool :write) params))
  ([conn {:keys [app-id]}]
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
                                (select app_id_config from setting) as _,
                                (select log_to_table_config from setting) as _
                           from tx"
                        (str app-id)
                        (str (flags/log-to-wal-log-table?))
                        app-id]
                       ["insert into transactions (app_id) values (?::uuid)" app-id]))))

(defn max-tx-id [conn]
  (:max_id (sql/select-one ::max-tx-id conn ["select max(id) as max_id from transactions"])))

(defn init [conn]
  (set-max-seen-tx-id (max-tx-id conn)))
