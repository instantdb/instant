(ns instant.model.instant-profile
  (:require
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.util.json :refer [->json]]
   [instant.model.instant-user :as instant-user-model]))

(defn put!
  ([params] (put! (aurora/conn-pool :write) params))
  ([conn {:keys [user-id meta]}]
   (sql/execute-one!
    conn
    ["INSERT INTO instant_profiles (id, meta) VALUES (?::uuid, ?::jsonb)
     ON CONFLICT (id) DO UPDATE SET meta = excluded.meta"
     user-id (->json meta)])))

(defn get-by-user-id
  ([params] (get-by-user-id (aurora/conn-pool :read) params))
  ([conn {:keys [user-id]}]
   (sql/select-one conn
                   ["SELECT 
                       ip.* 
                     FROM instant_profiles ip
                     WHERE ip.id = ?::uuid" user-id])))

(defn delete-by-id!
  ([params] (delete-by-id! (aurora/conn-pool :write) params))
  ([conn {:keys [id]}]
   (sql/execute-one! conn ["DELETE FROM instant_profiles WHERE id = ?::uuid" id])))

(comment
  (def u (instant-user-model/get-by-email {:email "stopa@instantdb.com"}))
  (put! {:user-id (:id u) :meta {:heard "hn"}})
  (get-by-user-id {:user-id (:id u)})
  (delete-by-id! {:id (:id u)}))
