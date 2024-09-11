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
   [instant.util.async :as ua]
   [instant.util.exception :as ex]
   [instant.util.io :as io]))

(defn extract-etype [{:keys [attrs]} attr-id]
  (attr-model/fwd-etype (attr-model/seek-by-id attr-id attrs)))

;; --------------
;; Check Commands

(defn tx-change-type [[action]]
  (cond
    (#{:add-triple :deep-merge-triple :retract-triple :delete-entity} action) :object-changes
    (#{:add-attr :delete-attr :update-attr} action) :attr-changes))

(defn action->tx-steps [tx-steps]
  (group-by (fn [[action]]
              (cond
                (#{:add-triple :deep-merge-triple :retract-triple} action) :update
                (#{:delete-entity} action) :delete))
            tx-steps))

(defn ->eid-actions [[eid tx-steps]]
  (let [ac->tx-steps (action->tx-steps tx-steps)]
    (map
     (fn [[action tx-steps]]
       [eid action tx-steps])
     ac->tx-steps)))

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

(defn get-triples [ctx eid]
  (or (-> ctx
          :preloaded-triples
          (get eid))
      (io/tag-io (entity-model/get-triples ctx eid))))

;; Why do we have to decide whether something is an update or a create?
;; When a user makes a transaction, the only option they have currently is to do an `update`:
;; tx.users[id].update({name: "Joe"})
;; It's up to use to decide whether this object existed before or not.
(defn object-upsert-check [{:keys [attrs rules current-user] :as ctx} eid tx-steps]
  (let [triples (map rest tx-steps)
        etype-attr-id (-> triples first second)
        etype (extract-etype ctx etype-attr-id)
        triples (get-triples ctx eid)
        original (entity-model/triples->map ctx triples)
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

(defn object-delete-check [{:keys [rules current-user] :as ctx} eid]
  (let [triples (get-triples ctx eid)
        original (entity-model/triples->map ctx triples)
        etype-attr-id (-> triples first second)
        etype (extract-etype ctx etype-attr-id)
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

(defn object-check [ctx [eid action tx-steps]]
  (condp = action
    :update
    (object-upsert-check ctx eid tx-steps)
    :delete
    (object-delete-check ctx eid)))

(defn object-checks
  "Creates check commands for each object in the transaction.

   We take tx-steps like:
   [
     [:add-triple joe-eid :users/name \"Joe\"]
     [:add-triple joe-eid :users/age 32]
     [:add-triple stopa-eid :users/name \"Stopa\"]
     [:add-triple stopa-eid :users/age 30]
   ]

   And we group them by `eid`.

   {
     joe-eid [[:add-triple joe-eid :users/name \"Joe\"]
              [:add-triple joe-eid :users/age 32]]
     stopa-eid [[:add-triple stopa-eid :users/name \"Stopa\"]
                [:add-triple stopa-eid :users/age 30]]
   }

   With this, we can generate a grouped `check` command for each `eid`."
  [ctx tx-steps]
  (let [eid->tx-steps (group-by second tx-steps)
        eid-actions (mapcat ->eid-actions eid->tx-steps)]
    (->> eid-actions
         (map (partial object-check ctx)))))

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
       (map (partial attr-check ctx))))

(defn get-new-atrrs [attr-changes]
  (->> attr-changes
       (filter (comp #{:add-attr} first))
       (map second)))

(def create-check? (comp #{:create} :action))

(defn get-check-commands [{:keys [attrs] :as ctx} tx-steps]
  (let [{:keys [attr-changes object-changes]} (group-by tx-change-type tx-steps)
        attr-checks (attr-checks ctx attr-changes)
        ;; Why do we need optimistic attrs?
        ;; Consider tx-steps like:
        ;; [
        ;;    [:add-attr {:id goal-attr-id
        ;;                :forward-identity [... "goals" "title"]}]
        ;;    [:add-triple goal-eid goal-attr-id "Hack"]
        ;; ]
        ;; If user 'creates' an attr in the same transaction,
        ;; We need to be able to resolve the attr-id for this `add-triple`
        optmistic-attrs (into attrs (get-new-atrrs attr-changes))
        new-ctx (assoc ctx :attrs optmistic-attrs)
        object-checks (object-checks new-ctx object-changes)]
    (into attr-checks object-checks)))

(defn run-check-commands! [ctx checks]
  (->> checks
       (ua/vfuture-pmap (fn [{:keys [etype action check] :as c}]
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

(defn extract-eids [tx-steps]
  (reduce (fn [acc tx-step]
            (if (= :object-changes (tx-change-type tx-step))
              (conj acc (second tx-step))
              acc))
          #{}
          tx-steps))

(defn preload-triples [ctx tx-steps]
  (let [eids (extract-eids tx-steps)]
    (if (seq eids)
      (entity-model/get-triples-batch ctx eids)
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
  [{:keys [db app-id admin? admin-check? admin-dry-run?] :as ctx} tx-steps]
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
        (lock-tx-on! tx-conn (hash app-id))
        (if admin?
          (tx/transact-without-tx-conn! tx-conn app-id tx-steps)
          (let [
                ;; Use the db connection we have so that we don't cause a deadlock
                ctx (assoc ctx :db {:conn-pool tx-conn})
                preloaded-triples (preload-triples ctx
                                                   tx-steps)
                ctx (assoc ctx :preloaded-triples preloaded-triples)
                check-commands (io/warn-io :check-commands
                                 (get-check-commands ctx tx-steps))
                create-checks (filter create-check? check-commands)
                update-delete-checks (remove create-check? check-commands)

                update-delete-checks-results (io/warn-io :run-check-commands!
                                               (run-check-commands! ctx update-delete-checks))
                tx-data (tx/transact-without-tx-conn! tx-conn app-id tx-steps)

                create-checks-results (io/warn-io :create-check-results
                                        (run-check-commands!
                                         ;; We need to be able to read our own writes.
                                         ;; We can only do this if we query the same connection
                                         (assoc ctx :db {:conn-pool tx-conn})
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
