(ns instant.model.app-admin-token
  (:require [instant.jdbc.aurora :as aurora]
            [instant.jdbc.sql :as sql]
            [next.jdbc :as next-jdbc]
            [instant.util.exception :as ex]))

(defn fetch
  ([params] (fetch (aurora/conn-pool :read) params))
  ([conn {:keys [token app-id]}]
   (sql/select-one conn
                   ["SELECT * FROM app_admin_tokens WHERE token = ?::uuid AND app_id = ?::uuid"
                    token app-id])))

(defn fetch! [params]
  (ex/assert-record! (fetch params) :app-admin-token {:args [params]}))

(defn create!
  ([params] (create! (aurora/conn-pool :write) params))
  ([conn {:keys [token app-id]}]
   (sql/execute-one! conn
                     ["INSERT INTO app_admin_tokens (token, app_id) VALUES (?::uuid, ?::uuid)"
                      token app-id])))

(defn delete-by-app-id!
  ([params] (delete-by-app-id! (aurora/conn-pool :write) params))
  ([conn {:keys [app-id]}]
   (sql/execute-one! conn
                     ["DELETE FROM app_admin_tokens WHERE app_id = ?::uuid"
                      app-id])))

(defn recreate!
  ([params] (recreate! (aurora/conn-pool :write) params))
  ([conn {:keys [token app-id]}]
   (next-jdbc/with-transaction [tx-conn conn]
     (delete-by-app-id! tx-conn {:app-id app-id})
     (create! tx-conn {:token token :app-id app-id}))))

(comment
  (def token #uuid "97835b27-6fa5-42e6-a193-87acc50c8629")
  (def colors-app-id  #uuid "b502cabc-11ed-4534-b340-349d46548642")
  (create! {:token token :app-id colors-app-id})
  (delete-by-app-id! {:app-id colors-app-id})
  (recreate! {:token token :app-id colors-app-id})
  (fetch {:token token :app-id colors-app-id}))

