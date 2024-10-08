(ns instant.reactive.ephemeral
  "Handles our ephemeral data apis for a session (presence, cursors)"
  (:require
   [tool]
   [clojure.core.async :as a]
   [clojure.edn :as edn]
   [clojure.set :as set]
   [clojure.string :as string]
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
   (com.hazelcast.core Hazelcast)
   (com.hazelcast.map.listener EntryAddedListener
                               EntryRemovedListener
                               EntryUpdatedListener)
   (java.util.function BiFunction)))

;; ------
;; Setup

(declare room-refresh-ch)
;; Channel we use to keep the hazelcast maps in sync for
;; apps that aren't using hazelcast while we're testing
(defonce refresh-map-ch (a/chan 1024))
(defonce hz-map-ops-ch (a/chan))

(def refresh-timeout-ms 500)

(defn init-hz []
  (let [config (Config.)
        network-config (.getNetworkConfig config)
        join-config (.getJoin network-config)
        tcp-ip-config (.getTcpIpConfig join-config)
        aws-config (.getAwsConfig join-config)]
    (.setEnabled (.getMulticastConfig join-config) false)
    (if (= :prod (config/get-env))
      ;; XXX: Don't forget to allow incoming on 5701 from same security group
      ;; XXX: Need to put all instances in same az
      ;; XXX: Need to configure placement group and see if it works
      (let [ip (aws-util/get-instance-ip)]
        (.setPublicAddress network-config ip)
        ;; XXX: Do we need both of these or just one?
        (.addInterface (.setEnabled (.getInterfaces (.getNetworkConfig (Config.)))
                                    true)
                       ip)
        (-> aws-config
            (.setEnabled true)
            (.setProperty "hz-port" "5701")
            (.setProperty "tag-key" aws-util/environment-tag-name)
            (.setProperty "tag-value" (aws-util/get-environment-tag))
            ;; XXX: Do we need the security-group-name?
            ;;(.setProperty "security-group-name" (get-security-group))
            ))
      (do
        (.setEnabled tcp-ip-config true)
        (.setMembers tcp-ip-config (list "127.0.0.1"))))

    (.setClusterName config "instant-server")
    (Hazelcast/newHazelcastInstance config)))

(defonce hz (delay (init-hz)))

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

;; XXX: Need something so that we can stop watching a room once all of
;;      our sessions stop caring about it.
(defonce room-maps (atom {}))

(defn map-snapshot [hz-map]
  ;; This is significantly faster than (into {} hz-map)
  ;; There may be more optimizations available
  (select-keys hz-map (.keySet hz-map)))

;; XXX: Need some kind of timeout
(defn handle-refresh-event [store-conn hz-map room-id]
  (tool/def-locals)
  (let [snapshot (map-snapshot hz-map)
        session-ids (filter (fn [sess-id]
                              (rs/get-session @store-conn sess-id))
                            (keys snapshot))]
    (tool/def-locals)
    (rs/try-broadcast-event! store-conn session-ids {:op :refresh-presence
                                                     :room-id room-id
                                                     :data snapshot})))

(defn start-refresh-map-worker [store-conn ch]
  (loop [{:keys [hz-map room-id on-sent] :as v} (a/<!! ch)]
    (if (nil? v)
      (tracer/record-info! {:name "room-refresh-map/closed"})
      (do
        (try
          (handle-refresh-event store-conn hz-map room-id)
          (catch Throwable t
            (tracer/record-exception-span! t {:name "rooms-refresh-map/straight-jacket"}))
          (finally (on-sent)))
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

;; XXX: check reflection warnings
;; (set! *warn-on-reflection* false)

(defn register-room-map [m app-id room-id sess-id]
  (let [map-name (.getName m)
        res
        (swap! room-maps
               (fn [maps]
                 (cond-> maps
                   true (update-in [:sessions sess-id] (fnil conj #{}) m)
                   (not (get-in maps [:maps map-name :listener]))
                   ;; Use the delay to ensure we only create one listener per map,
                   ;; even if swap has to retry
                   (assoc-in [:maps map-name :listener]
                             (delay (add-map-listener m app-id room-id))))))]
    @(get-in res [:maps map-name :listener])))

(defn reset-room-listeners! []
  (doseq [[k {:keys [listener]}] (:maps @room-maps)]
    ;; cleanup old listener
    (@listener)
    (let [m (.getMap @hz k)
          {:keys [app-id room-id]} (edn/read-string (.getName m))
          res (swap! room-maps
                     assoc-in
                     [:maps k :listener]
                     (delay (add-map-listener m app-id room-id)))]
      @(get-in res [:maps k :listener]))))

(defn get-hz-map [app-id room-id]
  (.getMap @hz (pr-str {:app-id app-id :room-id room-id})))

(defn push-hz-sync-op [f]
  (try
    (a/put! hz-map-ops-ch f)
    (catch Throwable e
      (tracer/record-exception-span! e {:name "ephemeral/push-hz-sync-op-err"}))))

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
  (tool/def-locals)
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

;; XXX: What happens if a user reconnects, do they always call join-room?
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
                ;; XXX: Need something to clear the map if we don't care about it any more
                ;;      If the map is empty, stop watching it.
                (.remove (get-hz-map app-id room-id) sess-id))
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
                (doseq [m (get-in @room-maps [:sessions sess-id])]
                  (.remove m sess-id))
                (swap! room-maps dissoc-in [:sessions sess-id]))
        regular-op (fn []
                     (swap! store-atom leave-by-session-id app-id sess-id))]
    (run-op app-id hz-op regular-op)))

;; ------
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

(defn start []
  (def ephemeral-store-atom (atom {}))
  (def room-refresh-ch (a/chan (a/sliding-buffer 1)))
  (def refresh-map-ch (a/chan 1024))
  (def hz-map-ops-ch (a/chan))

  ;; XXX: This needs a timeout
  @hz
  (ua/fut-bg (start-refresh-worker rs/store-conn ephemeral-store-atom room-refresh-ch))
  (ua/fut-bg (start-refresh-map-worker rs/store-conn refresh-map-ch))
  (ua/fut-bg (start-hz-sync hz-map-ops-ch)))

(defn stop []
  (a/close! room-refresh-ch)
  (a/close! refresh-map-ch)
  (a/close! hz-map-ops-ch))

(defn restart []
  (stop)
  (start))
