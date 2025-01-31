(ns instant.reactive.store
  "In-memory store that tracks all data for active sessions.

   Serves the following purposes:

   1. Invalidation. Given a mutation, the store can find relevant data to
      refresh.

   2. Caching. Datalog queries can be shared across instaql queries.
      By caching datalog results we improve perf.

   3. Novelty. By storing instaql query results we can compute changesets to
      send to clients

   4. Metadata. Sessions have auth, sockets, and other misc data for handling
      events across the lifetime of a session"
  (:require
   [clojure.string :as string]
   [datascript.core :as d]
   [instant.jdbc.sql :as sql]
   [instant.lib.ring.websocket :as ws]
   [instant.util.async :as ua]
   [instant.util.coll :as ucoll]
   [instant.util.exception :as ex]
   [instant.util.tracer :as tracer])
  (:import
   (java.lang InterruptedException)
   (java.util.concurrent CancellationException)))

(declare store-conn)

;; See (deftype Store) at bottom for implementation
;; XXX: move defprotocol here

(def tx-meta-lookup 0)

(def
  ^{:doc
    "The schema for the datascript store.
     The schema isn't enforced, except for :db/valueType, :db/index,
     :db/cardinality, and :db/tupleAttrs. There may be added fields.
     The :db/type field is purely cosmetic."}
  schema
  {:session/id {:db/unique :db.unique/identity}
   :session/socket {} ;; socket (from session.clj)
   :session/auth {} ;; {:app app :user user :admin? admin?} (from session.clj)
   :session/creator {} ;; user (from session.clj)
   :session/versions {} ;; library versions, e.g. {"@instantdb/react": "v0.1.2"}
   :session/datalog-loader {} ;; datalog-loader (from datalog.clj)

   ;; XXX: There are probably some lookups in here that I need to fix with db/unique
   :tx-meta/processed-tx-id {:db/type :db.type/integer}
   ;; unique key so that we can ensure there's only a single row
   :tx-meta/lookup {:db/type :db.type/integer
                    :db/unique :db.unique/identity}

   :instaql-query/query {:db/index true}
   :instaql-query/session-id {:db/type :db.type/uuid
                              :db/index true}
   :instaql-query/stale? {:db/type :db.type/boolean}
   :instaql-query/version {:db/type :db.type/integer}
   :instaql-query/hash {:db/type :db.type/number}
   ;; This would be easier if we had a store per app
   :instaql-query/session-id+query
   {:db/tupleAttrs [:instaql-query/session-id :instaql-query/query]
    :db/unique :db.unique/identity}
   :instaql-query/return-type {} ;; :join-rows or :tree

   :subscription/session-id {:db/index true
                             :db/type :db.type/uuid}
   :subscription/instaql-query {:db/index true
                                :db/valueType :db.type/ref}
   :subscription/datalog-query {:db/index true
                                :db/valueType :db.type/ref}
   :subscription/v {:db/type :db.type/integer}

   :datalog-query/query {:db/index true} ;; datalog patterns (from datalog.clj)

   :datalog-query/delayed-call {} ;; delay with datalog result (from query.clj)
   :datalog-query/topics {:db/type :db.type/list-of-topics}})

;; -----
;; misc

(defn missing-session? [{:keys [error entity-id]}]
  (and (= :entity-id/missing error)
       (coll? entity-id)
       (= :session/id (first entity-id))))

(defn translate-datascript-exceptions [exinfo]
  (let [{:keys [entity-id] :as data} (ex-data exinfo)]
    (if (missing-session? data)
      (ex/throw-session-missing! (last entity-id))
      (throw exinfo))))

(defn transact! [span-name conn tx-data]
  (let [t0 (System/nanoTime)]
    (tracer/with-span! {:name span-name}
      (let [t1 (System/nanoTime)]
        (try
          (locking conn
            (let [t2  (System/nanoTime)
                  ret (d/transact! conn tx-data)
                  t3  (System/nanoTime)]
              (tracer/add-data! {:attributes {:changed-datoms-count (count (:tx-data ret))
                                              :span-time-ms         (-> t1 (- t0) (/ 1000000) double)
                                              :lock-time-ms         (-> t2 (- t1) (/ 1000000) double)
                                              :tx-time-ms           (-> t3 (- t2) (/ 1000000) double)
                                              :db-before-size       (count (:db-before ret))
                                              :db-after-size        (count (:db-after ret))}})
              ret))
          (catch clojure.lang.ExceptionInfo e
            (translate-datascript-exceptions e)))))))

;; -----
;; reports

;; XXX: reports
(defn auth-and-creator-attrs [auth creator]
  {:app-title (-> auth :app :title)
   :app-id (-> auth :app :id)
   :app-user-email (-> auth :user :email)
   :creator-email (-> creator :email)})

(defn report-active-sessions [db]
  (->> (d/datoms db :aevt :session/id)
       (map (fn [{:keys [e]}]
              (let [ent (d/entity db e)]
                (assoc (auth-and-creator-attrs (:session/auth ent)
                                               (:session/creator ent))
                       :session-id (:session/id ent)))))))

(comment
  (report-active-sessions @store-conn))

;; -----
;; auth

(defn- -get-auth [db sess-id]
  (:session/auth (d/entity db [:session/id sess-id])))

;; ------
;; creator

(defn- -get-creator [db sess-id]
  (:session/creator (d/entity db [:session/id sess-id])))

;; -------------
;; session props

(defn- -set-session-props! [conn sess-id {:keys [creator
                                                 auth
                                                 versions]}]
  (transact! "store/set-session-props"
             conn
             (concat
              [[:db/add [:session/id sess-id] :session/auth auth]
               [:db/add [:session/id sess-id] :session/creator creator]]
              (when versions
                [[:db/add [:session/id sess-id] :session/versions versions]]))))

(defn- -get-versions [db sess-id]
  (:session/versions (d/entity db [:session/id sess-id])))

;; -----
;; tx-id

(defn- -get-processed-tx-id [db]
  (:tx-meta/processed-tx-id (d/entity db [:tx-meta/lookup tx-meta-lookup])))

;; ------
;; instaql queries

(defn- -get-stale-instaql-queries [db sess-id]
  (->> (d/datoms db :avet :instaql-query/session-id sess-id)
       (keep (fn [{:keys [e]}]
               (let [ent (d/entity db e)]
                 (when (:instaql-query/stale? ent)
                   ent))))))

(defn- bump-instaql-version-tx-data
  "Should be used in a db.fn/call. Returns transactions.
   Bumps the query version and marks query as not stale, creating the query
   if needed."
  [db lookup-ref session-id instaql-query return-type]
  (if-let [existing (d/entity db lookup-ref)]
    [[:db/add
      (:db/id existing)
      :instaql-query/version
      (inc (or (:instaql-query/version existing)
               0))]
     [:db/add (:db/id existing) :instaql-query/stale? false]]

    [{:instaql-query/session-id session-id
      :instaql-query/query instaql-query
      :instaql-query/stale? false
      :instaql-query/version 1
      :instaql-query/return-type return-type}]))

(defn- -bump-instaql-version! [conn sess-id q return-type]
  (let [lookup-ref [:instaql-query/session-id+query [sess-id q]]
        {:keys [db-after]}
        (transact! "store/bump-instaql-version!"
                   conn
                   [[:db.fn/call bump-instaql-version-tx-data lookup-ref sess-id q return-type]])]

    (:instaql-query/version (d/entity db-after lookup-ref))))

;; ----
;; remove instaql queries

(defn- remove-subscriptions-tx-data
  "Should be used in a db.fn/call. Returns transactions.
   Retracts the instaql-query and subscriptions for the query."
  [db session-id instaql-query]
  (if-let [query-eid (d/entid db [:instaql-query/session-id+query [session-id instaql-query]])]
    (conj (map (fn [datom]
                 [:db/retractEntity (:e datom)])
               (d/datoms db :avet :subscription/instaql-query query-eid))
          [:db/retractEntity query-eid])
    []))

;; TODO: We could do this in the background by listening to transactions
;;       and noticing whenever we remove a reference to a datalog entry
(defn- clean-stale-datalog-tx-data
  "Should be used in a db.fn/call. Returns transactions.
   Retracts datalog queries that are no longer referenced in any subscriptions."
  [db]
  (let [datalog-eids (d/datoms db :aevt :datalog-query/app-id)
        stale-datalog-eids (remove (fn [{:keys [e]}]
                                     (d/datoms db :avet :subscription/datalog-query e))
                                   datalog-eids)]
    (map (fn [[e]] [:db/retractEntity e]) stale-datalog-eids)))

(defn- -remove-query! [conn sess-id q]
  (transact! "store/remove-query!"
             conn
             [[:db.fn/call remove-subscriptions-tx-data sess-id q]
              [:db.fn/call clean-stale-datalog-tx-data]]))

;; --------------
;; adding queries

(defn- clean-stale-subscriptions-tx-data
  "Should be used in a db.fn/call. Returns transactions.
   Retracts subscriptions for an older version of an instaql query."
  [db instaql-query-lookup-ref version]
  (if-let [query-eid (d/entid db instaql-query-lookup-ref)]
    (keep (fn [datom]
            (let [sub-version (:v (d/find-datom db :eavt (:e datom) :subscription/v))]
              (when (or (not sub-version)
                        (< sub-version version))
                [:db/retractEntity (:e datom)])))
          (d/datoms db :avet :subscription/instaql-query query-eid))
    []))

(defn- set-instaql-query-result-tx-data
  "Should be used in a db.fn/call. Returns transactions.
   Sets the hash for the query result."
  [db lookup-ref result-hash]
  (if-let [e (d/entid db lookup-ref)]
    [[:db/add e :instaql-query/hash result-hash]]
    []))

(defn- -add-instaql-query! [conn {:keys [session-id instaql-query v] :as _ctx} result-hash]
  (let [lookup-ref [:instaql-query/session-id+query [session-id instaql-query]]
        {:keys [db-before db-after] :as res}
        (transact! "store/add-instaql-query!"
                   conn
                   [[:db.fn/call clean-stale-subscriptions-tx-data lookup-ref v]
                    [:db.fn/call clean-stale-datalog-tx-data]
                    [:db.fn/call set-instaql-query-result-tx-data lookup-ref result-hash]])

        hash-before (:instaql-query/hash (d/entity db-before lookup-ref))
        hash-after (:instaql-query/hash (d/entity db-after lookup-ref))
        result-changed? (or (not= hash-before hash-after)
                            (and (nil? hash-before)
                                 (nil? hash-after)))]
    (assoc res :result-changed? result-changed?)))

;; ------
;; session

(defn- -get-session [db sess-id]
  (d/entity db [:session/id sess-id]))

(defn- -get-session-instaql-queries [db sess-id]
  (->> (d/q '{:find [?q]
              :in [$ ?session-id]
              :where [[?e :instaql-query/session-id ?session-id]
                      [?e :instaql-query/query ?q]]}
            db
            sess-id)
       (map first)
       set))

(defn- remove-session-queries-tx-data
  "Should be used in a db.fn/call. Returns transactions.
   Retracts queries for the session."
  [db session-id]
  (map (fn [{:keys [e]}] [:db/retractEntity e])
       (d/datoms db :avet :instaql-query/session-id session-id)))

(defn- remove-session-subscriptions-tx-data
  "Should be used in a db.fn/call. Returns transactions.
   Retracts subscriptions for the session."
  [db session-id]
  (map (fn [{:keys [e]}] [:db/retractEntity e])
       (d/datoms db :avet :subscription/session-id session-id)))

(defn- -remove-session! [conn sess-id]
  (transact! "store/remove-session!"
             conn
             [[:db.fn/retractEntity [:session/id sess-id]]
              [:db.fn/call remove-session-queries-tx-data sess-id]

              ;; remove subscriptions for session
              [:db.fn/call remove-session-subscriptions-tx-data sess-id]

              ;; remove datalog-queries that are no longer in use
              [:db.fn/call clean-stale-datalog-tx-data]]))

;; ------
;; socket

(defn -get-socket [db sess-id]
  (-> (d/entity db [:session/id sess-id])
      :session/socket))

(defn -add-socket! [conn sess-id socket]
  (transact! "store/add-socket!"
             conn
             [{:session/id sess-id
               :session/socket socket}]))

;; ------
;; datalog cache

;; XXX: FIX
(defn swap-datalog-cache! [conn app-id datalog-query-fn ctx datalog-query]
  (let [lookup-ref [:datalog-query/app-id+query [app-id datalog-query]]
        watcher-id (Object.)
        this-result-delay (atom { ;; Promise holds the result of the query
                                 :promise (promise)
                                 ;; Watchers keep track of who started listening
                                 ;; while the query was running, so that we can
                                 ;; safely cancel the query if all listeners cancel
                                 :watchers #{watcher-id}
                                 :cancel-signal (promise)
                                 :aborted? false})
        {:keys [db-after]}
        (transact! "store/swap-datalog-cache!"
                   conn
                   [[:db.fn/call
                     (fn [db]
                       (if-let [existing (d/entity db lookup-ref)]
                         (if (not (:datalog-query/delayed-call existing))
                           [[:db/add
                             (:db/id existing)
                             :datalog-query/delayed-call this-result-delay]]
                           (let [{:keys [watchers]}
                                 (swap! (:datalog-query/delayed-call existing)
                                        (fn [state]
                                          (if (:aborted? state)
                                            state
                                            (update state :watchers conj watcher-id))))]
                             (when-not (contains? watchers watcher-id)
                               [[:db/add
                                 (:db/id existing)
                                 :datalog-query/delayed-call this-result-delay]])))
                         [{:datalog-query/app-id app-id
                           :datalog-query/query datalog-query
                           :datalog-query/delayed-call this-result-delay}]))]])
        result-delay (:datalog-query/delayed-call (d/entity db-after lookup-ref))
        unwrap-result (fn []
                        (let [res @(:promise @result-delay)]
                          (assert (:result res) "Missing result")
                          (if (:ok res)
                            (:result res)
                            (throw (:result res)))))
        cancel! (fn []
                  (tracer/with-span! {:name "store/datalog-query-cancel!"}
                    (deliver (:cancel-signal @result-delay) true)))]

    (tracer/add-data! {:attributes {:cache-hit (not= this-result-delay result-delay)
                                    :realized (realized? (:promise @result-delay))}})

    (when (= this-result-delay result-delay)
      ;; We added it, so we must execute it
      (let [stmt-tracker (sql/make-top-level-statement-tracker)
            result-promise (:promise @result-delay)
            work-fut (binding [ua/*child-vfutures* nil ;; Move future to a new "call-stack"
                               ;; Don't let our statements get canceled
                               sql/*in-progress-stmts* stmt-tracker]
                       (ua/vfuture
                         (try
                           (deliver result-promise
                                    {:ok true
                                     :result (datalog-query-fn ctx
                                                               datalog-query)})
                           (catch Throwable t
                             (deliver result-promise
                                      {:ok false
                                       :result t}))
                           (finally
                             ;; noop if we already delivered
                             (deliver result-promise
                                      {:ok false
                                       :result
                                       (Exception. "Did not deliver promise!")})
                             (deliver (:cancel-signal @result-delay)
                                      false)))))
            _cancel-fut (binding [ua/*child-vfutures* nil]
                          (ua/vfuture
                            (when @(:cancel-signal @result-delay)
                              (sql/cancel-in-progress stmt-tracker)
                              (future-cancel work-fut))))]))
    (try
      (if (realized? (:promise @result-delay))
        ;; The work is already done, so we don't need to listen for cancellation
        (unwrap-result)
        ;; Start a tracked future to watch for cancelation
        (let [wait-fut (ua/vfuture (unwrap-result))]
          (try
            @wait-fut
            (catch Throwable t
              (when (and (not (realized? (:promise @result-delay)))
                         (or (instance? InterruptedException t)
                             (instance? CancellationException t)))
                (let [{:keys [aborted?]}
                      (swap! result-delay
                             (fn [{:keys [watchers] :as state}]
                               (let [new-watchers (disj watchers watcher-id)]
                                 (cond-> state
                                   true (assoc :watchers new-watchers)
                                   (empty? new-watchers) (assoc :aborted? true)))))]

                  (when aborted?
                    (cancel!))))
              (throw t)))))
      (finally
        (swap! result-delay update :watchers disj watcher-id)))))

;; --------------
;; datalog loader

(defn- -upsert-datalog-loader! [conn sess-id make-loader-fn]
  (if-let [loader (:session/datalog-loader (d/entity @conn [:session/id sess-id]))]
    loader
    (let [{:keys [db-after]}
          (transact! "store/upsert-datalog-loader!"
                     conn
                     [[:db.fn/call
                       (fn [db]
                         (when-not (first (d/datoms db
                                                    :eavt
                                                    [:session/id sess-id]
                                                    :session/datalog-loader))
                           [[:db/add
                             [:session/id sess-id]
                             :session/datalog-loader
                             (make-loader-fn)]]))]])]
      (:session/datalog-loader (d/entity db-after [:session/id sess-id])))))

;; ------
;; subscriptions

;; XXX: fix
(defn record-datalog-query-start! [conn ctx datalog-query coarse-topics]
  (let [lookup-ref [:datalog-query/app-id+query [(:app-id ctx) datalog-query]]
        query-lookup-ref [:instaql-query/session-id+query [(:session-id ctx)
                                                           (:instaql-query ctx)]]]
    (transact! "store/record-datalog-query-start!"
               conn
               [[:db.fn/call
                 (fn [db]
                   (let [existing-datalog-query (d/entity db lookup-ref)
                         datalog-query-eid (or (:db/id existing-datalog-query)
                                               -1)
                         datalog-query-txes
                         (if existing-datalog-query
                           (when-not (:datalog-query/topics existing-datalog-query)
                             [[:db/add datalog-query-eid :datalog-query/topics coarse-topics]])
                           [{:db/id datalog-query-eid
                             :datalog-query/app-id (:app-id ctx)
                             :datalog-query/query datalog-query
                             :datalog-query/topics coarse-topics}])
                         subscription-txes
                         (when-let [query-eid (d/entid db query-lookup-ref)]
                           [{:subscription/app-id (:app-id ctx)
                             :subscription/session-id (:session-id ctx)
                             :subscription/v (:v ctx)
                             :subscription/instaql-query query-eid
                             :subscription/datalog-query datalog-query-eid}])]
                     (into datalog-query-txes subscription-txes)))]])))

(defn- -record-datalog-query-finish!
  [conn datalog-query topics]
  (let [lookup-ref [:datalog-query/query datalog-query]]
    (transact!
     "store/record-datalog-query-finish!"
     conn
     [[:db.fn/call
       (fn [db]
         (if-let [existing (d/entity db lookup-ref)]
           [[:db/add (:db/id existing) :datalog-query/topics topics]]
           [{:datalog-query/query datalog-query
             :datalog-query/topics topics}]))]])))

;; ------
;; invalidation

(defn intersects?
  "Like (not (empty? (set/intersection set-a set-b))), but it returns early
   instead of calculating the full intersection."
  [set-a set-b]
  (let [[big small] (if (> (count set-a) (count set-b))
                      [set-a set-b]
                      [set-b set-a])]
    (reduce (fn [_ item]
              (if (contains? big item)
                (reduced true)
                false))
            false
            small)))

(defn make-like-match? [case-insensitive? text pattern]
  (let [regex-pattern (-> pattern
                          (string/replace "_" ".")
                          (string/replace "%" ".*")
                          (#(str (when case-insensitive?
                                   "(?i)")
                                 "^"
                                 %
                                 "$")))]
    (re-matches (re-pattern regex-pattern) text)))

(def like-match? (partial make-like-match? false))
(def ilike-match? (partial make-like-match? true))

(defn- match-topic-part? [iv-part dq-part]
  (cond
    (keyword? iv-part)
    (= iv-part dq-part)

    (or (symbol? dq-part) (symbol? iv-part))
    true

    (set? dq-part)
    (intersects? iv-part dq-part)

    (map? dq-part)
    (if-some [{:keys [op value]} (:$comparator dq-part)]
      (let [f (case op
                :$gt >
                :$gte >=
                :$lt <
                :$lte <=
                :$like like-match?
                :$ilike ilike-match?)]
        (ucoll/seek (fn [v]
                      (f v value))
                    iv-part))
      (when (contains? dq-part :$not)
        (let [not-val (:$not dq-part)]
          (ucoll/seek (partial not= not-val) iv-part))))))

(defn match-topic?
  [[iv-idx iv-e iv-a iv-v]
   [dq-idx dq-e dq-a dq-v]]
  (and
   (match-topic-part? iv-idx dq-idx)
   (match-topic-part? iv-e   dq-e)
   (match-topic-part? iv-a   dq-a)
   (match-topic-part? iv-v   dq-v)))

(defn matching-topic-intersection? [iv-topics dq-topics]
  (ucoll/seek
   (fn [iv-topic]
     (ucoll/seek
      (fn [dq-topic]
        (match-topic? iv-topic dq-topic))
      dq-topics))
   iv-topics))

(defn- mark-instaql-queries-stale-tx-data
  "Should be used in a db.fn/call. Returns transactions.
   Marks instaql-queries that have subscriptions that reference the datalog
   query stale."
  [db datalog-query-eids]
  (persistent!
   (reduce
    (fn [txes datalog-query-eid]
      (reduce
       (fn [txes sub-datom]
         (if-let [instaql-query-eid (:v (d/find-datom db
                                                      :aevt
                                                      :subscription/instaql-query
                                                      (:e sub-datom)))]
           (conj! txes [:db/add instaql-query-eid :instaql-query/stale? true])
           txes))
       txes
       (d/datoms db :avet :subscription/datalog-query datalog-query-eid)))
    (transient [])
    datalog-query-eids)))

(defn- set-tx-id
  "Should be used in a db.fn/call. Returns transactions.
   Sets the processed-tx-id to the max of the given value and current value."
  [db tx-id]
  (let [lookup [:tx-meta/lookup tx-meta-lookup]]
    (if-let [current (:tx-meta/processed-tx-id (d/entity db lookup))]
      [[:db/add lookup :tx-meta/processed-tx-id (max current tx-id)]]
      [{:tx-meta/lookup tx-meta-lookup
        :tx-meta/processed-tx-id tx-id}])))

(defn- mark-datalog-queries-stale!
  "Stale-ing a datalog query has the following side-effects:
   1. Removes the datalog query from the datalog-cache
   2. Marks associated instaql entries as stale
   3. Updates store's latest processed tx-id for the app-id"
  [conn tx-id datalog-query-eids]
  (transact!
   "store/mark-datalog-queries-stale!"
   conn
   (list* [:db.fn/call set-tx-id tx-id]

          [:db.fn/call mark-instaql-queries-stale-tx-data datalog-query-eids]

          (mapv (fn [e] [:db.fn/retractEntity e]) datalog-query-eids))))

(defn- get-datalog-queries-for-topics [db iv-topics]
  (->> (d/datoms db :avet :datalog-query/topics)
       (keep (fn [datom]
               (when-let [dq-topics (:v datom)]
                 (when (matching-topic-intersection? iv-topics dq-topics)
                   (:e datom)))))))

(defn- -mark-stale-topics!
  "Given topics, invalidates all relevant datalog qs and associated instaql queries.

  Returns affected session-ids"
  [conn tx-id topics]
  (let [datalog-query-eids (get-datalog-queries-for-topics @conn topics)

        {:keys [db-before db-after]}
        (mark-datalog-queries-stale! conn
                                     tx-id
                                     datalog-query-eids)

        session-ids (d/q '{:find [?session-id]
                           :in [$ [?datalog-query ...]]
                           :where [[?e :subscription/datalog-query ?datalog-query]
                                   [?e :subscription/session-id ?session-id]]}
                         db-before
                         datalog-query-eids)]
    [db-after (map first session-ids)]))

;; ------------
;; Test Helpers

(defn get-datalog-cache-for-app [db app-id]
  (->> (d/q '{:find [?query ?result]
              :in [$ ?app-id]
              :where [[?e :datalog-query/app-id ?app-id]
                      [?e :datalog-query/query ?query]
                      [?e :datalog-query/delayed-call ?result]]}
            db
            app-id)
       (into {})))

(defn- format-subscription [ent]
  {:app-id (:subscription/app-id ent)
   :datalog-query (:datalog-query/query (:subscription/datalog-query ent))
   :instaql-query (:instaql-query/query (:subscription/instaql-query ent))
   :session-id (:subscription/session-id ent)
   :v (:subscription/v ent)})

(defn get-subscriptions-for-app-id [db app-id]
  (let [res (d/q '{:find [?e]
                   :in [$ ?app-id]
                   :where [[?e :subscription/app-id ?app-id]]}
                 db
                 app-id)]
    (->> res
         (map (comp format-subscription (partial d/entity db) first)))))

;; -----------------
;; Websocket Helpers

(defn send-event! [conn app-id sess-id event]
  (let [{:keys [ws-conn]} (get-socket conn app-id sess-id)]
    (when-not ws-conn
      (ex/throw-socket-missing! sess-id))
    (try
      (ws/send-json! app-id event ws-conn)
      (catch java.io.IOException e
        (ex/throw-socket-error! sess-id e)))))

(defn try-send-event!
  "Does a best-effort send. If it fails, we record and swallow the exception"
  [conn app-id sess-id event]
  (try
    (send-event! conn app-id sess-id event)
    (catch Exception e
      (tracer/with-span! {:name "rs/try-send-event-swallowed-err"}
        (tracer/record-exception-span!
         e
         {:name "rs/try-send-event-err"
          :attributes {:event (str event)
                       :escaping? false}})))))

;; -----
;; start

(defn init-store []
  (d/create-conn schema))

(defn start []
  (tracer/record-info! {:name "store/start"})
  (def store-conn (init-store)))

(defn stop []
  (tracer/record-info! {:name "store/reset"})
  (d/reset-conn! store-conn @(d/create-conn schema)))

(defn restart []
  (stop)
  (start))

;; -------------
;; Configuration

;; XXX: Figure out some way to remove apps
(defn- -conn-for-app [state app-id]
  (if-let [conn (get @state app-id)]
    conn
    (let [new-conn (d/create-conn schema)
          new-state (swap! state update app-id (fn [conn] (or conn new-conn)))]
      (get new-state app-id))))

(defprotocol IStore
  (conn-for-app! [this app-id])
  (app-id-for-session [this sess-id]
    "Used when you have a session id, but no app id.
     Can be deprecated when all clients are above 0.11.4")
  (get-session [this app-id sess-id])
  (remove-session! [this app-id sess-id])
  (get-socket [this app-id sess-id])
  (add-socket! [this app-id sess-id socket])
  (get-auth [this app-id sess-id])
  (get-creator [this app-id sess-id])
  (set-session-props! [this app-id sess-id props])
  (get-versions [this app-id sess-id])
  (get-processed-tx-id [this app-id])
  (get-stale-instaql-queries [this app-id sess-id])
  (bump-instaql-version! [this app-id sess-id q return-type])
  (remove-query! [this app-id sess-id q])
  (add-instaql-query! [this app-id ctx result-hash])
  (get-session-instaql-queries [this app-id sess-id])
  (swap-datalog-cache-delay! [this app-id datalog-query delayed-call])
  (upsert-datalog-loader! [this app-id sess-id make-loader-fn])
  (record-datalog-query-start! [this app-id ctx datalog-query coarse-topics])
  (record-datalog-query-finish! [this app-id datalog-query topics])
  (mark-stale-topics! [this app-id tx-id topics]))

(deftype Store [state]
  IStore
  (conn-for-app! [_this app-id]
    (assert app-id)
    (-conn-for-app state app-id))
  (app-id-for-session [_this sess-id]
    (get-in @state [:session-id->app-id sess-id]))
  (get-session [this app-id sess-id]
    (-get-session @(conn-for-app! this app-id) sess-id))
  (remove-session! [this app-id sess-id]
    (swap! state (fn [s]
                   (-> s
                       (dissoc-in [:sockets-without-apps sess-id])
                       (dissoc-in [:session-id->app-id sess-id]))))
    (when app-id
      (-remove-session! (conn-for-app! this app-id) sess-id)))
  (get-socket [this app-id sess-id]
    (let [conn (conn-for-app! this app-id)]
      (if-let [socket-without-app (get-in @state [:sockets-without-apps sess-id])]
        (do
          ;; Not super great because things can get out of sync, but it should be ok?
          (-add-socket! conn sess-id socket-without-app)
          (swap! state (fn [s]
                         (-> s
                             (dissoc-in [:sockets-without-apps sess-id])
                             ;; session->app keeps track of the app-id in case
                             ;; we need to look it up later. Might be a better
                             ;; way to do this?
                             (assoc-in [:session-id->app-id sess-id] app-id))))
          socket-without-app)
        (-get-socket conn sess-id))))
  (add-socket! [this app-id sess-id socket]
    (if app-id
      (-add-socket! (conn-for-app! this app-id) sess-id socket)
      (swap! state assoc-in [:sockets-without-apps sess-id] socket))
    ;; Don't rely on return value, since it will be different depending on
    ;; if there's an app-id
    nil)
  (get-auth [this app-id sess-id]
    (-get-auth @(conn-for-app! this app-id) sess-id))
  (get-creator [this app-id sess-id]
    (-get-creator @(conn-for-app! this app-id) sess-id))
  (set-session-props! [this app-id sess-id props]
    (-set-session-props! (conn-for-app! this app-id) sess-id props))
  (get-versions [this app-id sess-id]
    (-get-versions @(conn-for-app! this app-id) sess-id))
  (get-processed-tx-id [this app-id]
    (-get-processed-tx-id @(conn-for-app! this app-id)))
  (get-stale-instaql-queries [this app-id sess-id]
    (-get-stale-instaql-queries @(conn-for-app! this app-id) sess-id))
  (bump-instaql-version! [this app-id sess-id q return-type]
    (-bump-instaql-version! (conn-for-app! this app-id) sess-id q return-type))
  (remove-query! [this app-id sess-id q]
    (-remove-query! (conn-for-app! this app-id) sess-id q))
  (get-session-instaql-queries [this app-id sess-id]
    (-get-session-instaql-queries @(conn-for-app! this app-id) sess-id))
  (add-instaql-query! [this app-id ctx result-hash]
    (-add-instaql-query! (conn-for-app! this app-id) ctx result-hash))
  (swap-datalog-cache-delay! [this app-id datalog-query delayed-call]
    (-swap-datalog-cache-delay! (conn-for-app! this app-id)
                                datalog-query
                                delayed-call))
  (upsert-datalog-loader! [this app-id sess-id make-loader-fn]
    (-upsert-datalog-loader! (conn-for-app! this app-id) sess-id make-loader-fn))
  (record-datalog-query-start! [this app-id ctx datalog-query coarse-topics]
    (-record-datalog-query-start! (conn-for-app! this app-id)
                                  ctx
                                  datalog-query
                                  coarse-topics))
  (record-datalog-query-finish! [this app-id datalog-query topics]
    ;; XXX: Pull app-id out of store so we don't have to pass it
    (-record-datalog-query-finish! (conn-for-app! this app-id)
                                   datalog-query
                                   topics))
  (mark-stale-topics! [this app-id tx-id topics]
    (-mark-stale-topics! (conn-for-app! this app-id) tx-id topics)))

(defn create-store []
  (Store. (atom {})))

(defn before-ns-unload []
  (stop))

(defn after-ns-reload []
  (start))

;; ---------
;; benchmark

(comment
  (defn run-test []
    (let [app-id (random-uuid)
          test-store (d/create-conn schema)
          session-ids (repeatedly 100 #(random-uuid))
          instaql-queries (repeatedly 10 (fn []
                                           {:users {:$ {:where {:id (random-uuid)}}}}))
          hashes (into {} (map (fn [q]
                                 [q (hash q)])
                               instaql-queries))
          dummy-coarse-topics '[[:ea _ #{#uuid "285a2628-af8f-4ab0-ad79-6ce83722ef2e"} _ _]
                                [:ea
                                 _
                                 #{#uuid "f293d070-687b-4fdb-aa03-3347ba26ff88"
                                   #uuid "285a2628-af8f-4ab0-ad79-6ce83722ef2e"}
                                 _
                                 _]]]

      (tool/def-locals)
      (println "add sockets")
      (time (doseq [sid session-ids]
              (add-socket! test-store sid {})))
      (println "register instaql-queries")
      (time
       (doseq [sid session-ids
               q instaql-queries]
         (bump-instaql-version! test-store sid q :join-rows)))

      (println "record-datalog-query-start")
      (time
       (doseq [sid session-ids
               q instaql-queries]
         (record-datalog-query-start! test-store
                                      {:session-id sid
                                       :instaql-query q
                                       :app-id app-id
                                       :v 1}
                                      [[:ea (-> q :users :$ :where :id)]]
                                      dummy-coarse-topics)))

      (println "record-datalog-query-finish")
      (time
       (doseq [sid session-ids
               q instaql-queries]
         (record-datalog-query-finish! test-store
                                       {:session-id sid
                                        :instaql-query q
                                        :app-id app-id
                                        :v 1}
                                       [[:ea (-> q :users :$ :where :id)]]
                                       {:topics dummy-coarse-topics})))

      (println "add-instaql-query")
      (time
       (doseq [sid session-ids
               q instaql-queries]
         (add-instaql-query! test-store
                             {:session-id sid
                              :instaql-query q
                              :v 1}
                             (get hashes q))))

      (println "mark-stale")
      (time
       (mark-stale-topics! test-store app-id 1 dummy-coarse-topics))

      (println "get-stale")
      (time
       (doseq [sid session-ids]
         (get-stale-instaql-queries @test-store sid)))

      (println "register instaql-queries")
      (time
       (doseq [sid session-ids
               q instaql-queries]
         (bump-instaql-version! test-store sid q :join-rows)))

      (println "record-datalog-query-start")
      (time
       (doseq [sid session-ids
               q instaql-queries]
         (record-datalog-query-start! test-store
                                      {:session-id sid
                                       :instaql-query q
                                       :app-id app-id
                                       :v 2}
                                      [[:ea (-> q :users :$ :where :id)]]
                                      dummy-coarse-topics)))

      (println "record-datalog-query-finish")
      (time
       (doseq [sid session-ids
               q instaql-queries]
         (record-datalog-query-finish! test-store
                                       {:session-id sid
                                        :instaql-query q
                                        :app-id app-id
                                        :v 2}
                                       [[:ea (-> q :users :$ :where :id)]]
                                       {:topics dummy-coarse-topics})))

      (println "add-instaql-query")
      (time
       (doseq [sid session-ids
               q instaql-queries]
         (add-instaql-query! test-store
                             {:session-id sid
                              :instaql-query q
                              :v 2}
                             (get hashes q))))

      nil)))
