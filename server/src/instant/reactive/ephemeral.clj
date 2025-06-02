(ns instant.reactive.ephemeral
  "Handles our ephemeral data apis for a session (presence, cursors)"
  (:require
   [chime.core :as chime-core]
   [datascript.core :as ds]
   [editscript.core :as editscript]
   [instant.config :as config]
   [instant.reactive.receive-queue :as receive-queue]
   [instant.reactive.store :as rs]
   [instant.util.aws :as aws-util]
   [instant.util.coll :as coll]
   [instant.util.hazelcast :as hazelcast]
   [instant.util.lang :as lang]
   [instant.util.tracer :as tracer]
   [medley.core :as medley])
  (:import
   (com.hazelcast.config Config)
   (com.hazelcast.core Hazelcast HazelcastInstance)
   (com.hazelcast.cluster Cluster Member)
   (com.hazelcast.map IMap)
   (com.hazelcast.map.impl DataAwareEntryEvent)
   (com.hazelcast.map.listener EntryAddedListener
                               EntryRemovedListener
                               EntryUpdatedListener)
   (com.hazelcast.topic ITopic MessageListener Message)
   (java.time Duration Instant)
   (java.util Map$Entry)
   (java.util.concurrent Future)))

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

(defn init-hz [env store {:keys [instance-name cluster-name]
                          :or {instance-name "instant-hz-v3"
                               cluster-name "instant-server-v2"}}]
  (-> (java.util.logging.Logger/getLogger "com.hazelcast")
      (.setLevel (if (config/aws-env?)
                   java.util.logging.Level/INFO
                   java.util.logging.Level/WARNING)))
  (.setLevel (java.util.logging.Logger/getLogger "com.hazelcast.system.logo")
             java.util.logging.Level/OFF)
  (System/setProperty "hazelcast.shutdownhook.enabled" "false")
  (System/setProperty "hazelcast.phone.home.enabled" "false")
  (let [config               (Config.)
        network-config       (.getNetworkConfig config)
        join-config          (.getJoin network-config)
        tcp-ip-config        (.getTcpIpConfig join-config)
        aws-config           (.getAwsConfig join-config)
        serialization-config (.getSerializationConfig config)
        metrics-config       (.getMetricsConfig config)
        instance-id          (or @config/instance-id "dev")
        member-attribute-config (doto (com.hazelcast.config.MemberAttributeConfig.)
                                  (.setAttribute "instance-id" instance-id))]
    (.setMemberAttributeConfig config member-attribute-config)
    (.setInstanceName config instance-name)
    (.setEnabled (.getMulticastConfig join-config) false)
    (case env
      (:prod :staging)
      (let [ip (aws-util/get-instance-ip)]
        (.setPublicAddress network-config ip)
        (.setPort network-config (config/get-hz-port))
        (doto aws-config
          (.setEnabled true)
          (.setProperty "hz-port" "5701-5708")
          (.setProperty "tag-key" aws-util/environment-tag-name)
          (.setProperty "tag-value" (aws-util/get-environment-tag)))
        (.setEnabled metrics-config true))

      :dev
      (do
        (.setEnabled tcp-ip-config true)
        (.setMembers tcp-ip-config (list "127.0.0.1"))
        (.setEnabled metrics-config false))

      :test
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
        (.setEnabled metrics-config false)))

    (.setClusterName config cluster-name)

    (.setSerializerConfigs serialization-config
                           hazelcast/serializer-configs)

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
      {:hz                 hz
       :hz-rooms-map       hz-rooms-map
       :hz-broadcast-topic hz-broadcast-topic
       :instance-id        instance-id})))

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

;; ---------
;; Hazelcast

(defn handle-event [store ^DataAwareEntryEvent event]
  (let [room-key                 (.getKey event)
        {:keys [app-id room-id]} room-key
        {:keys [session-ids]}    (get-in @room-maps [:rooms room-key])]
    (when (seq session-ids) ;; if we have sessions in that room locally
      (let [room-data (.getValue event)
            last-data (.getOldValue event)
            edits     (when last-data
                        (editscript/get-edits
                         (editscript/diff last-data room-data {:algo :a-star :str-diff :none})))]
        (doseq [[sess-id _] room-data
                :let [q (-> (rs/session store sess-id) :session/socket :receive-q)]
                :when q
                :let [just-joined? (and (contains? room-data sess-id)
                                        (not (contains? last-data sess-id)))]]
          (receive-queue/put! q
                              {:op         :refresh-presence
                               :app-id     app-id
                               :room-id    room-id
                               :data       room-data
                               :edits      (when-not just-joined?
                                             edits)
                               :session-id sess-id}))))))

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

(defn remove-session! [app-id room-id sess-id]
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
    (hazelcast/remove-session! (get-hz-rooms-map) room-key sess-id)))

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
          (remove-session! app-id room-id sess-id))))))

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
        (remove-session! app-id room-id sess-id)))
    (doseq [^Map$Entry entry (.entrySet hz-map)
            :let [{:keys [app-id room-id]} (.getKey entry)
                  v (.getValue entry)]
            :when (and app-id room-id (empty? v))]
      (remove-session! app-id room-id (random-uuid)))))

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
  (contains? (get-room-data app-id room-id) sess-id))

(defn join-room! [app-id sess-id current-user room-id data]
  (register-session! app-id room-id sess-id)
  (hazelcast/join-room! (get-hz-rooms-map)
                        (hazelcast/room-key app-id room-id)
                        sess-id
                        (:instance-id @hz)
                        (:id current-user)
                        data))

(defn leave-room! [app-id sess-id room-id]
  (remove-session! app-id room-id sess-id))

(defn set-presence! [app-id sess-id room-id data]
  (hazelcast/set-presence! (get-hz-rooms-map)
                           (hazelcast/room-key app-id room-id)
                           sess-id
                           data))

(defn leave-by-session-id! [app-id sess-id]
  (doseq [room-id (get-in @room-maps [:sessions sess-id])]
    (remove-session! app-id room-id sess-id)))

;; ------
;; System

(defn start []
  (def hz
    (delay
      (init-hz (config/get-env) rs/store {})))
  (def clean-orphan-sessions-schedule
    (chime-core/chime-at
     (chime-core/periodic-seq (.plusMillis (Instant/now) 60000) (Duration/ofMinutes 1))
     clean-orphan-sessions))
  (let [^Future f (future @hz)]
    (.get f (* 60 1000) java.util.concurrent.TimeUnit/MILLISECONDS)))

(defn stop []
  (lang/close clean-orphan-sessions-schedule)
  (when-let [^HazelcastInstance hz (try (get-hz) (catch Exception _e nil))]
    (.shutdown hz)))

(defn restart []
  (stop)
  (start))

(defn before-ns-unload []
  (stop))

(defn after-ns-reload []
  (start))
