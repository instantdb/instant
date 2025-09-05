(ns instant.db.permissioned-transaction
  (:require
   [clojure.string :as string]
   [clojure+.core :as clojure+]
   [instant.db.cel :as cel]
   [instant.db.datalog :as d]
   [instant.db.model.attr :as attr-model]
   [instant.db.model.entity :as entity-model]
   [instant.db.transaction :as tx]
   [instant.jdbc.aurora :as aurora]
   [instant.model.rule :as rule-model]
   [instant.util.exception :as ex]
   [instant.util.io :as io]
   [instant.util.string :as string-util]
   [instant.util.tracer :as tracer]
   [instant.util.uuid :as uuid-util]
   [next.jdbc :as next-jdbc]
   [instant.util.coll :as ucoll]
   [instant.db.model.triple :as triple-model]))

(defn lookup-ref? [eid]
  (sequential? eid))

(defn extract-etype [{:keys [attrs]} attr-id]
  (attr-model/fwd-etype (attr-model/seek-by-id attr-id attrs)))

(defn extract-rev-etype [{:keys [attrs]} attr-id]
  (attr-model/rev-etype (attr-model/seek-by-id attr-id attrs)))

(defn validate-reserved-names!
  "Throws a validation error if the users tries to add triples to the $users table"
  [{:keys [admin?]} tx-step-maps]
  (doseq [{:keys [op etype] :as tx-step} tx-step-maps
          :when (#{:add-triple :deep-merge-triple :retract-triple :delete-entity} op)
          :when (and (string/starts-with? etype "$")
                     (not admin?)
                     ;; checking admin? is not enough for $files so we handle
                     ;; validations later
                     (not (string/starts-with? etype "$files")))]
    (ex/throw-validation-err!
     :tx-step
     (tx/vectorize-tx-step tx-step)
     [{:message (format "The %s namespace is read-only. It can't be modified."
                        etype)}])))

(defn coerce-value-uuids
  "Checks that all ref values are either lookup refs or UUIDs"
  [_ctx tx-steps]
  (for [{:keys [rev-etype value] :as tx-step} tx-steps]
    (if (and rev-etype (not (lookup-ref? value)))
      (if-some [value-uuid (uuid-util/coerce value)]
        (assoc tx-step :value value-uuid)
        (ex/throw-validation-err! :eid value
                                  [{:message "Expected link value to be a uuid."
                                    :hint {:tx-step (tx/vectorize-tx-step tx-step)}}]))
      tx-step)))

(defn validate-lookup-etypes
  "Checks that all lookup refs use existing attrs and match tx-step attribute etypes"
  [ctx tx-steps]
  (doseq [{:keys [eid etype] :as tx-step} tx-steps
          :when (lookup-ref? eid)
          :let [lookup-etype (extract-etype ctx (first eid))]]
    (when-not lookup-etype
      (ex/throw-validation-err! :lookup eid
                                [{:tx-step (tx/vectorize-tx-step tx-step)
                                  :message "Invalid lookup. Could not determine namespace from lookup attribute."}]))
    (when-not (= etype lookup-etype)
      (ex/throw-validation-err! :tx-step (tx/vectorize-tx-step tx-step)
                                [{:message (string-util/multiline->single-line
                                            "Invalid transaction. The namespace in the lookup attribute is
                                           different from the namespace of the attribute that is
                                           being set")}])))
  tx-steps)

(defn load-entities-map
  "Takes tx-steps, fetches from DB map of

     {{:eid :etype} -> <entity map>}"
  [{:keys [datalog-query-fn attrs] :as ctx} tx-steps]
  (let [eids+etypes (for [{:keys [eid etype value rev-etype]} tx-steps
                          :when eid
                          [eid etype] (if rev-etype
                                        [[eid etype]
                                         [value rev-etype]]
                                        [[eid etype]])]
                      {:eid eid :etype etype})]
    (when (seq eids+etypes)
      (let [query {:children
                   {:pattern-groups
                    (for [{:keys [eid etype]} eids+etypes]
                      {:patterns
                       [[:ea eid (attr-model/ea-ids-for-etype etype attrs)]]})}}
            ;; you might be tempted to simplify the query to [[:ea (set eids)]]
            ;; but the eid might be a lookup ref and you won't know how to get
            ;; the join rows for that lookup
            datalog-result (datalog-query-fn ctx query)]
        (zipmap
         eids+etypes
         (for [data (:data datalog-result)
               :let [rows    (:join-rows (:result data))
                     triples (mapcat identity rows)]]
           (when (seq triples)
             (-> (entity-model/triples->map ctx triples)
                 (assoc "id" (ffirst triples))))))))))

(defn resolve-lookups-tx-steps
  "Given known entities-map, resolves as much lookup-refs as possible"
  [_ctx entities-map tx-steps]
  (for [{:keys [eid etype value rev-etype] :as tx-step} tx-steps]
    (cond-> tx-step
      (lookup-ref? eid)
      (update :eid #(-> entities-map
                        (get {:eid % :etype etype})
                        (get "id")
                        (some-> uuid-util/coerce)
                        (or %)))

      (and rev-etype (lookup-ref? value))
      (update :value #(-> entities-map
                          (get {:eid % :etype rev-etype})
                          (get "id")
                          (some-> uuid-util/coerce)
                          (or %))))))

(defn resolve-lookups-entities-map
  "Updates entities-map keys that are lookup-refs"
  [_ctx entities-map]
  (into {}
        (for [[{:keys [eid etype]} entity] entities-map
              :let [id (or (some-> entity
                                   (get "id")
                                   uuid-util/coerce)
                           eid)]]
          [{:eid id :etype etype} entity])))

(defn deep-merge-and-delete
  "Applies a `merge()` patch to a record. Analogous to immutableDeepMerge in JS
   and deep_merge in Postgres"
  [orig updates]
  (if (and (map? orig) (map? updates))
    (reduce-kv
     (fn [accum key updated-value]
       (cond
         (and (map? (get accum key))
              (map? updated-value))
         (assoc accum key (deep-merge-and-delete (get accum key) updated-value))

         (nil? updated-value)
         (dissoc accum key)

         :else
         (assoc accum key updated-value)))
     orig
     updates)
    updates))

(defn update-entities-map
  "Applies local tx-steps to entities in entities-map, producing entities
   ~approximating ones post tx"
  [{:keys [attrs]} entities-map tx-steps]
  (persistent!
   (reduce
    (fn [acc {:keys [op eid etype aid value]}]
      (let [key   {:eid eid :etype etype}
            ;; apply lookup from eid as entity attr
            acc'  (if (and (lookup-ref? eid)
                           (#{:add-triple :deep-merge-triple} op))
                    (let [[lookup-aid lookup-value] eid
                          lookup-label (-> lookup-aid
                                           (attr-model/seek-by-id attrs)
                                           :forward-identity
                                           last)]
                      (ucoll/update! acc key assoc lookup-label lookup-value))
                    acc)
            ;; apply tx-step
            label (some-> aid
                          (attr-model/seek-by-id attrs)
                          :forward-identity
                          last)
            acc'' (case op
                    :add-triple
                    (ucoll/update! acc' key assoc label value)

                    :deep-merge-triple
                    (ucoll/update! acc' key update label deep-merge-and-delete value)

                    :retract-triple
                    (ucoll/update! acc' key assoc label nil)

                    acc')]
        acc''))
    (transient entities-map)
    tx-steps)))

(defn pre-checks
  "Checks that run before tx: update, delete for attrs & objects"
  [{:keys [attrs admin? rules]}
   entities-map
   updated-entities-map
   rule-params-map
   tx-steps]
  (for [tx-step tx-steps
        :let [{:keys [op eid aid etype value rev-etype]} tx-step
              key                {:eid eid :etype etype}
              entity             (get entities-map key)
              ref?               (some? rev-etype)
              [_ _ fwd-label]    (:forward-identity (attr-model/seek-by-id aid attrs))
              [_ _ rev-label]    (:reverse-identity (attr-model/seek-by-id aid attrs))
              rev-key            {:eid value :etype rev-etype}
              rev-entity         (when ref?
                                   (get entities-map rev-key))
              rule-params        (get rule-params-map key)
              link-program       (when ref?
                                   (rule-model/get-program! rules [[etype "allow" "link" fwd-label]
                                                                   [etype "allow" "link" "$default"]]))
              rev-link-program   (when ref?
                                   (rule-model/get-program! rules [[rev-etype "allow" "link" rev-label]
                                                                   [rev-etype "allow" "link" "$default"]]))
              unlink-program     (when ref?
                                   (rule-model/get-program! rules [[etype "allow" "unlink" fwd-label]
                                                                   [etype "allow" "unlink" "$default"]]))
              rev-unlink-program (when ref?
                                   (rule-model/get-program! rules [[rev-etype "allow" "unlink" rev-label]
                                                                   [rev-etype "allow" "unlink" "$default"]]))]
        check (clojure+/cond+
                (= :update-attr op)
                [{:scope    :attr
                  :action   :update
                  :etype    "attrs"
                  :program  {:result admin?}}]

                (= :delete-attr op)
                [{:scope    :attr
                  :action   :delete
                  :etype    "attrs"
                  :program  {:result admin?}}]

                (= :restore-attr op)
                [{:scope    :attr
                  :action   :restore
                  :etype    "attrs"
                  :program  {:result admin?}}]

                ;; if link is defined on at least one side
                (and (= :add-triple op)
                     ref?
                     (or link-program rev-link-program))
                (concat
                 (when (and entity link-program)
                   [{:scope    :object
                     :action   :link
                     :etype    etype
                     :eid      eid
                     :program  link-program
                     :bindings {:data         entity
                                :new-data     (get updated-entities-map key)
                                :linked-data  rev-entity
                                :linked-etype rev-etype
                                :rule-params  rule-params}}])
                 (when (and rev-entity rev-link-program)
                   [{:scope    :object
                     :action   :link
                     :etype    rev-etype
                     :eid      value
                     :program  rev-link-program
                     :bindings {:data         rev-entity
                                :new-data     (get updated-entities-map rev-key)
                                :linked-data  (get updated-entities-map key)
                                :linked-etype etype
                                :rule-params  (merge rule-params
                                                     (get rule-params-map rev-key))}}]))

                ;; fallback when link isn´t defined on either side
                (and (= :add-triple op)
                     ref?)
                (concat
                 (when entity
                   [{:scope    :object
                     :action   :update
                     :etype    etype
                     :eid      eid
                     :program  (or (rule-model/get-program! rules etype "update")
                                   {:result true})
                     :bindings {:data        entity
                                :new-data    (get updated-entities-map key)
                                :rule-params rule-params}}])
                 (when rev-entity
                   [{:scope    :object
                     :action   :view
                     :etype    rev-etype
                     :eid      value
                     :program  (or (rule-model/get-program! rules rev-etype "view")
                                   {:result true})
                     :bindings {:data        rev-entity
                                :new-data    (get updated-entities-map rev-key)
                                :rule-params (merge rule-params
                                                    (get rule-params-map rev-key))}}]))

                ;; if unlink is defined on at least one side
                (and (= :retract-triple op)
                     ref?
                     (or unlink-program rev-unlink-program))
                (concat
                 (when (and entity unlink-program)
                   [{:scope    :object
                     :action   :unlink
                     :etype    etype
                     :eid      eid
                     :program  unlink-program
                     :bindings {:data         entity
                                :new-data     (get updated-entities-map key)
                                :linked-data  rev-entity
                                :linked-etype rev-etype
                                :rule-params  rule-params}}])
                 (when (and rev-entity rev-unlink-program)
                   [{:scope    :object
                     :action   :unlink
                     :etype    rev-etype
                     :eid      value
                     :program  rev-unlink-program
                     :bindings {:data         rev-entity
                                :new-data     (get updated-entities-map rev-key)
                                :linked-data  entity
                                :linked-etype etype
                                :rule-params  (merge rule-params
                                                    (get rule-params-map rev-key))}}]))

                ;; fallback when unlink isn´t defined on either side
                (and (= :retract-triple op)
                     ref?)
                (concat
                 (when entity
                   [{:scope    :object
                     :action   :update
                     :etype    etype
                     :eid      eid
                     :program  (or (rule-model/get-program! rules etype "update")
                                   {:result true})
                     :bindings {:data        entity
                                :new-data    (get updated-entities-map key)
                                :rule-params rule-params}}])
                 (when rev-entity
                   [{:scope    :object
                     :action   :view
                     :etype    rev-etype
                     :eid      value
                     :program  (or (rule-model/get-program! rules rev-etype "view")
                                   {:result true})
                     :bindings {:data        rev-entity
                                :new-data    (get updated-entities-map rev-key)
                                :rule-params (merge rule-params
                                                    (get rule-params-map rev-key))}}]))

                (and (#{:add-triple :deep-merge-triple} op)
                     entity)
                [{:scope    :object
                  :action   :update
                  :etype    etype
                  :eid      eid
                  :program  (or (rule-model/get-program! rules etype "update")
                                {:result true})
                  :bindings {:data        entity
                             :new-data    (get updated-entities-map key)
                             :rule-params rule-params}}]

                (= :delete-entity op)
                [{:scope    :object
                  :action   :delete
                  :etype    etype
                  :eid      eid
                  :program  (or (rule-model/get-program! rules etype "delete")
                                {:result true})
                  :bindings {:data        entity
                             :rule-params rule-params}}]

                :else
                [])]
    check))

(defn post-create-checks
  "Checks for new entities created -- assumed to be run after tx so it can
   reference new data in rules"
  [{:keys [attrs rules]}
   entities-map
   updated-entities-map
   rule-params-map
   create-lookups-map
   tx-steps]
  (for [{:keys [op eid aid etype value rev-etype]} tx-steps
        :let [key                {:eid eid :etype etype}
              entity             (get entities-map key)
              updated-entity     (some-> (get updated-entities-map key)
                                         (update "id" #(or (get create-lookups-map %) (:eid key) %)))
              create?            (nil? entity)
              ref?               (some? rev-etype)
              [_ _ fwd-label]    (:forward-identity (attr-model/seek-by-id aid attrs))
              [_ _ rev-label]    (:reverse-identity (attr-model/seek-by-id aid attrs))
              rev-key            {:eid value :etype rev-etype}
              updated-rev-entity (when ref?
                                   (some-> (get updated-entities-map rev-key)
                                           (update "id" #(or (get create-lookups-map %) (:eid rev-key) %))))
              rule-params        (get rule-params-map key)
              link-program       (when ref?
                                   (rule-model/get-program! rules [[etype "allow" "link" fwd-label]
                                                                   [etype "allow" "link" "$default"]]))
              rev-link-program   (when ref?
                                   (rule-model/get-program! rules [[rev-etype "allow" "link" rev-label]
                                                                   [rev-etype "allow" "link" "$default"]]))]
        check (clojure+/cond+
                (= :add-attr op)
                [{:scope    :attr
                  :action   :create
                  :etype    "attrs"
                  :program  (or (rule-model/get-program! rules "attrs" "create")
                                {:result true})
                  :bindings {:data value}}]

                ;; if link is defined on at least one side
                (and (= :add-triple op)
                     ref?
                     (or link-program rev-link-program))
                (concat
                 (when (and create? link-program)
                   [{:scope    :object
                     :action   :link
                     :etype    etype
                     :eid      (get create-lookups-map eid eid)
                     :program  link-program
                     :bindings {:data         updated-entity
                                :new-data     updated-entity
                                :linked-data  updated-rev-entity
                                :linked-etype rev-etype
                                :rule-params  rule-params}}])
                 (when (and updated-rev-entity
                            (nil? (get entities-map rev-key))
                            rev-link-program)
                   [{:scope    :object
                     :action   :link
                     :etype    rev-etype
                     :eid      (get updated-rev-entity "id")
                     :program  rev-link-program
                     :bindings {:data         updated-rev-entity
                                :new-data     updated-rev-entity
                                :linked-data  updated-entity
                                :linked-etype etype
                                :rule-params  (merge rule-params
                                                     (get rule-params-map rev-key))}}]))

                ;; fallback when link isn´t defined on either side
                (and (= :add-triple op)
                     ref?)
                (concat
                 (when create?
                   [{:scope    :object
                     :action   :create
                     :etype    etype
                     :eid      (get create-lookups-map eid eid)
                     :program  (or (rule-model/get-program! rules etype "create")
                                   {:result true})
                     :bindings {:data         updated-entity
                                :new-data     updated-entity
                                :linked-data  updated-rev-entity
                                :linked-etype rev-etype
                                :rule-params  rule-params}}])
                 (when (and updated-rev-entity
                            (nil? (get entities-map rev-key)))
                   [{:scope    :object
                     :action   :view
                     :etype    rev-etype
                     :eid      (get updated-rev-entity "id")
                     :program  (or (rule-model/get-program! rules rev-etype "view")
                                   {:result true})
                     :bindings {:data         updated-rev-entity
                                :new-data     updated-rev-entity
                                :linked-data  updated-entity
                                :linked-etype etype
                                :rule-params  (merge rule-params
                                                    (get rule-params-map rev-key))}}]))

                (and (#{:add-triple :deep-merge-triple} op)
                     create?)
                [{:scope    :object
                  :action   :create
                  :etype    etype
                  :eid      (get create-lookups-map eid eid)
                  :program  (or (rule-model/get-program! rules etype "create")
                                {:result true})
                  :bindings (let [updated-entity (-> (get updated-entities-map key)
                                                     (update "id" #(get create-lookups-map % %)))]
                              {:data        updated-entity
                               :new-data    updated-entity
                               :rule-params rule-params})}]

                :else
                [])]
    check))

(defn run-checks!
  "Runs checks, returning results (admin-check?) or throwing"
  [ctx checks]
  (let [checks (distinct checks)
        ctx    (assoc ctx :preloaded-refs (cel/create-preloaded-refs-cache))
        _      (doseq [check checks
                       :let [{:keys [eid]} check]
                       :when (lookup-ref? eid)]
                 (ex/throw-validation-err! :lookup eid [{:message "Could not find the entity for this lookup"}]))
        results (cel/eval-programs! ctx checks)]
    (doall
     (for [{:keys [scope etype result] :as check} results]
       (do
         (when-not (:admin-check? ctx)
           (ex/assert-permitted! :perms-pass? [etype scope] result))
         (-> check
             (dissoc :result)
             (assoc
              :check-result result
              :check-pass?  (boolean result))))))))

(defn transact!
  "Runs transactions alongside permission checks. The overall flow looks like this:

   1. Take a list of tx-steps (add-attr, delete-attr, add-triple, etc)
   2. Load existing triples that correspond to these steps from DB
   3. Resolve lookup-refs where possible
   4. Run update and delete checks
   5. Transact tx-steps
   6. Fetch new lookup-ref data for newly inserted data
   7. Run create checks

   We run `create` checks _after_ the transaction, so we can query off of the
   object. For example, if we created a new `post`, we may want a check that says:
   `auth.id in data.ref('creator.id')`"
  [{:keys [db app-id admin? admin-check? admin-dry-run? attrs] :as ctx} tx-step-vecs]
  (tracer/with-span! {:name "permissioned-transaction/transact!"
                      :attributes {:app-id app-id
                                   :transact-version "2"}}
    (next-jdbc/with-transaction [tx-conn (:conn-pool db)]
      (io/warn-io :permissioned-transact!
        (let [ops-order        (tx/tx-steps-order tx-step-vecs)
              optimistic-attrs (tx/optimistic-attrs attrs tx-step-vecs)
              tx-step-maps     (io/expect-io
                                 (tx/preprocess-tx-steps tx-conn optimistic-attrs app-id tx-step-vecs))
              ;; Use the db connection we have so that we don't cause a deadlock
              ;; Also need to be able to read our own writes for the create checks
              ctx              (assoc ctx
                                      :db {:conn-pool tx-conn}
                                      :attrs optimistic-attrs)]
          (validate-reserved-names! ctx tx-step-maps)
          (if admin?
            (let [tx-steps (tx/reorder-tx-steps ops-order tx-step-maps)]
              (io/expect-io
                (tx/transact-without-tx-conn-impl! tx-conn optimistic-attrs app-id tx-steps {})))
            (let [;; pre-processing tx
                  tx-step-maps         (->> tx-step-maps
                                            (coerce-value-uuids ctx)
                                            (validate-lookup-etypes ctx)
                                            (tx/validate-value-lookup-etypes optimistic-attrs))
                  ;; TODO somehow fetch update-delete data-ref dependencies in the same go
                  entities-map         (io/expect-io
                                         (load-entities-map ctx tx-step-maps))
                  tx-step-maps         (resolve-lookups-tx-steps ctx entities-map tx-step-maps)
                  entities-map         (resolve-lookups-entities-map ctx entities-map)
                  updated-entities-map (update-entities-map ctx entities-map tx-step-maps)
                  rule-params-map      (persistent!
                                        (reduce
                                         (fn [acc {:keys [op eid etype value]}]
                                           (if (= :rule-params op)
                                             (ucoll/update! acc {:eid eid :etype etype} merge value)
                                             acc))
                                         (transient {})
                                         tx-step-maps))

                  ;; pre checks
                  pre-checks           (pre-checks ctx
                                                   entities-map
                                                   updated-entities-map
                                                   rule-params-map
                                                   tx-step-maps)
                  pre-check-results    (io/expect-io
                                         (run-checks! ctx pre-checks))

                  ;; transact to DB
                  tx-step-maps         (tx/reorder-tx-steps ops-order tx-step-maps)
                  tx-data              (io/expect-io
                                         (tx/transact-without-tx-conn-impl! tx-conn (:attrs ctx) app-id tx-step-maps {}))

                  ;; post checks
                  create-lookups-map   (io/expect-io
                                         (->> tx-step-maps
                                              (map :eid)
                                              (filter lookup-ref?)
                                              (triple-model/fetch-lookups->eid tx-conn app-id)))
                  post-checks          (post-create-checks ctx
                                                           entities-map
                                                           updated-entities-map
                                                           rule-params-map
                                                           create-lookups-map
                                                           tx-step-maps)
                  post-check-results   (io/expect-io
                                         (run-checks! ctx post-checks))

                  ;; finalizing
                  check-results        (concat pre-check-results post-check-results)
                  all-checks-ok?       (every? :check-result check-results)
                  rollback?            (and admin-check?
                                            (or admin-dry-run?
                                                (not all-checks-ok?)))]
              (when rollback?
                (io/expect-io
                  (.rollback tx-conn)))
              (assoc tx-data
                     :check-results  check-results
                     :all-checks-ok? all-checks-ok?
                     :committed?     (not rollback?)))))))))

(comment
  (do
    (def colors-app-id  #uuid "b502cabc-11ed-4534-b340-349d46548642")
    (def joe-eid #uuid "3c32701d-f4a2-40e8-b83c-077dd4cb5cec")
    (def app-attrs (attr-model/get-by-app-id colors-app-id))
    (def goal-id-attr (:id (attr-model/seek-by-fwd-ident-name ["goals" "id"] app-attrs)))
    (def goal-creator-id-attr (:id (attr-model/seek-by-fwd-ident-name ["goals" "creatorId"] app-attrs)))
    (def goal-title-attr (:id (attr-model/seek-by-fwd-ident-name ["goals" "title"] app-attrs)))
    (def goal-eid #uuid "5433bb57-a721-4130-9431-9384133b295f")
    (def tx-steps [[:add-triple goal-eid goal-id-attr goal-eid]
                   [:add-triple goal-eid goal-creator-id-attr joe-eid]
                   [:add-triple goal-eid goal-title-attr "Get a job"]]))
  (transact! {:db {:conn-pool (aurora/conn-pool :write)}
              :app-id colors-app-id
              :attrs app-attrs
              :current-user {:id joe-eid}
              :rules (rule-model/get-by-app-id {:app-id colors-app-id})
              :datalog-query-fn d/query} tx-steps)

  ;; OG transact
  (tx/transact! (aurora/conn-pool :write)
                (attr-model/get-by-app-id colors-app-id)
                colors-app-id
                tx-steps))
