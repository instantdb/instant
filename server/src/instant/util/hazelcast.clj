(ns instant.util.hazelcast
  (:require [instant.util.uuid :as uuid-util]
            [medley.core :refer [update-existing]]
            [taoensso.nippy :as nippy])
  (:import (com.hazelcast.config GlobalSerializerConfig SerializerConfig)
           (com.hazelcast.map IMap)
           (com.hazelcast.nio.serialization ByteArraySerializer)
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

;; --------
;; Room key

(defrecord RoomKeyV1 [^UUID app-id ^String room-id])

(def ^ByteArraySerializer room-key-serializer
  (reify ByteArraySerializer
    ;; Must be unique within the project
    (getTypeId [_] 4)
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
(defrecord RemoveSessionMergeV1 [^UUID session-id]
  BiFunction
  (apply [_ room-data _]
    (let [res (dissoc room-data session-id)]
      ;; Return null if we're the last so that the entry can be removed
      ;; from the map instead of holding an empty map
      (if (empty? res)
        nil
        res))))

(defn remove-session! [^IMap hz-map ^RoomKeyV1 room-key ^UUID session-id]
  (.merge hz-map
          room-key
          ;; If the current value of the key is null, then the new value
          ;; should just be an empty map. We'd like to put nil here to
          ;; remove the entry (like we do in the bifunction), but that's
          ;; not allowed.
          {}
          (->RemoveSessionMergeV1 session-id)))

(def ^ByteArraySerializer remove-session-serializer
  (reify ByteArraySerializer
    ;; Must be unique within the project
    (getTypeId [_] 1)
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
(defrecord JoinRoomMergeV1 [^UUID session-id ^UUID user-id]
  BiFunction
  (apply [_ room-data _]
    (update room-data
            session-id
            (fnil merge {:data {}})
            {:peer-id session-id
             :user (when user-id
                     {:id user-id})})))

(defn join-room! [^IMap hz-map ^RoomKeyV1 room-key ^UUID session-id ^UUID user-id]
  (.merge hz-map
          room-key
          {session-id {:peer-id session-id
                       :user (when user-id
                               {:id user-id})
                       :data {}}}
          (->JoinRoomMergeV1 session-id user-id)))


(def ^ByteArraySerializer join-room-serializer
  (reify ByteArraySerializer
    ;; Must be unique within the project
    (getTypeId [_] 2)
    (write ^bytes [_ obj]
      (let [{:keys [^UUID session-id ^UUID user-id]} obj
            byte-buffer (ByteBuffer/allocate (if user-id 32 16))]
        (.putLong byte-buffer (.getMostSignificantBits session-id))
        (.putLong byte-buffer (.getLeastSignificantBits session-id))
        (when user-id
          (.putLong byte-buffer (.getMostSignificantBits user-id))
          (.putLong byte-buffer (.getLeastSignificantBits user-id)))
        (.array byte-buffer)))
    (read [_ ^bytes in]
      (let [buf (ByteBuffer/wrap in)
            session-id (UUID. (.getLong buf)
                              (.getLong buf))
            user-id (when (.hasRemaining buf)
                      (UUID. (.getLong buf)
                             (.getLong buf)))]
        (->JoinRoomMergeV1 session-id user-id)))
    (destroy [_])))

(def join-room-config
  (make-serializer-config JoinRoomMergeV1
                          join-room-serializer))

;; ------------
;; Set presence

(defrecord SetPresenceMergeV1 [^UUID session-id data]
  BiFunction
  (apply [_ room-data _]
    (update-existing room-data
                     session-id
                     assoc
                     :data
                     data)))

(defn set-presence! [^IMap hz-map ^RoomKeyV1 room-key ^UUID session-id data]
  (.merge hz-map
          room-key
          ;; if current value is nil, then we're not in the room, so we
          ;; shouldn't set presence
          {}
          (->SetPresenceMergeV1 session-id data)))

(def ^ByteArraySerializer set-presence-serializer
  (reify ByteArraySerializer
    ;; Must be unique within the project
    (getTypeId [_] 3)
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
;; Global serializer

(def ^ByteArraySerializer global-serializer
  (reify ByteArraySerializer
    ;; Must be unique within the project
    (getTypeId [_] 5)
    (write ^bytes [_ obj]
      (tool/def-locals)
      (nippy/fast-freeze obj))
    (read [_ ^bytes in]
      (tool/def-locals)
      (nippy/fast-thaw in))
    (destroy [_])))

(def global-serializer-config (-> (GlobalSerializerConfig.)
                                  (.setImplementation global-serializer)
                                  (.setOverrideJavaSerialization true)))

(def serializer-configs
  [remove-session-config
   join-room-config
   set-presence-config
   room-key-config])
