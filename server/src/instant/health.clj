(ns instant.health
  (:require [compojure.core :refer [defroutes GET] :as compojure]
            [instant.config :as config]
            [instant.jdbc.aurora :as aurora]
            [instant.jdbc.sql :as sql]
            [instant.util.json :refer [->json]]
            [honey.sql :as hsql]
            [ring.util.http-response :as response])
  (:import [java.time Instant]))

(def send-agent (agent nil))

(defn mark-wal-unhealthy []
  (sql/execute!
   aurora/conn-pool
   (hsql/format
    {:insert-into :config
     :values [{:k "wal-errors"
               :v [:cast (->json {@config/process-id (str (Instant/now))}) :json]}]
     :on-conflict :k
     :do-update-set {:v [:|| [:cast :config.v :jsonb] [:cast :excluded.v :jsonb]]}})))

(defn mark-wal-healthy []
  (sql/execute!
   aurora/conn-pool
   (hsql/format
    {:update :config
     :set {:v [:- [:cast :v :jsonb] [:cast @config/process-id :text]]}
     :where [:= :k "wal-errors"]})))

(defn mark-wal-unhealthy-async []
  (send-off send-agent (fn [_]
                         (mark-wal-unhealthy))))

(defn mark-wal-healthy-async []
  (send-off send-agent (fn [_]
                         (mark-wal-healthy))))

(defn health-get [_req]
  (let [wal-errors (sql/select-one aurora/conn-pool ["select v from config where k = 'wal-errors'"])]
    (if (some-> wal-errors :v seq)
      (response/internal-server-error {:wal :error})
      (response/ok {:wal :ok}))))

(defroutes routes
  (GET "/health/system" [] health-get))
