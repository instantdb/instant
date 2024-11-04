(ns instant.reactive.ephemeral
  "Handles our ephemeral data apis for a session (presence, cursors)"
  (:require
   [clojure.core.async :as a]
   [clojure.set :as set]
   [datascript.core :refer [squuid-time-millis]]
   [instant.config :as config]
   [instant.flags :as flags]
   [instant.gauges :as gauges]
   [instant.reactive.store :as rs]
   [instant.util.async :as ua]
   [instant.util.aws :as aws-util]
   [instant.util.exception :as ex]
   [instant.util.hazelcast :as hz-util]
   [instant.util.tracer :as tracer]
   [medley.core :refer [dissoc-in]])
  (:import
   (com.hazelcast.config Config)
   (com.hazelcast.core Hazelcast HazelcastInstance)
   (com.hazelcast.map IMap)
   (com.hazelcast.map.impl DataAwareEntryEvent)
   (com.hazelcast.map.listener EntryAddedListener
                               EntryRemovedListener
                               EntryUpdatedListener)
   (java.util AbstractMap$SimpleImmutableEntry)
   (java.util.concurrent LinkedBlockingQueue)))

;; ------
;; Setup

(declare room-refresh-ch)
(defonce refresh-map-ch (a/chan 1024))
;; Channel we use to keep the hazelcast maps in sync for
;; apps that aren't using hazelcast. This can go away when
;; we fully migrate to hazelcast
(defonce hz-ops-q (atom nil))

(def refresh-timeout-ms 500)

;; room-maps keeps track of the rooms each session is in (for easy removal
;; on session close) and some info about the rooms we're subscribed to on
;; this machine
;; {:sessions {<session-id>: #{<room-id>}}
;;  :rooms {<{app-id: app-id, room-id: room-id}> {:session-ids #{<sess-id>}
;;                                                :chan async/chan}}}
(defonce room-maps (atom {}))

(defn handle-event [^DataAwareEntryEvent event]
  (let [{:keys [app-id] :as room-key} (.getKey event)]
    (when (flags/use-hazelcast? app-id)
      (when-let [ch (get-in @room-maps [:rooms room-key :chan])]
        (a/put! ch room-key)))))

(defn init-hz []
  (System/setProperty "hazelcast.shutdownhook.enabled" "false")
  (let [config (Config.)
        network-config (.getNetworkConfig config)
        join-config (.getJoin network-config)
        tcp-ip-config (.getTcpIpConfig join-config)
        aws-config (.getAwsConfig join-config)
        serialization-config (.getSerializationConfig config)]
    (.setInstanceName config "instant-hz-v2")
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

    (.setClusterName config "instant-server")

    (.setSerializerConfigs serialization-config
                           hz-util/serializer-configs)

    (.setGlobalSerializerConfig serialization-config
                                hz-util/global-serializer-config)

    (let [hz (Hazelcast/getOrCreateHazelcastInstance config)
          hz-rooms-map (.getMap hz "rooms-v2")
          listener-id (.addEntryListener hz-rooms-map
                                         (reify
                                           EntryAddedListener
                                           (entryAdded [_ event]
                                             (handle-event event))

                                           EntryRemovedListener
                                           (entryRemoved [_ event]
                                             (handle-event event))

                                           EntryUpdatedListener
                                           (entryUpdated [_ event]
                                             (handle-event event)))
                                         ;; Don't send value, since we may not be
                                         ;; interested in this change
                                         false)]
      {:hz hz
       :hz-rooms-map hz-rooms-map
       :listener-id listener-id})))

(defonce hz (delay (init-hz)))

(defn get-hz ^HazelcastInstance []
  (:hz @hz))

(defn get-hz-rooms-map ^IMap []
  (:hz-rooms-map @hz))

(def close-sentinel (Object.))
(defn start-hz-sync
  "Temporary function that syncs apps not using hazelcast
   to hazelcast maps so that they won't lose data if we switch them over."
  [^LinkedBlockingQueue q]
  (loop [f (.take q)]
    (when (not= f close-sentinel)
      (try (f)
           (catch Exception e
             (tracer/record-exception-span! e {:name "ephemeral/hz-sync"})))
      (recur (.take q)))))

;; ------
;; State

(defn- join-room
  "Sessions can join rooms to receive non-persisted updates. When a session joins a room
  it initially sets its data to an empty map."
  [store-v app-id sess-id {:keys [id] :as current-user} room-id]
  (-> store-v
      (update-in [:rooms app-id room-id :session-ids] (fnil conj #{}) sess-id)
      (assoc-in [:rooms app-id room-id :data sess-id] {:peer-id sess-id
                                                       :user (when current-user
                                                               {:id id})
                                                       :data {}})
      ;; Tracking room-ids for a session is useful for cleanup when a session disconnects
      (update-in [:sessions sess-id :room-ids] (fnil conj #{}) room-id)))

(defn disj-in
  "Calls dissoc-in to clean up the map when the item at path is empty after
   calling disj. Useful for cleaning up the room and session maps."
  [m path item]
  (let [new-m (update-in m path disj item)]
    (if (empty? (get-in new-m path))
      (dissoc-in new-m path)
      new-m)))

(defn- leave-room
  "Removes a session and its data from a room."
  [store-v app-id sess-id room-id]
  (-> store-v
      (disj-in [:rooms app-id room-id :session-ids] sess-id)
      (disj-in [:sessions sess-id :room-ids] room-id)
      (dissoc-in [:rooms app-id room-id :data sess-id])))

(defn- leave-by-session-id [store-v app-id sess-id]
  (let [rooms (get-in store-v [:sessions sess-id :room-ids] #{})
        without-rooms (if-not app-id
                        store-v
                        (reduce (fn [store-v room-id]
                                  (leave-room store-v app-id sess-id room-id))
                                store-v
                                rooms))]
    (-> without-rooms
        (dissoc-in [:sessions sess-id]))))

(defn- set-presence
  "Sets a session's presence data for a specific room."
  [store-v app-id sess-id room-id data]
  (assoc-in store-v [:rooms app-id room-id :data sess-id :data] data))

;; ---------
;; Hazelcast

(defn handle-refresh-event [store-conn room-key room-id]
  (let [room-data (.get (get-hz-rooms-map) room-key)
        session-ids (filter (fn [sess-id]
                              (rs/get-session @store-conn sess-id))
                            (keys room-data))]
    (rs/try-broadcast-event! store-conn session-ids {:op :refresh-presence
                                                     :room-id room-id
                                                     :data room-data})))

(defn straight-jacket-refresh-event!
  [store-conn {:keys [room-key room-id on-sent]}]
  (try
    (let [fut (ua/vfuture (handle-refresh-event store-conn
                                                room-key
                                                room-id))
          ret (deref fut refresh-timeout-ms :timeout)]
      (when (= :timeout ret)
        (future-cancel fut)
        (ex/throw-operation-timeout! :refresh-rooms refresh-timeout-ms)))
    (catch Throwable t
      (tracer/record-exception-span! t {:name "rooms-refresh-map/straight-jacket"}))
    (finally (on-sent))))

(defn start-refresh-map-worker [store-conn ch]
  (loop [event (a/<!! ch)]
    (if (nil? event)
      (tracer/record-info! {:name "room-refresh-map/closed"})
      (do
        (straight-jacket-refresh-event! store-conn event)
        (recur (a/<!! ch))))))

(defn get-room-data [app-id room-id]
  (.get (get-hz-rooms-map) (hz-util/room-key app-id room-id)))

(defn push-hz-sync-op [f]
  (try
    (when-let [^LinkedBlockingQueue q @hz-ops-q]
      (.put q f))
    (catch Throwable e
      (tracer/record-exception-span! e {:name "ephemeral/push-hz-sync-op-err"}))))

(defn register-session!
  "Registers that the session is following the room and starts a channel
   for the room if one doesn't already exist."
  [app-id room-id sess-id]
  (let [room-key (hz-util/room-key app-id room-id)
        chan (a/chan (a/sliding-buffer 1))
        res (swap!
             room-maps
             (fn [m]
               (-> m
                   (update-in [:sessions sess-id] (fnil conj #{}) room-id)
                   ;; Keep track of which sessions are interested in the room
                   ;; so we can close our channel when the last session leaves
                   (update-in [:rooms room-key :session-ids]
                              (fnil conj #{}) sess-id)
                   (update-in [:rooms room-key :chan]
                              #(or % chan)))))]
    (when (= chan (get-in res [:rooms room-key :chan]))
      ;; We set the chan, so we should create the go block that will
      ;; shuttle messages from the map listener to the channel that
      ;; broadcasts the room updates.
      (a/go-loop []
        (when-let [room-key (a/<! chan)]
          (let [complete-chan (a/chan)]
            (a/>! refresh-map-ch {:room-key room-key
                                  :room-id room-id
                                  :on-sent (fn [] (a/close! complete-chan))})
            ;; Wait until we've finished broadcasting before publishing a new
            ;; message. Helps to prevent the broadcaster getting overwhelmed.
            (a/<! complete-chan))
          (recur))))))

(defn remove-session! [app-id room-id sess-id]
  (let [room-key (hz-util/room-key app-id room-id)

        [old-val new-val]
        (swap-vals! room-maps
                    (fn [m]
                      (let [session-ids (-> m
                                            (get-in [:rooms room-key :session-ids])
                                            (disj sess-id))]
                        (cond-> m
                          true (disj-in [:sessions sess-id] room-id)
                          (empty? session-ids) (dissoc-in [:rooms room-key])
                          (seq session-ids) (assoc-in [:rooms room-key :session-ids]
                                                      session-ids)))))
        chan-before (get-in old-val [:rooms room-key :chan])
        chan-after (get-in new-val [:rooms room-key :chan])]
    (when (and chan-before (not= chan-before chan-after))
      ;; The last session left the room, so we should close out the go loop.
      (a/close! chan-before))

    (hz-util/remove-session! (get-hz-rooms-map) room-key sess-id)))

(defn clean-old-sessions []
  (let [oldest-timestamp (aws-util/oldest-instance-timestamp)
        hz-map (get-hz-rooms-map)]
    (when-not oldest-timestamp
      (throw (Exception. "Could not determine oldest instance timestamp")))
    (doseq [^AbstractMap$SimpleImmutableEntry entry (.entrySet hz-map)
            :let [{:keys [app-id room-id]} (.getKey entry)
                  v (.getValue entry)]
            :when (and app-id room-id)
            sess-id (keys v)
            :let [squuid-timestamp (squuid-time-millis sess-id)]
            :when (< squuid-timestamp oldest-timestamp)]
      (tracer/with-span! {:name "clean-old-session"
                          :attributes {:app-id app-id
                                       :room-id room-id
                                       :session-id sess-id
                                       :squuid-timestamp squuid-timestamp}}
        (remove-session! app-id room-id sess-id)))))

;; ----------
;; Public API

(defn get-changed-rooms
  "Collects new/updated rooms."
  [old-rooms new-rooms]
  (let [app-ids (set/union (set (keys old-rooms)) (set (keys new-rooms)))]
    (reduce (fn [acc app-id]
              (if (flags/use-hazelcast? app-id)
                acc
                (let [old-app-rooms (get old-rooms app-id {})
                      new-app-rooms (get new-rooms app-id {})]
                  (reduce-kv (fn [acc room-id data]
                               (if (not= (get old-app-rooms room-id) data)
                                 (conj acc [room-id data])
                                 acc))
                             acc
                             new-app-rooms))))
            []
            app-ids)))

(defn get-room-session-ids [store-v app-id room-id]
  (get-in store-v [:rooms app-id room-id :session-ids]))

(defn in-room?
  "Returns whether a session is part of a room."
  [store-v app-id room-id sess-id]
  (if (flags/use-hazelcast? app-id)
    (contains? (get-room-data app-id room-id) sess-id)
    (contains? (get-room-session-ids store-v app-id room-id) sess-id)))

(defn run-op [app-id hz-op regular-op]
  ;; Always run the regular op in case we disable hazelcast for the app
  (regular-op)

  (when-not (flags/use-hazelcast? app-id)
    (a/>!! room-refresh-ch :refresh))

  (cond (flags/use-hazelcast? app-id)
        (hz-op)

        ;; If we're not using hazelcast, put the op in a queue
        ;; to be applied in case we enable hazelcast for the app
        (not (flags/hazelcast-disabled?))
        (push-hz-sync-op hz-op)))

(defn join-room! [store-atom app-id sess-id current-user room-id]
  (let [hz-op (fn []
                (register-session! app-id room-id sess-id)
                (hz-util/join-room! (get-hz-rooms-map)
                                    (hz-util/room-key app-id room-id)
                                    sess-id
                                    (:id current-user)))
        regular-op
        (fn []
          (when-not (contains? (get-room-session-ids @store-atom app-id room-id)
                               sess-id)
            (swap! store-atom join-room app-id sess-id current-user room-id)))]

    (run-op app-id hz-op regular-op)))

(defn leave-room! [store-atom app-id sess-id room-id]
  (let [hz-op (fn []
                (remove-session! app-id room-id sess-id))
        regular-op (fn []
                     (swap! store-atom leave-room app-id sess-id room-id))]
    (run-op app-id hz-op regular-op)))

(defn set-presence! [store-atom app-id sess-id room-id data]
  (let [hz-op (fn []
                (hz-util/set-presence! (get-hz-rooms-map)
                                       (hz-util/room-key app-id room-id)
                                       sess-id
                                       data))
        regular-op (fn []
                     (swap! store-atom set-presence app-id sess-id room-id data))]
    (run-op app-id hz-op regular-op)))

(defn leave-by-session-id! [store-atom app-id sess-id]
  (let [hz-op (fn []
                (doseq [room-id (get-in @room-maps [:sessions sess-id])]
                  (remove-session! app-id room-id sess-id)))
        regular-op (fn []
                     (swap! store-atom leave-by-session-id app-id sess-id))]
    (run-op app-id hz-op regular-op)))

;; --------------
;; Refresh Worker

(defn refresh-rooms! [store-conn old-v new-v]
  (let [old-apps-rooms (get-in old-v [:rooms])
        new-apps-rooms (get-in new-v [:rooms])
        changed-rooms (get-changed-rooms old-apps-rooms new-apps-rooms)]
    (when (seq changed-rooms)
      (tracer/with-span!
        {:name "refresh-rooms"
         :attributes {:room-ids (pr-str (map first changed-rooms))}}
        (ua/vfuture-pmap
         (fn [[room-id {:keys [data session-ids]}]]
           (rs/try-broadcast-event! store-conn session-ids {:op :refresh-presence
                                                            :room-id room-id
                                                            :data data}))
         changed-rooms)))))

(defn straight-jacket-refresh-rooms! [store-conn prev curr]
  (try
    (let [refresh-fut (ua/vfuture (refresh-rooms! store-conn prev curr))
          ret (deref refresh-fut refresh-timeout-ms :timeout)]
      (when (= :timeout ret)
        (future-cancel refresh-fut)
        (ex/throw-operation-timeout! :refresh-rooms refresh-timeout-ms)))
    (catch Throwable e
      (tracer/record-exception-span! e {:name "rooms-refresh/straight-jacket"}))))

(defn start-refresh-worker [store-conn store-atom ch]
  (tracer/record-info! {:name "room-refresh/start"})
  (loop [prev-state @store-atom]
    (let [signal (a/<!! ch)
          curr-state @store-atom]
      (if (nil? signal)
        (tracer/record-info! {:name "room-refresh/closed"})
        (do (straight-jacket-refresh-rooms! store-conn prev-state curr-state)
            (recur curr-state))))))

;; ------
;; System

(declare ephemeral-store-atom)

(defn start-hz []
  (let [result (deref (future @hz) (* 60 1000) :timeout)]
    (when (= result :timeout)
      (alter-var-root #'flags/use-hazelcast? (fn [_] (constantly false)))
      (alter-var-root #'flags/hazelcast-disabled? (fn [_] (constantly true)))
      (tracer/record-exception-span!
       (Exception. "Hazelcast timed out while loading")
       {:name "ephemeral/hazelcast-load-timeout"}))))

(defn start []
  (def ephemeral-store-atom (atom {}))
  (def room-refresh-ch (a/chan (a/sliding-buffer 1)))
  (def refresh-map-ch (a/chan 1024))
  (def cleanup-gauge (gauges/add-gauge-metrics-fn
                      (fn [] (if-let [^LinkedBlockingQueue q @hz-ops-q]
                               [{:path "instant.ephemeral.hz-ops-q.size"
                                 :value (.size q)}]
                               []))))

  (start-hz)
  (ua/fut-bg (start-refresh-worker rs/store-conn ephemeral-store-atom room-refresh-ch))
  (dotimes [_ 32]
    (ua/vfut-bg (start-refresh-map-worker rs/store-conn refresh-map-ch)))
  (let [q (LinkedBlockingQueue.)]
    (reset! hz-ops-q q)
    (ua/fut-bg (start-hz-sync q))))

(defn stop []
  (a/close! room-refresh-ch)
  (a/close! refresh-map-ch)
  (when-let [q ^LinkedBlockingQueue @hz-ops-q]
    (.put q close-sentinel))
  (reset! hz-ops-q nil)
  (cleanup-gauge)
  (when-let [^HazelcastInstance hz (try (get-hz) (catch Exception _e nil))]
    (.shutdown hz)
    (def hz (delay (init-hz)))))

(defn restart []
  (stop)
  (start))
