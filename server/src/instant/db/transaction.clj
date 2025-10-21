(ns instant.db.transaction
  (:require
   [clojure.spec.alpha :as s]
   [clojure.spec.gen.alpha :as gen]
   [clojure.string :as string]
   [honey.sql :as hsql]
   [instant.db.model.attr :as attr-model]
   [instant.db.model.transaction :as transaction-model]
   [instant.db.model.triple :as triple-model]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.system-catalog :refer [system-catalog-app-id]]
   [instant.util.coll :as coll]
   [instant.util.exception :as ex]
   [instant.util.e2e-tracer :as e2e-tracer]
   [instant.util.json :refer [->json]]
   [instant.util.string :as string-util]
   [instant.util.tracer :as tracer]
   [instant.util.uuid :as uuid]
   [next.jdbc :as next-jdbc])
  (:import
   (java.util Date)))

(s/def ::mode
  #{:create :update :upsert})

(s/def ::opts
  (s/nilable
   (s/keys :opt-un [::mode])))

(s/def ::add-triple-step
  (s/cat :op #{:add-triple} :triple ::triple-model/triple :opts (s/? ::opts)))

(s/def ::deep-merge-triple-step
  (s/cat :op #{:deep-merge-triple} :triple ::triple-model/triple :opts (s/? ::opts)))

(s/def ::retract-triple-step
  (s/cat :op #{:retract-triple} :triple ::triple-model/triple))

(s/def ::add-attr-step
  (s/cat :op #{:add-attr} :attr ::attr-model/attr))

(s/def ::delete-entity-step
  (s/cat :op #{:delete-entity} :lookup ::triple-model/lookup :etype (s/? string?)))

(s/def ::rule-params-step
  (s/cat :op #{:rule-params} :lookup ::triple-model/lookup :etype (s/? string?) :params (s/map-of (some-fn string? keyword?) any?)))

(s/def ::delete-attr-step
  (s/cat :op #{:delete-attr} :attr-id ::attr-model/id))

(s/def ::restore-attr-step
  (s/cat :op #{:restore-attr} :attr-id ::attr-model/id))

(s/def ::update-attr-step
  (s/cat :op #{:update-attr} :update ::attr-model/attr-update))

(s/def ::tx-step (s/or :add-triple ::add-triple-step
                       :deep-merge-triple ::deep-merge-triple-step
                       :delete-entity ::delete-entity-step
                       :rule-params ::rule-params-step
                       :retract-triple ::retract-triple-step
                       :add-attr ::add-attr-step
                       :update-attr ::update-attr-step
                       :delete-attr ::delete-attr-step
                       :restore-attr ::restore-attr-step))

(s/def ::tx-steps (s/coll-of ::tx-step))

(defn mapify-tx-step
  "Converts [op e a v] into map form of {:op :eid :etype :aid :value :rev-etype}"
  [attrs [op first second third fourth]]
  (case op
    (:add-attr :update-attr)
    {:op op
     :value first}

    (:delete-attr :restore-attr)
    {:op op
     :aid first}

    (:add-triple :deep-merge-triple :retract-triple)
    {:op        op
     :eid       first
     :etype     (attr-model/fwd-etype (attr-model/seek-by-id second attrs))
     :aid       second
     :value     third
     :rev-etype (attr-model/rev-etype (attr-model/seek-by-id second attrs))
     :opts      fourth}

    :delete-entity
    {:op    op
     :eid   first
     :etype second}

    :rule-params
    {:op    op
     :eid   first
     :etype second
     :value third}))

(defn mapify-tx-steps [attrs tx-steps]
  (map #(mapify-tx-step attrs %) tx-steps))

(defn vectorize-tx-step
  "Inverse of mapify-tx-step"
  [{:keys [op eid etype aid value opts]}]
  (case op
    (:add-attr :update-attr)
    [op value]

    (:delete-attr :restore-attr)
    [op aid]

    (:add-triple :deep-merge-triple :retract-triple)
    [op eid aid value opts]

    :delete-entity
    [op eid etype]

    :rule-params
    [op eid etype value]))

;; ----
;; coerce

(defn- assert-coll! [{:keys [in root]} x]
  (when-not (coll? x)
    (ex/throw-validation-err!
     :tx-steps
     root
     [{:expected 'coll? :in in}]))
  x)

(defn coerce-attr-args [[action args :as tx-step]]
  (if (#{:add-attr :update-attr} action)
    [action (-> args
                (coll/update-in-when [:value-type] keyword)
                (coll/update-in-when [:cardinality] keyword))]
    tx-step))

(defn coerce-opts [tx-step]
  (let [opts-idx 4]
    (coll/update-in-when tx-step [opts-idx :mode] keyword)))

(defn coerce!
  "Takes an input tx-steps, and:
   - converts strings to keywords when needed
   - converts string uuids to java uuids when parseable

   At some point, we may prefer to use a tool like
   [coax](https://github.com/exoscale/coax)"
  [tx-steps]
  (assert-coll! {:in [] :root tx-steps} tx-steps)
  (mapv
   (fn [idx tx-step]
     (assert-coll! {:in [idx] :root tx-steps} tx-step)
     (let [action-idx 0]
       (-> tx-step
           (update action-idx keyword)
           coerce-attr-args
           coerce-opts
           uuid/walk-uuids)))
   (range)
   tx-steps))

(defn throw-on-invalid-id-lookup! [attrs tx-steps in lookup]
  (let [attr (-> lookup
                 first
                 (attr-model/seek-by-id attrs))]
    (when (and (= "id" (attr-model/fwd-label attr))
               (not (uuid? (second lookup))))
      (ex/throw-validation-err!
       :tx-steps
       tx-steps
       [{:message (format "Invalid lookup '%s'. The lookup attribute is '%s.%s', but the lookup value is not a valid UUID."
                          lookup
                          (attr-model/fwd-etype attr)
                          (attr-model/fwd-label attr))
         :in in}]))))

(defn check-for-invalid-entity-ids! [attrs tx-steps]
  (doseq [[idx tx-step] (map-indexed vector tx-steps)
          :when (and (coll? tx-step)
                     (>= (count tx-step) 2)
                     (contains? #{:add-triple :deep-merge-triple :retract-triple :delete-entity}
                                (first tx-step)))]
    (let [[_op e _a v] tx-step]
      (when (and (not (uuid? e))
                 (not (triple-model/eid-lookup-ref? e)))
        (ex/throw-validation-err!
         :tx-steps
         tx-steps
         [{:message (format "Invalid entity ID '%s'. Entity IDs must be UUIDs. Use id() or lookup() to generate a valid UUID." e)
           :in [idx 1]}]))

      (when (triple-model/eid-lookup-ref? e)
        (throw-on-invalid-id-lookup! attrs tx-step [idx 1] e))

      (when (triple-model/value-lookup-ref? v)
        (throw-on-invalid-id-lookup! attrs tx-step [idx 3] v)))))

(defn validate! [ctx tx-steps]
  (let [valid? (s/valid? ::tx-steps tx-steps)]
    (check-for-invalid-entity-ids! (:attrs ctx) tx-steps)
    (when-not valid?
      ;; Fall back to generic spec error
      (ex/throw-validation-err!
       :tx-steps
       tx-steps
       (ex/explain->validation-errors
        (s/explain-data ::tx-steps tx-steps))))))

;; ----
;; transact

(comment
  (gen/generate (s/gen ::tx-steps)))

(defn prevent-system-catalog-attrs-updates! [op tx-steps]
  (doseq [[_ attr] tx-steps
          :let     [etype (attr-model/fwd-etype attr)]]
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
          results (sql/do-execute! conn (hsql/format query))]
      (into {}
            (for [{:triples/keys [attr_id value entity_id]} results]
              [[attr_id value] entity_id])))))

(comment
  (resolve-lookups
   (aurora/conn-pool :read)
   #uuid "92cb730c-8b4f-46ef-9925-4fab953694c6"
   [[#uuid "20b65ea3-faad-4e80-863e-87468ff7792f" "joe@instantdb.com"]
    [#uuid "6a089759-2a2f-4898-9bb8-a7bc9f6f791a" "stopa"]]))

(defn resolve-etypes
  "Given [id id id], returns map of {id [etype etype ...], ...}"
  [conn app-id entity-ids]
  (if (empty? entity-ids)
    {}
    (let [query {:from            :triples
                 :join            [:attrs [:= :triples.attr_id :attrs.id]
                                   :idents [:= :attrs.forward_ident :idents.id]]
                 :where           [:and
                                   [:= :triples.app_id app-id]
                                   [:in :triples.entity_id entity-ids]]
                 :select-distinct [:triples.entity_id :idents.etype]}
          res (sql/do-execute! conn (hsql/format query))]
      (coll/group-by-to :triples/entity_id :idents/etype res))))

(comment
  (resolve-etypes
   (aurora/conn-pool :read)
   #uuid "0e563ace-d25f-44f6-ae00-4e6b9b6d1b2e"
   [#uuid "4d39508b-9ee2-48a3-b70d-8192d9c5a059"
    #uuid "005a8767-c0e7-4158-bb9a-62ce1a5858ed"
    #uuid "005b08a1-4046-4fba-b1d1-a78b0628901c"]))

(defn validate-mode [conn app-id tx-step-maps]
  (let [tx-step-maps (filter #(#{:add-triple :deep-merge-triple} (:op %)) tx-step-maps)
        create-steps (filter #(= :create (:mode (:opts %))) tx-step-maps)
        update-steps (filter #(= :update (:mode (:opts %))) tx-step-maps)
        eid+etypes   (into #{}
                           (keep (fn [{:keys [eid etype]}]
                                   (when (uuid? eid)
                                     [eid etype])))
                           (concat create-steps update-steps))
        lookups      (into #{}
                           (keep (fn [{:keys [eid]}]
                                   (when (triple-model/eid-lookup-ref? eid)
                                     eid)))
                           (concat create-steps update-steps))]
    (when (or (seq eid+etypes) (seq lookups))
      (tracer/with-span! {:name "transaction/validate-mode"
                          :attributes {:app-id app-id}}
        (let [query    "WITH eid_etypes AS (
                          SELECT CAST(elem ->> 0 AS UUID) AS id,
                                 CAST(elem ->> 1 AS TEXT) as etype
                          FROM JSONB_ARRAY_ELEMENTS(CAST(?eid+etypes AS JSONB)) AS elem
                        ),
                        check_eids AS (
                          SELECT DISTINCT eid_etypes.id, eid_etypes.etype, triples.entity_id
                          FROM eid_etypes
                          LEFT JOIN triples
                                 ON triples.app_id = ?app-id
                                AND triples.entity_id = eid_etypes.id
                          LEFT JOIN attrs
                                 ON triples.attr_id = attrs.id
                          WHERE attrs.etype = eid_etypes.etype
                        ),
                        lookups AS (
                          SELECT CAST(elem ->> 0 AS uuid) AS attr_id,
                                 CAST(elem ->> 1 AS jsonb) AS value
                          FROM JSONB_ARRAY_ELEMENTS(CAST(?lookups AS JSONB)) AS elem
                        ),
                        check_lookups AS (
                          SELECT DISTINCT lookups.attr_id, lookups.value, triples.entity_id
                          FROM lookups
                          LEFT JOIN triples
                                 ON app_id = ?app-id
                                AND triples.av
                                AND lookups.attr_id = triples.attr_id
                                AND lookups.value = triples.value
                        )
                        SELECT id, etype, NULL AS attr_id, NULL AS value, entity_id
                        FROM check_eids
                        UNION
                        SELECT NULL as id, NULL as etype, attr_id, value, entity_id
                        FROM check_lookups"
              params   {"?eid+etypes" (->json eid+etypes)
                        "?lookups"    (->json (map (fn [[a v]] [a (->json v)]) lookups))
                        "?app-id"     app-id}
              resolved (->> (sql/select ::validate-mode conn (sql/format query params))
                            (map (fn [{:keys [id attr_id value entity_id]}]
                                   [(or id [attr_id value]) entity_id]))
                            (into {}))]

          ;; check create over existing entities
          (when-some [existing (->> create-steps
                                    (filter (fn [{:keys [eid]}] (resolved eid)))
                                    not-empty)]
            (ex/throw-validation-err!
             :tx-step
             existing
             [{:message (str "Creating entities that exist: " (string/join ", " (map :eid existing)))}]))

          ;; check update over missing entities
          (when-some [missing (->> update-steps
                                   (filter (fn [{:keys [eid]}] (nil? (resolved eid))))
                                   not-empty)]
            (ex/throw-validation-err!
             :tx-step
             missing
             [{:message (str "Updating entities that don't exist: " (string/join ", " (map :eid missing)))}])))))))

(defn prevent-$files-updates
  "Files support delete, link/unlink, but not update or merge"
  [attrs tx-step-maps opts]
  (when (not (:allow-$files-update? opts))
    (doseq [{:keys [op eid aid etype value] :as tx-step} tx-step-maps
            :when (#{:add-triple :deep-merge-triple :retract-triple} op)
            :let [attr (attr-model/seek-by-id aid attrs)
                  label (attr-model/fwd-label attr)]
            :when (and (= etype "$files")
                       (or (not (contains? #{"id" "path"} label))
                           (and (= label "id") (not= eid value))))]
      (ex/throw-validation-err!
       :tx-step
       [op (vectorize-tx-step tx-step)]
       [{:message "update or merge is only allowed on `path` for $files in transact."}]))))

(defn resolve-lookups-for-delete-entity [conn app-id tx-step-maps]
  (let [[lookup-ref-deletes rest] (coll/split-by
                                   #(and (= :delete-entity (:op %))
                                         (triple-model/eid-lookup-ref? (:eid %)))
                                   tx-step-maps)
        lookup-refs               (map :eid lookup-ref-deletes)
        resolved                  (resolve-lookups conn app-id lookup-refs)]
    (concat
     ;; Update rule-params ops to use resolved eids
     (map (fn [tx-step]
            (if (and (= :rule-params (:op tx-step))
                     (get resolved (:eid tx-step)))
              (assoc tx-step :eid (get resolved (:eid tx-step)))
              tx-step))
          rest)
     (for [{:keys [eid] :as tx-step} lookup-ref-deletes
           :let [eid' (get resolved eid)]
           :when (uuid? eid')]
       (assoc tx-step :eid eid')))))

(defn resolve-etypes-for-delete-entity [conn app-id tx-step-maps]
  (let [[untyped-deletes rest] (coll/split-by
                                #(and (= :delete-entity (:op %))
                                      (nil? (:etype %)))
                                tx-step-maps)
        untyped-ids (map :eid untyped-deletes)
        resolved    (resolve-etypes conn app-id untyped-ids)]
    (concat
     rest
     (for [{:keys [eid] :as tx-step} untyped-deletes
           etype                     (get resolved eid [nil])]
       (assoc tx-step :etype etype)))))

(defn expand-delete-entity-cascade [conn app-id attrs tx-step-maps]
  (let [ids+etypes (for [{:keys [op eid etype]} tx-step-maps
                         :when  (and (= :delete-entity op)
                                     (uuid? eid)
                                     (some? etype))]
                     [eid etype])]
    (if (empty? ids+etypes)
      tx-step-maps
      (let [attrs+etypes
            (->> attrs
                 (filter #(= :ref (:value-type %)))
                 (filter #(= :cascade (:on-delete %)))
                 (mapv #(vector (:id %) (-> % :forward-identity second) (-> % :reverse-identity second))))

            reverse-attrs+etypes
            (->> attrs
                 (filter #(= :ref (:value-type %)))
                 (filter #(= :cascade (:on-delete-reverse %)))
                 (mapv #(vector (:id %) (-> % :forward-identity second) (-> % :reverse-identity second))))

            query+args
            (sql/format
             "WITH RECURSIVE

              attrs_forward (id, forward_etype, reverse_etype) AS (
                SELECT
                  cast(elem ->> 0 AS uuid),
                  cast(elem ->> 1 AS text),
                  cast(elem ->> 2 AS text)
                FROM
                  jsonb_array_elements(cast(?attrs+etypes AS jsonb)) AS elem
              ),

              attrs_reverse (id, forward_etype, reverse_etype) AS (
                SELECT
                  cast(elem ->> 0 AS uuid),
                  cast(elem ->> 1 AS text),
                  cast(elem ->> 2 AS text)
                FROM
                  jsonb_array_elements(cast(?reverse-attrs+etypes AS jsonb)) AS elem
              ),

              entids (entity_id, etype, parent_id) AS (
                -- Starting entities (the parents being deleted)
                SELECT
                  cast(elem ->> 0 AS uuid) as entity_id,
                  cast(elem ->> 1 AS text) as etype,
                  cast(elem ->> 0 AS uuid) as parent_id,  -- parent_id is itself for root entities
                  cast(elem ->> 1 as text) as parent_etype -- parent_etype is itself for root entities
                FROM
                  jsonb_array_elements(cast(?ids+etypes AS jsonb)) AS elem

                UNION

                SELECT
                  *
                FROM (
                  -- can't reference entids twice, but can bind it to entids_inner and then it's okay
                  WITH entids_inner AS (
                    SELECT
                      entity_id,
                      etype,
                      parent_id,
                      parent_etype
                    FROM
                      entids
                  )

                  -- follow forward refs → entid (cascaded children inherit parent_id)
                  SELECT
                    triples.entity_id AS entity_id,
                    attrs_forward.forward_etype AS etype,
                    entids_inner.parent_id AS parent_id,  -- inherit parent from the entity that triggered cascade
                    entids_inner.parent_etype as parent_etype
                  FROM
                    entids_inner
                  JOIN triples
                    ON triples.app_id = ?app-id
                  JOIN attrs_forward
                    ON triples.attr_id = attrs_forward.id
                  WHERE
                    triples.vae
                    AND entids_inner.entity_id = json_uuid_to_uuid(triples.value)
                    AND entids_inner.etype = attrs_forward.reverse_etype

                  UNION

                  -- follow entid → reverse refs (cascaded children inherit parent_id)
                  SELECT
                    json_uuid_to_uuid(triples.value) AS entity_id,
                    attrs_reverse.reverse_etype AS etype,
                    entids_inner.parent_id AS parent_id,  -- inherit parent from the entity that triggered cascade
                    entids_inner.parent_etype as parent_etype
                  FROM
                    entids_inner
                  JOIN triples
                    ON triples.app_id = ?app-id
                    AND entids_inner.entity_id = triples.entity_id
                  JOIN attrs_reverse
                    ON triples.attr_id = attrs_reverse.id
                  WHERE
                    triples.eav
                    AND entids_inner.etype = attrs_reverse.forward_etype
                )
              )

              SELECT
                entity_id, etype, parent_id, parent_etype
              FROM
                entids"
             {"?app-id"               app-id
              "?ids+etypes"           (->json ids+etypes)
              "?attrs+etypes"         (->json attrs+etypes)
              "?reverse-attrs+etypes" (->json reverse-attrs+etypes)})
            res (sql/execute! conn query+args)
            parent-id->rule-params (into {}
                                         (for [{:keys [op eid value]} tx-step-maps
                                               :when (and (= :rule-params op) (uuid? eid))]
                                           [eid value]))
            ;; Only get the cascaded entities (where parent_id != entity_id)
            cascaded-entities (remove #(and (= (:parent_id %) (:entity_id %))
                                            (= (:parent_etype %) (:etype %)))
                                      res)]
        (concat
         tx-step-maps
         ;; Add delete operations for cascaded entities only
         (for [{:keys [entity_id etype]} cascaded-entities]
           {:op :delete-entity
            :eid entity_id
            :etype etype})
         ;; Add rule-params for cascaded entities that have a parent with rule-params
         (for [{:keys [entity_id etype parent_id]} cascaded-entities
               :let [rule-params (get parent-id->rule-params parent_id)]
               :when rule-params]
           {:op :rule-params
            :eid entity_id
            :etype etype
            :value rule-params}))))))

(defn validate-value-lookup-etypes
  "Check that in the case of

     [op eid fwd-attr [lookup-attr lookup-value]]

   etype from reverse of fwd-attr matches etype from lookup-attr"
  [attrs tx-step-maps]
  (doseq [{:keys [op aid value] :as tx-step} tx-step-maps
          :when (#{:add-triple :deep-merge-triple :retract-triple} op)
          :let [rev-etype (attr-model/rev-etype (attr-model/seek-by-id aid attrs))]
          :when (and rev-etype
                     (triple-model/value-lookup-ref? value))
          :let [[value-lookup-attr-id _] value
                value-lookup-etype       (attr-model/fwd-etype (attr-model/seek-by-id value-lookup-attr-id attrs))]]
    (when-not value-lookup-etype
      (ex/throw-validation-err! :lookup value
                                [{:message "Invalid lookup. Could not determine namespace from lookup attribute."
                                  :tx-step tx-step}]))
    (when (and rev-etype (not= value-lookup-etype rev-etype))
      (ex/throw-validation-err! :tx-step tx-step
                                [{:message (string-util/multiline->single-line
                                            "Invalid transaction. The namespace in the lookup attribute is
                                             different from the namespace of the attribute that is
                                             being set")}])))
  tx-step-maps)

(defn get-attr-for-exception
  "Used by exception.clj to lookup the attr by its attr id when it gets an attr id
   in a sql exception."
  [attrs attr-id]
  (attr-model/seek-by-id attr-id attrs))

(defn transact-without-tx-conn-impl! [conn attrs app-id tx-step-maps opts]
  (binding [ex/*get-attr-for-exception* (partial get-attr-for-exception attrs)]
    (let [tx-step-vecs     (map vectorize-tx-step tx-step-maps)
          grouped-tx-steps (group-by first tx-step-vecs)]
      (tracer/with-span! {:name "transaction/transact!"
                          :attributes {:app-id app-id
                                       :num-tx-steps (count tx-step-vecs)
                                       :detailed-tx-steps (pr-str tx-step-vecs)}}
        (prevent-system-catalog-updates! app-id opts)
        (prevent-$files-updates attrs tx-step-maps opts)
        (validate-mode conn app-id tx-step-maps)
        (let [results
              (reduce-kv
               (fn [acc op tx-steps]
                 (when (#{:add-attr :update-attr} op)
                   (prevent-system-catalog-attrs-updates! op tx-steps))
                 (cond
                   (empty? tx-steps)
                   acc

                   (= :rule-params op)
                   acc

                   :else
                   (assoc acc op
                          (case op
                            :add-attr
                            (attr-model/insert-multi! conn app-id (map second tx-steps))

                            :delete-attr
                            (attr-model/soft-delete-multi! conn app-id (map second tx-steps))

                            :restore-attr
                            (attr-model/restore-multi! conn app-id (map second tx-steps))

                            :update-attr
                            (attr-model/update-multi! conn app-id (map second tx-steps))

                            :delete-entity
                            (triple-model/delete-entity-multi! conn app-id (map next tx-steps))

                            :add-triple
                            (triple-model/insert-multi! conn attrs app-id (map next tx-steps))

                            :deep-merge-triple
                            (triple-model/deep-merge-multi! conn attrs app-id (map next tx-steps))

                            :retract-triple
                            (triple-model/delete-multi! conn app-id (map next tx-steps))))))
               {}
               grouped-tx-steps)
              eid+attr-ids (distinct
                            (concat
                             (:delete-entity results)
                             (:add-triple results)
                             (:deep-merge-triple results)
                             (:retract-triple results)))
              _  (triple-model/validate-required! conn attrs app-id eid+attr-ids)
              updated-attrs (->> tx-step-maps
                                 (filter #(= :update-attr (:op %)))
                                 (map :value))
              _  (attr-model/validate-update-required! conn app-id updated-attrs)
              tx (transaction-model/create! conn {:app-id app-id})]
          (let [tx-created-at (Date/.toInstant (:created_at tx))]
            (e2e-tracer/start-invalidator-tracking! {:tx-id (:id tx)
                                                     :tx-created-at tx-created-at})
            (e2e-tracer/invalidator-tracking-step! {:tx-id (:id tx)
                                                    :tx-created-at tx-created-at
                                                    :name "transact"}))
          (assoc tx :results results))))))

(defn- tx-step-op [tx-step]
  (if (map? tx-step)
    :add-triple
    (first tx-step)))

(defn tx-steps-order
  "For backwards compatibility, we group steps by op but execute groups
   in order they first appeared in tx-steps"
  [tx-step-vecs]
  (distinct (map tx-step-op tx-step-vecs)))

(defn reorder-tx-steps
  [ops-order tx-step-maps]
  (let [groups (group-by :op tx-step-maps)]
    (mapcat #(get groups %) ops-order)))

(defn optimistic-attrs [attrs tx-step-vecs]
  (->> tx-step-vecs
       (reduce
        (fn [acc tx-step]
          (case (tx-step-op tx-step)
            (:add-attr
             :update-attr) (let [[_ value] tx-step]
                             (assoc! acc (:id value) value))
            :delete-attr   (let [[_ value] tx-step]
                             (dissoc! acc value))
            acc))
        (transient (attr-model/map-by-id attrs)))
       persistent!
       vals
       attr-model/wrap-attrs))

(defn- expand-maps
  "Lets you write sequence of :add-triple as a map. Will resolve attributes
   to their ids. Map must contain :id and :etype keys.

     (transact! [{:id    user-id
                  :etype \"$users\"
                  :email \"stopa@instantdb.com\"}])

   is equivalent to

     (let [attr-id (fn [label]
                     (attr-model/resolve-attr-id attrs \"$users\" label))]
       (transact! [[:add-triple user-id (attr-id :id) user-id]
                   [:add-triple user-id (attr-id :email) \"stopa@instantdb.com\"]]))"
  [attrs tx-step-vecs]
  (for [tx-step tx-step-vecs
        tx-step (if (map? tx-step)
                  (let [{:keys [id etype]} tx-step]
                    (for [[k v] tx-step
                          :when (not= :etype k)
                          :let  [attr-id (if (uuid? k)
                                           k
                                           (attr-model/resolve-attr-id attrs etype k))]]
                      [:add-triple id attr-id v]))
                  [tx-step])]
    tx-step))

(defn preprocess-tx-steps [conn attrs app-id tx-step-vecs]
  (->> tx-step-vecs
       (expand-maps attrs)
       (mapify-tx-steps attrs)
       (resolve-lookups-for-delete-entity conn app-id)
       (resolve-etypes-for-delete-entity conn app-id)
       (expand-delete-entity-cascade conn app-id attrs)))

(defn transact-without-tx-conn! [conn attrs app-id tx-step-vecs opts]
  (let [ops-order     (tx-steps-order tx-step-vecs)
        attrs'        (optimistic-attrs attrs tx-step-vecs)
        tx-step-maps  (->> tx-step-vecs
                           (preprocess-tx-steps conn attrs' app-id)
                           (reorder-tx-steps ops-order))]
    (transact-without-tx-conn-impl! conn attrs' app-id tx-step-maps opts)))

(defn transact!
  ([conn attrs app-id tx-steps]
   (transact! conn attrs app-id tx-steps {}))
  ([conn attrs app-id tx-steps opts]
   (next-jdbc/with-transaction [tx-conn conn]
     (transact-without-tx-conn! tx-conn attrs app-id tx-steps opts))))
