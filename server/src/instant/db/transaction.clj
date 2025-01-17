(ns instant.db.transaction
  (:require
   [clojure.spec.alpha :as s]
   [clojure.spec.gen.alpha :as gen]
   [clojure.string :as string]
   [clojure.walk :as w]
   [honey.sql :as hsql]
   [instant.db.model.attr :as attr-model]
   [instant.db.model.transaction :as transaction-model]
   [instant.db.model.triple :as triple-model]
   [instant.jdbc.sql :as sql]
   [instant.system-catalog :refer [system-catalog-app-id]]
   [instant.util.coll :as coll]
   [instant.util.exception :as ex]
   [instant.util.e2e-tracer :as e2e-tracer]
   [instant.util.json :refer [->json]]
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
  (s/cat :op #{:delete-entity :delete-entity-no-cascade}
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
       (mapv (fn [steps]
               (let [op (ffirst steps)]
                 (case op
                   :add-attr
                   [:add-attr (map second steps)]
                   :delete-attr
                   [:delete-attr (map second steps)]
                   :update-attr
                   [:update-attr (map second steps)]
                   :delete-entity
                   [:delete-entity (map rest steps)]
                   :delete-entity-no-cascade
                   [:delete-entity-no-cascade (map rest steps)]
                   :add-triple
                   [:add-triple (map rest steps)]
                   :deep-merge-triple
                   [:deep-merge-triple (map rest steps)]
                   :retract-triple
                   [:retract-triple (map rest steps)]))))))

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

(defn resolve-lookups
  "Given [[attr-id value] [attr-id value] ...],
   returns {[attr-id value] eid,
            [attr-id value] eid,
            ...}"
  [conn app-id lookups]
  (if (empty? lookups)
    {}
    (let [lookups (map (fn [[a v]] [a (->json v)]) lookups)
          query   {:with [[[:lookups {:columns [:attr_id :value]}]
                           {:values lookups}]]
                   :from :triples
                   :where [:= :app_id app-id]
                   :join [:lookups
                          [:and
                           :triples.av
                           [:= :triples.attr_id :lookups.attr_id]
                           [:= :triples.value [:cast :lookups.value :jsonb]]]]
                   :select [:triples.attr_id :triples.value :triples.entity_id]}
          results (tool/time* "resolve execute"
                              (sql/do-execute! conn (hsql/format query)))]

      (into {}
            (for [{:triples/keys [attr_id value entity_id]} results]
              [[attr_id value] entity_id])))))

(comment
  (resolve-lookups
   (instant.jdbc.aurora/conn-pool)
   #uuid "92cb730c-8b4f-46ef-9925-4fab953694c6"
   [[#uuid "20b65ea3-faad-4e80-863e-87468ff7792f" "joe@instantdb.com"]
    [#uuid "6a089759-2a2f-4898-9bb8-a7bc9f6f791a" "stopa"]]))

(defn resolve-etypes
  "Given [id id id], returns map of {id [etype etype ...], ...}"
  [conn app-id entity-ids]
  (if (empty? entity-ids)
    {}
    (->>  {:from            :triples
           :join            [:attrs [:= :triples.attr_id :attrs.id]
                             :idents [:= :attrs.forward_ident :idents.id]]
           :where           [:and
                             [:= :triples.app_id app-id]
                             [:in :triples.entity_id entity-ids]]
           :select-distinct [:triples.entity_id :idents.etype]}
          hsql/format
          (sql/do-execute! conn)
          (coll/group-by-to :triples/entity_id :idents/etype))))

(comment
  (resolve-etypes
   (instant.jdbc.aurora/conn-pool)
   #uuid "0e563ace-d25f-44f6-ae00-4e6b9b6d1b2e"
   [#uuid "4d39508b-9ee2-48a3-b70d-8192d9c5a059"
    #uuid "005a8767-c0e7-4158-bb9a-62ce1a5858ed"
    #uuid "005b08a1-4046-4fba-b1d1-a78b0628901c"]))


(defn resolve-lookups-for-delete-entity [conn app-id tx-steps]
  (let [[delete-entity-steps tx-steps'] (coll/split-by #(= :delete-entity (first %)) tx-steps)
        lookup-refs                     (->> delete-entity-steps
                                             (map second)
                                             (filter triple-model/eid-lookup-ref?))
        resolved                        (resolve-lookups conn app-id lookup-refs)
        delete-entity-steps'            (for [[op eid etype] delete-entity-steps]
                                          [op (get resolved eid eid) etype])]
    (concat delete-entity-steps' tx-steps')))

(defn resolve-etypes-for-delete-entity [conn app-id tx-steps]
  (let [[delete-entity-steps tx-steps'] (coll/split-by #(= :delete-entity (first %)) tx-steps)
        untyped-ids                     (->> delete-entity-steps
                                             (keep (fn [[_ id etype]]
                                                     (when (nil? etype)
                                                       id))))
        resolved                        (resolve-etypes conn app-id untyped-ids)
        delete-entity-steps'            (for [[op eid etype] delete-entity-steps
                                              etype'         (if etype
                                                               [etype]
                                                               (get resolved eid [nil]))]
                                          [op eid etype'])]
    (concat delete-entity-steps' tx-steps')))

(defn expand-delete-entity-cascade [conn app-id tx-steps]
  (let [[delete-entity-steps tx-steps'] (coll/split-by #(= :delete-entity (first %)) tx-steps)]
    (if (empty? delete-entity-steps)
      tx-steps
      (let [ids+etypes           (map next delete-entity-steps)
            query+args           (hsql/format
                                  {:with-recursive [[[:entids {:columns [:entity_id :etype]}]
                                                     {:union [{:values ids+etypes}
                                                              {:from   :triples
                                                               :join   [:attrs [:= :triples.attr_id :attrs.id]
                                                                        [:idents :forward_ident] [:= :forward_ident.id :attrs.forward_ident]
                                                                        [:idents :reverse_ident] [:= :reverse_ident.id :attrs.reverse_ident]
                                                                        :entids [:= [:to_jsonb :entids.entity_id] :triples.value]]
                                                               :where  [:and
                                                                        [:= :triples.app_id app-id]
                                                                        [:= :attrs.on_delete [:cast "cascade" :attr_on_delete]]
                                                                        [:= :attrs.value_type "ref"]
                                                                        :triples.vae
                                                                        [:= :entids.etype :reverse_ident.etype]]
                                                               :select [:triples.entity_id :forward_ident.etype]}]}]]
                                   :from   :entids
                                   :select :*})
            res                  (tool/time* "expand-delete-entity-cascade"
                                             (sql/execute! conn query+args))
            ids+etypes'          (map (juxt :entity_id :etype) res)
            delete-entity-steps' (for [[entity_id etype] (set (concat ids+etypes ids+etypes'))]
                                   [:delete-entity-no-cascade entity_id etype])]
        (concat delete-entity-steps' tx-steps')))))

(defn transact-without-tx-conn!
  ([conn attrs app-id tx-steps]
   (transact-without-tx-conn! conn attrs app-id tx-steps {}))
  ([conn attrs app-id tx-steps opts]
   (tracer/with-span! {:name "transaction/transact!"
                       :attributes {:app-id app-id
                                    :num-tx-steps (count tx-steps)
                                    :detailed-tx-steps (pr-str tx-steps)}}
     (prevent-system-catalog-updates! app-id opts)
     (let [tx-steps (if (some #(= :delete-entity (first %)) tx-steps)
                      (->> tx-steps
                           (resolve-lookups-for-delete-entity conn app-id)
                           (resolve-etypes-for-delete-entity conn app-id)
                           (expand-delete-entity-cascade conn app-id))
                      tx-steps)

           results
           (reduce
            (fn [acc [op args]]
              (when (#{:add-attr :update-attr} op)
                (prevent-system-catalog-attrs-updates! op args))
              (case op
                :add-attr
                (assoc acc :add-attr (attr-model/insert-multi! conn app-id args))

                :delete-attr
                (assoc acc :delete-attr (attr-model/delete-multi! conn app-id args))

                :update-attr
                (assoc acc :update-attr (attr-model/update-multi! conn app-id args))

                :delete-entity-no-cascade
                (assoc acc :delete-entity (triple-model/delete-entity-multi! conn app-id args))

                :add-triple
                (assoc acc :add-triple (triple-model/insert-multi! conn attrs app-id args))

                :deep-merge-triple
                (assoc acc :deep-merge-triple (triple-model/deep-merge-multi! conn attrs app-id args))

                :retract-triple
                (assoc acc :retract-triple (triple-model/delete-multi! conn app-id args))))
            {}
            (batch tx-steps))

           tx (transaction-model/create! conn {:app-id app-id})]
       (let [tx-created-at (.toInstant (:created_at tx))]
         (e2e-tracer/start-invalidator-tracking! {:tx-id (:id tx)
                                                  :tx-created-at tx-created-at})
         (e2e-tracer/invalidator-tracking-step! {:tx-id (:id tx)
                                                 :tx-created-at tx-created-at
                                                 :name "transact"}))
       (assoc tx :results results)))))

(defn transact!
  ([conn attrs app-id tx-steps]
   (transact! conn attrs app-id tx-steps {}))
  ([conn attrs app-id tx-steps opts]
   (next-jdbc/with-transaction [tx-conn conn]
     (transact-without-tx-conn! tx-conn attrs app-id tx-steps opts))))
