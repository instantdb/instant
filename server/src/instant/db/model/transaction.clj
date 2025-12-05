(ns instant.db.model.transaction
  (:require
   [instant.jdbc.sql :as sql]
   [instant.jdbc.aurora :as aurora]))

(defn create!
  ([params] (create! (aurora/conn-pool :write) params))
  ([conn {:keys [app-id]}]
   (sql/execute-one! ::create!
                     conn
                     ["INSERT INTO transactions (app_id) VALUES (?::uuid)"
                      app-id])))
