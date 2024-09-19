(ns instant.db.model.entity
  (:require [instant.db.model.attr :as attr-model]))

(defn get-triples-batch
  "Takes a list of eid+etype maps and returns a map of eid+etype to triples.
  (get-triples-batch ctx [{:eid 'eid-a' :etype \"users'}])
   -> {{:eid 'eid-a' :etype \"users\"} [[e a v t] [e a v t]]}

  If `etype` is nil, will return all triples across all namespaces for the id."
  [{:keys [datalog-query-fn attrs] :as ctx} eid+etypes]
  (let [patterns (map (fn [{:keys [eid etype]}]
                        {:patterns (if etype
                                     [[:ea eid (attr-model/attr-ids-for-etype etype attrs)]]
                                     [[:ea eid]])})
                      eid+etypes)
        query {:children {:pattern-groups patterns}}
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
    (zipmap eid+etypes triples)))

(defn get-triples
  "Returns all triples for the eid+etype.
   If etype is nil, returns all triples across all namespaces for the eid."
  [{:keys [datalog-query-fn attrs] :as ctx} etype eid]
  (let [query (if etype
                [[:ea eid (attr-model/attr-ids-for-etype etype attrs)]]
                [[:ea eid]])
        datalog-result (datalog-query-fn ctx query)
        triples (->> datalog-result
                     :join-rows
                     (mapcat identity))]
    triples))

(defn triples->map [{:keys [attrs] :as _ctx} triples]
  (let [kvs (->> triples
                 (map (fn [[_e a v]]
                        [(attr-model/fwd-label (attr-model/seek-by-id a attrs))
                         v])))
        m (into {} kvs)]
    m))

(defn datalog-result->map [ctx datalog-result]
  (let [triples (->> datalog-result :join-rows (mapcat identity))]
    (triples->map ctx triples)))
