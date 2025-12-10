(ns instant.db.model.transaction
  (:require
   [instant.flags :as flags]
   [instant.jdbc.sql :as sql]
   [instant.jdbc.aurora :as aurora]))

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
