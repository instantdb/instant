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
   [datascript.conn :as d-conn]
   [instant.flags :as flags]
   [instant.jdbc.sql :as sql]
   [instant.lib.ring.websocket :as ws]
   [instant.lib.ring.sse :as sse]
   [instant.util.async :as ua]
   [instant.util.coll :as ucoll]
   [instant.util.exception :as ex]
   [instant.util.lang :as lang]
   [instant.util.tracer :as tracer])
  (:import
   (java.lang InterruptedException)
   (java.time Instant)
   (java.util Map)
   (java.util.concurrent ConcurrentHashMap CancellationException ConcurrentLinkedQueue ExecutorService Executors)
   (java.util.concurrent.locks ReentrantLock)
   (java.util.regex Pattern)
   (io.undertow.server.handlers.sse ServerSentEventConnection)
   (io.undertow.websockets.spi WebSocketHttpExchange)))

(set! *warn-on-reflection* true)

(defrecord ReactiveStore [sessions ^Map conns])

(declare store)

(def sessions-schema
  {:session/id             {:db/unique :db.unique/identity}
   :session/socket         {}   ;; socket (from session.clj)
   :session/auth           {}   ;; {:app app :user user :admin? admin?} (from session.clj)
   :session/app-id         {:db/index true}
   :session/creator        {}   ;; user (from session.clj)
   :session/versions       {}   ;; library versions, e.g. {"@instantdb/react": "v0.1.2"}
   :session/datalog-loader {}   ;; datalog-loader (from datalog.clj)
   :session/attrs-hash     {}}) ;; last sent attrs’ hash

(def
  ^{:doc
    "The schema for the datascript store.
     The schema isn't enforced, except for :db/valueType, :db/index,
     :db/cardinality, and :db/tupleAttrs. There may be added fields.
     The :db/type field is purely cosmetic."}
  schema
  {:tx-meta/app-id {:db/unique :db.unique/identity}
   :tx-meta/processed-tx-id {:db/type :db.type/integer}

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
   :instaql-query/inference? {:db/type :db.type/boolean}

   :subscription/app-id {:db/type :db.type/integer}
   :subscription/session-id {:db/index true
                             :db/type :db.type/uuid}
   :subscription/instaql-query {:db/index true
                                :db/valueType :db.type/ref}
   :subscription/datalog-query {:db/index true
                                :db/valueType :db.type/ref}
   :subscription/v {:db/type :db.type/integer}

   :datalog-query/app-id {:db/index true
                          :db/type :db.type/integer}
   :datalog-query/query {} ;; datalog patterns (from datalog.clj)

   :datalog-query/app-id+query
   {:db/tupleAttrs [:datalog-query/app-id :datalog-query/query]
    :db/unique :db.unique/identity}

   :datalog-query/delayed-call {} ;; delay with datalog result (from query.clj)
   :datalog-query/topics {:db/type :db.type/list-of-topics}})

(defn create-conn [schema app-id]
  (doto (d/create-conn schema)
    (alter-meta! assoc
                 :app-id app-id
                 :executor (Executors/newSingleThreadExecutor (.factory (Thread/ofVirtual)))
                 :lock (ReentrantLock. false)
                 :tx-queue (ConcurrentLinkedQueue.)
                 :app-id app-id)))


(defn app-conn [store app-id]
  (Map/.computeIfAbsent (:conns store) app-id #(create-conn schema %)))

;; -----
;; misc

(defn translate-datascript-exceptions [exinfo]
  (let [{:keys [error entity-id]} (ex-data exinfo)]
    (if (and (= :entity-id/missing error)
             (coll? entity-id)
             (= :session/id (first entity-id)))
      (ex/throw-session-missing! (last entity-id))
      (throw exinfo))))

(defn duration-ms [t0 t1]
  (-> t1 (- t0) (/ 1000000) double))

(defrecord TxInput [tx-data result-promise])

(defrecord TxResult [type result lock-time-ms tx-time-ms])

(deftype RunTxes [conn]
  Runnable
  (run [this]
    (let [{:keys [tx-queue lock executor]} (meta conn)
          items (loop [items (transient [])]
                  (if (< 50 (count items))
                    (persistent! items)
                    (if-let [next-item (ConcurrentLinkedQueue/.poll tx-queue)]
                      (recur (conj! items next-item))
                      (persistent! items))))]
      (when (seq items)
        (let [t0 (System/nanoTime)
              reports (lang/with-reentrant-lock lock
                        (let [lock-time-ms (duration-ms t0 (System/nanoTime))]
                          (loop [db @conn
                                 items items
                                 reports (transient [])]
                            (if (seq items)
                              (let [tx-data (:tx-data (first items))
                                    start (System/nanoTime)
                                    report (try
                                             (->TxResult :ok
                                                         (d-conn/with db tx-data nil)
                                                         lock-time-ms
                                                         (duration-ms start (System/nanoTime)))
                                             (catch Throwable t
                                               (->TxResult :error
                                                           t
                                                           lock-time-ms
                                                           (duration-ms start (System/nanoTime)))))]
                                (recur (if (= :ok (:type report))
                                         (:db-after (:result report))
                                         db)
                                       (rest items)
                                       (conj! reports report)))
                              (do
                                (reset! conn db)
                                (persistent! reports))))))]
          (loop [items items
                 reports reports]
            (when (seq items)
              (deliver (:result-promise (first items)) (first reports))
              (recur (rest items) (rest reports)))))
        (when-not (ConcurrentLinkedQueue/.isEmpty tx-queue)
          (ExecutorService/.submit executor ^Runnable (RunTxes. conn)))))))

(defn transact-new! [span-name conn tx-data]
  (let [t1 (System/nanoTime)]
    (tracer/with-span! {:name span-name
                        :attributes {:version "new"}}
      (try
        (let [t2 (System/nanoTime)
              {:keys [tx-queue executor]} (meta conn)
              result-promise (promise)
              _ (ConcurrentLinkedQueue/.add tx-queue (->TxInput tx-data result-promise))
              _ (ExecutorService/.submit executor ^Runnable (RunTxes. conn))
              result @result-promise
              _ (when (= :error (:type result))
                  (throw (:result result)))
              report (:result result)]
          (tracer/add-data! {:attributes {:app-id (:app-id (meta conn))
                                          :changed-datoms-count (count (:tx-data report))
                                          :span-time-ms (-> t2 (- t1) (/ 1000000) double)
                                          :lock-time-ms (:lock-time-ms result)
                                          :tx-time-ms (:tx-time-ms result)
                                          :db-before-size (count (:db-before report))
                                          :db-after-size (count (:db-after report))}})
          report)
        (catch clojure.lang.ExceptionInfo e
          (translate-datascript-exceptions e))))))

(defn transact-old! [span-name conn tx-data]
  (let [t1 (System/nanoTime)]
    (tracer/with-span! {:name span-name
                        :attributes {:version "old"}}
      (try
        (let [t2          (System/nanoTime)
              [t3 ret t4] (lang/with-reentrant-lock (:lock (meta conn))
                            [(System/nanoTime)
                             (d/transact! conn tx-data)
                             (System/nanoTime)])]
          (tracer/add-data! {:attributes {:app-id               (:app-id (meta conn))
                                          :changed-datoms-count (count (:tx-data ret))
                                          :span-time-ms         (-> t2 (- t1) (/ 1000000) double)
                                          :lock-time-ms         (-> t3 (- t2) (/ 1000000) double)
                                          :tx-time-ms           (-> t4 (- t3) (/ 1000000) double)
                                          :db-before-size       (count (:db-before ret))
                                          :db-after-size        (count (:db-after ret))}})
          ret)
        (catch clojure.lang.ExceptionInfo e
          (translate-datascript-exceptions e))))))

(defn transact! [span-name conn tx-data]
  (if (or (flags/toggled? :enable-store-batching-globally)
          (contains? (flags/flag :enable-store-batching-apps)
                     (:app-id (meta conn))))
    (transact-new! span-name conn tx-data)
    (transact-old! span-name conn tx-data)))


;; -----
;; reports

(defprotocol HasHeaderMap
  (get-header [this ^String header-name]))

(extend-protocol HasHeaderMap
  WebSocketHttpExchange
  (get-header [req ^String header-name]
    (.getRequestHeader req header-name))

  ServerSentEventConnection
  (get-header [req ^String header-name]
    (some-> (.getRequestHeaders req)
            (.getFirst header-name))))

(defn socket-origin [{:keys [http-req]}]
  (some-> http-req
          (get-header "origin")))

(defn socket-ip [{:keys [http-req]}]
  (some-> http-req
          (get-header "x-forwarded-for")
          (String/.split ",")
          ;; Drop the ip added by the elb
          drop-last
          last
          string/trim))

(defn socket-x-amzn-trace-id
  "Load balancer trace id"
  [{:keys [http-req]}]
  (some-> http-req
          (get-header "x-amzn-trace-id")))

(defn socket-x-amz-cf-id
  "Cloudfront tracking id"
  [{:keys [http-req]}]
  (some-> http-req
          (get-header "x-amz-cf-id")))

(defn report-active-sessions [store]
  (let [db @(:sessions store)]
    (for [datom (d/datoms db :aevt :session/id)
          :let [ent (d/entity db (:e datom))
                {:session/keys [auth creator]} ent]]
      {:app-title      (-> auth :app :title)
       :app-id         (-> auth :app :id)
       :app-user-email (-> auth :user :email)
       :creator-email  (-> creator :email)
       :session-id     (:session/id ent)
       :socket-origin  (some-> ent
                               :session/socket
                               socket-origin)})))

(comment
  (report-active-sessions store))

(defn num-sessions [store]
  (let [db @(:sessions store)]
    (count
     (d/datoms db :aevt :session/id))))

;; --------
;; sessions

(defn session [store sess-id]
  (let [db @(:sessions store)]
    (d/entity db [:session/id sess-id])))

(defn assoc-session! [store sess-id & kvs]
  (let [conn   (:sessions store)
        entity' (apply assoc {:session/id sess-id} kvs)
        app-id (-> entity' :session/auth :app :id)
        entity (if app-id
                 (assoc entity' :session/app-id app-id)
                 entity')]
    (transact! "store/assoc-session!" conn [entity])))

;; -----
;; tx-id

(defn get-processed-tx-id [store app-id]
  (let [db  @(app-conn store app-id)
        ent (d/entity db [:tx-meta/app-id app-id])]
    (:tx-meta/processed-tx-id ent)))

;; ------
;; instaql queries

(defn get-stale-instaql-queries [store app-id sess-id]
  (let [db @(app-conn store app-id)]
    (for [datom (d/datoms db :avet :instaql-query/session-id sess-id)
          :let [ent (d/entity db (:e datom))]
          :when (:instaql-query/stale? ent)]
      ent)))

(defn bump-instaql-version-tx-data
  "Should be used in a db.fn/call. Returns transactions.
   Bumps the query version and marks query as not stale, creating the query
   if needed."
  [db lookup-ref session-id instaql-query return-type inference?]
  (if-let [existing (d/entity db lookup-ref)]
    (let [v  (:instaql-query/version existing)
          v' (inc (or v 0))]
      [{:db/id (:db/id existing)
        :instaql-query/version v'
        :instaql-query/stale? false}])
    [{:instaql-query/session-id session-id
      :instaql-query/query instaql-query
      :instaql-query/stale? false
      :instaql-query/version 1
      :instaql-query/return-type return-type
      :instaql-query/inference? (or inference? false)}]))

(defn bump-instaql-version! [store app-id sess-id q return-type inference?]
  (let [lookup-ref [:instaql-query/session-id+query [sess-id q]]
        conn       (app-conn store app-id)
        tx         [[:db.fn/call bump-instaql-version-tx-data lookup-ref sess-id q return-type inference?]]
        report     (transact! "store/bump-instaql-version!" conn tx)]
    (:instaql-query/version (d/entity (:db-after report) lookup-ref))))

;; ----
;; remove instaql queries

(defn- remove-subscriptions-tx-data
  "Should be used in a db.fn/call. Returns transactions.
   Retracts the instaql-query and subscriptions for the query."
  [db session-id instaql-query]
  (if-some [query-eid (d/entid db [:instaql-query/session-id+query [session-id instaql-query]])]
    (concat
     (for [datom (d/datoms db :avet :subscription/instaql-query query-eid)]
       [:db/retractEntity (:e datom)])
     [[:db/retractEntity query-eid]])
    []))

;; TODO: We could do this in the background by listening to transactions
;;       and noticing whenever we remove a reference to a datalog entry
(defn- clean-stale-datalog-tx-data
  "Should be used in a db.fn/call. Returns transactions.
   Retracts datalog queries that are no longer referenced in any subscriptions."
  [db]
  (for [datom (d/datoms db :aevt :datalog-query/app-id)
        :when (nil? (d/datoms db :avet :subscription/datalog-query (:e datom)))]
    [:db/retractEntity (:e datom)]))

(defn remove-query! [store app-id sess-id q]
  (transact! "store/remove-query!"
             (app-conn store app-id)
             [[:db.fn/call remove-subscriptions-tx-data sess-id q]
              [:db.fn/call clean-stale-datalog-tx-data]]))

;; --------------
;; adding queries

(defn- clean-stale-subscriptions-tx-data
  "Should be used in a db.fn/call. Returns transactions.
   Retracts subscriptions for an older version of an instaql query."
  [db instaql-query-lookup-ref version]
  (if-some [query-eid (d/entid db instaql-query-lookup-ref)]
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
  (if-some [e (d/entid db lookup-ref)]
    [[:db/add e :instaql-query/hash result-hash]]
    []))

(defn add-instaql-query! [store {:keys [app-id session-id instaql-query v] :as _ctx} result-hash]
  (let [conn            (app-conn store app-id)
        lookup-ref      [:instaql-query/session-id+query [session-id instaql-query]]
        report          (transact! "store/add-instaql-query!"
                                   conn
                                   [[:db.fn/call clean-stale-subscriptions-tx-data lookup-ref v]
                                    [:db.fn/call clean-stale-datalog-tx-data]
                                    [:db.fn/call set-instaql-query-result-tx-data lookup-ref result-hash]])
        hash-before     (:instaql-query/hash (d/entity (:db-before report) lookup-ref))
        hash-after      (:instaql-query/hash (d/entity (:db-after report) lookup-ref))
        result-changed? (or (not= hash-before hash-after)
                            (and (nil? hash-before)
                                 (nil? hash-after)))]
    (assoc report :result-changed? result-changed?)))

;; ------
;; session

(defn session-instaql-queries [store app-id sess-id]
  (let [db @(app-conn store app-id)]
    (set
     (for [datom (d/datoms db :avet :instaql-query/session-id sess-id)
           :let  [ent (d/entity db (:e datom))]]
       (:instaql-query/query ent)))))

(defn- remove-session-queries-tx-data
  "Should be used in a db.fn/call. Returns transactions.
   Retracts queries for the session."
  [db sess-id]
  (for [datom (d/datoms db :avet :instaql-query/session-id sess-id)]
    [:db/retractEntity (:e datom)]))

(defn- remove-session-subscriptions-tx-data
  "Should be used in a db.fn/call. Returns transactions.
   Retracts subscriptions for the session."
  [db sess-id]
  (for [datom (d/datoms db :avet :subscription/session-id sess-id)]
    [:db/retractEntity (:e datom)]))

(defn remove-session! [store app-id sess-id]
  ;; sync so new sessions are not added while we clean up this one
  (when (and app-id
             (Map/.containsKey (:conns store) app-id))
    (transact! "store/remove-session-data!"
               (app-conn store app-id)
               [[:db.fn/call remove-session-queries-tx-data sess-id]
                [:db.fn/call remove-session-subscriptions-tx-data sess-id]
                [:db.fn/call clean-stale-datalog-tx-data]]))
  (let [sessions-conn (:sessions store)]
    (transact! "store/remove-session!"
               sessions-conn
               [[:db.fn/retractEntity [:session/id sess-id]]])
    (when-let [removed-conn
               ;; Be careful not to use `lang/with-reentrant-lock` around
               ;; code that uses `transact!` or you will deadlock
               (lang/with-reentrant-lock (:lock (meta sessions-conn))
                 (when (and app-id
                            (empty? (d/datoms @sessions-conn :avet :session/app-id app-id)))
                   (Map/.remove (:conns store) app-id)))]
      (ExecutorService/.shutdown (:executor (meta removed-conn))))))

;; ------
;; datalog cache

(defn swap-datalog-cache! [store app-id datalog-query-fn ctx datalog-query]
  (let [lookup-ref [:datalog-query/app-id+query [app-id datalog-query]]
        watcher-id (Object.)
        this-result-delay (atom {;; Promise holds the result of the query
                                 :promise (promise)
                                 ;; Watchers keep track of who started listening
                                 ;; while the query was running, so that we can
                                 ;; safely cancel the query if all listeners cancel
                                 :watchers #{watcher-id}
                                 :cancel-signal (promise)
                                 :aborted? false})
        conn (app-conn store app-id)
        {:keys [db-after]}
        (transact! "store/swap-datalog-cache!"
                   conn
                   [[:db.fn/call
                     (fn [db]
                       (if-some [existing (d/entity db lookup-ref)]
                         (if (not (:datalog-query/delayed-call existing))
                           [[:db/add (:db/id existing) :datalog-query/delayed-call this-result-delay]]
                           (let [{:keys [watchers]}
                                 (swap! (:datalog-query/delayed-call existing)
                                        (fn [state]
                                          (if (:aborted? state)
                                            state
                                            (update state :watchers conj watcher-id))))]
                             (when-not (contains? watchers watcher-id)
                               [[:db/add (:db/id existing) :datalog-query/delayed-call this-result-delay]])))
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

(defn- upsert-datalog-loader-tx-data [db sess-id make-loader-fn]
  (when-not (d/find-datom db :eavt [:session/id sess-id] :session/datalog-loader)
    [[:db/add [:session/id sess-id] :session/datalog-loader (make-loader-fn)]]))

(defn upsert-datalog-loader! [store sess-id make-loader-fn]
  (let [conn (:sessions store)]
    (if-some [loader (:session/datalog-loader (d/entity @conn [:session/id sess-id]))]
      loader
      (let [{:keys [db-after]}
            (transact! "store/upsert-datalog-loader!"
                       conn
                       [[:db.fn/call upsert-datalog-loader-tx-data sess-id make-loader-fn]])]
        (:session/datalog-loader (d/entity db-after [:session/id sess-id]))))))


;; ------
;; subscriptions

(defn record-datalog-query-start! [store ctx datalog-query coarse-topics]
  (let [{:keys [app-id session-id instaql-query v]} ctx
        conn (app-conn store app-id)]
    (transact! "store/record-datalog-query-start!"
               conn
               [[:db.fn/call
                 (fn [db]
                   (let [lookup-ref             [:datalog-query/app-id+query [app-id datalog-query]]
                         existing-datalog-query (d/entity db lookup-ref)
                         datalog-query-eid      (or (:db/id existing-datalog-query) -1)]
                     (concat
                      (if existing-datalog-query
                        (when-not (:datalog-query/topics existing-datalog-query)
                          [{:db/id                datalog-query-eid
                            :datalog-query/topics coarse-topics}])
                        [{:db/id                datalog-query-eid
                          :datalog-query/app-id app-id
                          :datalog-query/query  datalog-query
                          :datalog-query/topics coarse-topics}])
                      (when-some [query-eid (d/entid db [:instaql-query/session-id+query [session-id instaql-query]])]
                        [{:subscription/app-id        app-id
                          :subscription/session-id    session-id
                          :subscription/v             v
                          :subscription/instaql-query query-eid
                          :subscription/datalog-query datalog-query-eid}]))))]])))

(defn record-datalog-query-finish! [store
                                    ctx
                                    datalog-query
                                    {:keys [topics] :as _result}]

  (let [{:keys [app-id]} ctx
        conn       (app-conn store app-id)
        lookup-ref [:datalog-query/app-id+query [app-id datalog-query]]]
    (transact!
     "store/record-datalog-query-finish!"
     conn
     [[:db.fn/call
       (fn [db]
         (if-some [existing (d/entity db lookup-ref)]
           [[:db/add (:db/id existing) :datalog-query/topics topics]]
           [{:datalog-query/app-id app-id
             :datalog-query/query datalog-query
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

(defn like-parts
  "Splits the like pattern into parts, quoting strings
  (like-parts \"%hello%\")
  -> [^ .* quoted-string<hello> .* $]"
  [pattern]
  (loop [pattern pattern
         s (StringBuilder.)
         parts (transient ["^"])]
    (if (not (seq pattern))
      (cond-> parts
        (pos? (count s)) (conj! (Pattern/quote (.toString s)))
        true (conj! "$")
        true (persistent!))
      (case (first pattern)
        \_ (recur (rest pattern)
                  (StringBuilder.)
                  (cond-> parts
                    (pos? (count s)) (conj! (Pattern/quote (.toString s)))
                    true (conj! ".")))
        \% (recur (rest pattern)
                  (StringBuilder.)
                  (cond-> parts
                    (pos? (count s)) (conj! (Pattern/quote (.toString s)))
                    true (conj! ".*")))
        (recur (rest pattern)
               (.append s (first pattern))
               parts)))))

(defn like-pattern
  "Creates a regex pattern for a like pattern, taking into account
   case insensitivity."
  [case-insensitive? pattern]
  (let [parts (like-parts pattern)]
    (Pattern/compile (string/join "" parts)
                     (if case-insensitive?
                       Pattern/CASE_INSENSITIVE
                       0))))

(defn make-like-match? [case-insensitive? text pattern]
  (let [regex-pattern (like-pattern case-insensitive? pattern )]
    (re-matches regex-pattern text)))

(def like-match?
  (partial make-like-match? false))

(def ilike-match?
  (partial make-like-match? true))

(defn instant-gt [^Instant a ^Instant b]
  (.isAfter a b))

(defn instant-gte [^Instant a ^Instant b]
  (or (.equals a b)
      (.isAfter a b)))

(defn instant-lt [^Instant a ^Instant b]
  (.isBefore a b))

(defn instant-lte [^Instant a ^Instant b]
  (or (.equals a b)
      (.isBefore a b)))

(defn string-gt [^String a ^String b]
  (pos? (.compareTo a b)))

(defn string-gte [^String a ^String b]
  (<= 0 (.compareTo a b)))

(defn string-lt [^String a ^String b]
  (neg? (.compareTo a b)))

(defn string-lte [^String a ^String b]
  (>= 0 (.compareTo a b)))

(defn bool-gt [^Boolean a ^Boolean b]
  (pos? (.compareTo a b)))

(defn bool-gte [^Boolean a ^Boolean b]
  (<= 0 (.compareTo a b)))

(defn bool-lt [^Boolean a ^Boolean b]
  (neg? (.compareTo a b)))

(defn bool-lte [^Boolean a ^Boolean b]
  (>= 0 (.compareTo a b)))

(defn match-nil
  "nil is always the smallest value and the comparator value can't be nil"
  [op]
  (case op
    :$gt false
    :$gte false
    :$lt true
    :$lte true
    :$like false
    :$ilike false))

(defn- match-topic-part? [iv-part dq-part]
  (cond
    (keyword? iv-part)
    (= iv-part dq-part)

    (or (symbol? dq-part) (symbol? iv-part))
    true

    (set? dq-part)
    (intersects? iv-part dq-part)

    (map? dq-part)
    (if-some [{:keys [op value data-type]} (:$comparator dq-part)]
      (let [f (case data-type
                :number (case op
                          :$gt >
                          :$gte >=
                          :$lt <
                          :$lte <=)
                :boolean (case op
                           :$gt bool-gt
                           :$gte bool-gte
                           :$lt bool-lt
                           :$lte bool-lte)
                :string (case op
                          :$gt string-gt
                          :$gte string-gte
                          :$lt string-lt
                          :$lte string-lte
                          :$like like-match?
                          :$ilike ilike-match?)
                :date (case op
                        :$gt instant-gt
                        :$gte instant-gte
                        :$lt instant-lt
                        :$lte instant-lte))]
        (ucoll/exists? (fn [v]
                         (if (nil? v)
                           (match-nil op)
                           (f v value)))
                       iv-part))
      (when (contains? dq-part :$not)
        (let [not-val (:$not dq-part)]
          (ucoll/exists? (partial not= not-val) iv-part))))))

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
  (for [datalog-query-eid datalog-query-eids
        sub-datom         (d/datoms db :avet :subscription/datalog-query datalog-query-eid)
        :let [sub-eid             (:e sub-datom)
              instaql-query-datom (d/find-datom db :eavt sub-eid :subscription/instaql-query)
              instaql-query-eid   (:v instaql-query-datom)]
        :when instaql-query-eid]
    [:db/add instaql-query-eid :instaql-query/stale? true]))

(defn- set-tx-id
  "Should be used in a db.fn/call. Returns transactions.
   Sets the processed-tx-id to the max of the given value and current value."
  [db app-id tx-id]
  (if-some [current (:tx-meta/processed-tx-id (d/entity db [:tx-meta/app-id app-id]))]
    [{:tx-meta/app-id app-id
      :tx-meta/processed-tx-id (max current tx-id)}]
    [{:tx-meta/app-id app-id
      :tx-meta/processed-tx-id tx-id}]))

(defn- mark-datalog-queries-stale!
  "Stale-ing a datalog query has the following side-effects:
   1. Removes the datalog query from the datalog-cache
   2. Marks associated instaql entries as stale
   3. Updates store's latest processed tx-id for the app-id"
  [conn app-id tx-id datalog-query-eids]
  (transact!
   "store/mark-datalog-queries-stale!"
   conn
   (concat
    [[:db.fn/call set-tx-id app-id tx-id]
     [:db.fn/call mark-instaql-queries-stale-tx-data datalog-query-eids]]
    (for [e datalog-query-eids]
      [:db.fn/retractEntity e]))))

(defn- get-datalog-queries-for-topics [db app-id iv-topics]
  (for [datom (d/datoms db :avet :datalog-query/app-id app-id)
        :let [dq-topics (:datalog-query/topics (d/entity db (:e datom)))]
        :when dq-topics
        :when (matching-topic-intersection? iv-topics dq-topics)]
    (:e datom)))

(defn mark-stale-topics!
  "Given topics, invalidates all relevant datalog qs and associated instaql queries.

  Returns affected session-ids"
  [store app-id tx-id topics]
  (let [conn               (app-conn store app-id)
        datalog-query-eids (get-datalog-queries-for-topics @conn app-id topics)

        report
        (mark-datalog-queries-stale! conn app-id tx-id datalog-query-eids)

        session-ids (d/q '[:find [?session-id ...]
                           :in   $ [?datalog-query ...]
                           :where
                           [?e :subscription/datalog-query ?datalog-query]
                           [?e :subscription/session-id ?session-id]]
                         (:db-before report)
                         datalog-query-eids)]
    session-ids))

;; -----------------
;; Websocket Helpers

(defn send-event! [store app-id sess-id event]
  (let [socket (:session/socket (session store sess-id))]
    (when-not socket
      (ex/throw-socket-missing! sess-id))
    (when-let [sse-conn (:sse-conn socket)]
      (try
        (sse/send-json! app-id event {:conn sse-conn})
        (catch java.io.IOException e
          (ex/throw-socket-error! sess-id e))))
    (when-let [ws-conn (:ws-conn socket)]
      (try
        (ws/send-json! app-id event ws-conn)
        (catch java.io.IOException e
          (ex/throw-socket-error! sess-id e))))))

(defn try-send-event!
  "Does a best-effort send. If it fails, we record and swallow the exception"
  [store app-id sess-id event]
  (try
    (send-event! store app-id sess-id event)
    (catch Exception e
      (tracer/with-span! {:name "rs/try-send-event-swallowed-err"}
        (tracer/record-exception-span!
         e
         {:name "rs/try-send-event-err"
          :attributes {:event (str event)
                       :escaping? false}})))))

;; -----
;; start

(defn init []
  (->ReactiveStore
   (create-conn sessions-schema "sessions")
   (ConcurrentHashMap.)))

(defn start []
  (tracer/record-info! {:name "store/start"})
  (def store (init)))

(defn stop []
  (tracer/record-info! {:name "store/reset"})
  (def store nil))

(defn restart []
  (stop)
  (start))

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
              (assoc-session! test-store sid :session/socket {})))
      (println "register instaql-queries")
      (time
       (doseq [sid session-ids
               q instaql-queries]
         (bump-instaql-version! test-store app-id sid q :join-rows true)))

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
         (get-stale-instaql-queries @test-store app-id sid)))

      (println "register instaql-queries")
      (time
       (doseq [sid session-ids
               q instaql-queries]
         (bump-instaql-version! test-store app-id sid q :join-rows true)))

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
