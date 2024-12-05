(ns instant.scratch.backtest
  "Entry point that spins up a REPL, and lets you backtest queries.
  
   The idea: 
   1. We download the last N production queries 
   2. We run these queries again, comparing our original `query` function with the new one. 
   3. We try to find discrepencies or degredations."
  (:require
   [instant.config :as config]
   [instant.nrepl :as nrepl]
   [instant.util.async :as ua]
   [instant.util.crypt :as crypt-util]
   [instant.util.tracer :as tracer]
   [instant.util.json :refer [<-json]]
   [clojure.java.io :as io]
   [instant.util.uuid :as uuid-util]
   [instant.util.exception :as ex]
   [clojure.edn :as edn]
   [instant.db.instaql :as iq]
   [clojure.java.shell :as shell]
   [clojure.string :as string]
   [instant.jdbc.sql :as sql]
   [instant.db.model.attr :as attr-model]
   [instant.util.instaql :as iq-util]))

(defn -main [& _args]
  (let [{:keys [aead-keyset]} (config/init)]
    (crypt-util/init aead-keyset))

  (tracer/init)

  (tracer/record-info! {:name "uncaught-exception-handler/set"})
  (Thread/setDefaultUncaughtExceptionHandler
   (ua/logging-uncaught-exception-handler))

  (nrepl/start))

(defn honeycomb-row->input! [[idx row]]
  (let [app-id (ex/get-param! row ["app_id"] uuid-util/coerce)
        query (ex/get-param! row ["forms"] edn/read-string)
        _ (iq/->forms! query)]
    {:idx idx
     :app-id app-id
     :query query}))

(defn compare! [conn {:keys [idx app-id query]}]
  (let [attrs (attr-model/get-by-app-id conn app-id)
        ctx {:db {:conn-pool conn}
             :app-id app-id
             :attrs attrs}

        _ (println (format "Comparing %s" idx))

        start-new (. System (nanoTime))
        new-result (binding [iq/*use-new* true]
                     (iq/query ctx query))
        new-ms (/ (double (- (. System (nanoTime)) start-new)) 1000000.0)

        start-old (. System (nanoTime))
        old-result (binding [iq/*use-new* false]
                     (iq/query ctx query))
        old-ms (/ (double (- (. System (nanoTime)) start-old)) 1000000.0)

        old-tree (iq-util/instaql-nodes->object-tree ctx old-result)
        new-tree (iq-util/instaql-nodes->object-tree ctx new-result)]
    {:same? (= old-tree new-tree)
     :app-id app-id
     :query query
     :same-same? (= old-result new-result)
     :old-result old-result
     :old-tree old-tree
     :new-tree new-tree
     :new-result new-result
     :old-ms old-ms
     :new-ms new-ms
     :improvement (- old-ms new-ms)}))

(defn prod-conn-str []
  (string/trim (:out (shell/sh "./scripts/prod_connection_string.sh"))))

(comment
  ;; Honeycomb Query URI:
  ;; https://ui.honeycomb.io/instantdb/environments/prod/datasets/instant-server/result/pdUiUrb4MhX?hideCompare 
  ;; 
  ;; Go to this URI, and export it into dev-resources 
  (def honeycomb-data
    (map-indexed vector (<-json (slurp (io/resource "honeycomb-export.json")))))

  (def inputs (keep
               (fn [[idx :as entry]]
                 (try
                   (honeycomb-row->input! entry)
                   (catch clojure.lang.ExceptionInfo e
                     (println (format "Failed to parse row = %s ex-data = %s"
                                      idx (pr-str (ex-data e)))))))
               honeycomb-data))

  (ex-data (ex/find-instant-exception *e))

  (def runs
    (with-open [prod-conn (sql/start-pool (assoc (config/db-url->config (prod-conn-str))
                                                 :maximumPoolSize 1))]

      (->> inputs
           (take 1)
           (mapv (partial compare! prod-conn)))))

  (map :improvement runs)
  (map :same? runs)
  (map :same-same? runs))



