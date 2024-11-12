(ns instant.util.instaql
  (:require [instant.db.model.attr-pat :as attr-pat]
            [instant.db.model.entity :as entity-model]))

(declare instaql-ref-nodes->object-tree)

(defn enrich-node [ctx parent-etype node]
  (let [label (-> node :data :k)
        pat (attr-pat/->guarded-ref-attr-pat
             ctx
             parent-etype
             0
             label)
        [next-etype _ _ attr forward?] pat
        enriched-node (update node
                              :data
                              (fn [d] (assoc d
                                             :etype next-etype
                                             :attr attr
                                             :forward? forward?)))]
    enriched-node))

(defn obj-node [ctx etype node]
  (let [datalog-result (-> node :data :datalog-result)
        blob-entries (entity-model/datalog-result->map (assoc ctx
                                                              :include-server-created-at? true)

                                                       datalog-result)
        ref-entries (some->> node
                             :child-nodes
                             (mapv (partial enrich-node ctx etype))
                             (instaql-ref-nodes->object-tree ctx))]
    (merge blob-entries ref-entries)))

(defn singular-entry? [data]
  (if (-> data :forward?)
    (= :one (-> data :attr :cardinality))
    (-> data :attr :unique?)))

;; We will need to update this when we support more than serverCreatedAt 
;; as the sort key

(defn reverse-compare [a b]
  (compare b a))

(defn sort-entries [option-map entries]
  (let [{:keys [k direction]} (:order option-map)
        compare-fn (if (and (= k "serverCreatedAt")
                            (= direction :desc))
                     reverse-compare
                     compare)]
    (->> entries
         (sort-by (fn [{:strs [$serverCreatedAt] :as _entry}]
                    $serverCreatedAt)
                  compare-fn)
         (map #(dissoc % "$serverCreatedAt")))))

(defn instaql-ref-nodes->object-tree [ctx nodes]
  (reduce
   (fn [acc node]
     (let [{:keys [child-nodes data]} node
           {:keys [option-map]} data
           _entries (mapv (partial obj-node ctx (-> data :etype)) child-nodes)
           entries (sort-entries option-map _entries)
           singular? (and (:inference? ctx) (singular-entry? data))
           entry-or-entries (if singular? (first entries) entries)]
       (assoc acc (:k data) entry-or-entries)))
   {}
   nodes))

(defn instaql-nodes->object-tree [ctx nodes]
  (let [enriched-nodes
        (mapv (fn [n] (update n :data (fn [d] (assoc d :etype (:k d))))) nodes)]
    (instaql-ref-nodes->object-tree ctx enriched-nodes)))
