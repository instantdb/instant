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
   [datascript.core :as d]
   [instant.util.coll :as ucoll]
   [instant.lib.ring.websocket :as ws]
   [instant.util.async :as ua]
   [instant.util.tracer :as tracer]
   [instant.util.exception :as ex]
   [medley.core :refer [dissoc-in]]))

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
   :instaql-query/hash {:db/type :db.type/string}
   ;; This would be easier if we had a store per app
   :instaql-query/session-id+query
   {:db/tupleAttrs [:instaql-query/session-id :instaql-query/query]
    :db/unique :db.unique/identity}
   :instaql-query/return-type {} ;; :join-rows or :tree

   :subscription/session-id {:db/index true
                             :db/type :db.type/uuid}
   :subscription/instaql-query {:db/index true} ;; instaql query (from instaql.clj)
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
  (tracer/with-span! {:name span-name}
    (try
      (let [ret (d/transact! conn tx-data)]
        (tracer/add-data! {:attributes {:changed-datoms-count (count (:tx-data ret))}})
        ret)
      (catch clojure.lang.ExceptionInfo e
        (translate-datascript-exceptions e)))))

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
   Retracts subscriptions for the session and instaql query."
  [db session-id instaql-query]
  (let [stale-sub-eids (d/q '{:find [?e]
                              :in [$ ?session-id ?instaql-query]
                              :where [[?e :subscription/session-id ?session-id]
                                      [?e :subscription/instaql-query ?instaql-query]]}
                            db
                            session-id
                            instaql-query)]
    (map (fn [[e]] [:db/retractEntity e]) stale-sub-eids)))

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
             [[:db/retractEntity [:instaql-query/session-id+query [sess-id q]]]
              [:db.fn/call remove-subscriptions-tx-data sess-id q]
              [:db.fn/call clean-stale-datalog-tx-data]]))

;; --------------
;; adding queries

(defn- clean-stale-subscriptions-tx-data
  "Should be used in a db.fn/call. Returns transactions.
   Retracts subscriptions for an older version of an instaql query."
  [db session-id instaql-query version]
  (let [stale-sub-eids (d/q '{:find [?e]
                              :in [$ ?session-id ?instaql-query ?current-v]
                              :where [[?e :subscription/session-id ?session-id]
                                      [?e :subscription/instaql-query ?instaql-query]
                                      [?e :subscription/v ?v]
                                      [(< ?v ?current-v)]]}
                            db
                            session-id
                            instaql-query
                            version)]
    (map (fn [[e]] [:db/retractEntity e]) stale-sub-eids)))

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
                   [[:db.fn/call clean-stale-subscriptions-tx-data session-id instaql-query v]
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
  (let [stale-iql-eids (d/q '{:find [?e]
                              :in [$ ?session-id]
                              :where [[?e :instaql-query/session-id ?session-id]]}
                            db
                            session-id)]
    (map (fn [[e]] [:db/retractEntity e]) stale-iql-eids)))

(defn- remove-session-subscriptions-tx-data
  "Should be used in a db.fn/call. Returns transactions.
   Retracts subscriptions for the session."
  [db session-id]
  (let [stale-sub-eids (d/q '{:find [?e]
                              :in [$ ?session-id]
                              :where [[?e :subscription/session-id ?session-id]]}
                            db
                            session-id)]
    (map (fn [[e]] [:db/retractEntity e]) stale-sub-eids)))

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

(defn- -swap-datalog-cache-delay! [conn datalog-query delayed-call]
  (let [lookup-ref [:datalog-query/query datalog-query]

        {:keys [db-after]}
        (transact! "store/swap-datalog-cache-delay!"
                   conn
                   [[:db.fn/call (fn [db]
                                   (if-let [existing (d/entity db lookup-ref)]
                                     (when-not (:datalog-query/delayed-call existing)
                                       [[:db/add
                                         (:db/id existing)
                                         :datalog-query/delayed-call delayed-call]])
                                     [{:datalog-query/query datalog-query
                                       :datalog-query/delayed-call delayed-call}]))]])]

    (:datalog-query/delayed-call (d/entity db-after lookup-ref))))

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

(defn- -record-datalog-query-start! [conn ctx datalog-query coarse-topics]
  (let [lookup-ref [:datalog-query/query datalog-query]]
    (transact! "store/record-datalog-query-start!"
               conn
               [[:db.fn/call
                 (fn [db]
                   (if-let [existing (d/entity db lookup-ref)]
                     (when-not (:datalog-query/topics existing)
                       [[:db/add (:db/id existing) :datalog-query/topics coarse-topics]])
                     [{:datalog-query/query datalog-query
                       :datalog-query/topics coarse-topics}]))]
                {:subscription/session-id (:session-id ctx)
                 :subscription/v (:v ctx)
                 :subscription/instaql-query (:instaql-query ctx)
                 :subscription/datalog-query lookup-ref}])))

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

(defn- match-topic-part? [iv-part dq-part]
  (cond
    (keyword? iv-part) (= iv-part dq-part)
    (or (symbol? dq-part) (symbol? iv-part)) true
    (set? dq-part) (intersects? iv-part dq-part)

    (and (map? dq-part) (contains? dq-part :not))
    (let [not-val (:not dq-part)]
      (some (partial not= not-val) iv-part))))

(defn match-topic?
  [iv-topic dq-topic]
  (ucoll/every?-var-args match-topic-part? iv-topic dq-topic))

(defn- contains-matching-topic? [dq-topics iv-topic]
  (some (partial match-topic? iv-topic) dq-topics))

(defn- matching-topic-intersection? [iv-topics dq-topics]
  (some (partial contains-matching-topic? dq-topics)
        iv-topics))

(defn- mark-instaql-queries-stale-tx-data
  "Should be used in a db.fn/call. Returns transactions.
   Marks instaql-queries that have subscriptions that reference the datalog
   query stale."
  [db datalog-query-eids]
  (let [iql-eids (d/q '{:find [?e]
                        :in [$ [?datalog-query ...]]
                        :where [[?sub-e :subscription/datalog-query ?datalog-query]
                                [?sub-e :subscription/instaql-query ?instaql-query]
                                [?e :instaql-query/query ?instaql-query]]}
                      db
                      datalog-query-eids)]
    (map (fn [[e]] [:db/add e :instaql-query/stale? true]) iql-eids)))

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
   :instaql-query (:subscription/instaql-query ent)
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
      (ws/send-json! event ws-conn)
      (catch java.io.IOException e
        (ex/throw-socket-error! sess-id e)))))

(defn try-send-event!
  "Does a best-effort send. If it fails, we record and swallow the exception"
  [conn sess-id event]
  (try
    (send-event! conn sess-id event)
    (catch Exception e
      (tracer/with-span! {:name "rs/try-send-event-swallowed-err"}
        (tracer/record-exception-span!
         e
         {:name "rs/try-send-event-err"
          :attributes {:event (str event)
                       :escaping? false}})))))

(defn try-broadcast-event!
  "Sends an event to multiple sessions"
  [conn sess-ids event]
  (ua/vfuture-pmap (fn [sess-id]
                     (try-send-event! conn sess-id event))
                   sess-ids))

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
