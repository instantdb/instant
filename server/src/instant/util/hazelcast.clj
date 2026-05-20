(ns instant.util.hazelcast
  (:require
   [instant.isn]
   [instant.rate-limit]
   [instant.util.coll :as ucoll]
   [instant.util.uuid :as uuid-util]
   [instant.util.defrecord :refer [defrecord-once]]
   [medley.core :refer [update-existing]]
   [taoensso.nippy :as nippy])
  (:import
   (com.hazelcast.config GlobalSerializerConfig SerializerConfig)
   (com.hazelcast.map EntryProcessor IMap)
   (com.hazelcast.map.impl LockAwareLazyMapEntry)
   (com.hazelcast.nio.serialization ByteArraySerializer)
   (java.io DataOutputStream DataInputStream ByteArrayInputStream ByteArrayOutputStream)
   (java.nio ByteBuffer)
   (java.util UUID)
   (java.util.function BiFunction)))

;; Be careful when you update the records and serializers in this
;; namespace. Hazelcast shares them across the fleet, so they must be
;; updated in a backwards compatible way. The old versions have to
;; work while the new and old versions are simultaneously deployed.

;; To make breaking changes, follow these steps:
;; 1. Create a new version of the record, e.g. JoinRoomMergeV2
;; 2. Create a serializer for the new record (make sure getTypeId is unique!)
;; 3. Create a new config and add it to serializer-configs at the bottom of the file
;; 4. Deploy the change, but don't use the new record yet (or put it behind a feature flag)
;; 5. Wait for all instance to update to the new version
;; 6. Start using the new version and stop using the old version
;; 7. Now it is safe to remove the old version

(defn make-serializer-config [protocol serializer]
  (-> (SerializerConfig.)
      (.setTypeClass protocol)
      (.setImplementation serializer)))

;; TODO: We should get rid of all of these custom serializers, use the global
;;       nippy serializer and write a custom nippy serializer for each type
;; Must be unique within the project
(def remove-session-type-id 1)
(def set-presence-type-id 3)
(def room-key-type-id 4)
(def global-type-id 5)
(def room-broadcast-type-id 6)
(def task-type-id 7)
(def join-room-v3-type-id 9)
(def sse-message-type-id 10)
(def presence-entry-processor-type-id 11)

;; --------
;; Room key

(defrecord-once RoomKeyV1 [^UUID app-id ^String room-id])

(def ^ByteArraySerializer room-key-serializer
  (reify ByteArraySerializer
    (getTypeId [_]
      room-key-type-id)
    (write ^bytes [_ obj]
      (let [uuid-bytes (uuid-util/->bytes (:app-id obj))
            ^String room-id (:room-id obj)
            room-id-bytes (.getBytes room-id)
            byte-buffer (ByteBuffer/allocate (+ (count uuid-bytes)
                                                (count room-id-bytes)))]
        (.put byte-buffer uuid-bytes)
        (.put byte-buffer room-id-bytes)
        (.array byte-buffer)))
    (read [_ ^bytes in]
      (let [buf (ByteBuffer/wrap in)
            app-id (UUID. (.getLong buf)
                          (.getLong buf))
            room-id-bytes (byte-array (.remaining buf))
            _ (.get buf room-id-bytes)
            room-id (String. room-id-bytes)]
        (->RoomKeyV1 app-id room-id)))
    (destroy [_])))

(def room-key-config
  (make-serializer-config RoomKeyV1
                          room-key-serializer))

(defn room-key [^UUID app-id ^String room-id]
  (->RoomKeyV1 app-id room-id))

;; --------------
;; Remove session

;; Helper to remove a session from the room in the hazelcast map
(defrecord-once RemoveSessionMergeV1 [^UUID session-id]
  BiFunction
  (apply [_ room-data _]
    (let [res (dissoc room-data session-id)]
      ;; Return null if we're the last so that the entry can be removed
      ;; from the map instead of holding an empty map
      (if (empty? res)
        nil
        res))))

(defn remove-session! [execute-on-key ^IMap hz-map ^RoomKeyV1 room-key ^UUID session-id]
  (let [action (->RemoveSessionMergeV1 session-id)]
    (if execute-on-key
      (execute-on-key room-key action)
      (.merge hz-map
              room-key
              ;; If the current value of the key is null, then the new value
              ;; should just be an empty map. We'd like to put nil here to
              ;; remove the entry (like we do in the bifunction), but that's
              ;; not allowed.
              {}
              action))))

(def ^ByteArraySerializer remove-session-serializer
  (reify ByteArraySerializer
    (getTypeId [_]
      remove-session-type-id)
    (write ^bytes [_ obj]
      (uuid-util/->bytes (:session-id obj)))
    (read [_ ^bytes in]
      (let [session-id (uuid-util/<-bytes in)]
        (->RemoveSessionMergeV1 session-id)))
    (destroy [_])))

(def remove-session-config
  (make-serializer-config RemoveSessionMergeV1
                          remove-session-serializer))

;; ---------
;; Join room

;; Helper to add a session to the room in the hazelcast map
(defrecord-once JoinRoomMergeV3 [^UUID session-id ^String instance-id ^UUID user-id data]
  BiFunction
  (apply [_ room-data _]
    (update room-data
            session-id
            (fn [existing]
              (merge existing
                     {:peer-id     session-id
                      :instance-id instance-id
                      :user        (when user-id
                                     {:id user-id})
                      :data (or (:data existing) data {})})))))

(def ^ByteArraySerializer join-room-v3-serializer
  (reify ByteArraySerializer
    (getTypeId [_]
      join-room-v3-type-id)
    (write ^bytes [_ obj]
      (let [{:keys [^UUID session-id ^String instance-id ^UUID user-id data]} obj]
        (nippy/fast-freeze [session-id instance-id user-id data])))
    (read [_ ^bytes in]
      (let [[session-id instance-id user-id data] (nippy/fast-thaw in)]
        (->JoinRoomMergeV3 session-id instance-id user-id data)))
    (destroy [_])))

(def join-room-v3-config
  (make-serializer-config JoinRoomMergeV3
                          join-room-v3-serializer))

(defn join-room! [execute-on-key ^IMap hz-map ^RoomKeyV1 room-key ^UUID session-id ^String instance-id ^UUID user-id data]
  (let [action (->JoinRoomMergeV3 session-id instance-id user-id data)]
    (if execute-on-key
      (execute-on-key room-key action)
      (.merge hz-map
              room-key
              {session-id {:peer-id     session-id
                           :instance-id instance-id
                           :user        (when user-id
                                          {:id user-id})
                           :data        (or data {})}}
              action))))

;; ------------
;; Set presence

(defrecord-once SetPresenceMergeV1 [^UUID session-id data]
  BiFunction
  (apply [_ room-data _]
    (update-existing room-data
                     session-id
                     assoc
                     :data
                     data)))

(defn set-presence! [execute-on-key ^IMap hz-map ^RoomKeyV1 room-key ^UUID session-id data]
  (let [action (->SetPresenceMergeV1 session-id data)]
    (if execute-on-key
      (execute-on-key room-key action)
      (.merge hz-map
              room-key
              ;; if current value is nil, then we're not in the room, so we
              ;; shouldn't set presence
              {}
              action))))

(def ^ByteArraySerializer set-presence-serializer
  (reify ByteArraySerializer
    (getTypeId [_]
      set-presence-type-id)
    (write ^bytes [_ obj]
      (let [{:keys [^UUID session-id data]} obj]
        (nippy/fast-freeze [session-id data])))
    (read [_ ^bytes in]
      (let [[session-id data] (nippy/fast-thaw in)]
        (->SetPresenceMergeV1 session-id data)))
    (destroy [_])))

(def set-presence-config
  (make-serializer-config SetPresenceMergeV1
                          set-presence-serializer))

;; -----------------
;; Presence executor
;; handles multiple updates all at once

(defn process-presence-entry [^LockAwareLazyMapEntry entry actions]
  (.setValue entry
             (reduce (fn [acc action]
                       (BiFunction/.apply action acc nil))
                     (.getValue entry)
                     actions))
  true)

(defrecord-once PresenceEntryProcessor [actions]
  EntryProcessor
  (process [_ entry]
    (process-presence-entry entry actions)))

(declare action-lookup)

(def ^ByteArraySerializer presence-entry-processor-serializer
  (reify ByteArraySerializer
    (getTypeId [_]
      presence-entry-processor-type-id)
    (write ^bytes [_ {:keys [actions]}]
      (let [baos (ByteArrayOutputStream. 64)
            dos  (DataOutputStream. baos)]
        (.writeInt dos (count actions))
        (doseq [action actions]
          (let [[tid ^ByteArraySerializer serializer] (get-in action-lookup [:by-class (class action)])
                ^bytes ba (.write serializer action)]
            (.writeByte dos (int tid))
            (.writeInt dos (alength ba))
            (.write dos ba 0 (alength ba))))
        (.toByteArray baos)))
    (read [_ ^bytes in]
      (let [dis (DataInputStream. (ByteArrayInputStream. in))
            n (.readInt dis)]
        (->PresenceEntryProcessor
         (ucoll/reduce-tr
          (fn [acc _]
            (let [tid (.readByte dis)
                  len (.readInt dis)
                  ba (byte-array len)
                  _ (.readFully dis ba)
                  ^ByteArraySerializer serializer (get-in action-lookup [:by-id tid])]
              (conj! acc (.read serializer ba))))
          []
          (range n)))))
    (destroy [_])))

(def presence-entry-processor-config
  (make-serializer-config PresenceEntryProcessor
                          presence-entry-processor-serializer))

;; --------------
;; Broadcast data

(defrecord-once RoomBroadcastV1 [^UUID app-id session-ids base-msg])

(defn room-broadcast-message [^UUID app-id session-ids base-msg]
  (->RoomBroadcastV1 app-id session-ids base-msg))

(def ^ByteArraySerializer room-broadcast-serializer
  (reify ByteArraySerializer
    (getTypeId [_]
      room-broadcast-type-id)
    (write ^bytes [_ obj]
      (nippy/fast-freeze obj))
    (read [_ ^bytes in]
      (nippy/fast-thaw in))
    (destroy [_])))

(def room-broadcast-config
  (make-serializer-config RoomBroadcastV1
                          room-broadcast-serializer))

;; -----------
;; SSE Message

;; Hack to avoid a cyclic dependency
(def send-messages (delay (resolve (symbol "instant.reactive.sse/send-messages-callable"))))

(defrecord-once SSEMessage [^UUID app-id ^UUID session-id ^bytes sse-token-hash messages]
  Callable
  (call [_]
    (@send-messages app-id session-id sse-token-hash messages)))

(defn thaw-with-offset
  "Like nipppy/fast-thaw, but takes an offset and length from the byte array so that you
   can use a byte array with extra stuff at the beginnning without copying"
  [^bytes ba offset length]
  (let [dis (DataInputStream. (ByteArrayInputStream. ba offset length))]
    (nippy/with-cache (nippy/thaw-from-in! dis))))

(def ^ByteArraySerializer sse-message-serializer
  (let [fixed-len (+ 16   ;; app-id
                     16   ;; session-id
                     32)] ;; token-hash
    (reify ByteArraySerializer
      (getTypeId [_]
        sse-message-type-id)
      (write ^bytes [_ obj]
        (let [{:keys [messages
                      ^UUID app-id
                      ^UUID session-id
                      ^bytes sse-token-hash]} obj
              ^bytes msg-bytes (nippy/fast-freeze messages)
              bb (ByteBuffer/allocate (+ fixed-len
                                         (count msg-bytes)))]
          (.putLong bb (.getMostSignificantBits app-id))
          (.putLong bb (.getLeastSignificantBits app-id))
          (.putLong bb (.getMostSignificantBits session-id))
          (.putLong bb (.getLeastSignificantBits session-id))
          (.put bb sse-token-hash)
          (.put bb msg-bytes)
          (.array bb)))
      (read [_ ^bytes in]
        (let [bb (ByteBuffer/wrap in)
              app-id (UUID. (.getLong bb) (.getLong bb))
              session-id (UUID. (.getLong bb) (.getLong bb))
              sse-token-hash (let [hash-bytes (byte-array 32)]
                               (.get bb hash-bytes)
                               hash-bytes)
              messages (thaw-with-offset in (.position bb) (.remaining bb))]
          (SSEMessage. app-id session-id sse-token-hash messages)))
      (destroy [_]))))

(def sse-message-config
  (make-serializer-config SSEMessage
                          sse-message-serializer))

;; ---------------
;; Executor Helpers

(defrecord-once Task [^clojure.lang.Var v]
  Callable
  (call [_]
    (v)))

(def ^ByteArraySerializer task-serializer
  (reify ByteArraySerializer
    (getTypeId [_]
      task-type-id)
    (write ^bytes [_ {:keys [v]}]
      (assert (var? v) "Expected Task to get a resolved var.")
      (nippy/fast-freeze (str (symbol v))))
    (read [_ ^bytes in]
      (->Task (resolve (symbol (nippy/fast-thaw in)))))
    (destroy [_])))

(def task-config
  (make-serializer-config Task
                          task-serializer))

;; -----------------
;; Global serializer

(def ^ByteArraySerializer global-serializer
  (reify ByteArraySerializer
    (getTypeId [_]
      global-type-id)
    (write ^bytes [_ obj]
      (nippy/fast-freeze obj))
    (read [_ ^bytes in]
      (nippy/fast-thaw in))
    (destroy [_])))

(def global-serializer-config (-> (GlobalSerializerConfig.)
                                  (.setImplementation global-serializer)
                                  (.setOverrideJavaSerialization false)))

(def serializer-configs
  [remove-session-config
   room-broadcast-config
   join-room-v3-config
   set-presence-config
   room-key-config
   task-config
   sse-message-config
   presence-entry-processor-config])

(def action-lookup
  (reduce (fn [acc ^SerializerConfig cfg]
            (let [klass                    (.getTypeClass cfg)
                  ^ByteArraySerializer ser (.getImplementation cfg)
                  tid                      (.getTypeId ser)]
              (-> acc
                  (assoc-in [:by-class klass] [tid ser])
                  (assoc-in [:by-id tid] ser))))
          {}
          serializer-configs))
