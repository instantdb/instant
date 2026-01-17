(ns instant.scratch.backtest
  "Entry point that spins up a REPL, and lets you backtest queries.
  
   The idea: 
   1. We download the last N production queries 
   2. We run these queries again, comparing our original `query` function with the new one. 
   3. We try to find discrepencies or degredations."
  (:require
   [instant.config :as config]
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
   [instant.util.instaql :as iq-util]
   [instant.scratch.backtest-vars :as backtest-vars]
   [clojure.pprint :as pprint]))

(defn honeycomb-row->input! [[idx row]]
  (let [app-id (ex/get-param! row ["app_id"] uuid-util/coerce)
        query (ex/get-param! row ["forms"] edn/read-string)
        _ (iq/->forms! (attr-model/wrap-attrs []) query)]
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
        new-result  (try
                      (binding [backtest-vars/*use-new* true]
                        (iq/query ctx query))
                      (catch Exception e
                        {:error e}))

        new-ms (/ (double (- (. System (nanoTime)) start-new)) 1000000.0)

        start-old (. System (nanoTime))
        old-result (try (binding [backtest-vars/*use-new* false]
                          (iq/query ctx query))
                        (catch Exception e
                          {:error e}))

        old-ms (/ (double (- (. System (nanoTime)) start-old)) 1000000.0)

        old-tree (when-not (:error old-result)
                   (iq-util/instaql-nodes->object-tree ctx old-result))
        new-tree (when-not (:error new-result)
                   (iq-util/instaql-nodes->object-tree ctx new-result))
        data {:idx idx
              :same? (= old-tree new-tree)
              :app-id app-id
              :query query
              :same-same? (= old-result new-result)
              :old-result old-result
              :old-tree old-tree
              :new-tree new-tree
              :new-result new-result
              :old-ms old-ms
              :new-ms new-ms
              :improvement (- old-ms new-ms)
              :new-result-error (:error new-result)
              :old-result-error (:error old-result)}]
    (pprint/pprint (select-keys data
                                [:improvement
                                 :same?
                                 :same-same?]))

    data))

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
    (binding [sql/*query-timeout-seconds* 5]
      (with-open [prod-conn (sql/start-pool (assoc (config/db-url->config (prod-conn-str))
                                                   :maximumPoolSize 1))]

        (->> inputs
             (take 100)
             (mapv (partial compare! prod-conn))))))

  (tool/copy
   (with-out-str (pprint/pprint
                  (map (fn [x]
                         (-> x
                             (select-keys [:improvement :same? :same-same?])
                             (assoc :new-result-error? (-> x :new-result-error boolean))
                             (assoc :old-result-error? (-> x :old-result-error boolean)))) runs))))

  (defn avg [coll]
    (/ (reduce + coll) (count coll)))

  (defn median [coll]
    (let [sorted (sort coll)
          n (count sorted)]
      (if (even? n)
        (/ (+ (nth sorted (quot n 2))
              (nth sorted (dec (quot n 2))))
           2)
        (nth sorted (quot n 2)))))

  (avg (map :improvement runs))

  (median (map :improvement runs))

  ;; all properly executed queries should be equal 
  (->> runs
       (remove (fn [{:keys [same? old-result-error new-result-error]}]
                 (or old-result-error
                     new-result-error
                     same?))))

  (count (keep :new-result-error runs))
  (map ex-data (keep :new-result-error runs))

  (count (keep :old-result-error runs))
  (map ex-data (keep :old-result-error runs))

  ;; new queries should not time out
  (->> runs
       (remove (fn [{:keys [old-result-error new-result-error]}]
                 (and new-result-error (not old-result-error))))))

(comment
  ;; to run one: 
  (def res
    (binding [sql/*query-timeout-seconds* 10]
      (with-open [prod-conn (sql/start-pool (assoc (config/db-url->config (prod-conn-str))
                                                   :maximumPoolSize 1))]

        (compare!
         prod-conn
         {:app-id nil
          :query  nil})))))



