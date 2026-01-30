(ns instant.util.hazelcast
  (:require
   instant.isn
   [instant.util.uuid :as uuid-util]
   [medley.core :refer [update-existing]]
   [taoensso.nippy :as nippy])
  (:import
   (com.hazelcast.config GlobalSerializerConfig SerializerConfig)
   (com.hazelcast.map IMap)
   (com.hazelcast.nio.serialization ByteArraySerializer)
   (instant.isn ISN)
   (java.io DataInputStream ByteArrayInputStream)
   (java.nio ByteBuffer)
   (java.util UUID)
   (java.util.function BiFunction)
   (org.postgresql.replication LogSequenceNumber)))

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

;; Must be unique within the project
(def remove-session-type-id 1)
(def set-presence-type-id 3)
(def room-key-type-id 4)
(def global-type-id 5)
(def room-broadcast-type-id 6)
(def task-type-id 7)
(def join-room-v3-type-id 9)
(def sse-message-type-id 10)
(def wal-record-type-id 11)

;; --------------
;; nippy encoders

;; 1 is our custom identifier for LogSequenceNumber, no other type can use it and
;; it must be the same across all machines.
(nippy/extend-freeze LogSequenceNumber 1 [^LogSequenceNumber lsn data-output]
  (.writeLong data-output (.asLong lsn)))

(nippy/extend-thaw 1 [data-input]
  (LogSequenceNumber/valueOf (.readLong data-input)))

;; 2 is our custom identifier for ISN, no other type can use it and
;; it must be the same across all machines.
(nippy/extend-freeze ISN 2 [^ISN isn data-output]
  (.writeInt data-output (.slot_num isn))
  (.writeLong data-output (.asLong ^LogSequenceNumber (.lsn isn))))

(nippy/extend-thaw 2 [data-input]
  (instant.isn/->ISN (.readInt data-input)
                     (LogSequenceNumber/valueOf (.readLong data-input))))

;; --------
;; Room key

(defrecord RoomKeyV1 [^UUID app-id ^String room-id])

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
(defrecord JoinRoomMergeV3 [^UUID session-id ^String instance-id ^UUID user-id data]
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

(defn join-room! [^IMap hz-map ^RoomKeyV1 room-key ^UUID session-id ^String instance-id ^UUID user-id data]
  (.merge hz-map
          room-key
          {session-id {:peer-id     session-id
                       :instance-id instance-id
                       :user        (when user-id
                                      {:id user-id})
                       :data        (or data {})}}
          (->JoinRoomMergeV3 session-id instance-id user-id data)))

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

;; --------------
;; Broadcast data

(defrecord RoomBroadcastV1 [^UUID app-id session-ids base-msg])

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

(defrecord SSEMessage [^UUID app-id ^UUID session-id ^bytes sse-token-hash messages]
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

(defrecord Task [^clojure.lang.Var v]
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

;; ----------
;; Wal record

;; Expects a var that takes no arguments
(defrecord WalRecord [record])

(def ^ByteArraySerializer wal-record-serializer
  (reify ByteArraySerializer
    (getTypeId [_]
      wal-record-type-id)
    (write ^bytes [_ {:keys [record]}]
      (nippy/fast-freeze record))
    (read [_ ^bytes in]
      (->WalRecord (nippy/fast-thaw in)))
    (destroy [_])))

(def wal-record-config
  (make-serializer-config WalRecord
                          wal-record-serializer))


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
   wal-record-config])
