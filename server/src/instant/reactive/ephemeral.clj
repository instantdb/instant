(ns instant.reactive.ephemeral
  "Handles our ephemeral data apis for a session (presence, cursors)"
  (:require
   [chime.core :as chime-core]
   [clojure.java.jmx :as jmx]
   [datascript.core :as ds]
   [editscript.core :as editscript]
   [instant.config :as config :refer [aws-env?]]
   [instant.gauges :as gauges]
   [instant.rate-limit :as rate-limit]
   [instant.reactive.receive-queue :as receive-queue]
   [instant.reactive.store :as rs]
   [instant.util.async :as ua]
   [instant.util.aws :as aws-util]
   [instant.util.coll :as coll]
   [instant.util.delay :as delay]
   [instant.util.hazelcast :as hazelcast]
   [instant.util.lang :as lang]
   [instant.util.tracer :as tracer]
   [instant.util.uuid :as uuid-util]
   [instant.work-queue :as work-queue]
   [medley.core :as medley])
  (:import
   (com.hazelcast.cluster Cluster InitialMembershipListener Member)
   (com.hazelcast.config Config)
   (com.hazelcast.core Hazelcast HazelcastInstance)
   (com.hazelcast.map IMap)
   (com.hazelcast.map.impl DataAwareEntryEvent)
   (com.hazelcast.map.listener EntryAddedListener EntryRemovedListener EntryUpdatedListener)
   (com.hazelcast.spi.properties ClusterProperty HazelcastProperty)
   (com.hazelcast.topic ITopic Message MessageListener)
   (io.github.bucket4j.grid.hazelcast HazelcastProxyManager)
   (java.time Duration Instant)
   (java.util ArrayList Map Map$Entry)
   (java.util.concurrent ConcurrentHashMap Executors Future LinkedBlockingQueue)
   (java.util.function BiFunction)
   (javax.management ObjectName)))

;; ------
;; Setup

;; room-maps keeps track of the rooms each session is in (for easy removal
;; on session close) and some info about the rooms we're subscribed to on
;; this machine
;; {:sessions {<session-id>: #{<room-id>}}
;;  :rooms {<{app-id: app-id, room-id: room-id}> {:session-ids #{<sess-id>}}}}
(defonce room-maps
  (atom {}))

(declare handle-event)

(declare handle-broadcast-message)

(declare process-event)

;; {machine-id Member}
(defonce hz-member-by-machine-id-cache ^ConcurrentHashMap (ConcurrentHashMap.))

;; {machine-id {callback-id (fn [:action])}}
(defonce hz-member-callbacks ^ConcurrentHashMap (ConcurrentHashMap.))

;; {callback-id (fn [machine-id :action])}
(defonce hz-member-change-callbacks ^ConcurrentHashMap (ConcurrentHashMap.))

(defn remove-hz-member-callback [machine-id cb-id]
  (Map/.compute hz-member-callbacks machine-id ^BiFunction (reify BiFunction
                                                             (apply [_ _k v]
                                                               (let [new (dissoc v cb-id)]
                                                                 (when-not (empty? new)
                                                                   new))))))

(defn add-hz-member-callback [machine-id cb]
  (let [cb-id (random-uuid)]
    (Map/.compute hz-member-callbacks machine-id ^BiFunction (reify BiFunction
                                                               (apply [_ _k v]
                                                                 (assoc v cb-id cb))))
    (fn []
      (remove-hz-member-callback machine-id cb-id))))

(defn remove-hz-member-change-callback [cb-id]
  (Map/.remove hz-member-change-callbacks cb-id))

(defn add-hz-member-change-callback [cb]
  (let [cb-id (random-uuid)]
    (Map/.put hz-member-change-callbacks cb-id cb)
    (fn []
      (remove-hz-member-change-callback cb-id))))

(defn run-member-callbacks [machine-id action]
  (doseq [[_k cb] (Map/.get hz-member-callbacks machine-id)]
    (cb action))
  (doseq [[_k cb] hz-member-change-callbacks]
    (cb machine-id action)))

(defn- add-member-listener [^HazelcastInstance hz]
  (.addMembershipListener (.getCluster hz)
                          (reify InitialMembershipListener
                            (init [_ e]
                              (doseq [^Member m (.getMembers e)]
                                (when-let [machine-id (-> m
                                                          (.getAttribute "machine-id")
                                                          uuid-util/coerce)]
                                  (Map/.put hz-member-by-machine-id-cache machine-id m)
                                  (run-member-callbacks machine-id :added))))
                            (memberAdded [_ e]
                              (let [m (.getMember e)]
                                (when-let [machine-id (-> m
                                                          (.getAttribute "machine-id")
                                                          uuid-util/coerce)]
                                  (Map/.put hz-member-by-machine-id-cache machine-id m)
                                  (run-member-callbacks machine-id :added))))
                            (memberRemoved [_ e]
                              (let [m (.getMember e)]
                                (when-let [machine-id (-> m
                                                          (.getAttribute "machine-id")
                                                          uuid-util/coerce)]
                                  (Map/.remove hz-member-by-machine-id-cache machine-id m)
                                  (run-member-callbacks machine-id :removed)))))))

(defn resolve-task-ips
  "All overlay IPs the Swarm service tasks resolve to (DNSRR), including our own."
  []
  (map #(.getHostAddress %)
       (java.net.InetAddress/getAllByName "tasks.server")))

(defn get-swarm-ip
  "The container's own overlay IP — the local interface address that also
   appears in the tasks.server DNSRR resolution (distinguishes the overlay
   interface from docker_gwbridge)."
  [task-ips]
  (let [task-ips (set task-ips)]
    (->> (java.net.NetworkInterface/getNetworkInterfaces)
         enumeration-seq
         (mapcat #(enumeration-seq (.getInetAddresses %)))
         (map #(.getHostAddress %))
         (filter task-ips)
         first)))

(defn init-hz [env store {:keys [instance-name cluster-name]
                          :or {instance-name "instant-hz-v3"
                               cluster-name "instant-server-v2"}}]
  (-> (java.util.logging.Logger/getLogger "com.hazelcast")
      (.setLevel (if (aws-env?)
                   java.util.logging.Level/INFO
                   java.util.logging.Level/FINEST)))
  (.setLevel (java.util.logging.Logger/getLogger "com.hazelcast.system.logo")
             java.util.logging.Level/OFF)
  (let [config               (Config.)
        network-config       (.getNetworkConfig config)
        join-config          (.getJoin network-config)
        tcp-ip-config        (.getTcpIpConfig join-config)
        aws-config           (.getAwsConfig join-config)
        serialization-config (.getSerializationConfig config)
        metrics-config       (.getMetricsConfig config)
        instance-id          (or @config/instance-id "dev")
        member-attribute-config (doto (com.hazelcast.config.MemberAttributeConfig.)
                                  (.setAttribute "instance-id" instance-id)
                                  (.setAttribute "machine-id" (str config/machine-id)))]

    ;; Docs: https://docs.hazelcast.com/hazelcast/5.5/system-properties
    (doseq [[prop value] [[ClusterProperty/PHONE_HOME_ENABLED "false"]
                          [ClusterProperty/SHUTDOWNHOOK_ENABLED "false"]

                          ;; Make sure max join seconds is less than the startup timeout
                          ;; Default is 300
                          [ClusterProperty/MAX_JOIN_SECONDS "45"]

                          ;; Timeout to connect all other cluster members when a member is joining to a cluster.
                          ;; Default is 120
                          [ClusterProperty/CONNECT_ALL_WAIT_SECONDS "60"]]]
      (.setProperty config (.getName ^HazelcastProperty prop) value))

    (.setMemberAttributeConfig config member-attribute-config)
    (.setInstanceName config instance-name)
    (.setEnabled (.getMulticastConfig join-config) false)
    (cond
      (aws-env?)
      (let [ip (aws-util/get-instance-ip)]
        (.setPublicAddress network-config ip)
        (.setPort network-config (config/get-hz-port))
        (doto aws-config
          (.setEnabled true)
          (.setProperty "hz-port" "5701-5708")
          (.setProperty "tag-key" aws-util/environment-tag-name)
          (.setProperty "tag-value" (aws-util/get-environment-tag)))
        (.setEnabled metrics-config true))

      (= env :test)
      (do
        (.setEnabled (.getAutoDetectionConfig join-config) false)
        (.setEnabled aws-config false)
        (.setEnabled (.getAzureConfig join-config) false)
        (.setEnabled (.getEurekaConfig join-config) false)
        (.setEnabled (.getGcpConfig join-config) false)
        (.setEnabled (.getKubernetesConfig join-config) false)
        (.setEnabled (.getMulticastConfig join-config) false)
        (.setEnabled tcp-ip-config false)
        (.setPort network-config 0)
        (.setPortAutoIncrement network-config false)
        (.setEnabled metrics-config false))

      :else
      (do
        ;; Resolve the Swarm tasks ourselves and hand Hazelcast concrete
        ;; per-IP members. Feeding it the `tasks.server` hostname is unreliable:
        ;; the TcpIpJoiner re-resolves the hostname per-port at join time and
        ;; dedups against itself, so DNSRR ordering can leave it with no peer.
        (let [task-ips (resolve-task-ips)]
          (.setEnabled tcp-ip-config true)
          (.setMembers tcp-ip-config (map #(str % ":5701") task-ips))
          (when-let [ip (get-swarm-ip task-ips)]
            (.setPublicAddress network-config ip))
          (.setEnabled metrics-config true))))

    (.setClusterName config cluster-name)

    (.setSerializerConfigs serialization-config
                           hazelcast/serializer-configs)

    (HazelcastProxyManager/addCustomSerializers serialization-config
                                                ;; bucket4j is going to add its own types, so we give it some
                                                ;; room to fit above our types
                                                10000)

    (.setGlobalSerializerConfig serialization-config
                                hazelcast/global-serializer-config)

    (let [hz                 (Hazelcast/getOrCreateHazelcastInstance config)
          local-member       (.getLocalMember (.getCluster hz))
          hz-rooms-map       (.getMap hz "rooms-v2")
          hz-broadcast-topic (.getTopic hz "rooms-broadcast")]

      (.addEntryListener hz-rooms-map
                         (reify
                           EntryAddedListener
                           (entryAdded [_ event]
                             (handle-event store event))

                           EntryRemovedListener
                           (entryRemoved [_ event]
                             (handle-event store event))

                           EntryUpdatedListener
                           (entryUpdated [_ event]
                             (handle-event store event)))

                         true)
      (.addMessageListener hz-broadcast-topic
                           (reify
                             MessageListener
                             (onMessage [_ message]
                               ;; Don't bother handling messages that we put on the topic
                               (when (not= local-member (.getPublishingMember message))
                                 (handle-broadcast-message store message)))))
      (add-member-listener hz)
      {:hz                 hz
       :hz-rooms-map       hz-rooms-map
       :hz-broadcast-topic hz-broadcast-topic
       :instance-id        instance-id
       :rate-limit (rate-limit/initialize hz)})))

(defonce hz
  (delay
    (init-hz (config/get-env) rs/store {})))

(defn get-hz ^HazelcastInstance []
  (:hz @hz))

;; {{:room-id <room-id> :app-id <app-id>}
;;  {<sess-id>
;;   {:peer-id     <session-id>
;;    :instance-id <instance-id>
;;    :user        {:id <user-id>}
;;    :data        <data>}}
(defn get-hz-rooms-map ^IMap []
  (:hz-rooms-map @hz))

(defn get-hz-broadcast-topic ^ITopic []
  (:hz-broadcast-topic @hz))

(defn get-rate-limit []
  (:rate-limit @hz))

;; ---------
;; Hazelcast

(defn process-event [store room-key last-data room-data]
  (let [{:keys [app-id room-id]} room-key
        {:keys [session-ids]} (get-in @room-maps [:rooms room-key])]
    (when (seq session-ids) ;; if we have sessions in that room locally
      (let [edits (when last-data
                    (editscript/get-edits
                     (editscript/diff last-data room-data {:algo :a-star :str-diff :none})))]
        (doseq [[sess-id _] room-data
                :let [q (-> (rs/session store sess-id) :session/socket :receive-q)]
                :when q
                :let [just-joined? (and (contains? room-data sess-id)
                                        (not (contains? last-data sess-id)))]]
          (receive-queue/put! q
                              {:op :refresh-presence
                               :app-id app-id
                               :room-id room-id
                               :data room-data
                               :edits (when-not just-joined?
                                        edits)
                               :session-id sess-id}))))))

(defn add-event-item
  "Called by the work queue when a new item is added"
  [item-atom ^DataAwareEntryEvent event]
  (let [room-data (.getValue event)
        last-data (.getOldValue event)]
    (swap! item-atom (fn [v]
                       (if v
                         (-> v
                             (assoc :room-data room-data))
                         {:room-data room-data
                          :last-data last-data})))))

(defn process-event-item
  "Called by the work queue."
  [store room-key item-atom]
  (let [[old-val _] (swap-vals! item-atom (fn [_] nil))]
    (try
      (when old-val
        (process-event store room-key (:last-data old-val) (:room-data old-val)))
      (catch Throwable t
        (tracer/record-exception-span! t {:name "eph/process-event-item"
                                          :escaping? false
                                          :attributes {:room-key room-key}})))))

(defn handle-event
  "Called by the hazelcast entry listener. Queues the event so that it can
   be processed in a batch."
  [store ^DataAwareEntryEvent event]
  (let [room-key (.getKey event)]
    (when (get-in @room-maps [:rooms room-key])
      (work-queue/offer-work (rs/eph-event-queue store) room-key event))))

(defn handle-broadcast-message
  "Handles the message on the topic we use to broadcast a client-broadcast
   message to sessions that are in the room, but live on a different physical
   machine."
  [store ^Message m]
  (let [{:keys [app-id session-ids base-msg]} (.getMessageObject m)]
    (doseq [sess-id session-ids
            :let [q (-> (rs/session store sess-id) :session/socket :receive-q)]
            :when q]
      (receive-queue/put! q
                          (assoc base-msg
                                 :op :server-broadcast
                                 :session-id sess-id
                                 :app-id app-id)))))

(defn process-rooms-map-updates [room-key action-q]
  (let [items (ArrayList.)]
    (LinkedBlockingQueue/.drainTo action-q items)
    (when-not (.isEmpty items)
      (let [promises (mapv :promise items)
            actions (mapv :action items)]
        (try
          (.executeOnKey (get-hz-rooms-map)
                         room-key
                         (hazelcast/->PresenceEntryProcessor actions))
          (doseq [p promises]
            (deliver p {:ok true}))
          (catch Throwable t
            (doseq [p promises]
              (deliver p {:error t}))))))))

(defn enqueue-room-map-update [store room-key action]
  (let [p (promise)
        item {:action action
              :promise p}]
    (work-queue/offer-work (rs/eph-update-queue store) room-key item)
    (when-let [error (:error @p)]
      (throw error))))

(defn broadcast [app-id session-ids base-msg]
  (.publish (get-hz-broadcast-topic)
            (hazelcast/room-broadcast-message app-id
                                              session-ids
                                              base-msg)))

(defn get-room-data [app-id room-id]
  (.get (get-hz-rooms-map) (hazelcast/room-key app-id room-id)))

(defn register-session!
  "Registers that the session is following the room and starts a channel
   for the room if one doesn't already exist."
  [app-id room-id sess-id]
  (let [room-key (hazelcast/room-key app-id room-id)]
    (swap!
     room-maps
     (fn [m]
       (-> m
           (update-in [:sessions sess-id] (fnil conj #{}) room-id)
           ;; Keep track of which sessions are interested in the room
           ;; so we can close our channel when the last session leaves
           (update-in [:rooms room-key :session-ids]
                      (fnil conj #{}) sess-id))))))

(defn remove-session! [store app-id room-id sess-id]
  (let [room-key (hazelcast/room-key app-id room-id)]
    (swap! room-maps
           (fn [m]
             (let [session-ids (-> m
                                   (get-in [:rooms room-key :session-ids])
                                   (disj sess-id))]
               (cond-> m
                 true (coll/disj-in [:sessions sess-id] room-id)
                 (empty? session-ids) (medley/dissoc-in [:rooms room-key])
                 (seq session-ids) (assoc-in [:rooms room-key :session-ids]
                                             session-ids)))))
    (enqueue-room-map-update store room-key (hazelcast/remove-session-action sess-id))))

(defn clean-orphan-sessions [_time]
  (tracer/with-span! {:name "clean-orphan-sessions"}
    (let [instance-ids (-> (:hz @hz)
                           HazelcastInstance/.getCluster
                           Cluster/.getMembers
                           (->>
                            (map #(Member/.getAttribute % "instance-id"))
                            (into #{})))]
      (doseq [^Map$Entry entry (IMap/.entrySet (:hz-rooms-map @hz))
              :let [{:keys [app-id room-id]} (.getKey entry)
                    v (.getValue entry)]
              :when (and app-id room-id)
              [sess-id {:keys [instance-id]}] v
              :when (or
                     (nil? instance-id)
                     (not (contains? instance-ids instance-id))
                     (and (= instance-id (:instance-id @hz))
                          (nil? (rs/session rs/store sess-id))))]
        (tracer/with-span! {:name "clean-orphan-session"
                            :attributes {:app-id      app-id
                                         :room-id     room-id
                                         :session-id  sess-id
                                         :instance-id instance-id}}
          (remove-session! rs/store app-id room-id sess-id))))))

(defn clean-old-sessions []
  (let [oldest-timestamp (aws-util/oldest-instance-timestamp)
        hz-map (get-hz-rooms-map)]
    (when-not oldest-timestamp
      (throw (Exception. "Could not determine oldest instance timestamp")))
    (doseq [^Map$Entry entry (.entrySet hz-map)
            :let [{:keys [app-id room-id]} (.getKey entry)
                  v (.getValue entry)]
            :when (and app-id room-id)
            sess-id (keys v)
            :let [squuid-timestamp (ds/squuid-time-millis sess-id)]
            :when (< squuid-timestamp oldest-timestamp)]
      (tracer/with-span! {:name "clean-old-session"
                          :attributes {:app-id app-id
                                       :room-id room-id
                                       :session-id sess-id
                                       :squuid-timestamp squuid-timestamp}}
        (remove-session! rs/store app-id room-id sess-id)))
    (doseq [^Map$Entry entry (.entrySet hz-map)
            :let [{:keys [app-id room-id]} (.getKey entry)
                  v (.getValue entry)]
            :when (and app-id room-id (empty? v))]
      (remove-session! rs/store app-id room-id (random-uuid)))))

;; ----------
;; Public API

(defn get-room-session-ids [app-id room-id]
  (let [room-data         (get-room-data app-id room-id)
        room-key          (hazelcast/room-key app-id room-id)
        local-session-ids (get-in @room-maps [:rooms room-key :session-ids] #{})]
    {:local-ids (filterv local-session-ids (keys room-data))
     :remote-ids (vec (remove local-session-ids (keys room-data)))}))

(defn in-room?
  "Returns whether a session is part of a room."
  [app-id room-id sess-id]
  (let [room-key (hazelcast/room-key app-id room-id)]
    (contains? (get-in @room-maps [:rooms room-key :session-ids])
               sess-id)))

(defn join-room! [store app-id sess-id current-user room-id data]
  (register-session! app-id room-id sess-id)
  (enqueue-room-map-update store
                           (hazelcast/room-key app-id room-id)
                           (hazelcast/join-room-action sess-id
                                                       (:instance-id @hz)
                                                       (:id current-user)
                                                       data)))

(defn leave-room! [store app-id sess-id room-id]
  (remove-session! store app-id room-id sess-id))

(defn set-presence! [store app-id sess-id room-id data]
  (enqueue-room-map-update store
                           (hazelcast/room-key app-id room-id)
                           (hazelcast/set-presence-action sess-id data)))

(defn leave-by-session-id! [store app-id sess-id]
  (doseq [room-id (get-in @room-maps [:sessions sess-id])]
    (remove-session! store app-id room-id sess-id)))

(defn hz-jmx-stats []
  (for [^ObjectName n (jmx/mbean-names "com.hazelcast:*")
        a (jmx/attribute-names n)
        ;; Filter out properties with tags or else we'll
        ;; overload honeycomb
        :when (not (.getKeyProperty n "tag0"))
        :let [prefix (.getKeyProperty n "prefix")
              k (format "hz.%s.%s" prefix (name a))]]
    [{:path k
      :value (clojure.java.jmx/read n a)}]))

(defn hz-gauges [{:keys [^IMap hz-rooms-map ^ITopic hz-broadcast-topic rate-limit]}]
  (let [{:keys [putOperationCount
                totalPutLatency
                getOperationCount
                totalGetLatency
                removeOperationCount
                totalRemoveLatency
                setOperationCount
                totalSetLatency] :as map-stats} (bean (.getLocalMapStats hz-rooms-map))]
    (concat
     (hz-jmx-stats)
     (for [[k v] (select-keys map-stats
                              [:maxGetLatency
                               :otherOperationCount
                               :maxPutLatency
                               :maxRemoveLatency
                               :heapCost
                               :totalSetLatency
                               :ownedEntryMemoryCost
                               :setOperationCount
                               :eventOperationCount
                               :totalPutLatency
                               :hits
                               :backupCount
                               :backupEntryMemoryCost
                               :totalGetLatency
                               :totalRemoveLatency
                               :dirtyEntryCount
                               :removeOperationCount
                               :backupEntryCount
                               :maxSetLatency
                               :lockedEntryCount
                               :ownedEntryCount
                               :putOperationCount
                               :expirationCount
                               :evictionCount
                               :getOperationCount])]
       [{:path (str "hz.hz-rooms-map." (name k))
         :value v}])

     (when (pos? putOperationCount)
       [{:path "hz.hz-rooms-map.avgPutLatency"
         :value (double (/ totalPutLatency
                           putOperationCount))}])
     (when (pos? getOperationCount)
       [{:path "hz.hz-rooms-map.avgGetLatency"
         :value (double (/ totalGetLatency
                           getOperationCount))}])
     (when (pos? removeOperationCount)
       [{:path "hz.hz-rooms-map.avgRemoveLatency"
         :value (double (/ totalRemoveLatency
                           removeOperationCount))}])
     (when (pos? setOperationCount)
       [{:path "hz.hz-rooms-map.avgSetLatency"
         :value (double (/ totalSetLatency
                           setOperationCount))}])

     (let [stats (.getLocalTopicStats hz-broadcast-topic)]
       [{:path "hz.hz-broadcast-topic.publishOperationCount"
         :value (.getPublishOperationCount stats)}
        {:path "hz.hz-broadcast-topic.receiveOperationCount"
         :value (.getReceiveOperationCount stats)}])

     (let [stats (bean (.getLocalMapStats ^IMap (:bucket-map rate-limit)))]
       [{:path "hz.bucket4j-map.heapCost"
         :value (:heapCost stats)}
        {:path "hz.bucket4j-map.ownedEntryMemoryCost"
         :value (:ownedEntryMemoryCost stats)}]))))

;; ------
;; System

(defn init-store [store]
  (reset! (:eph-event-queue-atom store)
          (work-queue/create-work-queue (Executors/newFixedThreadPool (delay/cpu-count))
                                        {:init-fn (fn [_k] (atom nil))
                                         :add-fn (fn [_k item-atom event]
                                                   (add-event-item item-atom event)
                                                   item-atom)
                                         :empty?-fn (fn [_k item-atom]
                                                      (empty? @item-atom))
                                         :process-fn (partial process-event-item store)}))

  (reset! (:eph-update-queue-atom store)
          (work-queue/create-work-queue (ua/make-virtual-thread-executor)
                                        {:init-fn (fn [_k] (LinkedBlockingQueue.))
                                         :add-fn (fn [_k q op]
                                                   (LinkedBlockingQueue/.put q op)
                                                   q)
                                         :empty?-fn (fn [_k q]
                                                      (LinkedBlockingQueue/.isEmpty q))
                                         :process-fn process-rooms-map-updates})))

(defn start []
  (init-store rs/store)
  (def hz
    (delay
      (init-hz (config/get-env) rs/store {})))
  (def clean-orphan-sessions-schedule
    (chime-core/chime-at
     (chime-core/periodic-seq (.plusMillis (Instant/now) 60000) (Duration/ofMinutes 1))
     clean-orphan-sessions))

  (let [^Future f (future @hz)
        hz-realized (.get f (* 60 1000 2) java.util.concurrent.TimeUnit/MILLISECONDS)]
    (def stop-gauge (gauges/add-gauge-metrics-fn (fn [_]
                                                   (hz-gauges hz-realized))))))

(defn shutdown-hz [hz-delay]
  (when-let [^HazelcastInstance hz (try (:hz @hz-delay) (catch Exception _e nil))]
    (.shutdown hz))
  (when-let [rate-limit (try (:rate-limit @hz-delay) (catch Exception _e nil))]
    ((:shutdown rate-limit))))

(defn stop []
  (lang/close clean-orphan-sessions-schedule)
  (when (bound? #'stop-gauge)
    (stop-gauge))
  (when-let [q (rs/eph-event-queue rs/store)]
    (work-queue/shutdown q))
  (when-let [q (rs/eph-update-queue rs/store)]
    (work-queue/shutdown q))
  (shutdown-hz hz))

(defn restart []
  (stop)
  (start))

(defn before-ns-unload []
  (stop))

(defn after-ns-reload []
  (start))
