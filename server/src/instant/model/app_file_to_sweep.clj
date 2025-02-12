(ns instant.model.app-file-to-sweep
  (:require
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [honey.sql :as hsql]))

(defn get-all
  ([] (get-all (aurora/conn-pool :read)))
  ([conn]
   (sql/select
    conn (hsql/format
          {:select [:*]
           :from [:app_files_to_sweep]}))))

(defn delete-by-ids!
  ([params] (delete-by-ids! (aurora/conn-pool :write) params))
  ([conn {:keys [ids]}]
   (sql/execute-one!
    conn
    (hsql/format
     {:delete-from :app_files_to_sweep
      :where [:in :id ids]}))))
