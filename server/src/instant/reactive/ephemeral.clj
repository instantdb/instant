(ns instant.reactive.ephemeral
  "Handles our ephemeral data apis for a session (presence, cursors)"
  (:require
   [clojure.core.async :as a]
   [clojure.edn :as edn]
   [clojure.set :as set]
   [datascript.core :refer [squuid-time-millis]]
   [instant.config :as config]
   [instant.flags :as flags]
   [instant.reactive.store :as rs]
   [instant.util.async :as ua]
   [instant.util.aws :as aws-util]
   [instant.util.exception :as ex]
   [instant.util.tracer :as tracer]
   [medley.core :refer [dissoc-in]])
  (:import
   (com.hazelcast.config Config)
   (com.hazelcast.core Hazelcast HazelcastInstance)
   (com.hazelcast.map IMap)
   (com.hazelcast.map.listener EntryAddedListener
                               EntryRemovedListener
                               EntryUpdatedListener)
   (java.util.function BiFunction)))

;; ------
;; Setup

(declare room-refresh-ch)
(defonce refresh-map-ch (a/chan 1024))
;; Channel we use to keep the hazelcast maps in sync for
;; apps that aren't using hazelcast. This can go away when
;; we fully migrate to hazelcast
(defonce hz-ops-ch (a/chan))

(def refresh-timeout-ms 500)

(defn init-hz []
  (let [config (Config.)
        network-config (.getNetworkConfig config)
        join-config (.getJoin network-config)
        tcp-ip-config (.getTcpIpConfig join-config)
        aws-config (.getAwsConfig join-config)]
    (.setInstanceName config "instant-hz")
    (.setEnabled (.getMulticastConfig join-config) false)
    (if (= :prod (config/get-env))
      ;; XXX: Don't forget to allow incoming on 5701 from same security group
      ;; XXX: Need to put all instances in same az
      ;; XXX: Need to configure placement group and see if it works
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
    (Hazelcast/getOrCreateHazelcastInstance config)))

(defonce hz (delay (init-hz)))
(defn get-hz ^HazelcastInstance []
  @hz)

(defn start-hz-sync
  "Temporary function that syncs apps not using hazelcast
   to hazelcast maps so that they won't lose data if we switch them over."
  [ch]
  (loop [f (a/<!! ch)]
    (when f
      (try (f)
           (catch Exception e
             (tracer/record-exception-span! e {:name "ephemeral/hz-sync"})))
      (recur (a/<!! ch)))))

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

(defonce room-maps (atom {}))

(defn map-snapshot [hz-map]
  ;; This is significantly faster than (into {} hz-map)
  ;; There may be more optimizations available
  (into {} (.entrySet hz-map)))

(defn handle-refresh-event [store-conn hz-map room-id]
  (let [snapshot (map-snapshot hz-map)
        session-ids (filter (fn [sess-id]
                              (rs/get-session @store-conn sess-id))
                            (keys snapshot))]
    (rs/try-broadcast-event! store-conn session-ids {:op :refresh-presence
                                                     :room-id room-id
                                                     :data snapshot})))

(defn straight-jacket-refresh-event!
  [store-conn {:keys [hz-map room-id on-sent]}]
  (try
    (let [fut (ua/vfuture (handle-refresh-event store-conn
                                                hz-map
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

(defn add-map-listener
  "Creates a listener on the map that will publish messages to the refresh-map-ch
   on changes.
   Returns a cleanup function."
  [m app-id room-id]
  (let [ch (a/chan (a/sliding-buffer 1))
        listener (reify
                   EntryAddedListener
                   (entryAdded [_ event]
                     (a/put! ch event))
                   EntryRemovedListener
                   (entryRemoved [_ event]
                     (a/put! ch event))
                   EntryUpdatedListener
                   (entryUpdated [_ event]
                     (a/put! ch event)))]

    ;; Background process that moves events from the listener
    ;; to the channel that will broadcast the updates
    (ua/vfuture (loop [event (a/<!! ch)]
                  (when event
                    (when (flags/use-hazelcast? app-id)
                      (let [complete-ch (a/chan)]
                        (a/>!! refresh-map-ch
                               {:hz-map m
                                :room-id room-id
                                :on-sent (fn [] (a/close! complete-ch))})
                        ;; Prevent overwhelming the refresh channel.
                        ;; We'll wait until this event has been
                        ;; broadcast before broadcasting the next event,
                        ;; dropping all but the latest update.
                        (a/<!! complete-ch)))
                    (recur (a/<!! ch)))))

    (let [listener-id (.addEntryListener m listener true)]
      (fn []
        (.removeEntryListener m listener-id)
        (a/close! ch)))))

(defn register-room-map [^IMap m app-id room-id sess-id]
  (let [map-name (.getName m)]
    ;; Use locking to ensure that we only create one listener
    ;; for the app and that we don't get a race condition when
    ;; we destroy the map after the last person leaves.
    (locking map-name
      (let [listener (when (not (get-in @room-maps [:maps map-name :listener]))
                       (add-map-listener m app-id room-id))]
        (swap! room-maps
               (fn [maps]
                 (cond-> maps
                   true (update-in [:sessions sess-id] (fnil conj #{}) m)

                   listener
                   (assoc-in [:maps map-name :listener] listener))))))))

(defn reset-room-listeners!
  "Debug function if you change the definition of add-map-listener and want to
   update maps to use the new function. Useful in dev."
  []
  (doseq [[k {:keys [listener]}] (:maps @room-maps)]
    ;; cleanup old listener
    (listener)
    (let [m (.getMap (get-hz) k)
          {:keys [app-id room-id]} (edn/read-string (.getName m))]
      (swap! room-maps
             assoc-in
             [:maps k :listener]
             (add-map-listener m app-id room-id)))))

(defn get-hz-map ^IMap [app-id room-id]
  (.getMap (get-hz) (pr-str {:app-id app-id :room-id room-id})))

(defn push-hz-sync-op [f]
  (try
    (a/put! hz-ops-ch f)
    (catch Throwable e
      (tracer/record-exception-span! e {:name "ephemeral/push-hz-sync-op-err"}))))

(defn remove-session [^IMap hz-map sess-id]
  (swap! room-maps disj-in [:sessions sess-id] hz-map)
  (.remove hz-map sess-id)
  ;; We add the locking to prevent a race condition on registering the map
  ;; while it's being destroyed. This may still be a race with other machines,
  ;; but I wasn't able to trigger one locally.
  (locking (.getName hz-map)
    (when (.isEmpty hz-map)
      (.destroy hz-map)
      (when-let [cleanup (get-in @room-maps [:maps (.getName hz-map) :listener])]
        (cleanup)
        (swap! room-maps dissoc-in [:maps (.getName hz-map)])))))

(defn clean-old-sessions []
  (let [oldest-timestamp (aws-util/oldest-instance-timestamp)]
    (when-not oldest-timestamp
      (throw (Exception. "Could not determine oldest instance timestamp")))
    (doseq [^IMap obj (.getDistributedObjects ^HazelcastInstance @hz)
            :when (instance? IMap obj)
            :let [{:keys [app-id room-id]} (try (edn/read-string (.getName obj))
                                                (catch Throwable _t nil))]
            :when (and app-id room-id)
            sess-id (.keySet obj)
            :let [squuid-timestamp (squuid-time-millis sess-id)]
            :when (< squuid-timestamp oldest-timestamp)]
      (tracer/with-span! {:name "clean-old-session"
                          :attributes {:session-id sess-id
                                       :app-id app-id
                                       :squuid-timestamp squuid-timestamp}}
        (remove-session obj sess-id)))))



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
    (.containsKey (get-hz-map app-id room-id) sess-id)
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
                (let [hz-map (get-hz-map app-id room-id)]
                  (register-room-map hz-map app-id room-id sess-id)
                  (.putIfAbsent hz-map sess-id {:peer-id sess-id
                                                :user (when current-user
                                                        {:id (:id current-user)})
                                                :data {}})))
        regular-op
        (fn []
          (when-not (contains? (get-room-session-ids @store-atom app-id room-id)
                               sess-id)
            (swap! store-atom join-room app-id sess-id current-user room-id)))]

    (run-op app-id hz-op regular-op)))

(defn leave-room! [store-atom app-id sess-id room-id]
  (let [hz-op (fn []
                (let [hz-map (get-hz-map app-id room-id)]
                  (remove-session hz-map sess-id)))
        regular-op (fn []
                     (swap! store-atom leave-room app-id sess-id room-id))]
    (run-op app-id hz-op regular-op)))

(defn set-presence! [store-atom app-id sess-id room-id data]
  (let [hz-op (fn []
                (.merge (get-hz-map app-id room-id)
                        sess-id
                        {:data data}
                        (reify BiFunction
                          (apply [_ x y]
                            (merge x y)))))
        regular-op (fn []
                     (swap! store-atom set-presence app-id sess-id room-id data))]
    (run-op app-id hz-op regular-op)))

(defn leave-by-session-id! [store-atom app-id sess-id]
  (let [hz-op (fn []
                (doseq [hz-map (get-in @room-maps [:sessions sess-id])]
                  (remove-session hz-map sess-id)))
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
         :attributes {:room-ids (pr-str (map first changed-rooms))}
         :sample-rate 0.01}
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
  (def hz-ops-ch (a/chan))

  (start-hz)
  (ua/fut-bg (start-refresh-worker rs/store-conn ephemeral-store-atom room-refresh-ch))
  (dotimes [_ 32]
    (ua/vfut-bg (start-refresh-map-worker rs/store-conn refresh-map-ch)))
  (ua/fut-bg (start-hz-sync hz-ops-ch)))

(defn stop []
  (a/close! room-refresh-ch)
  (a/close! refresh-map-ch)
  (a/close! hz-ops-ch))

(defn restart []
  (stop)
  (start))
