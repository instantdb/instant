(ns instant.util.instaql
  (:require [instant.db.model.attr :as attr-model]
            [instant.db.model.attr-pat :as attr-pat]
            [instant.db.model.entity :as entity-model]
            [instant.util.uuid :as uuid-util])
  (:import
   (java.time Instant)))

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
                             (map (partial enrich-node ctx etype))
                             (instaql-ref-nodes->object-tree ctx))]
    (merge blob-entries ref-entries)))

(defn singular-entry? [data]
  (if (-> data :forward?)
    (= :one (-> data :attr :cardinality))
    (-> data :attr :unique?)))

(defn make-sort-key-compare [direction]
  (if (= direction :desc)
    ;; Switch the order of the arguments if descending
    (fn [{field-b :field id-b :id}
         {field-a :field id-a :id}]
      (if (= field-a field-b)
        (uuid-util/pg-compare id-a id-b)
        (compare field-a field-b)))
    (fn [{field-a :field id-a :id}
         {field-b :field id-b :id}]
      (if (= field-a field-b)
        (uuid-util/pg-compare id-a id-b)
        (compare field-a field-b)))))

(defn value-transformer-for-sort [{:keys [attrs]} etype field]
  (let [checked-type (-> (attr-model/seek-by-fwd-ident-name [etype field] attrs)
                         :checked-data-type)]
    (if (= checked-type :date)
      (fn [v]
        (cond (string? v)
              (Instant/parse v)
              (number? v)
              (Instant/ofEpochMilli v)))
      identity)))

(defn sort-entries [ctx etype option-map entries]
  (let [{:keys [k direction]} (:order option-map)
        k (if (= k "serverCreatedAt") "$serverCreatedAt" k)
        sort-field (or k "$serverCreatedAt")
        transform-sort-value (value-transformer-for-sort ctx etype sort-field)
        ents-by-sort-keys (reduce (fn [acc ent]
                                    (let [sort-key {:field (transform-sort-value
                                                            (get ent sort-field))
                                                    :id (or (get ent "id")
                                                            ;; Sometimes tests don't
                                                            ;; set id fields
                                                            (random-uuid))}]
                                      (assoc acc sort-key (dissoc ent "$serverCreatedAt"))))
                                  {}
                                  entries)

        compare-fn (make-sort-key-compare direction)
        sorted-keys (sort compare-fn (keys ents-by-sort-keys))]
    (map #(get ents-by-sort-keys %) sorted-keys)))

(defn instaql-ref-nodes->object-tree [ctx nodes]
  (reduce
   (fn [acc node]
     (let [{:keys [child-nodes data]} node
           {:keys [option-map]} data
           _entries (map (partial obj-node ctx (-> data :etype)) child-nodes)
           entries (sort-entries ctx (:etype data) option-map _entries)
           singular? (and (:inference? ctx) (singular-entry? data))
           entry-or-entries (if singular? (first entries) entries)]
       (assoc acc (:k data) entry-or-entries)))
   {}
   nodes))

(defn instaql-nodes->object-tree [ctx nodes]
  (let [enriched-nodes
        (map (fn [n] (update n :data (fn [d] (assoc d :etype (:k d))))) nodes)]
    (instaql-ref-nodes->object-tree ctx enriched-nodes)))
