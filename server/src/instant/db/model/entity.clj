(ns instant.db.model.entity
  (:require [instant.db.model.attr :as attr-model]))

(defn get-triples [{:keys [datalog-query-fn] :as ctx} eid]
  (let [datalog-result (datalog-query-fn ctx [[:ea eid]])
        triples (->> datalog-result
                     :join-rows
                     (mapcat identity))]
    triples))

(defn triples->map [{:keys [attrs attr-map] :as _ctx} triples]
  (let [kvs (->> triples
                 (map (fn [[_e a v]]
                        [(attr-model/fwd-label (if
                                                attr-map (attr-map a)
                                                (attr-model/seek-by-id a attrs)))
                         v])))
        m (into {} kvs)]
    m))

(defn datalog-result->map [ctx datalog-result]
  (let [triples (->> datalog-result :join-rows (mapcat identity))]
    (triples->map ctx triples)))

(defn get-map [ctx eid]
  (triples->map ctx (get-triples ctx eid)))
