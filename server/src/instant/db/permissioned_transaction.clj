(ns instant.db.permissioned-transaction
  (:require
   [instant.db.model.attr :as attr-model]
   [instant.jdbc.aurora :as aurora]
   [instant.db.transaction :as tx]
   [instant.db.datalog :as d]
   [instant.util.json :refer [<-json ->json]]
   [instant.model.rule :as rule-model]
   [instant.db.model.entity :as entity-model]
   [instant.db.cel :as cel]
   [instant.util.tracer :as tracer]
   [next.jdbc :as next-jdbc]
   [instant.jdbc.sql :as sql]
   [instant.util.exception :as ex]
   [instant.util.io :as io]
   [instant.util.string :as string-util]))

(defn extract-etype [{:keys [attrs]} attr-id]
  (attr-model/fwd-etype (attr-model/seek-by-id attr-id attrs)))

;; --------------
;; Check Commands

(defn tx-change-type [[action]]
  (cond
    (#{:add-triple :deep-merge-triple :retract-triple :delete-entity} action) :object-changes
    (#{:add-attr :delete-attr :update-attr} action) :attr-changes))

(defn tx-object-action-type [[action]]
  (cond
    (#{:add-triple :deep-merge-triple :retract-triple} action) :update
    (#{:delete-entity} action) :delete))

;; Applies a `merge()` patch to a record
;; Analogous to immutableDeepMerge in JS
;; and deep_merge in Postgres
(defn deep-merge-and-delete [orig updates]
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

(comment
  (deep-merge-and-delete {:a {:b 0}} {:a {:b 1} :c 2})
  (deep-merge-and-delete 1 {:a {:b 1} :c 2})
  (deep-merge-and-delete {:a {:b 1} :c 2} 2)
  (deep-merge-and-delete {:a {:b 1} :c 2} nil)
  (deep-merge-and-delete {:a {:b 0}} {:a {:b nil} :c 2}))

(defn apply-tx-steps [attrs original tx-steps]
  (reduce
   (fn [acc [action _e a v]]
     (let [label (-> (attr-model/seek-by-id a attrs) :forward-identity
                     last)
           val (condp = action
                 :deep-merge-triple (deep-merge-and-delete (get acc label) v)
                 :add-triple v
                 :retract-triple nil)]
       (assoc acc label val)))
   original
   tx-steps))

;; Why do we have to decide whether something is an update or a create?
;; When a user makes a transaction, the only option they have currently is to do an `update`:
;; tx.users[id].update({name: "Joe"})
;; It's up to use to decide whether this object existed before or not.
(defn object-upsert-check
  [{:keys [attrs rules current-user] :as ctx} etype eid tx-steps triples]
  (let [original (entity-model/triples->map ctx triples)
        action (if (seq original) "update" "create")
        program (rule-model/get-program! rules etype action)
        action-kw (keyword action)
        new-data (apply-tx-steps attrs original tx-steps)]
    {:scope :object
     :etype (keyword etype)
     :action action-kw
     :eid eid
     :data {:original original
            :updated new-data}
     :program program
     :check (fn [ctx]
              (cond (not program)
                    true
                    (= :create action-kw)
                    (cel/eval-program!
                     program
                     {"auth"
                      (cel/->cel-map (<-json (->json current-user)))
                      "newData"
                      (cel/->cel-map (<-json (->json new-data)))
                      "data"
                      (cel/->cel-map
                       (assoc  (<-json (->json new-data))
                               "_ctx" ctx
                               "_etype" etype))})

                    (= :update action-kw)
                    (cel/eval-program!
                     program
                     {"auth"
                      (cel/->cel-map (<-json (->json current-user)))
                      "data"
                      (cel/->cel-map
                       (assoc  (<-json (->json original))
                               "_ctx" ctx
                               "_etype" etype))
                      "newData"
                      (cel/->cel-map (<-json (->json new-data)))})))}))

(defn object-delete-check [{:keys [rules current-user] :as ctx} etype eid triples]
  (let [original (entity-model/triples->map ctx triples)
        program (when etype
                  (rule-model/get-program! rules etype "delete"))]
    {:scope :object
     :etype (keyword etype)
     :action :delete
     :eid eid
     :program program
     :check (fn [ctx]
              (if-not program
                true
                (cel/eval-program!
                 program
                 {"auth"
                  (cel/->cel-map (<-json (->json current-user)))
                  "data"
                  (cel/->cel-map
                   (assoc  (<-json (->json original))
                           "_ctx" ctx
                           "_etype" etype))})))}))

(defn object-check [ctx etype eid action tx-steps triples]
  (condp = action
    :update
    (object-upsert-check ctx etype eid tx-steps triples)
    :delete
    (object-delete-check ctx etype eid triples)))

(defn group-object-tx-steps
  "Groups tx-steps by etype, eid, and action.

   We take tx-steps like:
   [
     [:add-triple joe-eid :users/name \"Joe\"]
     [:add-triple joe-eid :users/age 32]
     [:add-triple stopa-eid :users/name \"Stopa\"]
     [:add-triple stopa-eid :users/age 30]
   ]

   And we group them by `eid`, `etype`, and `action`.

   {
     {:eid joe-eid
      :etype \"users\"
      :action :update} [[:add-triple joe-eid :users/name \"Joe\"]
                        [:add-triple joe-eid :users/age 32]]
     {:eid stopa-eid
      :etype \"users\"
      :action :update} [[:add-triple stopa-eid :users/name \"Stopa\"]
                        [:add-triple stopa-eid :users/age 30]]
   }"
  [ctx tx-steps]
  (reduce (fn [acc tx-step]
            (let [[action eid aid] tx-step
                  aid-etype (if (= action :delete-entity)
                              aid
                              (extract-etype ctx aid))
                  etype (if (sequential? eid)
                          ;; If it's a lookup ref, use the lookup attr
                          ;; as the etype
                          (let [lookup-etype (extract-etype ctx (first eid))]
                            (when (not lookup-etype)
                              (ex/throw-validation-err!
                               :lookup
                               eid
                               [{:message (string-util/multiline->single-line
                                           "Invalid lookup. Could not determine
                                            namespace from lookup attribute.")
                                 :tx-step tx-step}]))
                            (when (and aid-etype (not= aid-etype lookup-etype))
                              (ex/throw-validation-err!
                               :tx-step
                               tx-step
                               [{:message (string-util/multiline->single-line
                                           "Invalid transaction. The namespace
                                            in the lookup attribute is different
                                            from the namespace of the attribute
                                            that is being set")}]))
                            lookup-etype)
                          aid-etype)
                  ;; If we know the etype from the lookup for delete-entity,
                  ;; but the client hasn't been updated to provide it, then
                  ;; we can patch the `delete-entity` step to include it
                  patched-step (if (and (= action :delete-entity)
                                        (not aid)
                                        etype)
                                 [action eid etype]
                                 tx-step)]
              (update acc
                      {:eid eid
                       :etype etype
                       :action (tx-object-action-type tx-step)}
                      (fnil conj [])
                      patched-step)))
          {}
          tx-steps))

(defn object-checks
  "Creates check commands for each object in the transaction.

   We take tx-steps like:
   [
     [:add-triple joe-eid :users/name \"Joe\"]
     [:add-triple joe-eid :users/age 32]
     [:add-triple stopa-eid :users/name \"Stopa\"]
     [:add-triple stopa-eid :users/age 30]
   ]

   And we group them by `eid`, `etype`, and `action`.

   {
     {:eid joe-eid
      :etype \"users\"
      :action :update} [[:add-triple joe-eid :users/name \"Joe\"]
                        [:add-triple joe-eid :users/age 32]]
     {:eid stopa-eid
      :etype \"users\"
      :action :update} [[:add-triple stopa-eid :users/name \"Stopa\"]
                        [:add-triple stopa-eid :users/age 30]]
   }

   With this, we can generate a grouped `check` command for each `eid+etype`."
  [ctx preloaded-triples]
  (mapv (fn [[{:keys [eid etype action]} {:keys [triples tx-steps]}]]
          (object-check ctx etype eid action tx-steps triples))
        preloaded-triples))

(defn attr-delete-check [{:keys [admin?] :as _ctx} _aid]
  {:scope :attr
   :etype :attrs
   :action :delete
   :check (fn [_ctx]
            admin?)})

(defn attr-update-check [{:keys [admin?] :as _ctx} _aid]
  {:scope :attr
   :etype :attrs
   :type :update
   :check (fn [_ctx]
            admin?)})

(defn attr-create-check [{:keys [current-user rules] :as _ctx} attr]
  (let [program (rule-model/get-program! rules "attrs" "create")]
    {:scope :attr
     :etype :attrs
     :action :create
     :check (fn [_ctx]
              (if-not program
                true
                (cel/eval-program!
                 program
                 {"auth" (cel/->cel-map (<-json (->json current-user)))
                  "data" (cel/->cel-map (<-json (->json attr)))})))}))

(defn attr-check [ctx [action args]]
  (condp = action
    :add-attr
    (attr-create-check ctx args)
    :delete-attr
    (attr-delete-check ctx args)
    :update-attr
    (attr-update-check ctx args)))

(defn attr-checks [ctx tx-steps]
  (->> tx-steps
       (mapv (partial attr-check ctx))))

(defn get-new-attrs [attr-changes]
  (->> attr-changes
       (filter (comp #{:add-attr} first))
       (map second)))

(def create-check? (comp (partial = :create) :action))

(defn optimistic-attrs
  "Why do we need optimistic attrs?
   Consider tx-steps like:
   [
      [:add-attr {:id goal-attr-id
                  :forward-identity [... \"goals\" \"title\"]}]
      [:add-triple goal-eid goal-attr-id \"Hack\"]
   ]
   If user 'creates' an attr in the same transaction,
   We need to be able to resolve the attr-id for this `add-triple`"
  [{:keys [attrs]} attr-changes]
  (into attrs (get-new-attrs attr-changes)))

(defn get-check-commands [ctx attr-changes preloaded-triples]
  (let [attr-checks (attr-checks ctx attr-changes)
        object-checks (object-checks ctx preloaded-triples)]
    (into attr-checks object-checks)))

(defn run-check-commands! [ctx checks]
  (->> checks
       (mapv (fn [{:keys [etype action check] :as c}]
               (let [check-result (check ctx)]
                 (if (:admin-check? ctx)
                   (assoc c
                          :check-result check-result
                          :check-pass? (boolean check-result))
                   (ex/assert-permitted!
                    :perms-pass?
                    [etype action]
                    check-result)))))))

;; ------------
;; Data preload

(defn preload-triples
  "Takes the object changes and returns a map with keys:
     {:eid eid, :etype etype :action action}
   and values
     {:triples [[eavt] [eavt]]
      :tx-steps [step]}

   If the etype isn't provided for deletes, we will resolve it after we
   fetch the triples."
  [ctx object-changes]
  (let [groups (group-object-tx-steps ctx object-changes)
        triples-by-eid+etype (if (seq groups)
                               (entity-model/get-triples-batch ctx (keys groups))
                               {})]
    (reduce (fn [acc [{:keys [eid etype action] :as k} triples]]
              (let [steps (get groups k)]
                (if etype
                  (assoc acc k {:triples triples
                                :tx-steps steps})
                  (let [etype-groups (group-by (fn [[_e a]]
                                                 (extract-etype ctx a))
                                               triples)]
                    (if (empty? etype-groups)
                      (ex/throw-validation-err!
                       :tx-steps
                       steps
                       [{:message "Could not determine the namespace that the transaction belongs to."}])
                      (reduce (fn [acc [etype triples]]
                                (if (not etype)
                                  (ex/throw-validation-err!
                                   :tx-steps
                                   steps
                                   [{:message "Could not determine the namespace that the transaction belongs to."}])
                                  (assoc acc
                                         {:eid eid
                                          :etype etype
                                          :action action}
                                         {:triples triples
                                          :tx-steps steps})))

                              acc
                              etype-groups))))))
            {}
            triples-by-eid+etype)))

(defn extract-refs
  "Extracts a list of refs that can be passed to cel/prefetch-data-refs.
   Returns: [{:etype string path-str string eids #{uuid}}]"
  [check-commands]
  (vals
   (reduce (fn [acc check]
             (if (and (= :object (:scope check))
                      (:program check))
               (let [ref-paths (cel/collect-data-ref-uses (:cel-ast (:program check)))]
                 (reduce (fn [acc path-str]
                           ;; group by etype + ref-path so we can collect all eids
                           ;; for each group
                           (update acc
                                   [(:etype check) path-str]
                                   (fn [ref]
                                     (-> (or ref {:etype (name (:etype check))
                                                  :path-str path-str
                                                  :eids #{}})
                                         (update :eids conj (:eid check))))))
                         acc
                         ref-paths))
               acc))
           {}
           check-commands)))

(defn preload-refs
  "Preloads data for data.ref so that we don't have to make a db call in the cel handler"
  [ctx check-commands]
  (let [refs (extract-refs check-commands)]
    (if (seq refs)
      (cel/prefetch-data-refs ctx refs)
      {})))

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
    (let [{:keys [conn-pool]} db]
      (next-jdbc/with-transaction [tx-conn conn-pool]
        ;; transact does read and then a write.
        ;; We need to protect against a case where a different
        ;; write happens between our read and write.
        ;; To protect against this, we ensure writes for an
        ;; app happen serially. We take an advisory lock on app-id
        ;; when we start transact and we don't release it until
        ;; we are done. This ensures that other transactions
        ;; for this app will wait.
        #_(lock-tx-on! tx-conn (hash app-id))
        (if admin?
          (tx/transact-without-tx-conn! tx-conn app-id tx-steps)
          (let [{:keys [attr-changes object-changes]}
                (group-by tx-change-type tx-steps)

                optimistic-attrs (into attrs (get-new-attrs attr-changes))
                ;; Use the db connection we have so that we don't cause a deadlock
                ;; Also need to be able to read our own writes for the create checks
                ctx (assoc ctx
                           :db {:conn-pool tx-conn}
                           :attrs optimistic-attrs)

                ;; If we were really smart, we would fetch the triples and the
                ;; update-delete data-ref dependencies in one go.
                preloaded-triples (preload-triples ctx object-changes)

                check-commands
                (io/warn-io :check-commands
                  (get-check-commands
                   ctx
                   attr-changes
                   ;; Use preloaded-triples instead of object-changes.
                   ;; It has all the same data, but the preload will also
                   ;; resolve etypes for older version of delete-entity
                   preloaded-triples))

                {create-checks true update-delete-checks false}
                (group-by create-check? check-commands)

                preloaded-update-delete-refs (preload-refs ctx update-delete-checks)

                update-delete-checks-results
                (io/warn-io :run-check-commands!
                            (run-check-commands! (assoc ctx
                                                        :preloaded-refs preloaded-update-delete-refs)
                                                 update-delete-checks))

                tx-data (tx/transact-without-tx-conn! tx-conn app-id tx-steps)

                preloaded-create-refs (preload-refs ctx create-checks)
                create-checks-results (io/warn-io :run-create-check-commands!
                                                  (run-check-commands!
                                                   (assoc ctx :preloaded-refs preloaded-create-refs)
                                                   create-checks))
                all-check-results (concat update-delete-checks-results create-checks-results)
                all-checks-ok? (every? (fn [r] (-> r :check-result)) all-check-results)
                rollback? (and admin-check?
                               (or admin-dry-run? (not all-checks-ok?)))
                result (assoc
                        tx-data
                        :check-results all-check-results
                        :all-checks-ok? all-checks-ok?
                        :committed? (not rollback?))]
            (when rollback? (.rollback tx-conn))
            result))))))

(comment
  (do
    (def colors-app-id  #uuid "b502cabc-11ed-4534-b340-349d46548642")
    (def joe-eid #uuid "3c32701d-f4a2-40e8-b83c-077dd4cb5cec")
    (def app-attrs (attr-model/get-by-app-id aurora/conn-pool colors-app-id))
    (def goal-id-attr (:id (attr-model/seek-by-fwd-ident-name ["goals" "id"] app-attrs)))
    (def goal-creator-id-attr (:id (attr-model/seek-by-fwd-ident-name ["goals" "creatorId"] app-attrs)))
    (def goal-title-attr (:id (attr-model/seek-by-fwd-ident-name ["goals" "title"] app-attrs)))
    (def goal-eid #uuid "5433bb57-a721-4130-9431-9384133b295f")
    (def tx-steps [[:add-triple goal-eid goal-id-attr goal-eid]
                   [:add-triple goal-eid goal-creator-id-attr joe-eid]
                   [:add-triple goal-eid goal-title-attr "Get a job"]]))
  (transact! {:db {:conn-pool aurora/conn-pool}
              :app-id colors-app-id
              :attrs app-attrs
              :current-user {:id joe-eid}
              :rules (rule-model/get-by-app-id aurora/conn-pool {:app-id colors-app-id})
              :datalog-query-fn d/query} tx-steps)

  ;; OG transact
  (tx/transact! aurora/conn-pool colors-app-id tx-steps))
