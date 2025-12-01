(ns measure-get-datalog-queries
  (:require [clojure.edn :as edn]
            [datascript.core :as d]
            [instant.reactive.store :as store]))

(def readers
  "EDN readers for state_capture.edn. We override function/atom tags so the
   datascript DB can be read without needing the original closures."
  (assoc d/data-readers
         'function (fn [_] (fn [& _] :no-op))
         'atom (fn [x] (atom x))
         'instant (fn [s] (java.time.Instant/parse s))))

(defn read-capture [path]
  (let [{:keys [db] :as capture} (edn/read-string {:readers readers}
                                                 (slurp path))
        db (if (string? db)
             (edn/read-string {:readers readers} db)
             db)]
    (assoc capture :db db)))

(defn backfill-attrs-index [db app-id]
  (let [schema (assoc (:schema db) :datalog-query/attrs {:db/index true :db/cardinality :db.cardinality/many})
        empty-db (d/empty-db schema)
        original-datoms (d/datoms db :eavt)
        db-with-data (:db-after (d/with empty-db original-datoms))
        
        datalog-queries (d/datoms db-with-data :avet :datalog-query/app-id app-id)
        tx-data (reduce (fn [tx datom]
                          (let [ent (d/entity db-with-data (:e datom))
                                topics (:datalog-query/topics ent)
                                attrs (reduce (fn [acc topic]
                                                (let [a (nth topic 2)]
                                                  (if (set? a)
                                                    (into acc a)
                                                    acc)))
                                              #{}
                                              topics)]
                            (reduce (fn [tx attr]
                                      (conj tx [:db/add (:e datom) :datalog-query/attrs attr]))
                                    tx
                                    attrs)))
                        []
                        datalog-queries)]
    (let [res-db (if (seq tx-data)
                   (:db-after (d/with db-with-data tx-data))
                   db-with-data)]
      (println "Backfilled attrs. Queries count:" (count datalog-queries))
      (println "Tx data size:" (count tx-data))
      (let [attr-datoms (d/datoms res-db :aevt :datalog-query/attrs)]
        (println "Attribute datoms count:" (count attr-datoms))
        (println "Sample attr datom:" (first attr-datoms)))
      res-db)))

(defn measure [db app-id topics]
  (let [t0 (System/nanoTime)
        ;; get-datalog-queries-for-topics is private; use var to invoke directly
        results (vec (#'store/get-datalog-queries-for-topics db app-id topics))
        ms (/ (- (System/nanoTime) t0) 1e6)]
    {:count (count results)
     :duration-ms ms
     :results results}))

(defn -main [& [path]]
  (let [path (or path "state_capture.edn")
        {:keys [db app-id topics tx-id]} (read-capture path)
        db (backfill-attrs-index db app-id) ;; Backfill index
        {:keys [count duration-ms]} (measure db app-id topics)]
    (println "state capture:" path)
    (println "app-id:" app-id "tx-id:" tx-id)
    (println "topic count:" (clojure.core/count topics))
    (println "matching datalog queries:" count)
    (println (format "duration: %.3f ms" duration-ms))
    (shutdown-agents)))
