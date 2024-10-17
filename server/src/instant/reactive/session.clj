(ns instant.reactive.session
  "Manager for the lifecycle of a user session.

   When a user connects over a socket, they can authenticate,
   subscribe/unsubscribe from queries, make transsactions, and receive updates.

   Each connection has their own `session` worker, that can understand these
   commands."
  (:require
   [lambdaisland.uri :as uri]
   [instant.config :as config]
   [instant.util.async :as ua]
   [instant.jdbc.aurora :as aurora]
   [instant.reactive.store :as rs]
   [instant.reactive.query :as rq]
   [instant.db.transaction :as tx]
   [instant.util.tracer :as tracer]
   [instant.db.datalog :as d]
   [instant.util.json :refer [<-json]]
   [instant.util.delay :as delay]
   [instant.model.app :as app-model]
   [instant.db.model.attr :as attr-model]
   [instant.db.pg-introspect :as pg-introspect]
   [instant.model.app-user :as app-user-model]
   [instant.model.instant-user :as instant-user-model]
   [instant.model.app-admin-token :as app-admin-token-model]
   [instant.db.permissioned-transaction :as permissioned-tx]
   [instant.model.rule :as rule-model]
   [clojure.main :refer [root-cause]]
   [instant.reactive.ephemeral :as eph]
   [instant.util.exception :as ex]
   [instant.util.uuid :as uuid-util]
   [instant.reactive.session :as session]
   [instant.grouped-queue :as grouped-queue]
   [instant.gauges :as gauges])
  (:import
   (java.util.concurrent CancellationException)
   (java.util.concurrent.atomic AtomicLong)
   (java.time Duration Instant)))

;; ------
;; Setup

(declare receive-q)
(declare receive-q-stop-signal)
(def handle-receive-timeout-ms 5000)

(def num-receive-workers (* 3 (delay/cpu-count)))

;; ------
;; handlers

(defn auth-and-creator-attrs [auth creator]
  {:app-id (-> auth :app :id)
   :app-title (-> auth :app :title)
   :app-user-email (-> auth :user :email)
   :creator-id (-> creator :id)
   :creator-email (-> creator :email)})

;; -------
;; init

(defn get-attrs [app]
  (if-let [connection-string (-> app :connection_string)]
    ;; TODO(byop): Separate connection for byop app
    (pg-introspect/introspect aurora/conn-pool (or (->> connection-string
                                                        (app-model/decrypt-connection-string (:id app))
                                                        uri/query-map
                                                        :currentSchema)
                                                   "public"))
    {:attrs (attr-model/get-by-app-id (:id app))}))

(defn- handle-init! [store-conn sess-id
                     {:keys [refresh-token client-event-id __admin-token] :as event}]
  (let [prev-auth (rs/get-auth @store-conn sess-id)
        _ (when prev-auth
            (ex/throw-validation-err! :init event [{:message "`init` has already run for this session."}]))
        app-id (ex/get-param! event [:app-id] uuid-util/coerce)
        app (app-model/get-by-id! {:id app-id})
        {:keys [attrs]} (get-attrs app)
        user (when refresh-token
               (app-user-model/get-by-refresh-token!
                {:app-id app-id :refresh-token refresh-token}))
        creator (instant-user-model/get-by-app-id
                 aurora/conn-pool {:app-id app-id})
        admin? (and __admin-token
                    (boolean
                     (app-admin-token-model/fetch! {:app-id app-id
                                                    :token __admin-token})))
        auth {:app app :user user :admin? admin?}]
    (tracer/add-data! {:attributes (auth-and-creator-attrs auth creator)})
    (rs/set-auth! store-conn sess-id auth)
    (rs/set-creator! store-conn sess-id creator)
    (rs/send-event! store-conn sess-id {:op :init-ok
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
      (rs/send-event! store-conn sess-id {:op :add-query-exists :q q
                                          :client-event-id client-event-id})

      :else
      (let [return-type (keyword (or return-type "join-rows"))
            {app-id :id} app
            processed-tx-id (rs/get-processed-tx-id @store-conn app-id)
            {:keys [table-info]} (get-attrs app)
            attrs (attr-model/get-by-app-id app-id)
            ctx {:db {:conn-pool aurora/conn-pool}
                 :datalog-loader (rs/upsert-datalog-loader! store-conn sess-id d/make-loader)
                 :session-id sess-id
                 :app-id app-id
                 :attrs attrs
                 :table-info table-info
                 :admin? admin?
                 :current-user user}
            {:keys [instaql-result]} (rq/instaql-query-reactive! store-conn ctx q return-type)]
        (rs/send-event! store-conn sess-id {:op :add-query-ok :q q :result instaql-result
                                            :processed-tx-id processed-tx-id
                                            :client-event-id client-event-id})))))

(defn- handle-remove-query! [store-conn sess-id {:keys [q client-event-id] :as _event}]
  (let [{:keys [app]} (get-auth! store-conn sess-id)]
    (rs/remove-query! store-conn sess-id (:id app) q)
    (rs/send-event! store-conn sess-id {:op :remove-query-ok :q q
                                        :client-event-id client-event-id})))

(defn- recompute-instaql-query!
  [{:keys [store-conn current-user app-id sess-id attrs table-info admin?]}
   {:keys [instaql-query/query instaql-query/return-type]}]
  (let [ctx {:db {:conn-pool aurora/conn-pool}
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

(defn- handle-refresh! [store-conn sess-id _event]
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
        recompute-results (->> stale-queries
                               (ua/vfuture-pmap (partial recompute-instaql-query! opts)))
        {computations true spam false} (group-by :result-changed? recompute-results)
        num-spam (count spam)
        num-computations (count computations)
        num-recomputations (count recompute-results)
        computations (if config/drop-refresh-spam?
                       computations
                       recompute-results)]
    (tracer/with-span! {:name "handle-refresh/send-event!"
                        :attributes {:num-recomputations num-recomputations
                                     :num-spam num-spam
                                     :num-computations num-computations}}
      (when (seq computations)
        (rs/send-event! store-conn sess-id {:op :refresh-ok
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
         {:db {:conn-pool aurora/conn-pool}
          :rules  (rule-model/get-by-app-id aurora/conn-pool
                                            {:app-id app-id})

          :app-id app-id
          :current-user (:user auth)
          :admin? (:admin? auth)
          :datalog-query-fn d/query
          :attrs (attr-model/get-by-app-id app-id)}
         coerced)]
    (rs/send-event! store-conn sess-id
                    {:op :transact-ok
                     :tx-id tx-id
                     :client-event-id client-event-id})))

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
        creator (rs/get-creator @store-conn session-id)]
    (merge
     {:op op
      :client-event-id client-event-id
      :session-id session-id
      :worker-delay-ms worker-delay-ms
      :receive-q-delay-ms receive-q-delay-ms
      :ws-ping-latency-ms ws-ping-latency-ms}
     (auth-and-creator-attrs auth creator))))

(defn socket-origin [{:keys [http-req]}]
  (some-> http-req
          (.getRequestHeaders)
          (.get "origin")
          first))

(defn socket-ip [{:keys [http-req]}]
  (some-> http-req
          (.getRequestHeader "cf-connecting-ip")))

(defn- handle-join-room! [store-conn eph-store-atom sess-id {:keys [client-event-id room-id] :as _event}]
  (let [auth (get-auth! store-conn sess-id)
        app-id (-> auth :app :id)
        current-user (-> auth :user)]
    (eph/join-room! eph-store-atom app-id sess-id current-user room-id)
    (rs/send-event! store-conn sess-id {:op :join-room-ok
                                        :room-id room-id
                                        :client-event-id client-event-id})))

(defn- handle-leave-room! [store-conn eph-store-atom sess-id {:keys [client-event-id room-id] :as _event}]
  (let [auth (get-auth! store-conn sess-id)
        app-id (-> auth :app :id)]
    (eph/leave-room! eph-store-atom app-id sess-id room-id)
    (rs/send-event! store-conn sess-id {:op :leave-room-ok
                                        :room-id room-id
                                        :client-event-id client-event-id})))

(defn assert-in-room! [store-v app-id room-id sess-id]
  (when-not (eph/in-room? store-v app-id room-id sess-id)
    (ex/throw-validation-err!
     :room
     {:app-id app-id :room-id room-id :session-id sess-id}
     [{:message "You have not entered this room yet."}])))

(defn- handle-set-presence!
  [store-conn eph-store-atom sess-id {:keys [client-event-id room-id data] :as _event}]
  (let [auth (get-auth! store-conn sess-id)
        app-id (-> auth :app :id)
        _ (assert-in-room! @eph-store-atom app-id room-id sess-id)]
    (eph/set-presence! eph-store-atom app-id sess-id room-id data)
    (rs/send-event! store-conn sess-id {:op :set-presence-ok
                                        :room-id room-id
                                        :client-event-id client-event-id})))

(defn- handle-client-broadcast!
  "Broadcasts a client message to other sessions in the room"
  [store-conn eph-store-atom sess-id {:keys [client-event-id room-id topic data] :as _event}]
  (let [auth (get-auth! store-conn sess-id)
        app-id (-> auth :app :id)
        _ (assert-in-room! @eph-store-atom app-id room-id sess-id)
        current-user (-> auth :user)
        ids-to-notify (-> (eph/get-room-session-ids @eph-store-atom app-id room-id)
                          (disj sess-id))
        base-msg {:room-id room-id
                  :topic topic
                  :data {:peer-id sess-id
                         :user (when current-user
                                 {:id (:id current-user)})
                         :data data}}]
    (rs/try-broadcast-event! store-conn ids-to-notify (assoc base-msg :op :server-broadcast))
    (rs/send-event! store-conn sess-id (assoc base-msg
                                              :op :client-broadcast-ok
                                              :client-event-id client-event-id))))

(defn handle-event [store-conn eph-store-atom session event]
  (tracer/with-span! {:name "receive-worker/handle-event"}
    (let [{:keys [op]} event
          {:keys [session/socket]} session
          {:keys [id]} socket]
      (tracer/add-data! {:attributes (event-attributes store-conn id event)})
      (case op
        :init (handle-init! store-conn id event)
        :add-query (handle-add-query! store-conn id event)
        :remove-query (handle-remove-query! store-conn id event)
        :refresh (handle-refresh! store-conn id event)
        :transact (handle-transact! store-conn id event)
        ;; -----
        ;; EPH events
        :join-room (handle-join-room! store-conn eph-store-atom id event)
        :leave-room (handle-leave-room! store-conn eph-store-atom id event)
        :set-presence (handle-set-presence! store-conn eph-store-atom id event)
        :client-broadcast (handle-client-broadcast! store-conn eph-store-atom id event)))))

;; --------------
;; Receive Workers

(defn- handle-instant-exception [store-conn session original-event instant-ex]
  (let [sess-id (:session/id session)
        {:keys [client-event-id]} original-event
        {:keys [::ex/type ::ex/message ::ex/hint] :as err-data} (ex-data instant-ex)]
    (tracer/add-data! {:attributes {:err-data (pr-str err-data)}})
    (condp contains? type
      #{::ex/record-not-found
        ::ex/record-expired
        ::ex/record-not-unique
        ::ex/record-foreign-key-invalid
        ::ex/record-check-violation
        ::ex/sql-raise

        ::ex/permission-denied
        ::ex/permission-evaluation-failed

        ::ex/param-missing
        ::ex/param-malformed

        ::ex/validation-failed}
      (rs/try-send-event! store-conn sess-id
                          {:op :error
                           :status 400
                           :client-event-id client-event-id
                           :original-event original-event
                           :type (keyword (name type))
                           :message message
                           :hint hint})

      #{::ex/session-missing
        ::ex/socket-missing
        ::ex/socket-error}
      (tracer/record-exception-span! instant-ex
                                     {:name "receive-worker/socket-unreachable"})

      (do
        (tracer/add-exception! instant-ex {:escaping? false})
        (rs/try-send-event! store-conn sess-id
                            {:op :error
                             :status 500
                             :client-event-id client-event-id
                             :original-event original-event
                             :type (keyword (name type))
                             :message message
                             :hint hint})))))

(defn- handle-uncaught-err [store-conn session original-event root-err]
  (let [sess-id (:session/id session)
        {:keys [client-event-id]} original-event]
    (tracer/add-exception! root-err {:escaping? false})
    (rs/try-send-event! store-conn sess-id
                        {:op :error
                         :client-event-id client-event-id
                         :status 500
                         :original-event original-event
                         :message (str "Yikes, something broke on our end! Sorry about that."
                                       " Please ping us (Joe and Stopa) on Discord and let us know!")})))

(defn handle-receive-attrs [store-conn session event metadata]
  (let [{:keys [session/socket]} session
        sess-id (:session/id session)
        event-attrs (event-attributes store-conn sess-id event)]
    (assoc (merge metadata event-attrs)
           :socket-origin (socket-origin socket)
           :socket-ip (socket-ip socket)
           :session-id sess-id)))

(defn handle-receive [store-conn eph-store-atom session event metadata]
  (tracer/with-exceptions-silencer [silence-exceptions]
    (tracer/with-span! {:name "receive-worker/handle-receive"
                        :attributes (handle-receive-attrs store-conn session event metadata)}
      (let [pending-handlers (:pending-handlers (:session/socket session))
            event-fut (ua/vfuture (handle-event store-conn eph-store-atom session event))
            pending-handler {:future event-fut
                             :op (:op event)
                             :silence-exceptions silence-exceptions}]
        (swap! pending-handlers conj pending-handler)
        (tracer/add-data! {:attributes {:concurrent-handler-count (count @pending-handlers)}})
        (try
          (let [ret (deref event-fut handle-receive-timeout-ms :timeout)]
            (when (= :timeout ret)
              (future-cancel event-fut)
              (ex/throw-operation-timeout! :handle-receive handle-receive-timeout-ms)))

          (catch CancellationException _e
            ;; We must have cancelled this in the on-close, so don't try to do any
            ;; error handling
            (tracer/record-info! {:name "handle-receive-cancelled"}))
          (catch Throwable e
            (tracer/record-info! {:name "caught-throwable"})
            (let [original-event event
                  instant-ex (ex/find-instant-exception e)
                  root-err (root-cause e)]
              (cond
                instant-ex (handle-instant-exception
                            store-conn session original-event instant-ex)
                :else (handle-uncaught-err
                       store-conn session original-event root-err))))
          (finally
            (swap! pending-handlers disj pending-handler)))))))

(defn process-receive-q-entry [store-conn eph-store-atom entry metadata]
  (let [{:keys [put-at item]} entry
        {:keys [session-id] :as event} item
        now (Instant/now)
        session (rs/get-session @store-conn session-id)]
    (cond
      (not session)
      (tracer/record-info! {:name "receive-worker/session-not-found"
                            :attributes (assoc metadata :session-id session-id)})

      :else
      (handle-receive
       store-conn
       eph-store-atom
       (into {} session)
       (assoc event
              :total-delay-ms
              (.toMillis (Duration/between put-at now))
              :ws-ping-latency-ms
              (some-> session
                      :session/socket
                      :get-ping-latency-ms
                      (#(%))))
       metadata))))

(defn straight-jacket-process-receive-q-entry [store-conn eph-store-atom entry metadata]
  (try
    (process-receive-q-entry store-conn eph-store-atom entry metadata)
    (catch Throwable e
      (tracer/record-exception-span! e {:name "receive-worker/handle-receive-straight-jacket"
                                        :attributes (assoc metadata
                                                           :session-id (:session-id (:item entry))
                                                           :item entry)}))))

(defn receive-worker-reserve-fn [[t] inflight-q]
  (if (= t :refresh)
    (grouped-queue/inflight-queue-reserve-all inflight-q)
    (grouped-queue/inflight-queue-reserve 1 inflight-q)))

(defn start-receive-workers [store-conn eph-store-atom receive-q stop-signal]
  (doseq [n (range num-receive-workers)]
    (ua/fut-bg
     (loop []
       (if @stop-signal
         (tracer/record-info! {:name "receive-worker/shutdown-complete"
                               :attributes {:worker-n n}})
         (do (grouped-queue/process-polling!
              receive-q
              {:reserve-fn receive-worker-reserve-fn
               :process-fn (fn [group-key [entry :as batch]]
                             (straight-jacket-process-receive-q-entry store-conn
                                                                      eph-store-atom
                                                                      entry
                                                                      {:worker-n n
                                                                       :batch-size (count batch)
                                                                       :group-key group-key}))})
             (recur)))))))

(defn enqueue->receive-q [receive-q item]
  (grouped-queue/put!
   receive-q
   {:item item :put-at (Instant/now)}))

;; -----------------
;; Websocket Interop

(defn on-open [store-conn {:keys [id] :as socket}]
  (tracer/with-span! {:name "socket/on-open"
                      :attributes {:session-id (:id socket)}}
    (rs/add-socket! store-conn id socket)))

(defn on-message [{:keys [id receive-q data]}]
  (enqueue->receive-q receive-q (-> (<-json data true)
                                    (update :op keyword)
                                    (assoc :session-id id))))

(defn on-error [{:keys [id error]}]
  (condp instance? error
    java.io.IOException nil
    (tracer/record-exception-span! error {:name "socket/on-error"
                                          :attributes {:session-id id}
                                          :escaping? false})))

(defn on-close [store-conn eph-store-atom {:keys [id pending-handlers]}]
  (tracer/with-span! {:name "socket/on-close"
                      :attributes {:session-id id}}
    (doseq [{:keys [future silence-exceptions op]} @pending-handlers]
      (tracer/with-span! {:name "cancel-pending-handler"
                          :attributes {:op op}}
        (silence-exceptions true)
        (future-cancel future)))

    (let [app-id (-> (rs/get-auth @store-conn id)
                     :app
                     :id)]
      (eph/leave-by-session-id! eph-store-atom app-id id)
      (rs/remove-session! store-conn id))))

(defn undertow-config
  [store-conn eph-store-atom receive-q {:keys [id]}]
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
                            eph-store-atom
                            {:id id
                             :pending-handlers pending-handlers}))}}))

;; ------
;; System

(defn receive-q-metrics [receive-q]
  [{:path "instant.reactive.session.receive-q.size"
    :value (grouped-queue/size receive-q)}
   {:path "instant.reactive.session.receive-q.longest-waiting-ms"
    :value (if-let [{:keys [put-at]} (grouped-queue/peek receive-q)]
             (.toMillis (Duration/between put-at (Instant/now)))
             0)}])

(defn group-fn [{:keys [item] :as _input}]
  (let [{:keys [session-id op]} item]
    (condp contains? op
      #{:transact}
      [:transact session-id]

      #{:join-room :leave-room :set-presence :client-broadcast}
      [:room session-id]

      #{:add-query :remove-query}
      (let [{:keys [q]} item]
        [:query session-id q])

      #{:refresh}
      [:refresh session-id]
      nil)))

(comment
  (group-fn {:item {:session-id 1 :op :transact}})
  (group-fn {:item {:session-id 1 :op :leave-room}})
  (group-fn {:item {:session-id 1 :op :add-query :q {:users {}}}}))

(defn start []
  (def receive-q (grouped-queue/create {:group-fn #'group-fn}))
  (def receive-q-stop-signal (atom false))
  (def cleanup-gauge (gauges/add-gauge-metrics-fn
                      (fn [] (receive-q-metrics receive-q))))

  (ua/fut-bg
   (start-receive-workers
    rs/store-conn
    eph/ephemeral-store-atom
    receive-q
    receive-q-stop-signal)))

(defn stop []
  (reset! receive-q-stop-signal true)
  (cleanup-gauge))

(defn restart []
  (stop)
  (start))
