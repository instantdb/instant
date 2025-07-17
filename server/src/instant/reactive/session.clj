(ns instant.reactive.session
  "Manager for the lifecycle of a user session.

   When a user connects over a socket, they can authenticate,
   subscribe/unsubscribe from queries, make transsactions, and receive updates.

   Each connection has their own `session` worker, that can understand these
   commands."
  (:require
   [clojure.main :refer [root-cause]]
   [instant.config :as config]
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
   [instant.reactive.receive-queue :as receive-queue]
   [instant.reactive.store :as rs]
   [instant.util.async :as ua]
   [instant.util.delay :as delay]
   [instant.util.exception :as ex]
   [instant.util.json :refer [<-json]]
   [instant.util.semver :as semver]
   [instant.util.e2e-tracer :as e2e-tracer]
   [instant.util.tracer :as tracer]
   [instant.util.uuid :as uuid-util]
   [lambdaisland.uri :as uri])
  (:import
   (java.util.concurrent CancellationException)
   (java.util.concurrent.atomic AtomicLong)))

;; ------
;; Setup

(def handle-receive-timeout-ms 5000)

(def num-receive-workers (* (if config/fewer-vfutures?
                              20
                              100)
                            (delay/cpu-count)))

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
    (pg-introspect/introspect (aurora/conn-pool :read) (or (->> connection-string
                                                                (app-model/decrypt-connection-string (:id app))
                                                                uri/query-map
                                                                :currentSchema)
                                                           "public"))
    {:attrs (attr-model/get-by-app-id (:id app))}))

(def refresh-skip-attrs-min-version
  (semver/parse "v0.20.4"))

(defn- handle-init! [store sess-id event]
  (let [{:keys [refresh-token client-event-id versions]
         admin-token :__admin-token} event
        prev-auth   (:session/auth (rs/session store sess-id))
        _           (when prev-auth
                      (ex/throw-validation-err! :init event [{:message "`init` has already run for this session."}]))
        app-id      (ex/get-param! event [:app-id] uuid-util/coerce)
        app         (app-model/get-by-id! {:id app-id})
        {:keys [attrs]} (get-attrs app)
        user        (when refresh-token
                      (app-user-model/get-by-refresh-token!
                       {:app-id app-id :refresh-token refresh-token}))
        creator     (instant-user-model/get-by-app-id {:app-id app-id})
        admin?      (and admin-token
                         (boolean
                          (app-admin-token-model/fetch! {:app-id app-id
                                                         :token admin-token})))
        auth        {:app    app
                     :user   user
                     :admin? admin?}
        parsed-version  (some-> versions (get core-version-key) (semver/parse))
        can-skip-attrs? (and (flags/refresh-skip-attrs? app-id)
                             parsed-version
                             (pos? (semver/compare-semver parsed-version refresh-skip-attrs-min-version)))]
    (tracer/add-data! {:attributes (auth-and-creator-attrs auth creator versions)})
    (apply rs/assoc-session! store sess-id
           :session/auth auth
           :session/creator creator
           (concat
            (when versions
              [:session/versions versions])
            (when can-skip-attrs?
              [:session/attrs-hash (hash attrs)])))
    (rs/send-event! store app-id sess-id {:op              :init-ok
                                          :session-id      sess-id
                                          :client-event-id client-event-id
                                          :auth            auth
                                          :attrs           attrs})))

(defn- get-auth! [store sess-id]
  (let [{:session/keys [auth]} (rs/session store sess-id)]
    (when-not (:app auth)
      (ex/throw-validation-err! :init {:sess-id sess-id} [{:message "`init` has not run for this session."}]))
    auth))

(defn- handle-add-query! [store sess-id {:keys [q client-event-id return-type] :as _event}]
  (let [{:keys [app user admin?]} (get-auth! store sess-id)
        {app-id :id}    app
        instaql-queries (rs/session-instaql-queries store app-id sess-id)]
    (cond
      (contains? instaql-queries q)
      (rs/send-event! store app-id sess-id {:op :add-query-exists :q q
                                            :client-event-id client-event-id})

      (nil? q)
      (ex/throw-validation-err! :add-query
                                {:q q}
                                [{:message "Query can not be null."}])

      :else
      (let [return-type (keyword (or return-type "join-rows"))
            processed-tx-id (rs/get-processed-tx-id store app-id)
            {:keys [table-info]} (get-attrs app)
            attrs (attr-model/get-by-app-id app-id)
            ctx {:db             {:conn-pool (aurora/conn-pool :read)}
                 :datalog-loader (rs/upsert-datalog-loader! store sess-id d/make-loader)
                 :session-id     sess-id
                 :app-id         app-id
                 :attrs          attrs
                 :table-info     table-info
                 :admin?         admin?
                 :current-user   user}
            {:keys [instaql-result]} (rq/instaql-query-reactive! store ctx q return-type)]
        (rs/send-event! store app-id sess-id {:op :add-query-ok
                                              :q q
                                              :result instaql-result
                                              :processed-tx-id processed-tx-id
                                              :client-event-id client-event-id})))))

(defn- handle-remove-query! [store sess-id {:keys [q client-event-id] :as _event}]
  (let [{:keys [app]} (get-auth! store sess-id)]
    (rs/remove-query! store (:id app) sess-id q)
    (rs/send-event! store (:id app) sess-id {:op :remove-query-ok :q q
                                             :client-event-id client-event-id})))

(defn- recompute-instaql-query!
  [{:keys [store current-user app-id sess-id attrs table-info admin?]}
   {:keys [instaql-query/query instaql-query/return-type]}]
  (let [ctx {:db {:conn-pool (aurora/conn-pool :read)}
             :session-id sess-id
             :app-id app-id
             :attrs attrs
             ;; Will only be present for byop apps
             :table-info table-info
             :current-user current-user
             :admin? admin?}
        {:keys [instaql-result result-changed?]}
        (rq/instaql-query-reactive! store ctx query return-type)]
    {:instaql-query query
     :instaql-result instaql-result
     :result-changed? result-changed?}))

(defn- handle-refresh! [store sess-id event debug-info]
  (e2e-tracer/invalidator-tracking-step! {:tx-id (:tx-id event)
                                          :tx-created-at (:tx-created-at event)
                                          :name "start-refresh"
                                          :attributes {:session-id sess-id}})
  (let [auth (get-auth! store sess-id)
        app-id (-> auth :app :id)
        current-user (-> auth :user)
        admin? (-> auth :admin?)
        {:keys [attrs table-info]} (get-attrs (:app auth))
        stale-queries (rs/get-stale-instaql-queries store app-id sess-id)
        opts {:store store
              :app-id app-id
              :current-user current-user
              :sess-id sess-id
              :attrs attrs
              :table-info table-info
              :admin? admin?}
        processed-tx-id (rs/get-processed-tx-id store app-id)
        _ (reset! debug-info {:processed-tx-id processed-tx-id
                              :instaql-queries (map :instaql-query/query stale-queries)})
        recompute-results (->> stale-queries
                               (ua/pmap (partial recompute-instaql-query! opts)))
        {computations true spam false} (group-by :result-changed? recompute-results)
        num-spam (count spam)
        num-computations (count computations)
        num-recomputations (count recompute-results)
        drop-spam? (flags/drop-refresh-spam? app-id)
        computations (if drop-spam?
                       computations
                       recompute-results)
        tracer-attrs {:num-recomputations num-recomputations
                      :num-spam num-spam
                      :num-computations num-computations
                      :dropped-spam? drop-spam?
                      :tx-latency-ms (e2e-tracer/tx-latency-ms (:tx-created-at event))}
        {prev-attrs-hash :session/attrs-hash
         version :session/versions} (rs/session store sess-id)
        parsed-version  (some-> version (get core-version-key) (semver/parse))
        can-skip-attrs? (and (flags/refresh-skip-attrs? app-id)
                             parsed-version
                             (pos? (semver/compare-semver parsed-version refresh-skip-attrs-min-version)))
        attrs-hash      (hash attrs)
        attrs-changed?  (not= prev-attrs-hash attrs-hash)]
    (when (and can-skip-attrs? attrs-changed?)
      (rs/assoc-session! store sess-id :session/attrs-hash attrs-hash))
    (e2e-tracer/invalidator-tracking-step! {:tx-id (:tx-id event)
                                            :tx-created-at (:tx-created-at event)
                                            :name "finish-refresh-queries"
                                            :attributes (assoc tracer-attrs
                                                               :session-id sess-id)})
    (tracer/with-span! {:name "handle-refresh/send-event!"
                        :attributes tracer-attrs}
      (when (seq computations)
        (rs/send-event! store app-id sess-id (with-meta
                                               (cond->
                                                {:op :refresh-ok
                                                 :processed-tx-id processed-tx-id
                                                 :computations computations}
                                                 (or (not can-skip-attrs?) attrs-changed?)
                                                 (assoc :attrs attrs))
                                               {:tx-id (:tx-id event)
                                                :tx-created-at (:tx-created-at event)
                                                :session-id sess-id}))))))

;; -----
;; transact

(defn handle-transact!
  [store sess-id {:keys [tx-steps client-event-id] :as _event}]
  (let [auth (get-auth! store sess-id)
        app-id (-> auth :app :id)
        coerced (tx/coerce! tx-steps)
        _ (tx/validate! coerced)
        {tx-id :id}
        (permissioned-tx/transact!
         {:db {:conn-pool (aurora/conn-pool :write)}
          :rules (rule-model/get-by-app-id {:app-id app-id})
          :app-id app-id
          :current-user (:user auth)
          :admin? (:admin? auth)
          :datalog-query-fn d/query
          :attrs (attr-model/get-by-app-id app-id)}
         coerced)]
    (rs/send-event! store app-id sess-id
                    {:op :transact-ok
                     :tx-id tx-id
                     :client-event-id client-event-id})))

;; -----
;; error

(defn handle-error! [store sess-id {:keys [status
                                           app-id
                                           client-event-id
                                           original-event
                                           type
                                           message
                                           hint]}]
  (rs/send-event! store
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
  [store
   session-id
   {:keys [op
           client-event-id
           total-delay-ms
           ws-ping-latency-ms] :as _event}]
  (let [{:session/keys [auth creator versions]} (rs/session store session-id)]
    (merge
     {:op op
      :client-event-id client-event-id
      :session-id session-id
      :total-delay-ms total-delay-ms
      :ws-ping-latency-ms ws-ping-latency-ms}
     (auth-and-creator-attrs auth creator versions))))

(defn validate-room-id [event]
  (ex/get-param! event [:room-id] (fn [s]
                                    (when (string? s)
                                      s))))

(defn- handle-join-room! [store sess-id {:keys [client-event-id data] :as event}]
  (let [auth (get-auth! store sess-id)
        app-id (-> auth :app :id)
        current-user (-> auth :user)
        room-id (validate-room-id event)]
    (eph/join-room! app-id sess-id current-user room-id data)
    (rs/send-event! store app-id sess-id {:op :join-room-ok
                                          :room-id room-id
                                          :client-event-id client-event-id})))

(defn- handle-leave-room! [store sess-id {:keys [client-event-id] :as event}]
  (let [auth (get-auth! store sess-id)
        app-id (-> auth :app :id)
        room-id (validate-room-id event)]
    (eph/leave-room! app-id sess-id room-id)
    (rs/send-event! store app-id sess-id {:op :leave-room-ok
                                          :room-id room-id
                                          :client-event-id client-event-id})))

(defn assert-in-room! [app-id room-id sess-id]
  (when-not (eph/in-room? app-id room-id sess-id)
    (ex/throw-validation-err!
     :room
     {:app-id app-id :room-id room-id :session-id sess-id}
     [{:message "You have not entered this room yet."}])))

(defn- handle-set-presence!
  [store sess-id {:keys [client-event-id data] :as event}]
  (let [auth (get-auth! store sess-id)
        app-id (-> auth :app :id)
        room-id (validate-room-id event)
        _ (assert-in-room! app-id room-id sess-id)]
    (eph/set-presence! app-id sess-id room-id data)
    (rs/send-event! store app-id sess-id {:op :set-presence-ok
                                          :room-id room-id
                                          :client-event-id client-event-id})))

(def patch-presence-min-version
  (semver/parse "v0.17.5"))

(defn- handle-refresh-presence! [store sess-id {:keys [app-id data edits] :as event}]
  (let [version (-> (rs/session store sess-id)
                    :session/versions
                    (get core-version-key))
        room-id (validate-room-id event)]
    (cond
      (and edits (empty? edits))
      :nop

      (and edits
           (flags/use-patch-presence? app-id)
           (when-let [parsed-version (some-> version (semver/parse))]
             (pos? (semver/compare-semver parsed-version
                                          patch-presence-min-version))))
      (rs/send-event! store app-id sess-id
                      {:op      :patch-presence
                       :room-id room-id
                       :edits   edits})

      :else
      (rs/send-event! store app-id sess-id
                      {:op      :refresh-presence
                       :room-id room-id
                       :data    data}))))

(defn- handle-client-broadcast!
  "Broadcasts a client message to other sessions in the room"
  [store sess-id {:keys [client-event-id topic data] :as event}]
  (let [auth (get-auth! store sess-id)
        app-id (-> auth :app :id)
        room-id (validate-room-id event)
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
            :let [q (-> (rs/session store notify-sess-id) :session/socket :receive-q)]
            :when (and q (not= sess-id notify-sess-id))]
      (receive-queue/put! q
                          (assoc base-msg
                                 :op :server-broadcast
                                 :session-id notify-sess-id
                                 :app-id app-id)))
    (when (seq remote-ids)
      (eph/broadcast app-id remote-ids base-msg))

    (rs/send-event! store app-id sess-id (assoc base-msg
                                                :op :client-broadcast-ok
                                                :client-event-id client-event-id))))

(defn- handle-server-broadcast! [store sess-id {:keys [app-id topic data] :as event}]
  (let [room-id (validate-room-id event)]
    (when (eph/in-room? app-id room-id sess-id)
      (rs/send-event! store app-id sess-id {:op :server-broadcast
                                            :room-id room-id
                                            :topic topic
                                            :data data}))))

(defn handle-event [store session event debug-info]
  (let [{:keys [op]} event
        {:keys [session/socket]} session
        {:keys [id]} socket]
    (tracer/add-data! {:attributes (event-attributes store id event)})
    (case op
      :init         (handle-init! store id event)
      :add-query    (handle-add-query! store id event)
      :remove-query (handle-remove-query! store id event)
      :refresh      (handle-refresh! store id event debug-info)
      :transact     (handle-transact! store id event)
      :error        (handle-error! store id event)
      ;; -----
      ;; EPH events
      :join-room        (handle-join-room! store id event)
      :leave-room       (handle-leave-room! store id event)
      :set-presence     (handle-set-presence! store id event)
      :refresh-presence (handle-refresh-presence! store id event)
      :client-broadcast (handle-client-broadcast! store id event)
      :server-broadcast (handle-server-broadcast! store id event))))

;; --------------
;; Receive Workers

(defn- handle-instant-exception [session app-id original-event instant-ex debug-info]
  (let [sess-id (:session/id session)
        q (:receive-q (:session/socket session))
        {:keys [client-event-id]} original-event
        {:keys [::ex/type ::ex/message ::ex/hint] :as err-data} (ex-data instant-ex)]
    (tracer/add-data! {:attributes {:err-data (pr-str err-data)}})
    (if (= :error (:op original-event))
      ;; Don't send an error if we failed to send the error or we'll get into an
      ;; infinite loop of errors
      (tracer/add-data! {:attributes {:error-on-error true}})
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
        (receive-queue/put! q
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
          (receive-queue/put! q
                              {:op :error
                               :app-id app-id
                               :status 500
                               :client-event-id client-event-id
                               :original-event (merge original-event
                                                      debug-info)
                               :type (keyword (name type))
                               :message message
                               :hint hint
                               :session-id sess-id}))))))

(defn- handle-uncaught-err [session app-id original-event root-err debug-info]
  (let [sess-id (:session/id session)
        q (:receive-q (:session/socket session))
        {:keys [client-event-id]} original-event]
    (tracer/add-exception! root-err {:escaping? false})

    (receive-queue/put! q
                        {:op :error
                         :app-id app-id
                         :client-event-id client-event-id
                         :status 500
                         :original-event (merge original-event
                                                debug-info)
                         :message (str "Yikes, something broke on our end! Sorry about that."
                                       " Please ping us (Joe and Stopa) on Discord and let us know!")
                         :session-id sess-id})))

(defn handle-receive-attrs [store session event metadata]
  (let [{:keys [session/socket]} session
        sess-id (:session/id session)
        event-attrs (event-attributes store sess-id event)]
    (assoc (merge metadata event-attrs)
           :socket-origin (rs/socket-origin socket)
           :socket-ip (rs/socket-ip socket)
           :session-id sess-id)))

(defn handle-receive [store session event metadata]
  (tracer/with-exceptions-silencer [silence-exceptions]
    (tracer/with-span! {:name "receive-worker/handle-receive"
                        :attributes (handle-receive-attrs store session event metadata)}
      (let [pending-handlers (:pending-handlers (:session/socket session))
            in-progress-stmts (sql/make-statement-tracker)
            debug-info (atom nil)
            app-id (-> session :session/auth :app :id)
            timeout-ms (or (when app-id
                             (flags/handle-receive-timeout app-id))
                           handle-receive-timeout-ms)
            event-fut (binding [sql/*in-progress-stmts* in-progress-stmts]
                        (if config/fewer-vfutures?
                          (ua/tracked-future (handle-event store
                                                           session
                                                           event
                                                           debug-info))
                          (ua/vfuture (handle-event store
                                                    session
                                                    event
                                                    debug-info))))
            pending-handler {:future event-fut
                             :op (:op event)
                             :in-progress-stmts in-progress-stmts
                             :silence-exceptions silence-exceptions}]
        (swap! pending-handlers conj pending-handler)
        (tracer/add-data! {:attributes {:timeout-ms timeout-ms
                                        :concurrent-handler-count (count @pending-handlers)}})
        (try
          (let [ret (deref event-fut timeout-ms :timeout)]
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
              (ex/throw-operation-timeout! :handle-receive timeout-ms)))

          (catch CancellationException _e
            ;; We must have cancelled this in the on-close, so don't try to do any
            ;; error handling
            (tracer/record-info! {:name "handle-receive-cancelled"}))
          (catch Throwable e
            (tracer/record-info! {:name "caught-throwable"})
            (let [original-event event
                  instant-ex (ex/find-instant-exception e)
                  root-err (root-cause e)
                  app-id (some-> (rs/session store (:session/id session))
                                 :session/auth
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

(defn process-receive-q-event [store event metadata]
  (let [{:keys [session-id]
         ::grouped-queue/keys [put-at]} event]
    (if-some [session (rs/session store session-id)]
      (let [session            (into {} session)
            total-delay-ms     (- (System/currentTimeMillis) put-at)
            ws-ping-latency-ms (some-> session
                                       :session/socket
                                       :get-ping-latency-ms
                                       (#(%)))
            event              (assoc event
                                      :total-delay-ms total-delay-ms
                                      :ws-ping-latency-ms ws-ping-latency-ms)
            metadata           (assoc metadata :skipped-size (dec (::grouped-queue/combined event 1)))]
        (handle-receive store session event metadata))
      (tracer/record-info! {:name "receive-worker/session-not-found"
                            :attributes (assoc metadata :session-id session-id)}))))

(defn straight-jacket-process-receive-q-event [store group-key event]
  (let [metadata {:group-key group-key}]
    (try
      (process-receive-q-event store event metadata)
      (catch Throwable e
        (tracer/record-exception-span! e {:name "receive-worker/straight-jacket-process-receive-q-event"
                                          :attributes (assoc metadata
                                                             :session-id (:session-id event)
                                                             :event event)})))))

;; -----------------
;; Websocket Interop

(defn on-open [store {sess-id :id :as socket}]
  (tracer/with-span! {:name "socket/on-open"
                      :attributes {:session-id sess-id}}
    (rs/assoc-session! store sess-id :session/socket socket)))

(defn on-message [{:keys [id receive-q data]}]
  (receive-queue/put! receive-q (-> (<-json data true)
                                    (update :op keyword)
                                    (assoc :session-id id))))

(defn on-error [{:keys [id error]}]
  (condp instance? error
    java.io.IOException nil
    (tracer/record-exception-span! error {:name "socket/on-error"
                                          :attributes {:session-id id}
                                          :escaping? false})))

(defn on-close [store {:keys [id pending-handlers]}]
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

    (let [app-id (-> (rs/session store id)
                     :session/auth
                     :app
                     :id)]
      (rs/remove-session! store app-id id)
      (eph/leave-by-session-id! app-id id))))

(defn undertow-config
  [store receive-q {:keys [id]}]
  (let [pending-handlers (atom #{})
        atomic-ping-latency-nanos (AtomicLong. 0)]
    {:undertow/websocket
     {:set-ping-latency-nanos (fn [^Long v]
                                (.set atomic-ping-latency-nanos v))
      :on-open (fn [req]
                 (let [socket {:id id
                               :http-req (:exchange req)
                               :ws-conn (:channel req)
                               :receive-q receive-q
                               :pending-handlers pending-handlers
                               :get-ping-latency-ms (fn []
                                                      (double (/ (.get atomic-ping-latency-nanos)
                                                                 1000000.0)))}]
                   (on-open store socket)))
      :on-message (fn [{:keys [data]}]
                    (on-message {:id id
                                 :data data
                                 :receive-q receive-q}))
      :on-error (fn [{:keys [error]}]
                  (on-error {:id id
                             :error error}))
      :on-close (fn [_]
                  (on-close store
                            {:id id
                             :pending-handlers pending-handlers}))}}))

;; ------
;; System

(defn group-key [{:keys [op session-id room-id q]}]
  (case op
    :transact
    [:transact session-id]

    (:join-room :leave-room :set-presence :client-broadcast :server-broadcast)
    [:room session-id room-id]

    (:add-query :remove-query)
    [:query session-id q]

    :refresh
    [:refresh session-id]

    :refresh-presence
    [:refresh-presence session-id room-id]

    :error
    [:error session-id]

    nil))

(defmulti combine
  (fn [event1 event2]
    [(:op event1) (:op event2)]))

(defmethod combine :default [_ _]
  nil)

(defmethod combine [:refresh :refresh] [event1 event2]
  (e2e-tracer/invalidator-tracking-step!
   {:name          "skipped-refresh"
    :tx-id         (:tx-id event1)
    :tx-created-at (:tx-created-at event1)})
  event2)

(defmethod combine [:refresh-presence :refresh-presence] [event1 event2]
  (update event2 :edits #(into (vec (:edits event1)) %)))

(defmethod combine [:set-presence :set-presence] [_event1 event2]
  event2)

(defn process [group-key event]
  (straight-jacket-process-receive-q-event rs/store group-key event))

(defn start []
  (receive-queue/start
   (grouped-queue/start
    {:group-key-fn #'group-key
     :combine-fn   #'combine
     :process-fn   #'process
     :max-workers  num-receive-workers
     :metrics-path "instant.reactive.session.receive-q"})))

(defn stop []
  (receive-queue/stop))

(defn restart []
  (stop)
  (start))

(defn before-ns-unload []
  (stop))

(defn after-ns-reload []
  (start))
