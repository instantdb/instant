(ns instant.db.model.entity
  (:require
   [instant.db.model.attr :as attr-model])
  (:import
   [java.util Date]))

(defn get-triples
  "Returns all triples for the eid+etype.
   If etype is nil, returns all triples across all namespaces for the eid."
  [{:keys [datalog-query-fn attrs] :as ctx} etype eid]
  (let [query (if etype
                [[:ea eid (attr-model/ea-ids-for-etype etype attrs)]]
                [[:ea eid]])

        datalog-result (datalog-query-fn ctx query)

        triples (->> datalog-result
                     :join-rows
                     (mapcat identity))]
    triples))

(defn triples->map [{:keys [attrs include-server-created-at?] :as _ctx} triples]
  (->> triples
       (reduce (fn [acc [_e a v t]]
                 (let [label (attr-model/fwd-label (attr-model/seek-by-id a attrs))]
                   (cond-> acc
                     true (assoc! label v)

                     (and (= label "id")
                          include-server-created-at?)
                     (assoc! "$serverCreatedAt" (Date. (long t))))))
               (transient {}))
       (persistent!)
       (not-empty)))

(defn datalog-result->map [ctx datalog-result]
  (let [triples (->> datalog-result :join-rows (mapcat identity))]
    (triples->map ctx triples)))
