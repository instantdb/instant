(ns instant.reactive.session
  "Manager for the lifecycle of a user session.

   When a user connects over a socket, they can authenticate,
   subscribe/unsubscribe from queries, make transsactions, and receive updates.

   Each connection has their own `session` worker, that can understand these
   commands."
  (:require
   [clojure.main :refer [root-cause]]
   [instant.db.datalog :as d]
   [instant.db.model.attr :as attr-model]
   [instant.db.permissioned-transaction :as permissioned-tx]
   [instant.db.pg-introspect :as pg-introspect]
   [instant.db.transaction :as tx]
   [instant.flags :as flags]
   [instant.grouped-queue :as grouped-queue]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.model.app :as app-model]
   [instant.model.app-admin-token :as app-admin-token-model]
   [instant.model.app-user :as app-user-model]
   [instant.model.instant-user :as instant-user-model]
   [instant.model.rule :as rule-model]
   [instant.reactive.ephemeral :as eph]
   [instant.reactive.query :as rq]
   [instant.reactive.receive-queue :as receive-queue :refer [receive-q]]
   [instant.reactive.store :as rs]
   [instant.util.async :as ua]
   [instant.util.delay :as delay]
   [instant.util.exception :as ex]
   [instant.util.json :refer [<-json]]
   [instant.util.tracer :as tracer]
   [instant.util.uuid :as uuid-util]
   [lambdaisland.uri :as uri]
   [version-clj.core :as version]
   [version-clj.qualifiers])
  (:import
   (java.time Duration Instant)
   (java.util.concurrent CancellationException)
   (java.util.concurrent.atomic AtomicLong)))

;; ------
;; Setup

(declare receive-q-stop-signal)
(def handle-receive-timeout-ms 5000)

(def num-receive-workers (* 100 (delay/cpu-count)))

;; ------
;; handlers

(def core-version-key (keyword "@instantdb/core"))
(def react-version-key (keyword "@instantdb/react"))
(def react-native-version-key (keyword "@instantdb/react-native"))

(defn auth-and-creator-attrs [auth creator versions]
  (cond-> {:app-id (-> auth :app :id)
           :app-title (-> auth :app :title)
           :app-user-email (-> auth :user :email)
           :creator-id (-> creator :id)
           :creator-email (-> creator :email)}
    (get versions react-version-key)
    (assoc "@instantdb/react" (get versions react-version-key))

    (get versions react-native-version-key)
    (assoc "@instantdb/react-native" (get versions react-native-version-key))

    (get versions core-version-key)
    (assoc "@instantdb/core" (get versions core-version-key))))

;; -------
;; init

(defn get-attrs [app]
  (if-let [connection-string (-> app :connection_string)]
    ;; TODO(byop): Separate connection for byop app
    (pg-introspect/introspect (aurora/conn-pool) (or (->> connection-string
                                                          (app-model/decrypt-connection-string (:id app))
                                                          uri/query-map
                                                          :currentSchema)
                                                     "public"))
    {:attrs (attr-model/get-by-app-id (:id app))}))

(defn- handle-init! [store-conn sess-id
                     {:keys [refresh-token client-event-id versions __admin-token] :as event}]
  (let [prev-auth (rs/get-auth @store-conn sess-id)
        _ (when prev-auth
            (ex/throw-validation-err! :init event [{:message "`init` has already run for this session."}]))
        app-id (ex/get-param! event [:app-id] uuid-util/coerce)
        app (app-model/get-by-id! {:id app-id})
        {:keys [attrs]} (get-attrs app)
        user (when refresh-token
               (app-user-model/get-by-refresh-token!
                {:app-id app-id :refresh-token refresh-token}))
        creator (instant-user-model/get-by-app-id {:app-id app-id})
        admin? (and __admin-token
                    (boolean
                     (app-admin-token-model/fetch! {:app-id app-id
                                                    :token __admin-token})))
        auth {:app app :user user :admin? admin?}]
    (tracer/add-data! {:attributes (auth-and-creator-attrs auth creator versions)})
    (rs/set-session-props! store-conn sess-id {:auth auth
                                               :creator creator
                                               :versions versions})
    (rs/send-event! store-conn app-id sess-id {:op :init-ok
                                               :session-id sess-id
                                               :client-event-id client-event-id
                                               :auth auth
                                               :attrs attrs})))

(defn- get-auth! [store-conn sess-id]
  (let [auth (rs/get-auth @store-conn sess-id)]
    (when-not (:app auth)
      (ex/throw-validation-err! :init {:sess-id sess-id} [{:message "`init` has not run for this session."}]))
    auth))

(defn- handle-add-query! [store-conn sess-id {:keys [q client-event-id return-type] :as _event}]
  (let [instaql-queries (rs/get-session-instaql-queries @store-conn sess-id)
        {:keys [app user admin?]} (get-auth! store-conn sess-id)]

    (cond
      (contains? instaql-queries q)
      (rs/send-event! store-conn (:id app) sess-id {:op :add-query-exists :q q
                                                    :client-event-id client-event-id})

      :else
      (let [return-type (keyword (or return-type "join-rows"))
            {app-id :id} app
            processed-tx-id (rs/get-processed-tx-id @store-conn app-id)
            {:keys [table-info]} (get-attrs app)
            attrs (attr-model/get-by-app-id app-id)
            ctx {:db {:conn-pool (aurora/conn-pool)}
                 :datalog-loader (rs/upsert-datalog-loader! store-conn sess-id d/make-loader)
                 :session-id sess-id
                 :app-id app-id
                 :attrs attrs
                 :table-info table-info
                 :admin? admin?
                 :current-user user}
            {:keys [instaql-result]} (rq/instaql-query-reactive! store-conn ctx q return-type)]
        (rs/send-event! store-conn app-id sess-id {:op :add-query-ok :q q :result instaql-result
                                                   :processed-tx-id processed-tx-id
                                                   :client-event-id client-event-id})))))

(defn- handle-remove-query! [store-conn sess-id {:keys [q client-event-id] :as _event}]
  (let [{:keys [app]} (get-auth! store-conn sess-id)]
    (rs/remove-query! store-conn sess-id (:id app) q)
    (rs/send-event! store-conn (:id app) sess-id {:op :remove-query-ok :q q
                                                  :client-event-id client-event-id})))

(defn- recompute-instaql-query!
  [{:keys [store-conn current-user app-id sess-id attrs table-info admin?]}
   {:keys [instaql-query/query instaql-query/return-type]}]
  (let [ctx {:db {:conn-pool (aurora/conn-pool)}
             :session-id sess-id
             :app-id app-id
             :attrs attrs
             ;; Will only be present for byop apps
             :table-info table-info
             :current-user current-user
             :admin? admin?}
        {:keys [instaql-result result-changed?]}
        (rq/instaql-query-reactive! store-conn ctx query return-type)]
    {:instaql-query query
     :instaql-result instaql-result
     :result-changed? result-changed?}))

(defn- handle-refresh! [store-conn sess-id _event debug-info]
  (let [auth (get-auth! store-conn sess-id)
        app-id (-> auth :app :id)
        current-user (-> auth :user)
        admin? (-> auth :admin?)
        {:keys [attrs table-info]} (get-attrs (:app auth))
        stale-queries (rs/get-stale-instaql-queries @store-conn sess-id)
        opts {:store-conn store-conn
              :app-id app-id
              :current-user current-user
              :sess-id sess-id
              :attrs attrs
              :table-info table-info
              :admin? admin?}
        processed-tx-id (rs/get-processed-tx-id @store-conn app-id)
        _ (reset! debug-info {:processed-tx-id processed-tx-id
                              :instaql-queries (map :instaql-query/query stale-queries)})
        recompute-results (->> stale-queries
                               (ua/vfuture-pmap (partial recompute-instaql-query! opts)))
        {computations true spam false} (group-by :result-changed? recompute-results)
        num-spam (count spam)
        num-computations (count computations)
        num-recomputations (count recompute-results)
        drop-spam? (flags/drop-refresh-spam? app-id)
        computations (if drop-spam?
                       computations
                       recompute-results)]
    (tracer/with-span! {:name "handle-refresh/send-event!"
                        :attributes {:num-recomputations num-recomputations
                                     :num-spam num-spam
                                     :num-computations num-computations
                                     :dropped-spam? drop-spam?}}
      (when (seq computations)
        (rs/send-event! store-conn app-id sess-id {:op :refresh-ok
                                                   :processed-tx-id processed-tx-id
                                                   :attrs attrs
                                                   :computations computations})))))

;; -----
;; transact

(defn handle-transact!
  [store-conn sess-id {:keys [tx-steps client-event-id] :as _event}]
  (let [auth (get-auth! store-conn sess-id)
        app-id (-> auth :app :id)
        coerced (tx/coerce! tx-steps)
        _ (tx/validate! coerced)
        {tx-id :id}
        (permissioned-tx/transact!
         {:db {:conn-pool (aurora/conn-pool)}
          :rules (rule-model/get-by-app-id {:app-id app-id})
          :app-id app-id
          :current-user (:user auth)
          :admin? (:admin? auth)
          :datalog-query-fn d/query
          :attrs (attr-model/get-by-app-id app-id)}
         coerced)]
    (rs/send-event! store-conn app-id sess-id
                    {:op :transact-ok
                     :tx-id tx-id
                     :client-event-id client-event-id})))

;; -----
;; error

(defn handle-error! [store-conn sess-id {:keys [status
                                                app-id
                                                client-event-id
                                                original-event
                                                type
                                                message
                                                hint]}]
  (rs/send-event! store-conn
                  app-id
                  sess-id
                  {:op :error
                   :status status
                   :client-event-id client-event-id
                   :original-event original-event
                   :type type
                   :message message
                   :hint hint}))

;; ------
;; worker

(defn event-attributes
  [store-conn
   session-id
   {:keys [op
           client-event-id
           receive-q-delay-ms
           worker-delay-ms
           ws-ping-latency-ms] :as _event}]
  (let [auth (rs/get-auth @store-conn session-id)
        creator (rs/get-creator @store-conn session-id)
        versions (rs/get-versions @store-conn session-id)]
    (merge
     {:op op
      :client-event-id client-event-id
      :session-id session-id
      :worker-delay-ms worker-delay-ms
      :receive-q-delay-ms receive-q-delay-ms
      :ws-ping-latency-ms ws-ping-latency-ms}
     (auth-and-creator-attrs auth creator versions))))

(defn socket-origin [{:keys [http-req]}]
  (some-> http-req
          (.getRequestHeaders)
          (.get "origin")
          first))

(defn socket-ip [{:keys [http-req]}]
  (some-> http-req
          (.getRequestHeader "cf-connecting-ip")))

(defn- handle-join-room! [store-conn sess-id {:keys [client-event-id room-id] :as _event}]
  (let [auth (get-auth! store-conn sess-id)
        app-id (-> auth :app :id)
        current-user (-> auth :user)]
    (eph/join-room! app-id sess-id current-user room-id)
    (rs/send-event! store-conn app-id sess-id {:op :join-room-ok
                                               :room-id room-id
                                               :client-event-id client-event-id})))

(defn- handle-leave-room! [store-conn sess-id {:keys [client-event-id room-id] :as _event}]
  (let [auth (get-auth! store-conn sess-id)
        app-id (-> auth :app :id)]
    (eph/leave-room! app-id sess-id room-id)
    (rs/send-event! store-conn app-id sess-id {:op :leave-room-ok
                                               :room-id room-id
                                               :client-event-id client-event-id})))

(defn assert-in-room! [app-id room-id sess-id]
  (when-not (eph/in-room? app-id room-id sess-id)
    (ex/throw-validation-err!
     :room
     {:app-id app-id :room-id room-id :session-id sess-id}
     [{:message "You have not entered this room yet."}])))

(defn- handle-set-presence!
  [store-conn sess-id {:keys [client-event-id room-id data] :as _event}]
  (let [auth (get-auth! store-conn sess-id)
        app-id (-> auth :app :id)
        _ (assert-in-room! app-id room-id sess-id)]
    (eph/set-presence! app-id sess-id room-id data)
    (rs/send-event! store-conn app-id sess-id {:op :set-presence-ok
                                               :room-id room-id
                                               :client-event-id client-event-id})))

(def qualifiers
  (assoc version-clj.qualifiers/default-qualifiers "dev" 7))

(defn- handle-refresh-presence! [store-conn sess-id {:keys [app-id room-id data edits]}]
  (let [version (-> (rs/get-versions @store-conn sess-id)
                    (get core-version-key))]
    (cond
      (and edits (empty? edits))
      :nop

      (and edits (version/newer? version "v0.17.5" {:qualifiers qualifiers}))
      (rs/send-event! store-conn app-id sess-id
                      {:op      :patch-presence
                       :room-id room-id
                       :edits   edits})

      :else
      (rs/send-event! store-conn app-id sess-id
                      {:op      :refresh-presence
                       :room-id room-id
                       :data    data}))))

(defn- handle-client-broadcast!
  "Broadcasts a client message to other sessions in the room"
  [store-conn sess-id {:keys [client-event-id room-id topic data] :as _event}]
  (let [auth (get-auth! store-conn sess-id)
        app-id (-> auth :app :id)
        _ (assert-in-room! app-id room-id sess-id)
        current-user (-> auth :user)
        {:keys [local-ids remote-ids]} (eph/get-room-session-ids app-id room-id)
        base-msg {:room-id room-id
                  :topic topic
                  :data {:peer-id sess-id
                         :user (when current-user
                                 {:id (:id current-user)})
                         :data data}}]

    (doseq [notify-sess-id local-ids
            :let [q (:receive-q (rs/get-socket @store-conn notify-sess-id))]
            :when (and q (not= sess-id notify-sess-id))]
      (receive-queue/enqueue->receive-q q
                                        (assoc base-msg
                                               :op :server-broadcast
                                               :session-id notify-sess-id
                                               :app-id app-id)))
    (when (seq remote-ids)
      (eph/broadcast app-id remote-ids base-msg))

    (rs/send-event! store-conn app-id sess-id (assoc base-msg
                                                     :op :client-broadcast-ok
                                                     :client-event-id client-event-id))))

(defn- handle-server-broadcast! [store-conn sess-id {:keys [app-id room-id topic data]}]
  (when (eph/in-room? app-id room-id sess-id)
    (rs/send-event! store-conn app-id sess-id {:op :server-broadcast
                                               :room-id room-id
                                               :topic topic
                                               :data data})))

(defn handle-event [store-conn session event debug-info]
  (let [{:keys [op]} event
        {:keys [session/socket]} session
        {:keys [id]} socket]
    (tracer/add-data! {:attributes (event-attributes store-conn id event)})
    (case op
      :init (handle-init! store-conn id event)
      :add-query (handle-add-query! store-conn id event)
      :remove-query (handle-remove-query! store-conn id event)
      :refresh (handle-refresh! store-conn id event debug-info)
      :transact (handle-transact! store-conn id event)
      :error (handle-error! store-conn id event)
      ;; -----
      ;; EPH events
      :join-room (handle-join-room! store-conn id event)
      :leave-room (handle-leave-room! store-conn id event)
      :set-presence (handle-set-presence! store-conn id event)
      :refresh-presence (handle-refresh-presence! store-conn id event)
      :client-broadcast (handle-client-broadcast! store-conn id event)
      :server-broadcast (handle-server-broadcast! store-conn id event))))

;; --------------
;; Receive Workers

(defn- handle-instant-exception [session app-id original-event instant-ex debug-info]
  (let [sess-id (:session/id session)
        q (:receive-q (:session/socket session))
        {:keys [client-event-id]} original-event
        {:keys [::ex/type ::ex/message ::ex/hint] :as err-data} (ex-data instant-ex)]
    (tracer/add-data! {:attributes {:err-data (pr-str err-data)}})
    (case type
      (::ex/record-not-found
       ::ex/record-expired
       ::ex/record-not-unique
       ::ex/record-foreign-key-invalid
       ::ex/record-check-violation
       ::ex/sql-raise

       ::ex/permission-denied
       ::ex/permission-evaluation-failed

       ::ex/param-missing
       ::ex/param-malformed

       ::ex/validation-failed)
      (receive-queue/enqueue->receive-q q
                                        {:op :error
                                         :app-id app-id
                                         :status 400
                                         :client-event-id client-event-id
                                         :original-event (merge original-event
                                                                debug-info)
                                         :type (keyword (name type))
                                         :message message
                                         :hint hint
                                         :session-id sess-id})

      (::ex/session-missing
       ::ex/socket-missing
       ::ex/socket-error)
      (tracer/record-exception-span! instant-ex
                                     {:name "receive-worker/socket-unreachable"})

      (do
        (tracer/add-exception! instant-ex {:escaping? false})
        (receive-queue/enqueue->receive-q q
                                          {:op :error
                                           :app-id app-id
                                           :status 500
                                           :client-event-id client-event-id
                                           :original-event (merge original-event
                                                                  debug-info)
                                           :type (keyword (name type))
                                           :message message
                                           :hint hint
                                           :session-id sess-id})))))

(defn- handle-uncaught-err [session app-id original-event root-err debug-info]
  (let [sess-id (:session/id session)
        q (:receive-q (:session/socket session))
        {:keys [client-event-id]} original-event]
    (tracer/add-exception! root-err {:escaping? false})

    (receive-queue/enqueue->receive-q q
                                      {:op :error
                                       :app-id app-id
                                       :client-event-id client-event-id
                                       :status 500
                                       :original-event (merge original-event
                                                              debug-info)
                                       :message (str "Yikes, something broke on our end! Sorry about that."
                                                     " Please ping us (Joe and Stopa) on Discord and let us know!")
                                       :session-id sess-id})))

(defn handle-receive-attrs [store-conn session event metadata]
  (let [{:keys [session/socket]} session
        sess-id (:session/id session)
        event-attrs (event-attributes store-conn sess-id event)]
    (assoc (merge metadata event-attrs)
           :socket-origin (socket-origin socket)
           :socket-ip (socket-ip socket)
           :session-id sess-id)))

(defn handle-receive [store-conn session event metadata]
  (tracer/with-exceptions-silencer [silence-exceptions]
    (tracer/with-span! {:name "receive-worker/handle-receive"
                        :attributes (handle-receive-attrs store-conn session event metadata)}
      (let [pending-handlers (:pending-handlers (:session/socket session))
            in-progress-stmts (sql/make-statement-tracker)
            debug-info (atom nil)
            event-fut (binding [sql/*in-progress-stmts* in-progress-stmts]
                        (ua/vfuture (handle-event store-conn
                                                  session
                                                  event
                                                  debug-info)))
            pending-handler {:future event-fut
                             :op (:op event)
                             :in-progress-stmts in-progress-stmts
                             :silence-exceptions silence-exceptions}]
        (swap! pending-handlers conj pending-handler)
        (tracer/add-data! {:attributes {:concurrent-handler-count (count @pending-handlers)}})
        (try
          (let [ret (deref event-fut handle-receive-timeout-ms :timeout)]
            (when (= :timeout ret)
              (let [in-progress-count (count @(:stmts in-progress-stmts))
                    _ (sql/cancel-in-progress in-progress-stmts)
                    cancel-res (future-cancel event-fut)]
                (tracer/add-data! {:attributes
                                   {:timedout true
                                    :in-progress-query-count in-progress-count
                                    ;; If false, then canceling the queries let
                                    ;; the future complete before we could cancel it
                                    :future-cancel-result cancel-res}}))
              (ex/throw-operation-timeout! :handle-receive handle-receive-timeout-ms)))

          (catch CancellationException _e
            ;; We must have cancelled this in the on-close, so don't try to do any
            ;; error handling
            (tracer/record-info! {:name "handle-receive-cancelled"}))
          (catch Throwable e
            (tracer/record-info! {:name "caught-throwable"})
            (let [original-event event
                  instant-ex (ex/find-instant-exception e)
                  root-err (root-cause e)
                  app-id (some-> (rs/get-auth @store-conn (:session/id session))
                                 :app
                                 :id)]
              (cond
                instant-ex (handle-instant-exception session
                                                     app-id
                                                     original-event
                                                     instant-ex
                                                     @debug-info)
                :else (handle-uncaught-err session
                                           app-id
                                           original-event
                                           root-err
                                           @debug-info))))
          (finally
            (swap! pending-handlers disj pending-handler)))))))

(defn process-receive-q-entry [store-conn entry metadata]
  (let [{:keys [put-at item skipped-size]} entry
        {:keys [session-id] :as event} item
        now (Instant/now)
        session (rs/get-session @store-conn session-id)]
    (cond
      (not session)
      (tracer/record-info! {:name "receive-worker/session-not-found"
                            :attributes (assoc metadata
                                               :session-id session-id)})

      :else
      (handle-receive
       store-conn

       (into {} session)
       (assoc event
              :total-delay-ms
              (.toMillis (Duration/between put-at now))
              :ws-ping-latency-ms
              (some-> session
                      :session/socket
                      :get-ping-latency-ms
                      (#(%))))
       (assoc metadata :skipped-size skipped-size)))))

(defmulti consolidate
  (fn [type batch]
    (if (= 1 (count batch))
      :default
      type)))

(defmethod consolidate :default [_ batch]
  batch)

(defmethod consolidate :refresh [_ batch]
  [(-> (first batch)
       (assoc :skipped-size (dec (count batch))))])

(defmethod consolidate :refresh-presence [_ batch]
  [(-> (last batch)
       (assoc :skipped-size (dec (count batch)))
       (assoc-in [:item :edits]
                 (into [] (mapcat #(get-in % [:item :edits])) batch)))])

(defmethod consolidate :room [_ batch]
  (loop [last-entry (first batch)
         batch      (next batch)
         acc        (transient [])]
    (if (empty? batch)
      (persistent! (conj! acc last-entry))
      (let [entry       (first batch)
            last-entry' (if (and (= :set-presence (-> last-entry :item :op))
                                 (= :set-presence (-> entry :item :op)))
                          (assoc entry :skipped-size (inc (:skipped-size last-entry 0)))
                          entry)]
        (recur last-entry' (next batch) acc)))))

(defn straight-jacket-process-receive-q-batch [store-conn batch metadata]
  (try
    (let [type (-> metadata :group-key first)]
      (doseq [entry (consolidate type batch)]
        (process-receive-q-entry store-conn entry metadata)))
    (catch Throwable e
      (tracer/record-exception-span! e {:name "receive-worker/handle-receive-batch-straight-jacket"
                                        :attributes (assoc metadata
                                                           :session-id (:session-id (:item (first batch)))
                                                           :items batch)}))))

(defn receive-worker-reserve-fn [[t] inflight-q]
  (case t
    (:refresh :room :refresh-presence)
    (grouped-queue/inflight-queue-reserve-all inflight-q)

    (grouped-queue/inflight-queue-reserve 1 inflight-q)))

(defn start-receive-worker [store-conn receive-q stop-signal id]
  (ua/vfut-bg
   (loop []
     (if @stop-signal
       (tracer/record-info! {:name "receive-worker/shutdown-complete"
                             :attributes {:worker-n id}})
       (do (grouped-queue/process-polling!
            receive-q
            {:reserve-fn receive-worker-reserve-fn
             :process-fn (fn [group-key batch]
                           (straight-jacket-process-receive-q-batch store-conn
                                                                    batch
                                                                    {:worker-n id
                                                                     :batch-size (count batch)
                                                                     :group-key group-key}))})
           (recur))))))

(defn start-receive-workers [store-conn receive-q stop-signal]
  (doseq [n (range num-receive-workers)]
    (start-receive-worker store-conn receive-q stop-signal n)))

;; -----------------
;; Websocket Interop

(defn on-open [store-conn {:keys [id] :as socket}]
  (tracer/with-span! {:name "socket/on-open"
                      :attributes {:session-id (:id socket)}}
    (rs/add-socket! store-conn id socket)))

(defn on-message [{:keys [id receive-q data]}]
  (receive-queue/enqueue->receive-q receive-q (-> (<-json data true)
                                                  (update :op keyword)
                                                  (assoc :session-id id))))

(defn on-error [{:keys [id error]}]
  (condp instance? error
    java.io.IOException nil
    (tracer/record-exception-span! error {:name "socket/on-error"
                                          :attributes {:session-id id}
                                          :escaping? false})))

(defn on-close [store-conn {:keys [id pending-handlers]}]
  (tracer/with-span! {:name "socket/on-close"
                      :attributes {:session-id id}}
    (doseq [{:keys [op
                    future
                    silence-exceptions
                    in-progress-stmts]} @pending-handlers
            :let [in-progress-count (count @(:stmts in-progress-stmts))]]
      (tracer/with-span! {:name "cancel-pending-handler"
                          :attributes {:op op
                                       :in-progress-query-count in-progress-count}}
        (silence-exceptions true)
        (sql/cancel-in-progress in-progress-stmts)
        (future-cancel future)))

    (let [app-id (-> (rs/get-auth @store-conn id)
                     :app
                     :id)]
      (rs/remove-session! store-conn id)
      (eph/leave-by-session-id! app-id id))))

(defn undertow-config
  [store-conn receive-q {:keys [id]}]
  (let [pending-handlers (atom #{})
        atomic-ping-latency-nanos (AtomicLong. 0)]
    {:undertow/websocket
     {:set-ping-latency-nanos (fn [^Long v]
                                (.set atomic-ping-latency-nanos v))
      :on-open (fn [{ws-conn :channel http-req :exchange :as _req}]
                 (let [socket {:id id
                               :http-req http-req
                               :ws-conn ws-conn
                               :receive-q receive-q
                               :pending-handlers pending-handlers
                               :get-ping-latency-ms (fn []
                                                      (double (/ (.get atomic-ping-latency-nanos)
                                                                 1000000.0)))}]
                   (on-open store-conn socket)))
      :on-message (fn [{:keys [data]}]
                    (on-message {:id id
                                 :data data
                                 :receive-q receive-q}))
      :on-error (fn [{:keys [error]}]
                  (on-error {:id id
                             :error error}))
      :on-close (fn [_]
                  (on-close store-conn
                            {:id id
                             :pending-handlers pending-handlers}))}}))

;; ------
;; System

(defn group-fn [{:keys [item] :as _input}]
  (let [{:keys [op session-id room-id]} item]
    (case op
      :transact
      [:transact session-id]

      (:join-room :leave-room :set-presence :client-broadcast :server-broadcast)
      [:room session-id room-id]

      (:add-query :remove-query)
      (let [{:keys [q]} item]
        [:query session-id q])

      :refresh
      [:refresh session-id]

      :refresh-presence
      [:refresh-presence session-id room-id]

      :error
      [:error session-id]

      nil)))

(comment
  (group-fn {:item {:session-id 1 :op :transact}})
  (group-fn {:item {:session-id 1 :op :leave-room}})
  (group-fn {:item {:session-id 1 :op :add-query :q {:users {}}}}))

(defn start []
  (receive-queue/start #'group-fn)
  (def receive-q-stop-signal (atom false))

  (ua/fut-bg
   (start-receive-workers
    rs/store-conn
    receive-q
    receive-q-stop-signal)))

(defn stop []
  (reset! receive-q-stop-signal true)
  (receive-queue/stop))

(defn restart []
  (stop)
  (start))
