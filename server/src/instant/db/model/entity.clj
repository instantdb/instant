(ns instant.db.model.entity
  (:require [instant.db.model.attr :as attr-model]))

(defn get-triples-batch
  "Takes a list of eids and returns a map of eid to triples."
  [{:keys [datalog-query-fn] :as ctx} eids]
  (let [query {:children {:pattern-groups
                          (map (fn [eid]
                                 {:patterns [[:ea eid]]})
                               eids)}}
        ;; you might be tempted to simplify the query to [[:ea (set eids)]]
        ;; but the eid might be a lookup ref and you won't know how to get
        ;; the join rows for that lookup
        datalog-result (datalog-query-fn ctx query)

        triples (map (fn [result]
                       (->> result
                            :result
                            :join-rows
                            (mapcat identity)))
                     (:data datalog-result))]
    (zipmap eids triples)))

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
