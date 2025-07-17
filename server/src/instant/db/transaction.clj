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

(s/def ::update-attr-step
  (s/cat :op #{:update-attr} :update ::attr-model/attr-update))

(s/def ::tx-step (s/or :add-triple ::add-triple-step
                       :deep-merge-triple ::deep-merge-triple-step
                       :delete-entity ::delete-entity-step
                       :rule-params ::rule-params-step
                       :retract-triple ::retract-triple-step
                       :add-attr ::add-attr-step
                       :update-attr ::update-attr-step
                       :delete-attr ::delete-attr-step))

(s/def ::tx-steps (s/coll-of ::tx-step))

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

(defn validate-mode [conn app-id grouped-tx-steps]
  (let [tx-steps     (concat
                      (:add-triple grouped-tx-steps)
                      (:deep-merge-triple grouped-tx-steps))
        create-steps (filter (fn [[_ _ _ _ opts]]
                               (= :create (:mode opts))) tx-steps)
        update-steps (filter (fn [[_ _ _ _ opts]]
                               (= :update (:mode opts))) tx-steps)
        eids         (into #{}
                           (keep (fn [[_ e _ _ _]]
                                   (when (uuid? e) e)))
                           (concat create-steps update-steps))
        lookups      (into #{}
                           (keep (fn [[_ e _ _ _]]
                                   (when (triple-model/eid-lookup-ref? e) e)))
                           (concat create-steps update-steps))]
    (when (or (seq eids) (seq lookups))
      (tracer/with-span! {:name "transaction/validate-mode"
                          :attributes {:app-id app-id}}
        (let [query    "WITH eids AS (
                        SELECT cast(elem AS uuid) AS id
                        FROM jsonb_array_elements_text(cast(?eids AS jsonb)) AS elem
                      ),
                      check_eids AS (
                        SELECT DISTINCT id, entity_id
                        FROM eids
                        LEFT JOIN triples
                               ON app_id = ?app-id
                              AND id = entity_id
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
                      SELECT id, NULL AS attr_id, NULL AS value, entity_id
                      FROM check_eids
                      UNION
                      SELECT NULL as id, attr_id, value, entity_id
                      FROM check_lookups"
              params   {"?eids"    (->json eids)
                        "?lookups" (->json (map (fn [[a v]] [a (->json v)]) lookups))
                        "?app-id"  app-id}
              resolved (->> (sql/select ::validate-mode conn (sql/format query params))
                            (map (fn [{:keys [id attr_id value entity_id]}]
                                   [(or id [attr_id value]) entity_id]))
                            (into {}))]

        ;; check create over existing entities
          (when-some [existing (->> create-steps
                                    (filter (fn [[_ e _ _ _]] (resolved e)))
                                    not-empty)]
            (ex/throw-validation-err!
             :tx-step
             existing
             [{:message (str "Creating entities that exist: " (string/join ", " (map (fn [[_ e _ _ _]] e) existing)))}]))

        ;; check update over missing entities
          (when-some [missing (->> update-steps
                                   (filter (fn [[_ e _ _ _]] (nil? (resolved e))))
                                   not-empty)]
            (ex/throw-validation-err!
             :tx-step
             missing
             [{:message (str "Updating entities that don't exist: " (string/join ", " (map (fn [[_ e _ _ _]] e) missing)))}])))))))

(defn prevent-$files-add-retract! [attrs op tx-steps]
  (doseq [t tx-steps
          :let [[_op eid aid v] t
                attr (attr-model/seek-by-id aid attrs)
                etype (attr-model/fwd-etype attr)
                label (attr-model/fwd-label attr)]
          :when (and (= etype "$files")
                     (or (not (contains? #{"id" "path"} label))
                         (and (= label "id") (not= eid v))))]
    (ex/throw-validation-err!
     :tx-step
     [op t]
     [{:message "update or merge is only allowed on `path` for $files in transact."}])))

(defn prevent-$files-updates
  "Files support delete, link/unlink, but not update or merge"
  [attrs grouped-tx-steps opts]
  (when (not (:allow-$files-update? opts))
    (doseq [batch grouped-tx-steps
            :let [[op tx-steps] batch]]
      (case op
        (:add-triple :deep-merge-triple :retract-triple)
        (prevent-$files-add-retract! attrs op tx-steps)

        nil))))

(defn resolve-lookups-for-delete-entity [tx-steps conn app-id]
  (let [lookup-refs (->> tx-steps
                         (map second)
                         (filter triple-model/eid-lookup-ref?))
        resolved    (resolve-lookups conn app-id lookup-refs)]
    (for [[op eid etype] tx-steps
          :let [eid' (get resolved eid eid)]
          :when (uuid? eid')]
      [op eid' etype])))

(defn resolve-etypes-for-delete-entity [tx-steps conn app-id]
  (let [untyped-ids (->> tx-steps
                         (keep (fn [[_ id etype]]
                                 (when (nil? etype)
                                   id))))
        resolved    (resolve-etypes conn app-id untyped-ids)]
    ;; TODO remove
    (doseq [[_ _ etype :as tx-step] tx-steps
            :when (nil? etype)]
      (binding [tracer/*span* nil]
        (tracer/record-info!
         {:name "tx/missing-etype"
          :attributes {:app-id  app-id
                       :tx-step tx-step
                       :stage   "resolve-etypes-for-delete-entity"}})))
    (for [[op eid etype] tx-steps
          etype'         (if etype
                           [etype]
                           (get resolved eid [nil]))]
      [op eid etype'])))

(defn expand-delete-entity-cascade [tx-steps conn app-id attrs]
  (let [ids+etypes (->> (map next tx-steps)
                        (filter (fn [[id etype]]
                                  (and (uuid? id) (some? etype)))))]
    (if (empty? ids+etypes)
      tx-steps
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
            (hsql/format
             {:with-recursive
              [;; endids
               [[:entids {:columns [:entity_id :etype]}]
                {:union [{:values ids+etypes}
                         ;; can’t reference entids twice, but can bind it to entids_inner and then it’s okay
                         {:select :*
                          :from [[{:with
                                   [[[:entids_inner]
                                     {:select :* :from :entids}]]
                                   :union
                                   [;; follow forward refs → entid
                                    {:from   :entids_inner
                                     :join   [:refs_forward [:and
                                                           ;; TODO entity_id/value_ref join instead
                                                             [:= [:to_jsonb :entids_inner.entity_id] :refs_forward.value]
                                                             [:= :entids_inner.etype :refs_forward.reverse_etype]]]
                                     :select [:refs_forward.entity_id :refs_forward.forward_etype]}
                                  ;; follow entid → reverse refs
                                    {:from   :entids_inner
                                     :join   [:refs_reverse [:and
                                                             [:= :entids_inner.entity_id :refs_reverse.entity_id]
                                                             [:= :entids_inner.etype :refs_reverse.forward_etype]]]
                                   ;; TODO value -> value_ref
                                     :select [[[:cast [:->> :refs_reverse.value :0] :uuid]] :refs_reverse.reverse_etype]}]}
                                  ;; :alias required for postgres 13
                                  :alias]]}]}]

               ;; attrs_forward
               [[:attrs_forward {:columns [:id :forward_etype :reverse_etype]}]
                (if (empty? attrs+etypes)
                  {:select [[[:cast nil :uuid]] nil nil] :where false}
                  {:values attrs+etypes})]

               ;; refs_forward
               [:refs_forward {:select [:triples.entity_id :triples.value :attrs_forward.forward_etype :attrs_forward.reverse_etype]
                               :from   :triples
                               :join   [:attrs_forward [:= :triples.attr_id :attrs_forward.id]]
                               :where  [:and
                                        :triples.vae
                                        [:= :triples.app_id app-id]]}]

               ;; attrs_reverse
               [[:attrs_reverse {:columns [:id :forward_etype :reverse_etype]}]
                (if (empty? reverse-attrs+etypes)
                  {:select [[[:cast nil :uuid]] nil nil] :where false}
                  {:values reverse-attrs+etypes})]

               ;; refs_reverse
               [:refs_reverse {:select [:triples.entity_id :triples.value :attrs_reverse.forward_etype :attrs_reverse.reverse_etype]
                               :from   :triples
                               :join   [:attrs_reverse [:= :triples.attr_id :attrs_reverse.id]]
                               :where  [:and
                                        :triples.vae
                                        [:= :triples.app_id app-id]]}]]
              ;; final select
              :from   :entids
              :select :*})
            res         (sql/execute! conn query+args)
            ids+etypes' (map (juxt :entity_id :etype) res)]
        (for [[entity_id etype] (set (concat ids+etypes ids+etypes'))]
          [:delete-entity entity_id etype])))))

(defn get-attr-for-exception
  "Used by exception.clj to lookup the attr by its attr id when it gets an attr id
   in a sql exception."
  [attrs attr-id]
  (attr-model/seek-by-id attr-id attrs))

(defn transact-without-tx-conn-impl! [conn attrs app-id grouped-tx-steps opts]
  (binding [ex/*get-attr-for-exception* (partial get-attr-for-exception attrs)]
    (let [tx-steps (apply concat (vals grouped-tx-steps))]
      (tracer/with-span! {:name "transaction/transact!"
                          :attributes {:app-id app-id
                                       :num-tx-steps (count tx-steps)
                                       :detailed-tx-steps (pr-str tx-steps)}}
        (prevent-system-catalog-updates! app-id opts)
        (prevent-$files-updates attrs grouped-tx-steps opts)
        (validate-mode conn app-id grouped-tx-steps)
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
                            (attr-model/delete-multi! conn app-id (map second tx-steps))

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
              updated-attrs (-> grouped-tx-steps :update-attr (->> (map second)))
              _  (attr-model/validate-update-required! conn app-id updated-attrs)
              tx (transaction-model/create! conn {:app-id app-id})]
          (let [tx-created-at (Date/.toInstant (:created_at tx))]
            (e2e-tracer/start-invalidator-tracking! {:tx-id (:id tx)
                                                     :tx-created-at tx-created-at})
            (e2e-tracer/invalidator-tracking-step! {:tx-id (:id tx)
                                                    :tx-created-at tx-created-at
                                                    :name "transact"}))
          (assoc tx :results results))))))

(defn preprocess-tx-steps [conn attrs app-id tx-steps]
  (-> (group-by first tx-steps)
      (coll/update-when :delete-entity resolve-lookups-for-delete-entity conn app-id)
      (coll/update-when :delete-entity resolve-etypes-for-delete-entity conn app-id)
      (coll/update-when :delete-entity expand-delete-entity-cascade conn app-id attrs)))

(defn transact-without-tx-conn!
  ([conn attrs app-id tx-steps]
   (transact-without-tx-conn! conn attrs app-id tx-steps {}))
  ([conn attrs app-id tx-steps opts]
   (let [grouped-tx-steps (preprocess-tx-steps conn attrs app-id tx-steps)]
     (transact-without-tx-conn-impl! conn attrs app-id grouped-tx-steps opts))))

(defn transact!
  ([conn attrs app-id tx-steps]
   (transact! conn attrs app-id tx-steps {}))
  ([conn attrs app-id tx-steps opts]
   (next-jdbc/with-transaction [tx-conn conn]
     (transact-without-tx-conn! tx-conn attrs app-id tx-steps opts))))
