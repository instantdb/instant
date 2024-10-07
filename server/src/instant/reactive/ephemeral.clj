(ns instant.reactive.ephemeral
  "Handles our ephemeral data apis for a session (presence, cursors)"
  (:require
   [clojure.core.async :as a]
   [clojure.edn :as edn]
   [clojure.set :as set]
   [clojure.string :as string]
   [instant.config :as config]
   [instant.reactive.store :as rs]
   [instant.util.async :as ua]
   [instant.util.exception :as ex]
   [instant.util.tracer :as tracer]
   [medley.core :refer [dissoc-in]]
   [clj-http.client :as clj-http]
   [amazonica.aws.ec2 :as ec2])
  (:import
   (com.hazelcast.config Config)
   (com.hazelcast.core Hazelcast)
   (com.hazelcast.map.listener EntryAddedListener
                               EntryRemovedListener
                               EntryUpdatedListener)))

;; ------
;; Setup

(declare room-refresh-ch)

(def refresh-timeout-ms 500)

(def tag-name "elasticbeanstalk:environment-name")
(defn get-tag []
  (let [token (-> (clj-http/put
                   "http://169.254.169.254/latest/api/token"
                   {:headers {"X-aws-ec2-metadata-token-ttl-seconds" "21600"}})
                  :body)
        instance-id (-> (clj-http.client/get
                         "http://169.254.169.254/latest/meta-data/instance-id"
                         {:headers {"X-aws-ec2-metadata-token" token}})
                        :body)]
    (->> (ec2/describe-instances {:instance-ids [instance-id]})
         :reservations
         first
         :instances
         first
         :tags
         (filter (fn [t] (= (:key t) tag-name)))
         first
         :value)))

(defn get-security-group []
  (let [token (-> (clj-http/put
                   "http://169.254.169.254/latest/api/token"
                   {:headers {"X-aws-ec2-metadata-token-ttl-seconds" "21600"}})
                  :body)]
    (-> (clj-http.client/get
         "http://169.254.169.254/latest/meta-data/security-groups"
         {:headers {"X-aws-ec2-metadata-token" token}})
        :body)))

(defn get-ip []
  (let [token (-> (clj-http/put
                   "http://169.254.169.254/latest/api/token"
                   {:headers {"X-aws-ec2-metadata-token-ttl-seconds" "21600"}})
                  :body)]
    (-> (clj-http.client/get
         "http://169.254.169.254/latest/meta-data/local-ipv4"
         {:headers {"X-aws-ec2-metadata-token" token}})
        :body)))

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
      (do
        (.setPublicAddress network-config (get-ip))
        (.addInterface (.setEnabled (.getInterfaces (.getNetworkConfig (Config.)))
                                    true)
                       (get-ip))
        (-> aws-config
            (.setEnabled true)
            (.setProperty "tag-key" tag-name)
            (.setProperty "tag-value" (get-tag))
            (.setProperty "security-group-name" (get-security-group))

            (.setProperty "hz-port" "5701")))
      (do
        (.setEnabled tcp-ip-config true)
        (.setMembers tcp-ip-config (list "127.0.0.1"))))

    (.setClusterName config "instant-server")
    (Hazelcast/newHazelcastInstance config)))

(defonce hz (delay (init-hz)))

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
  ;; XXX
  (contains? (get-room-session-ids store-v app-id room-id) sess-id))

;; XXX: Need something so that we can stop watching a room once all of
;;      our sessions stop caring about it.
(defonce room-maps (atom {}))
(defonce refresh-map-ch (a/chan))

;; XXX: Need some kind of timeout
(defn handle-refresh-event [store-conn m]
  (let [snapshot (into {} m)
        session-ids (keys snapshot)
        room-id (-> (.getName m)
                    edn/read-string
                    :room-id)]
    (rs/try-broadcast-event! store-conn session-ids {:op :refresh-presence
                                                     :room-id room-id
                                                     :data snapshot
                                                     :__machine-id @config/process-id})))

(defn start-refresh-map-worker [store-conn ch]
  (loop [m (a/<!! ch)]
    (if (nil? m)
      (tracer/record-info! {:name "room-refresh-map/closed"})
      (do (try (handle-refresh-event store-conn m)
               (catch Throwable t
                 (tracer/record-exception-span! t {:name "rooms-refresh-map/straight-jacket"})))
          (recur (a/<!! ch))))))

(defn handle-event [m ch event]
  (a/put! ch m))

(defn make-listener [m]
  (let [ch (a/chan (a/sliding-buffer 1))]
    ;; Probably a better way to do this?
    (ua/vfuture (loop [m (a/<!! ch)]
                  (when m
                    (a/>!! refresh-map-ch m)
                    (recur (a/<!! ch)))))
    (reify
      EntryAddedListener
      (entryAdded [_ event]
        (handle-event m ch event))
      EntryRemovedListener
      (entryRemoved [_ event]
        (handle-event m ch event))
      EntryUpdatedListener
      (entryUpdated [_ event]
        (handle-event m ch event)))))

;; XXX: check reflection warnings
;; (set! *warn-on-reflection* false)

(defn register-room-map [m sess-id]
  (let [map-name (.getName m)
        res
        (swap! room-maps
               (fn [maps]
                 (cond-> maps
                   true (update-in [:sessions sess-id] (fnil conj #{}) m)
                   (not (get-in maps [:maps map-name :listener]))
                   ;; Use the delay to ensure we only create one listener per map,
                   ;; even if swap has to retry
                   (assoc-in [map-name :listener]
                             (delay
                               (.addEntryListener m
                                                  (make-listener m)
                                                  true))))))]
    @(get-in res [map-name :listener])))

(defn map-id [app-id room-id]
  (pr-str {:app-id app-id :room-id room-id}))

;; XXX: Use a flag to determine whether to use hz
(defn join-room! [store-atom app-id sess-id current-user room-id]
  ;;(tool/def-locals)
  (let [hz-map (.getMap @hz (map-id app-id room-id))]
    (register-room-map hz-map sess-id)
    (.put hz-map sess-id {:peer-id sess-id
                          :user (when current-user
                                  {:id (:id current-user)})
                          :data {}}))
  (when-not (contains? (get-room-session-ids @store-atom app-id room-id) sess-id)
    (swap! store-atom join-room app-id sess-id current-user room-id)
    ;;(a/>!! room-refresh-ch :refresh)
    ))

(defn leave-room! [store-atom app-id sess-id room-id]
  (let [hz-map (.getMap @hz (map-id app-id room-id))]
    ;; XXX: Need something to clear the map if we don't care about it any more
    ;;      If the map is empty, stop watching it.
    (.remove hz-map sess-id))
  (swap! store-atom leave-room app-id sess-id room-id)
  ;;(a/>!! room-refresh-ch :refresh)
  )

(defn set-presence! [store-atom app-id sess-id room-id data]
  (let [hz-map (.getMap @hz (map-id app-id room-id))]
    (.put hz-map sess-id (merge (.get hz-map sess-id)
                                {:data data})))
  (swap! store-atom set-presence app-id sess-id room-id data)
  ;;(a/>!! room-refresh-ch :refresh)
  )

(defn leave-by-session-id! [store-atom app-id sess-id]
  ;; XXX
  (swap! store-atom leave-by-session-id app-id sess-id)
  (doseq [m (get-in @room-maps [:sessions sess-id])]
    (.remove m sess-id))
  (swap! room-maps dissoc-in [:sessions sess-id])
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
  @hz
  (ua/fut-bg (start-refresh-worker rs/store-conn ephemeral-store-atom room-refresh-ch))
  (ua/fut-bg (start-refresh-map-worker rs/store-conn refresh-map-ch)))

(defn stop []
  (a/close! room-refresh-ch))

(defn restart []
  (stop)
  (start))
