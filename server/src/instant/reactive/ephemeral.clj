(ns instant.reactive.ephemeral
  "Handles our ephemeral data apis for a session (presence, cursors)"
  (:require
   [editscript.core :as editscript]
   [instant.config :as config]
   [instant.reactive.receive-queue :as receive-queue]
   [instant.reactive.store :as rs]
   [instant.util.aws :as aws-util]
   [instant.util.coll :refer [disj-in]]
   [instant.util.hazelcast :as hz-util]
   [medley.core :refer [dissoc-in]])
  (:import
   (com.hazelcast.config Config)
   (com.hazelcast.core Hazelcast HazelcastInstance)
   (com.hazelcast.map IMap)
   (com.hazelcast.map.impl DataAwareEntryEvent)
   (com.hazelcast.map.listener EntryAddedListener
                               EntryRemovedListener
                               EntryUpdatedListener)
   (com.hazelcast.topic ITopic MessageListener Message)))

;; ------
;; Setup

;; room-maps keeps track of the rooms each session is in (for easy removal
;; on session close) and some info about the rooms we're subscribed to on
;; this machine
;; {:sessions {<session-id>: #{<room-id>}}
;;  :rooms {<{app-id: app-id, room-id: room-id}> {:session-ids #{<sess-id>}
;;                                                :last-data <...>}}}
(defonce room-maps
  (atom {}))

(declare handle-event)

(declare handle-broadcast-message)

(defn init-hz
  ([store-conn]
   (init-hz store-conn {}))
  ([store-conn {:keys [instance-name cluster-name metrics]
                :or {instance-name "instant-hz-v2"
                     cluster-name "instant-server"
                     metrics true}}]
   (-> (java.util.logging.Logger/getLogger "com.hazelcast.system.logo")
       (.setLevel java.util.logging.Level/WARNING))
   (System/setProperty "hazelcast.shutdownhook.enabled" "false")
   (System/setProperty "hazelcast.phone.home.enabled" "false")
   (let [config               (Config.)
         network-config       (.getNetworkConfig config)
         join-config          (.getJoin network-config)
         tcp-ip-config        (.getTcpIpConfig join-config)
         aws-config           (.getAwsConfig join-config)
         serialization-config (.getSerializationConfig config)
         metrics-config       (.getMetricsConfig config)]
     (.setInstanceName config instance-name)
     (.setEnabled (.getMulticastConfig join-config) false)
     (if (= :prod (config/get-env))
       (let [ip (aws-util/get-instance-ip)]
         (.setPublicAddress network-config ip)
         (-> aws-config
             (.setEnabled true)
             (.setProperty "hz-port" "5701")
             (.setProperty "tag-key" aws-util/environment-tag-name)
             (.setProperty "tag-value" (aws-util/get-environment-tag))))
       (do
         (.setEnabled tcp-ip-config true)
         (.setMembers tcp-ip-config (list "127.0.0.1"))))

     (.setClusterName config cluster-name)

     (.setSerializerConfigs serialization-config
                            hz-util/serializer-configs)

     (.setGlobalSerializerConfig serialization-config
                                 hz-util/global-serializer-config)

     (.setEnabled metrics-config metrics)

     (let [hz                 (Hazelcast/newHazelcastInstance config)
           local-member       (.getLocalMember (.getCluster hz))
           hz-rooms-map       (.getMap hz "rooms-v2")
           hz-broadcast-topic (.getTopic hz "rooms-broadcast")]
       (.addEntryListener hz-rooms-map
                          (reify
                            EntryAddedListener
                            (entryAdded [_ event]
                              (handle-event store-conn event))

                            EntryRemovedListener
                            (entryRemoved [_ event]
                              (handle-event store-conn event))

                            EntryUpdatedListener
                            (entryUpdated [_ event]
                              (handle-event store-conn event)))
                         ;; Don't send value, since we may not be
                         ;; interested in this change
                          false)
       (.addMessageListener hz-broadcast-topic
                            (reify
                              MessageListener
                              (onMessage [_ message]
                               ;; Don't bother handling messages that we put on the topic
                                (when (not= local-member (.getPublishingMember message))
                                  (handle-broadcast-message store-conn message)))))
       {:hz hz
        :hz-rooms-map hz-rooms-map
        :hz-broadcast-topic hz-broadcast-topic}))))

(defonce hz
  (delay
    (init-hz rs/store-conn)))

(defn get-hz ^HazelcastInstance []
  (:hz @hz))

(defn get-hz-rooms-map ^IMap []
  (:hz-rooms-map @hz))

(defn get-hz-broadcast-topic ^ITopic []
  (:hz-broadcast-topic @hz))

;; ---------
;; Hazelcast

(defn handle-event [store-conn ^DataAwareEntryEvent event]
  (let [room-key                        (.getKey event)
        {:keys [app-id room-id]}        room-key
        {:keys [session-ids last-data]} (get-in @room-maps [:rooms room-key])]
    (when (seq session-ids)
      (let [room-data (.get (get-hz-rooms-map) room-key)
            edits     (when last-data
                        (editscript/get-edits
                         (editscript/diff last-data room-data {:algo :a-star :str-diff :none})))]
        (swap! room-maps assoc-in [:rooms room-key :last-data] room-data)
        (doseq [[sess-id _] room-data
                :let [q (:receive-q (rs/get-socket @store-conn sess-id))]
                :when q]
          (receive-queue/enqueue->receive-q q
                                            {:op         :refresh-presence
                                             :app-id     app-id
                                             :room-id    room-id
                                             :data       room-data
                                             :edits      edits
                                             :session-id sess-id}))))))

(defn handle-broadcast-message
  "Handles the message on the topic we use to broadcast a client-broadcast
   message to sessions that are in the room, but live on a different physical
   machine."
  [store-conn ^Message m]
  (let [{:keys [app-id session-ids base-msg]} (.getMessageObject m)]
    (doseq [sess-id session-ids
            :let [q (:receive-q (rs/get-socket @store-conn sess-id))]
            :when q]
      (receive-queue/enqueue->receive-q q
                                        (assoc base-msg
                                               :op :server-broadcast
                                               :session-id sess-id
                                               :app-id app-id)))))

(defn broadcast [app-id session-ids base-msg]
  (.publish (get-hz-broadcast-topic)
            (hz-util/room-broadcast-message app-id
                                            session-ids
                                            base-msg)))

(defn get-room-data [app-id room-id]
  (.get (get-hz-rooms-map) (hz-util/room-key app-id room-id)))

(defn register-session!
  "Registers that the session is following the room and starts a channel
   for the room if one doesn't already exist."
  [app-id room-id sess-id]
  (let [room-key (hz-util/room-key app-id room-id)]
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
  (let [room-key (hz-util/room-key app-id room-id)]
    (swap! room-maps
           (fn [m]
             (let [session-ids (-> m
                                   (get-in [:rooms room-key :session-ids])
                                   (disj sess-id))]
               (cond-> m
                 true (disj-in [:sessions sess-id] room-id)
                 (empty? session-ids) (dissoc-in [:rooms room-key])
                 (seq session-ids) (assoc-in [:rooms room-key :session-ids]
                                             session-ids)))))
    (hz-util/remove-session! (get-hz-rooms-map) room-key sess-id)))

;; ----------
;; Public API

(defn get-room-session-ids [app-id room-id]
  (let [room-data         (get-room-data app-id room-id)
        room-key          (hz-util/room-key app-id room-id)
        local-session-ids (get-in @room-maps [:rooms room-key :session-ids] #{})]
    {:local-ids (filterv local-session-ids (keys room-data))
     :remote-ids (vec (remove local-session-ids (keys room-data)))}))

(defn in-room?
  "Returns whether a session is part of a room."
  [app-id room-id sess-id]
  (contains? (get-room-data app-id room-id) sess-id))

(defn join-room! [app-id sess-id current-user room-id]
  (register-session! app-id room-id sess-id)
  (hz-util/join-room! (get-hz-rooms-map)
                      (hz-util/room-key app-id room-id)
                      sess-id
                      (:id current-user)))

(defn leave-room! [app-id sess-id room-id]
  (remove-session! app-id room-id sess-id))

(defn set-presence! [app-id sess-id room-id data]
  (hz-util/set-presence! (get-hz-rooms-map)
                         (hz-util/room-key app-id room-id)
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
      (init-hz rs/store-conn)))
  (-> (future @hz)
      (.get (* 60 1000) java.util.concurrent.TimeUnit/MILLISECONDS)))

(defn stop []
  (when-let [^HazelcastInstance hz (try (get-hz) (catch Exception _e nil))]
    (.shutdown hz)))

(defn restart []
  (stop)
  (start))

(defn before-ns-unload []
  (stop))

(defn after-ns-reload []
  (start))
