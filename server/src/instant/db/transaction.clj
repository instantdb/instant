(ns instant.db.transaction
  (:require
   [clojure.spec.alpha :as s]
   [clojure.spec.gen.alpha :as gen]
   [clojure.string :as string]
   [clojure.walk :as w]
   [instant.db.model.attr :as attr-model]
   [instant.db.model.transaction :as transaction-model]
   [instant.db.model.triple :as triple-model]
   [instant.system-catalog :refer [system-catalog-app-id]]
   [instant.util.coll :as coll]
   [instant.util.exception :as ex]
   [instant.util.tracer :as tracer]
   [next.jdbc :as next-jdbc]))

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

(defn prevent-system-catalog-attrs-updates! [op attrs]
  (doseq [attr attrs
          :let [etype (attr-model/fwd-etype attr)]]
    (when (and etype (string/starts-with? etype "$"))
      (ex/throw-validation-err!
       :tx-steps
       op
       [{:message (format "You can't create or modify attributes in the %s namespace." etype)}]))))

(defn prevent-system-catalog-updates! [app-id opts]
  (when (and (= app-id system-catalog-app-id)
             (not (:allow-system-catalog-updates? opts)))
    (ex/throw-validation-err!
     :app
     app-id
     [{:message (format "You can't make updates to this app.")}])))

(defn enforce-on-deletes
  "Unoptimized on-delete helper that will delete entities that have
   on-delete=:cascade. Only used for system attributes right now.
   Before releasing as a feature, this should probably happen inside of
   the `delete-multi`.

   This approach is not ideal because there's no bound on the number of
   times you recur. We probably want to prevent cycles on the on-delete
   (e.g. if `a` has on-delete for `b`, then `b` can't have on-delete
   for `a`), so that the delete query can be statically defined in
   triple-model/delete-multi!"
  ([conn attrs app-id results]
   (enforce-on-deletes conn attrs app-id results (:delete-entity results)))
  ([conn attrs app-id results last-delete-entities]
   (if-let [deleted-triples (seq last-delete-entities)]
     (let [deletes (keep (fn [{:keys [triples/attr_id triples/entity_id]}]
                           (let [attr (attr-model/seek-by-id attr_id attrs)]
                             (when (and (= :ref (:value-type attr))
                                        (= :cascade (:on-delete attr)))
                               [entity_id (attr-model/fwd-etype attr)])))
                         deleted-triples)]
       (if (seq deletes)
         (let [on-delete-results (triple-model/delete-entity-multi! conn app-id deletes)]
           (recur conn
                  attrs
                  app-id
                  (update results :delete-entity into on-delete-results)
                  on-delete-results))
         results))
     results)))

(defn transact-without-tx-conn!
  ([conn attrs app-id tx-steps]
   (transact-without-tx-conn! conn attrs app-id tx-steps {}))
  ([conn attrs app-id tx-steps opts]
   (tracer/with-span! {:name "transaction/transact!"
                       :attributes {:app-id app-id
                                    :num-tx-steps (count tx-steps)
                                    :detailed-tx-steps (pr-str tx-steps)}}
     (prevent-system-catalog-updates! app-id opts)
     (let [results
           (reduce
            (fn [acc [op & args]]
              (when (#{:add-attr :update-attr} op)
                (prevent-system-catalog-attrs-updates! op args))
              (let [res (case op
                          :add-attr
                          (attr-model/insert-multi! conn app-id args)
                          :delete-attr
                          (attr-model/delete-multi! conn app-id args)
                          :update-attr
                          (attr-model/update-multi! conn app-id args)
                          :delete-entity
                          (triple-model/delete-entity-multi! conn app-id args)
                          :add-triple
                          (triple-model/insert-multi! conn attrs app-id args)
                          :deep-merge-triple
                          (triple-model/deep-merge-multi! conn attrs app-id args)
                          :retract-triple
                          (triple-model/delete-multi! conn app-id args))]
                (assoc acc op res)))
            {}
            (batch tx-steps))

           results-with-on-deletes (enforce-on-deletes conn attrs app-id results)
           tx (transaction-model/create! conn {:app-id app-id})]
       (assoc tx :results results-with-on-deletes)))))

(defn transact!
  ([conn attrs app-id tx-steps]
   (transact! conn attrs app-id tx-steps {}))
  ([conn attrs app-id tx-steps opts]
   (next-jdbc/with-transaction [tx-conn conn]
     (transact-without-tx-conn! tx-conn attrs app-id tx-steps opts))))
