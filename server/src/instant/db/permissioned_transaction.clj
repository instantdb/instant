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
   [instant.jdbc.sql :as sql]
   [instant.model.rule :as rule-model]
   [instant.util.exception :as ex]
   [instant.util.io :as io]
   [instant.util.string :as string-util]
   [instant.util.tracer :as tracer]
   [instant.util.uuid :as uuid-util]
   [next.jdbc :as next-jdbc]
   [instant.util.coll :as ucoll]
   [instant.db.model.triple :as triple-model]))

(defn extract-etype [{:keys [attrs]} attr-id]
  (attr-model/fwd-etype (attr-model/seek-by-id attr-id attrs)))

(defn extract-rev-etype [{:keys [attrs]} attr-id]
  (attr-model/rev-etype (attr-model/seek-by-id attr-id attrs)))

;; --------------
;; Check Commands

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

(defn apply-lookup-value [obj attrs [action e]]
  (case action
    (:deep-merge-triple :add-triple)
    (if-not (vector? e)
      obj
      (let [[attr-id val] e
            label (-> (attr-model/seek-by-id attr-id attrs)
                      :forward-identity
                      last)]
        (assoc obj label val)))
    obj))

(defn apply-tx-steps [attrs original tx-steps]
  (reduce
   (fn [acc [action _e a v :as tx-step]]
     (let [label (-> (attr-model/seek-by-id a attrs) :forward-identity
                     last)
           val (case action
                 :deep-merge-triple (deep-merge-and-delete (get acc label) v)
                 :add-triple v
                 :retract-triple nil)]
       (-> acc
           (apply-lookup-value attrs tx-step)
           (assoc label val))))
   original
   tx-steps))

(defn object-upsert-check-program [{:keys [action program etype eid data] :as _check}
                                   {:keys [rule-params] :as _ctx}]
  (let [{:keys [original updated]} data
        rule-params (get rule-params {:eid eid :etype etype})]
    (cond
      (not program)
      {:result true}

      (= :create action)
      {:program program
       :bindings {:data updated
                  :new-data updated
                  :rule-params rule-params}}

      (= :update action)
      {:program program
       :bindings {:data original
                  :new-data updated
                  :rule-params rule-params}})))

(defn object-delete-check-program
  [{:keys [program etype eid data] :as _check}
   {:keys [rule-params] :as _ctx}]
  (let [{:keys [original]} data
        rule-params (get rule-params {:eid eid :etype etype})]
    (if-not program
      {:result true}
      {:program program
       :bindings {:data original
                  :rule-params rule-params}})))

(defn object-view-check-program [{:keys [program etype eid data] :as _check}
                                 {:keys [rule-params] :as _ctx}]
  (let [{:keys [original]} data
        rule-params (get rule-params {:eid eid :etype etype})]
    (if-not program
      {:result true}
      {:program program
       :bindings {:data original
                  :rule-params rule-params}})))

(defn attr-create-check-program [{:keys [program data]} _ctx]
  (let [{:keys [updated]} data]
    (if-not program
      {:result true}
      {:program program
       :bindings {:data updated}})))


(defn check-program [{:keys [scope action] :as check} ctx]
  (case [scope action]
    [:object :create] (object-upsert-check-program check ctx)
    [:object :update] (object-upsert-check-program check ctx)
    [:object :delete] (object-delete-check-program check ctx)
    [:object :view]   (object-view-check-program check ctx)
    [:attr   :create] (attr-create-check-program check ctx)
    [:attr   :delete] {:result (:admin? ctx)}
    [:attr   :update] {:result (:admin? ctx)}))


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
  [{:keys [attrs rules] :as ctx} preloaded-triples]
  (->>
   (for [[k v] preloaded-triples
         :let [{:keys [eid etype action]} k
               {:keys [triples tx-steps]} v
               original (entity-model/triples->map ctx triples)]]
     (case action
       ;; update op is used both for create and for update
       :update
       (let [program  (rule-model/get-program! rules etype (if (seq original) "update" "create"))
             new-data (apply-tx-steps attrs original tx-steps)]
         {:scope   :object
          :etype   etype
          :action  (if (seq original) :update :create)
          :eid     eid
          :program program
          :data    {:original original
                    :updated new-data}})

       :delete
       {:scope   :object
        :etype   etype
        :action  :delete
        :eid     eid
        :program (when etype
                   (rule-model/get-program! rules etype "delete"))
        :data    {:original original}}

       :view
       (when (seq original)
         {:scope   :object
          :etype   etype
          :action  :view
          :eid     eid
          :program (rule-model/get-program! rules etype "view")
          :data    {:original original}})

       nil))
   (filterv some?)))

(defn throw-mismatched-lookup-ns! [tx-step]
  (ex/throw-validation-err!
   :tx-step
   tx-step
   [{:message (string-util/multiline->single-line
               "Invalid transaction. The namespace in the lookup attribute is
                different from the namespace of the attribute that is
                being set")}]))

(defn throw-unknown-lookup! [eid tx-step]
  (ex/throw-validation-err!
   :lookup
   eid
   [{:message
     "Invalid lookup. Could not determine namespace from lookup attribute."
     :tx-step tx-step}]))

(defn extract-lookup-etype! [ctx eid aid-etype tx-step]
  ;; If it's a lookup ref, use the lookup attr
  ;; as the etype
  (let [lookup-etype (extract-etype ctx (first eid))]
    (when (not lookup-etype)
      (throw-unknown-lookup! eid tx-step))
    (when (and aid-etype (not= aid-etype lookup-etype))
      (throw-mismatched-lookup-ns! tx-step))
    lookup-etype))

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

   :groups
    {{:eid joe-eid
      :etype \"users\"
      :action :update} [[:add-triple joe-eid :users/name \"Joe\"]
                        [:add-triple joe-eid :users/age 32]]
     {:eid stopa-eid
      :etype \"users\"
      :action :update} [[:add-triple stopa-eid :users/name \"Stopa\"]
                        [:add-triple stopa-eid :users/age 30]] }
   :rule-params-to-copy
   {{:eid joe-id
     :etype \"users\"} [{:eid post-id :etype \"posts\"}]}"
  [ctx tx-steps]
  (reduce (fn [acc tx-step]
            (let [[op eid aid-or-etype value] tx-step
                  aid-etype (case op
                              (:delete-entity :rule-params) aid-or-etype
                              #_else                        (extract-etype ctx aid-or-etype))
                  etype (if (sequential? eid)
                          (extract-lookup-etype! ctx eid aid-etype tx-step)
                          aid-etype)
                  ;; TODO remove
                  _ (when (nil? etype)
                      (binding [tracer/*span* nil]
                        (tracer/record-info!
                         {:name "tx/missing-etype"
                          :attributes {:app-id  (:app-id ctx)
                                       :tx-step tx-step
                                       :stage   "group-object-tx-steps"}})))
                  ;; If we know the etype from the lookup for delete-entity,
                  ;; but the client hasn't been updated to provide it, then
                  ;; we can patch the `delete-entity` step to include it
                  patched-step (if (and (= op :delete-entity)
                                        (not aid-or-etype)
                                        etype)
                                 [op eid etype]
                                 tx-step)

                  [rev-etype rev-eid] (if (= "delete-entity" op)
                                        nil
                                        (when-let [rev-etype (extract-rev-etype ctx aid-or-etype)]
                                          (when (sequential? value)
                                            ;; prevent mismatched etype in the lookup
                                            (extract-lookup-etype! ctx value rev-etype tx-step))
                                          [rev-etype (if (sequential? value)
                                                       value
                                                       (if-let [e (uuid-util/coerce value)]
                                                         e
                                                         (ex/throw-validation-err!
                                                          :eid
                                                          value
                                                          [{:message "Expected link value to be a uuid."
                                                            :hint {:tx-step tx-step}}])))]))]
              (cond-> acc
                true (update-in [:groups {:eid eid
                                          :etype etype
                                          :action (case (first tx-step)
                                                    (:add-triple :deep-merge-triple :retract-triple) :update
                                                    :delete-entity :delete
                                                    :rule-params   :rule-params)}]
                                (fnil conj [])
                                patched-step)
                rev-etype (->  (update-in [:groups {:eid rev-eid
                                                    :etype rev-etype
                                                    :action :view}]
                                          (fnil conj [])
                                          patched-step)
                               (update-in [:rule-params-to-copy {:etype etype :eid eid}]
                                          (fnil conj [])
                                          {:etype rev-etype :eid rev-eid})))))

          {:groups {} :rule-params-to-copy {}}
          tx-steps))

(defn get-new-attrs [attr-changes]
  (->> attr-changes
       (filter (comp #{:add-attr} first))
       (map second)))

(def create-check? (comp (partial = :create) :action))

(defn attr-checks [ctx attr-changes]
  (for [[action args] attr-changes]
    (case action
      :add-attr
      (let [program (rule-model/get-program! (:rules ctx) "attrs" "create")
            attr    args]
        {:scope   :attr
         :etype   "attrs"
         :action  :create
         :program program
         :data    {:updated attr}})

      :delete-attr
      {:scope  :attr
       :etype  "attrs"
       :action :delete}

      :update-attr
      {:scope  :attr
       :etype  "attrs"
       :action :update})))

(defn run-check-commands! [ctx checks]
  (let [{:keys [programs no-programs]}
        (reduce (fn [acc c]
                  (let [program-or-result (check-program c ctx)]
                    (assert (or (contains? program-or-result :result)
                                (contains? program-or-result :program)))
                    (if (contains? program-or-result :result)
                      (assoc-in acc
                                [:no-programs c] program-or-result)
                      (assoc-in acc
                                [:programs c]
                                program-or-result))))
                {:programs {}
                 :no-programs {}}
                checks)
        program-results (cel/eval-programs! ctx programs)]
    (reduce-kv (fn [acc {:keys [etype action] :as c} {:keys [result]}]
                 (conj acc (if (:admin-check? ctx)
                             (assoc c
                                    :check-result result
                                    :check-pass? (boolean result))
                             (ex/assert-permitted! :perms-pass?
                                                   [etype action]
                                                   result))))
               []
               (merge program-results
                      no-programs))))

;; ------------
;; Data preload

(defn preload-triples
  "Takes the grouped changes and returns a map with keys:
     {:eid eid, :etype etype :action action}
   and values
     {:triples [[eavt] [eavt]]
      :tx-steps [step]}

   If the etype isn't provided for deletes, we will resolve it after we
   fetch the triples."
  [ctx groups]
  (let [triples-by-eid+etype (if (seq groups)
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

(defn lookup->eid-from-preloaded-triples [preloaded-triples]
  (reduce
   (fn [acc [{:keys [eid]} {:keys [triples]}]]
     (if (and (vector? eid) (seq triples))
       (assoc acc eid (ffirst triples))
       acc))
   {}
   preloaded-triples))

(defn resolve-lookup [lookups->eid eid]
  (clojure+/cond+
   (not (sequential? eid))
   eid

   :let [found (lookups->eid eid)]

   (nil? found)
   (ex/throw-validation-err! :lookup eid [{:message "Could not find the entity for this lookup"}])

   :else
   found))

(defn resolve-check-lookup [lookups->eid {:keys [eid] :as check}]
  (let [resolved-eid (resolve-lookup lookups->eid eid)]
    (-> check
        (assoc :eid resolved-eid)
        (ucoll/assoc-in-when [:data :updated "id"] resolved-eid))))

(defn resolve-lookups-for-create-checks [tx-conn app-id checks]
  (let [lookups (->> checks
                     (map :eid)
                     (filter sequential?))
        lookups->eid (triple-model/fetch-lookups->eid tx-conn app-id lookups)]
    (mapv #(resolve-check-lookup lookups->eid %) checks)))

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
    (let [{:keys [conn-pool]} db]
      (next-jdbc/with-transaction [tx-conn conn-pool]
        (if admin?
          (tx/transact-without-tx-conn! tx-conn attrs app-id tx-steps)
          (let [grouped-tx-steps (tx/preprocess-tx-steps tx-conn attrs app-id tx-steps)

                attr-changes     (concat
                                  (:add-attr grouped-tx-steps)
                                  (:delete-attr grouped-tx-steps)
                                  (:update-attr grouped-tx-steps))

                object-changes   (concat
                                  (:add-triple grouped-tx-steps)
                                  (:deep-merge-triple grouped-tx-steps)
                                  (:retract-triple grouped-tx-steps)
                                  (:delete-entity grouped-tx-steps))

                optimistic-attrs (into attrs (map second) (:add-attr grouped-tx-steps))

                ;; Use the db connection we have so that we don't cause a deadlock
                ;; Also need to be able to read our own writes for the create checks
                ctx (assoc ctx
                           :db {:conn-pool tx-conn}
                           :attrs optimistic-attrs)

                {grouped-changes :groups
                 rule-params-to-copy :rule-params-to-copy}
                (group-object-tx-steps ctx
                                       (concat object-changes (:rule-params grouped-tx-steps)))

                ;; If we were really smart, we would fetch the triples and the
                ;; update-delete data-ref dependencies in one go.
                preloaded-triples (preload-triples ctx grouped-changes)

                check-commands
                (io/warn-io :check-commands
                  (concat
                   (attr-checks ctx attr-changes)
                   ;; Use preloaded-triples instead of object-changes.
                   ;; It has all the same data, but the preload will also
                   ;; resolve etypes for older version of delete-entity
                   (object-checks ctx preloaded-triples)))

                {create-checks :create
                 view-checks :view
                 update-checks :update
                 delete-checks :delete}
                (group-by :action check-commands)

                lookups->eid (lookup->eid-from-preloaded-triples preloaded-triples)

                user-rule-params (reduce
                                  (fn [acc [_ eid etype params]]
                                    (let [eid (get lookups->eid eid eid)
                                          key {:eid eid, :etype etype}]
                                      (update acc key merge params)))
                                  {}
                                  (:rule-params grouped-tx-steps))

                rule-params (->> rule-params-to-copy
                                 (mapcat (fn [[source dests]]
                                           (for [dest dests] [source dest])))
                                 (reduce (fn [acc [source dest]]
                                           (let [source (update source :eid
                                                                (fn [eid] (get lookups->eid eid eid)))

                                                 dest (update dest :eid
                                                              (fn [eid] (get lookups->eid eid eid)))]

                                             (update acc dest merge (get acc source {}))))
                                         user-rule-params))

                ctx (assoc ctx :rule-params rule-params)

                before-tx-checks-resolved
                (mapv #(resolve-check-lookup lookups->eid %) (concat update-checks
                                                                     delete-checks
                                                                     view-checks))

                before-tx-checks-results
                (run-check-commands! (assoc ctx
                                            :preloaded-refs (cel/create-preloaded-refs-cache))
                                     before-tx-checks-resolved)

                tx-data
                (tx/transact-without-tx-conn-impl! tx-conn (:attrs ctx) app-id grouped-tx-steps {})

                ;; update lookups with newly created triples
                create-lookups->eid (some->> (concat create-checks (keys rule-params))
                                             (map :eid)
                                             (filter sequential?)
                                             not-empty
                                             set
                                             (triple-model/fetch-lookups->eid tx-conn app-id))
                rule-params (ucoll/map-keys
                             (fn [{:keys [eid etype]}]
                               {:eid   (get create-lookups->eid eid eid)
                                :etype etype})
                             rule-params)
                ctx (assoc ctx :rule-params rule-params)

                after-tx-checks-resolved (mapv #(resolve-check-lookup create-lookups->eid %) create-checks)
                after-tx-checks-results (run-check-commands!
                                         (assoc ctx :preloaded-refs (cel/create-preloaded-refs-cache))
                                         after-tx-checks-resolved)
                all-check-results (concat before-tx-checks-results
                                          after-tx-checks-results)
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
