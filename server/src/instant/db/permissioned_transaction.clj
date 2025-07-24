(ns instant.db.permissioned-transaction
  (:require
   [clojure.string :as string]
   [instant.db.cel :as cel]
   [instant.db.datalog :as d]
   [instant.db.model.attr :as attr-model]
   [instant.db.model.entity :as entity-model]
   [instant.db.transaction :as tx]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.model.rule :as rule-model]
   [instant.util.exception :as ex]
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

(defn mapify-tx-step
  "Converts [op e a v] into map form of {:op :eid :etype :aid :value :rev-etype}"
  [ctx [op first second third fourth]]
  (case op
    (:add-attr :update-attr :delete-attr)
    {:op op
     :value first}

    (:add-triple :deep-merge-triple :retract-triple)
    {:op        op
     :eid       first
     :etype     (extract-etype ctx second)
     :aid       second
     :value     third
     :rev-etype (extract-rev-etype ctx second)
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

(defn mapify-tx-steps [ctx tx-steps]
  (map #(mapify-tx-step ctx %) tx-steps))

(defn vectorize-tx-step
  "Inverse of mapify-tx-step"
  [{:keys [op eid etype aid value opts]}]
  (case op
    (:add-attr :update-attr :delete-attr)
    [op value]

    (:add-triple :deep-merge-triple :retract-triple)
    [op eid aid value opts]

    :delete-entity
    [op eid etype]

    :rule-params
    [op eid etype value]))

(defn coerce-value-uuids
  "Checks that all ref values are either lookup refs or UUIDs"
  [_ctx tx-steps]
  (for [{:keys [rev-etype value] :as tx-step} tx-steps]
    (if (and rev-etype (not (lookup-ref? value)))
      (if-some [value-uuid (uuid-util/coerce value)]
        (assoc tx-step :value value-uuid)
        (ex/throw-validation-err! :eid value
                                  [{:message "Expected link value to be a uuid."
                                    :hint {:tx-step (vectorize-tx-step tx-step)}}]))
      tx-step)))

(defn validate-lookup-etypes
  "Checks that all lookup refs use existing attrs and match tx-step attribute etypes"
  [ctx tx-steps]
  (doseq [{:keys [eid etype] :as tx-step} tx-steps
          :when (lookup-ref? eid)
          :let [lookup-etype (extract-etype ctx (first eid))]]
    (when-not lookup-etype
      (ex/throw-validation-err! :lookup eid
                                [{:tx-step (vectorize-tx-step tx-step)
                                  :message "Invalid lookup. Could not determine namespace from lookup attribute."}]))
    (when-not (= etype lookup-etype)
      (ex/throw-validation-err! :tx-step (vectorize-tx-step tx-step)
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
                      {:eid eid :etype etype})
        query {:children
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
             (assoc "id" (ffirst triples))))))))

(defn resolve-lookups-tx-steps
  "Given known entities-map, resolves as much lookup-refs as possible"
  [_ctx entities-map tx-steps]
  (for [{:keys [eid etype value rev-etype] :as tx-step} tx-steps]
    (cond-> tx-step
      (lookup-ref? eid)
      (update :eid #(-> entities-map (get {:eid % :etype etype}) (get "id") (some-> uuid-util/coerce) (or %)))

      (and rev-etype (lookup-ref? value))
      (update :value #(-> entities-map (get {:eid % :etype rev-etype}) (get "id") (some-> uuid-util/coerce) (or %))))))

(defn resolve-lookups-entities-map
  "Updates entities-map keys that are lookup-refs"
  [_ctx entities-map]
  (into {}
        (for [[{:keys [eid etype]} entity] entities-map
              :let [id (some-> entity (get "id") uuid-util/coerce)]]
          (if id
            [{:eid id :etype etype} entity]
            [{:eid eid :etype etype} entity]))))

(defn deep-merge-and-delete
  "Applies a `merge()` patch to a record. Analogous to immutableDeepMerge in JS
   and deep_merge in Postgres"
  [orig updates]
  (if (and (map? orig) (map? updates))
    (reduce-kv
     (fn [accum key updated-value]
       (cond
         (and (map? (get accum key)) (map? updated-value))
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
            acc'  (if (and (vector? eid)
                           (#{:add-triple :deep-merge-triple} op))
                    (let [[lookup-aid lookup-value] eid
                          lookup-label (-> lookup-aid (attr-model/seek-by-id attrs)
                                           :forward-identity last)]
                      (ucoll/update! acc key assoc lookup-label lookup-value))
                    acc)
            ;; apply tx-step
            label (some-> aid (attr-model/seek-by-id attrs) :forward-identity last)
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

(defn rule-params-map
  "Collects rule-params as a map of

     {{:eid :etype} -> <rule-params>}"
  [_ctx tx-steps]
  (into {}
        (for [{:keys [op eid etype value]} tx-steps
              :when (= :rule-params op)]
          [{:eid eid :etype etype} value])))

(defn before-tx-checks
  "Checks that run before tx: update, delete for attrs & objects"
  [{:keys [admin? rules]}
   entities-map
   updated-entities-map
   rule-params-map
   tx-steps]
  (doall
   (distinct
    (for [{:keys [op eid etype value rev-etype]} tx-steps
          :let [key         {:eid eid :etype etype}
                entity      (get entities-map key)
                rule-params (get rule-params-map key)]
          check (cond
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

                  (and (#{:add-triple :deep-merge-triple :retract-triple} op)
                       entity) ;; update
                  (concat
                   [{:scope    :object
                     :action   :update
                     :etype    etype
                     :eid      eid
                     :program  (or (rule-model/get-program! rules etype "update")
                                   {:result true})
                     :bindings {:data        entity
                                :new-data    (get updated-entities-map key)
                                :rule-params rule-params}}]
                   ;; updating a ref adds implicit "view" check in reverse direction
                   ;; with rule-params from forward direction
                   (when rev-etype
                     (when-some [rev-entity (get entities-map {:eid value :etype rev-etype})]
                       [{:scope    :object
                         :action   :view
                         :etype    rev-etype
                         :eid      value
                         :program  (or (rule-model/get-program! rules rev-etype "view")
                                       {:result true})
                         :bindings {:data        rev-entity
                                    :rule-params rule-params}}])))

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
      (if (lookup-ref? (:eid check))
        (ex/throw-validation-err! :lookup (:eid check) [{:message "Could not find the entity for this lookup"}])
        check)))))

(defn after-tx-checks
  "Checks that run after tx: create, add-attr"
  [{:keys [rules]}
   entities-map
   updated-entities-map
   rule-params-map
   create-lookups-map
   tx-steps]
  (doall
   (distinct
    (for [{:keys [op eid etype value rev-etype]} tx-steps
          :let [key         {:eid eid :etype etype}
                entity      (get entities-map key)
                rule-params (get rule-params-map key)]
          check (cond
                  (= :add-attr op)
                  [{:scope    :attr
                    :action   :create
                    :etype    "attrs"
                    :program  (or (rule-model/get-program! rules "attrs" "create")
                                  {:result true})
                    :bindings {:data value}}]

                  (and (#{:add-triple :deep-merge-triple :retract-triple} op)
                       (not entity)) ;; create
                  (concat
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
                   ;; updating a ref adds implicit "view" check in reverse direction
                   ;; with rule-params from forward direction
                   (when rev-etype
                     (when-some [rev-entity (get entities-map {:eid value :etype rev-etype})]
                       [{:scope    :object
                         :action   :view
                         :etype    rev-etype
                         :eid      value
                         :program  (or (rule-model/get-program! rules rev-etype "view")
                                       {:result true})
                         :bindings {:data        rev-entity
                                    :rule-params rule-params}}])))

                  :else
                  [])]
      (if (lookup-ref? (:eid check))
        (ex/throw-validation-err! :lookup (:eid check) [{:message "Could not find the entity for this lookup"}])
        check)))))

(defn run-checks!
  "Runs checks, returning results (admin-check?) or throwing"
  [ctx checks]
  (let [ctx' (assoc ctx :preloaded-refs (cel/create-preloaded-refs-cache))]
    (doall
     (for [check (cel/eval-programs! ctx' checks)
           :let [{:keys [scope etype result]} check]]
       (if (:admin-check? ctx')
         (-> check
             (dissoc :result)
             (assoc
              :check-result result
              :check-pass?  (boolean result)))
         (ex/assert-permitted! :perms-pass?
                               [etype scope]
                               result))))))

(defn validate-reserved-names!
  "Throws a validation error if the users tries to add triples to the $users table"
  [admin? attrs tx-steps]
  (doseq [tx-step tx-steps
          :let [etype (case (first tx-step)
                        (:add-triple :deep-merge-triple :retract-triple)
                        (let [[_op _eid aid] tx-step]
                          (-> (attr-model/seek-by-id aid attrs)
                              attr-model/fwd-etype))

                        :delete-entity
                        (let [[_op _eid etype] tx-step]
                          etype)

                        nil)]
          :when (and etype
                     (string/starts-with? etype "$")
                     (not (and admin? (= etype "$users")))
                     ;; checking admin? is not enough for $files so we handle
                     ;; validations later
                     (not (string/starts-with? etype "$files")))]
    (ex/throw-validation-err!
     :tx-step
     tx-step
     [{:message (format "The %s namespace is read-only. It can't be modified."
                        etype)}])))

(defn lock-tx-on! [tx-conn big-int]
  (sql/execute! tx-conn ["SELECT pg_advisory_xact_lock(?)" big-int]))

(defn transact!
  "Runs transactions alongside permission checks. The overall flow looks like this:

   1. We take a list of tx-steps (add-attr, delete-attr, add-triple, etc)
   2. We group tx-steps `check` commands.
     a. Multiple `add-triple` commands for the same `eid` will collect into a single
        `check` command
   3. We run queries to get existing data for each `eid` in the transaction.

   Here's the order that checks run:

   1. We run all `update` and `delete` checks first.
   2. Then, we run the actual transaction
   3. Then, we run all the `create` checks.

   We run `create` checks _after_ the transaction, so we can query off of the
   object. For example, if we created a new `post`, we may want a check that says:
   `auth.id in data.ref('creator.id')`"
  [{:keys [db app-id admin? admin-check? admin-dry-run? attrs] :as ctx} tx-steps]
  (tracer/with-span! {:name "permissioned-transaction/transact!"
                      :attributes {:app-id app-id}}
    (validate-reserved-names! admin? attrs tx-steps)
    (next-jdbc/with-transaction [tx-conn (:conn-pool db)]
      (if admin?
        (tx/transact-without-tx-conn! tx-conn attrs app-id tx-steps {})
        (let [optimistic-attrs (tx/optimistic-attrs attrs tx-steps)

              ;; Use the db connection we have so that we don't cause a deadlock
              ;; Also need to be able to read our own writes for the create checks
              ctx'             (assoc ctx
                                      :db {:conn-pool tx-conn}
                                      :attrs optimistic-attrs)

              grouped-tx-steps (tx/preprocess-tx-steps tx-steps tx-conn optimistic-attrs app-id)

              tx-steps'        (->> (apply concat (vals grouped-tx-steps))
                                    (mapify-tx-steps ctx')
                                    (coerce-value-uuids ctx')
                                    (validate-lookup-etypes ctx'))

              ;; If we were really smart, we would fetch the triples and the
              ;; update-delete data-ref dependencies in one go
              entities-map     (load-entities-map ctx' tx-steps')

              tx-steps''       (->> tx-steps'
                                    (resolve-lookups-tx-steps ctx' entities-map))

              entities-map'    (resolve-lookups-entities-map ctx' entities-map)

              updated-entities-map (update-entities-map ctx' entities-map' tx-steps'')

              rule-params-map      (rule-params-map ctx' tx-steps'')

              before-tx-checks        (before-tx-checks ctx' entities-map' updated-entities-map rule-params-map tx-steps'')
              before-tx-check-results (run-checks! ctx' before-tx-checks)

              tx-data              (as-> tx-steps'' %
                                     (map vectorize-tx-step %)
                                     (group-by first %)
                                     (tx/transact-without-tx-conn-impl! tx-conn (:attrs ctx) app-id % {}))

              create-lookups-map   (->> tx-steps''
                                        (map :eid)
                                        (filter lookup-ref?)
                                        (triple-model/fetch-lookups->eid tx-conn app-id))

              after-tx-checks         (after-tx-checks ctx' entities-map' updated-entities-map rule-params-map create-lookups-map tx-steps'')
              after-tx-check-results  (run-checks! ctx' after-tx-checks)

              check-results           (concat before-tx-check-results after-tx-check-results)
              all-checks-ok?          (every? (fn [r] (-> r :check-result)) check-results)
              rollback?               (and admin-check?
                                           (or admin-dry-run?
                                               (not all-checks-ok?)))
              result                  (assoc tx-data
                                             :check-results  check-results
                                             :all-checks-ok? all-checks-ok?
                                             :committed?     (not rollback?))]
          (when rollback?
            (.rollback tx-conn))
          result)))))

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
