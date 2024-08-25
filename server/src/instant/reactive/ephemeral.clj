(ns instant.reactive.ephemeral
  "Handles our ephemeral data apis for a session (presence, cursors)"
  (:require
   [instant.reactive.store :as rs]
   [instant.util.tracer :as tracer]
   [instant.util.async :as ua]
   [clojure.core.async :as a]
   [clojure.set :as set]
   [instant.util.exception :as ex]
   [medley.core :refer [dissoc-in]]))

;; ------
;; Setup

(declare room-refresh-ch)

(def refresh-timeout-ms 500)

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

;; ----------
;; Public API

(defn get-changed-rooms
  "Collects new/updated rooms."
  [old-rooms new-rooms]
  (let [app-ids (set/union (set (keys old-rooms)) (set (keys new-rooms)))]
    (reduce (fn [acc app-id]
              (let [old-app-rooms (get old-rooms app-id {})
                    new-app-rooms (get new-rooms app-id {})]
                (reduce-kv (fn [acc room-id data]
                             (if (not= (get old-app-rooms room-id) data)
                               (conj acc [room-id data])
                               acc))
                           acc
                           new-app-rooms)))
            []
            app-ids)))

(defn get-room-session-ids [store-v app-id room-id]
  (get-in store-v [:rooms app-id room-id :session-ids]))

(defn in-room?
  "Returns whether a session is part of a room."
  [store-v app-id room-id sess-id]
  (contains? (get-room-session-ids store-v app-id room-id) sess-id))

(defn join-room! [store-atom app-id sess-id current-user room-id]
  (when-not (contains? (get-room-session-ids @store-atom app-id room-id) sess-id)
    (swap! store-atom join-room app-id sess-id current-user room-id)
    (a/>!! room-refresh-ch :refresh)))

(defn leave-room! [store-atom app-id sess-id room-id]
  (swap! store-atom leave-room app-id sess-id room-id)
  (a/>!! room-refresh-ch :refresh))

(defn set-presence! [store-atom app-id sess-id room-id data]
  (swap! store-atom set-presence app-id sess-id room-id data)
  (a/>!! room-refresh-ch :refresh))

(defn leave-by-session-id! [store-atom app-id sess-id]
  (swap! store-atom leave-by-session-id app-id sess-id)
  (a/>!! room-refresh-ch :refresh))

;; ------
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

(defn start []
  (def ephemeral-store-atom (atom {}))
  (def room-refresh-ch (a/chan (a/sliding-buffer 1)))
  (ua/fut-bg (start-refresh-worker rs/store-conn ephemeral-store-atom room-refresh-ch)))

(defn stop []
  (a/close! room-refresh-ch))

(defn restart []
  (stop)
  (start))
