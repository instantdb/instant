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
                       (tool/inspect ["with setting as materialized (
                           select set_config('instant.wal_msg_app_id', ?::text, true) as config
                         ),
                         tx as (
                           insert into transactions (app_id) values (?::uuid) returning *
                         )
                         select tx.*, (select config from setting) as _ from tx"
                                      (str app-id)
                                      app-id])
                       (tool/inspect ["insert into transactions (app_id) values (?::uuid)" app-id])))))
