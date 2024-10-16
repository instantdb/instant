(ns instant.db.model.entity
  (:require [instant.db.model.attr :as attr-model]
            [instant.db.model.attr-pat :as attr-pat]
            [instant.util.coll :as ucoll])
  (:import [java.util Date]))

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

        datalog-result
        (datalog-query-fn
         (merge ctx
                (when (some #(= "$users" (:etype %)) eid+etypes)
                  {:users-shim-info
                   (attr-model/users-shim-info attrs)}))
         query)

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

        datalog-result
        (datalog-query-fn
         (merge ctx
                (when (= etype "$users")
                  {:users-shim-info
                   (attr-model/users-shim-info attrs)}))
         query)

        triples (->> datalog-result
                     :join-rows
                     (mapcat identity))]
    triples))

(defn get-triples-where
  "Returns all triples for entity given a where clause. Not $users shim aware."
  [{:keys [datalog-query-fn attrs] :as ctx} etype where]
  (when (< 1 (count where))
    (throw (Exception. "get-triple-where only supports a single where clause for now.")))
  (let [[path-str value] (first where)

        path (clojure.string/split (name path-str) #"\.")

        [refs-path value-label] (ucoll/split-last path)
        level 0

        [last-etype last-level ref-attr-pats]
        (attr-pat/->ref-attr-pats ctx
                                  attr-pat/default-level-sym
                                  etype
                                  level
                                  refs-path)

        value-attr-pat (attr-pat/->value-attr-pat ctx
                                                  attr-pat/default-level-sym
                                                  last-etype
                                                  last-level
                                                  value-label
                                                  value)

        eid-sym (attr-pat/default-level-sym etype 0)

        query (concat (attr-pat/attr-pats->patterns
                       ctx
                       (concat ref-attr-pats
                               [value-attr-pat]))
                      [[:ea
                        eid-sym
                        (attr-model/attr-ids-for-etype etype attrs)]])
        datalog-result
        (datalog-query-fn
         (merge ctx
                (when (= etype "$users")
                  {:users-shim-info
                   (attr-model/users-shim-info attrs)}))
         query)

        triples (->> datalog-result
                     :join-rows
                     (mapcat identity))

        eid (-> datalog-result
                :symbol-values
                (get eid-sym)
                first)]
    (tool/def-locals)
    (filter (fn [[e]]
              (= e eid))
            triples)))

(defn triples->map [{:keys [attrs include-server-created-at?] :as _ctx} triples]
  (reduce (fn [acc [_e a v t]]
            (let [label (attr-model/fwd-label (attr-model/seek-by-id a attrs))]
              (cond-> acc
                true (assoc label v)

                (and (= label "id")
                     include-server-created-at?)
                (assoc "$serverCreatedAt" (Date. t)))))
          {}
          triples))

(defn datalog-result->map [ctx datalog-result]
  (let [triples (->> datalog-result :join-rows (mapcat identity))]
    (triples->map ctx triples)))
