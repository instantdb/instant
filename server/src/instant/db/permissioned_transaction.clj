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

                  [rev-etype rev-eid] (if (= :delete-entity op)
                                        nil
                                        (when-let [rev-etype (extract-rev-etype ctx aid-or-etype)]
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
                                          :action (case op
                                                    (:add-triple :deep-merge-triple :retract-triple) :update
                                                    :delete-entity :delete
                                                    :rule-params   :rule-params)}]
                                (fnil conj [])
                                tx-step)
                rev-etype (->  (update-in [:groups {:eid rev-eid
                                                    :etype rev-etype
                                                    :action :view}]
                                          (fnil conj [])
                                          tx-step)
                               (update-in [:rule-params-to-copy {:etype etype :eid eid}]
                                          (fnil conj [])
                                          {:etype rev-etype :eid rev-eid})))))

          {:groups {} :rule-params-to-copy {}}
          tx-steps))

(defn before-tx-attr-checks [ctx tx-steps]
  (for [tx-step tx-steps]
    (case (nth tx-step 0)
      :update-attr
      {:scope    :attr
       :action   :update
       :etype    "attrs"
       :program  {:result (:admin? ctx)}}

      :delete-attr
      {:scope    :attr
       :action   :delete
       :etype    "attrs"
       :program  {:result (:admin? ctx)}}

      nil)))

(defn after-tx-attr-checks [ctx tx-steps]
  (for [tx-step tx-steps]
    (case (nth tx-step 0)
      :add-attr
      {:scope    :attr
       :action   :create
       :etype    "attrs"
       :program  (or (rule-model/get-program! (:rules ctx) "attrs" "create")
                     {:result true})
       :bindings {:data (nth tx-step 1)}}

      nil)))

(defn before-tx-object-checks [ctx preloaded-triples]
  (let [{:keys [attrs rules rule-params]} ctx]
    (for [[k v] preloaded-triples
          :let [{:keys [eid etype action]} k
                {:keys [triples tx-steps]} v
                original (entity-model/triples->map ctx triples)]
          :when (seq original)] ;; view/update/delete
      (case action
        :update
        {:scope    :object
         :action   :update
         :etype    etype
         :eid      eid
         :program  (or (rule-model/get-program! rules etype "update")
                       {:result true})
         :bindings {:data        original
                    :new-data    (apply-tx-steps attrs original tx-steps)
                    :rule-params (get rule-params {:eid eid :etype etype})}}

        :delete
        {:scope    :object
         :action   :delete
         :etype    etype
         :eid      eid
         :program  (or (rule-model/get-program! rules etype "delete")
                       {:result true})
         :bindings {:data        original
                    :rule-params (get rule-params {:eid eid :etype etype})}}

        :view
        {:scope    :object
         :action   :view
         :etype    etype
         :eid      eid
         :program  (or (rule-model/get-program! rules etype "view")
                       {:result true})
         :bindings {:data        original
                    :rule-params (get rule-params {:eid eid :etype etype})}}

        nil))))

(defn after-tx-object-checks [ctx preloaded-triples]
  (let [{:keys [attrs rules rule-params]} ctx]
    (for [[k v] preloaded-triples
          :let [{:keys [eid etype action]} k
                {:keys [triples tx-steps]} v
                original (entity-model/triples->map ctx triples)]
          :when (empty? original)] ;; create
      (case action
        :update
        (let [new-data (apply-tx-steps attrs {} tx-steps)]
          {:scope    :object
           :action   :create
           :etype    etype
           :eid      eid
           :program  (or (rule-model/get-program! rules etype "create")
                         {:result true})
           :bindings {:data        new-data
                      :new-data    new-data
                      :rule-params (get rule-params {:eid eid :etype etype})}})

        nil))))

(defn run-checks! [ctx checks]
  (for [check (cel/eval-programs! ctx checks)
        :let [{:keys [scope etype result]} check]]
    (if (:admin-check? ctx)
      (-> check
          (dissoc :result)
          (assoc
           :check-result result
           :check-pass?  (boolean result)))
      (ex/assert-permitted! :perms-pass?
                            [etype scope]
                            result))))

;; ------------
;; Data preload

(defn preload-triples
  "Takes the grouped-changes and returns a map with keys:
     {:eid eid, :etype etype :action action}
   and values
     {:triples  [[eavt] [eavt]]
      :tx-steps [step]}"
  [{:keys [datalog-query-fn attrs] :as ctx} grouped-changes]
  (if (empty? grouped-changes)
    {}
    (let [eids+etypes (distinct
                       (for [[key _] grouped-changes]
                         [(:eid key) (:etype key)]))
          query {:children
                 {:pattern-groups
                  (for [[eid etype] eids+etypes]
                    {:patterns
                     [[:ea eid (attr-model/ea-ids-for-etype etype attrs)]]})}}
          ;; you might be tempted to simplify the query to [[:ea (set eids)]]
          ;; but the eid might be a lookup ref and you won't know how to get
          ;; the join rows for that lookup

          datalog-result (datalog-query-fn ctx query)

          eid+etype->triples (zipmap
                              eids+etypes
                              (map (fn [result]
                                     (->> result
                                          :result
                                          :join-rows
                                          (mapcat identity)))
                                   (:data datalog-result)))]
      (persistent!
       (reduce-kv
        (fn [acc key tx-steps]
          (assoc! acc key {:triples (get eid+etype->triples [(:eid key) (:etype key)])
                           :tx-steps tx-steps}))
        (transient {})
        grouped-changes)))))

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

(defn resolve-check-lookup [lookups->eid check]
  (let [resolve-eid #(resolve-lookup lookups->eid %)]
    (some-> check
            (update :eid resolve-eid)
            (ucoll/update-in-when [:bindings :data "id"] resolve-eid)
            (ucoll/update-in-when [:bindings :new-data "id"] resolve-eid))))

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
    (next-jdbc/with-transaction [tx-conn (:conn-pool db)]
      (if admin?
        (tx/transact-without-tx-conn! tx-conn attrs app-id tx-steps {})
        (let [optimistic-attrs (tx/optimistic-attrs attrs tx-steps)
              grouped-tx-steps (tx/preprocess-tx-steps tx-steps tx-conn optimistic-attrs app-id)
              tx-steps'        (apply concat (vals grouped-tx-steps))

              ;; Use the db connection we have so that we don't cause a deadlock
              ;; Also need to be able to read our own writes for the create checks
              ctx (assoc ctx
                         :db {:conn-pool tx-conn}
                         :attrs optimistic-attrs)

              {grouped-changes :groups
               rule-params-to-copy :rule-params-to-copy}
              (group-object-tx-steps ctx
                                     (concat
                                      (:add-triple grouped-tx-steps)
                                      (:deep-merge-triple grouped-tx-steps)
                                      (:retract-triple grouped-tx-steps)
                                      (:delete-entity grouped-tx-steps)
                                      (:rule-params grouped-tx-steps)))

              ;; If we were really smart, we would fetch the triples and the
              ;; update-delete data-ref dependencies in one go.
              preloaded-triples (preload-triples ctx grouped-changes)

              lookups->eid (lookup->eid-from-preloaded-triples preloaded-triples)

              preloaded-triples (into {}
                                      (for [[k v] preloaded-triples]
                                        [(update k :eid #(get lookups->eid % %)) v]))

              ;; { {:eid <eid>, :etype <etype>} -> params }
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

              before-tx-checks (->>
                                (concat
                                 (before-tx-attr-checks ctx tx-steps')
                                 (before-tx-object-checks ctx preloaded-triples))
                                (mapv #(resolve-check-lookup lookups->eid %)))

              before-tx-checks-results (run-checks!
                                        (assoc ctx :preloaded-refs (cel/create-preloaded-refs-cache))
                                        before-tx-checks)

              tx-data
              (tx/transact-without-tx-conn-impl! tx-conn (:attrs ctx) app-id grouped-tx-steps {})

              ;; update lookups with newly created triples
              create-lookups->eid (some->> (concat
                                            (after-tx-attr-checks ctx tx-steps')
                                            (after-tx-object-checks ctx preloaded-triples)
                                            (keys rule-params))
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

              after-tx-checks (->>
                               (concat
                                (after-tx-attr-checks ctx tx-steps')
                                (after-tx-object-checks ctx preloaded-triples))
                               (mapv #(resolve-check-lookup create-lookups->eid %)))

              after-tx-checks-results (run-checks!
                                       (assoc ctx :preloaded-refs (cel/create-preloaded-refs-cache))
                                       after-tx-checks)

              check-results (concat before-tx-checks-results
                                    after-tx-checks-results)
              all-checks-ok? (every? (fn [r] (-> r :check-result)) check-results)
              rollback? (and admin-check?
                             (or admin-dry-run?
                                 (not all-checks-ok?)))
              result (assoc tx-data
                            :check-results  check-results
                            :all-checks-ok? all-checks-ok?
                            :committed?     (not rollback?))]
          (when rollback? (.rollback tx-conn))
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
