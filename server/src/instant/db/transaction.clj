(ns instant.db.transaction
  (:require
   [next.jdbc :as next-jdbc]
   [instant.db.model.attr :as attr-model]
   [instant.db.model.triple :as triple-model]
   [instant.db.model.transaction :as transaction-model]
   [instant.util.tracer :as tracer]
   [clojure.spec.alpha :as s]
   [clojure.spec.gen.alpha :as gen]
   [clojure.walk :as w]
   [instant.util.coll :as coll]
   [instant.util.exception :as ex]))

(s/def ::add-triple-step
  (s/cat :op #{:add-triple} :triple ::triple-model/triple))

(s/def ::deep-merge-triple-step
  (s/cat :op #{:deep-merge-triple} :triple ::triple-model/triple))

(s/def ::retract-triple-step
  (s/cat :op #{:retract-triple} :triple ::triple-model/triple))

(s/def ::add-attr-step
  (s/cat :op #{:add-attr} :attr ::attr-model/attr))

(s/def ::delete-entity-step
  (s/cat :op #{:delete-entity}
         :lookup ::triple-model/lookup
         :etype (s/? string?)))

(s/def ::delete-attr-step
  (s/cat :op #{:delete-attr} :attr-id ::attr-model/id))

(s/def ::update-attr-step
  (s/cat :op #{:update-attr} :update ::attr-model/attr-update))

(s/def ::tx-step (s/or :add-triple ::add-triple-step
                       :deep-merge-triple ::deep-merge-triple-step
                       :delete-entity ::delete-entity-step
                       :retract-triple ::retract-triple-step
                       :add-attr ::add-attr-step
                       :update-attr ::update-attr-step
                       :delete-attr ::delete-attr-step))

(s/def ::tx-steps (s/coll-of ::tx-step))

;; ----
;; coerce

(defn- walk-uuids
  "Converts string instances of UUIDs to java UUIDs"
  [m]
  (w/postwalk #(or (and (string? %) (parse-uuid %)) %) m))

(defn- assert-coll! [{:keys [in root]} x]
  (when-not (coll? x)
    (ex/throw-validation-err!
     :tx-steps
     root
     [{:expected 'coll? :in in}]))
  x)

(defn coerce!
  "Takes an input tx-steps, and: 
   - converts strings to keywords when needed  
   - converts string uuids to java uuids when parseable 

   At some point, we may prefer to use a tool like 
   [coax](https://github.com/exoscale/coax)"
  [tx-steps]
  (let [action-idx 0
        state {:in [] :root tx-steps}]
    (->> tx-steps
         (assert-coll! state)
         (map-indexed
          (fn [idx tx-step]
            (assert-coll! (update state :in conj idx) tx-step)
            (update tx-step action-idx keyword)))
         (mapv
          (fn [[action args :as tx-step]]
            (if (#{:add-attr :update-attr} action)
              [action (-> args
                          (coll/update-in-when [:value-type] keyword)
                          (coll/update-in-when [:cardinality] keyword))]
              tx-step)))
         walk-uuids)))

(defn validate! [tx-steps]
  (let [valid? (s/valid? ::tx-steps tx-steps)]
    (when-not valid?
      (ex/throw-validation-err!
       :tx-steps
       tx-steps
       (ex/explain->validation-errors
        (s/explain-data ::tx-steps tx-steps))))))

;; ----
;; transact

(defn batch [steps]
  (->> steps
       (partition-by first)
       (map (fn [steps]
              (let [[[op]] steps]
                (condp = op
                  :add-attr
                  (into [:add-attr] (map second steps))
                  :delete-attr
                  (into [:delete-attr] (map second steps))
                  :update-attr
                  (into [:update-attr] (map second steps))
                  :delete-entity
                  (into [:delete-entity] (map rest steps))
                  :add-triple
                  (into [:add-triple] (map rest steps))
                  :deep-merge-triple
                  (into [:deep-merge-triple] (map rest steps))
                  :retract-triple
                  (into [:retract-triple] (map rest steps))))))))

(comment
  (batch (gen/generate (s/gen ::tx-steps))))

(defn transact-without-tx-conn! [conn app-id tx-steps]
  (tracer/with-span! {:name "transaction/transact!"
                      :attributes {:app-id app-id
                                   :num-tx-steps (count tx-steps)
                                   :detailed-tx-steps (pr-str tx-steps)}}
    (doseq [[op & args] (batch tx-steps)]
      (condp = op
        :add-attr
        (attr-model/insert-multi! conn app-id args)
        :delete-attr
        (attr-model/delete-multi! conn app-id args)
        :update-attr
        (attr-model/update-multi! conn app-id args)
        :delete-entity
        (triple-model/delete-entity-multi! conn app-id args)
        :add-triple
        (triple-model/insert-multi! conn app-id args)
        :deep-merge-triple
        (triple-model/deep-merge-multi! conn app-id args)
        :retract-triple
        (triple-model/delete-multi! conn app-id args)))
    (transaction-model/create! conn {:app-id app-id})))

(defn transact! [conn app-id tx-steps]
  (next-jdbc/with-transaction [tx-conn conn]
    (transact-without-tx-conn! tx-conn app-id tx-steps)))
