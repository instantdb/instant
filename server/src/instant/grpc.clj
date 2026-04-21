(ns instant.grpc
  (:require
   [clojure.set]
   [instant.isn]
   [instant.util.defrecord :refer [defrecord-once]]
   [taoensso.nippy :as nippy])
  (:import
   (instant.isn ISN)
   (io.grpc MethodDescriptor MethodDescriptor$Marshaller MethodDescriptor$MethodType)
   (java.io ByteArrayInputStream DataInputStream)
   (java.time Instant)
   (java.util UUID)
   (org.postgresql.replication LogSequenceNumber)))

;; These defrecords are used to transfer messages between machines.
;; If you need to change anything or add new ones, you must do a 2-phase deploy.
;; Also update the encoders in instant.nippy

(defrecord-once StreamRequest [^UUID app-id ^UUID stream-id ^long offset])

(defrecord-once StreamFile [^UUID id ^String location-id ^long size])

(defrecord-once StreamInit [^long offset files chunks])

(defrecord-once StreamContent [^long offset chunks])

(defrecord-once StreamComplete [])
(defrecord-once StreamAborted [^String abort-reason])

;; Stream errors take a single keyword to indicate the error type
;; make sure to add the key to the stream-error-map so that nippy
;; can serialize/deserialize it

(defrecord-once StreamError [error])


(defrecord-once WalRecord [^UUID app-id
                           ^long tx-id
                           ^ISN isn
                           ^ISN previous-isn
                           ^Instant tx-created-at
                           ^long tx-bytes
                           ^LogSequenceNumber nextlsn
                           attr-changes
                           ident-changes
                           triple-changes
                           messages
                           wal-logs])
(def stream-error-map
  {:unknown -1
   :rate-limit 1
   :stream-missing-on-instance 2
   :writer-disconnected 3
   :instance-missing 4})

(def stream-error-id-map (clojure.set/map-invert stream-error-map))

(assert (= (count stream-error-map)
           (count stream-error-id-map)))

(defn stream-error [kw]
  (if (not (contains? stream-error-map kw))
    (throw (ex-info "Invalid stream error" {:kw kw}))
    (->StreamError kw)))

(def nippy-marshaller
  (reify MethodDescriptor$Marshaller
    (stream [_ value]
      (ByteArrayInputStream. (nippy/fast-freeze value)))
    (parse [_ stream]
      (nippy/thaw-from-in! (DataInputStream. stream)))))

(def subscribe-method
  (-> (MethodDescriptor/newBuilder)
      (.setType MethodDescriptor$MethodType/BIDI_STREAMING)
      (.setFullMethodName "InstantStreams/Subscribe")
      (.setRequestMarshaller nippy-marshaller)
      (.setResponseMarshaller nippy-marshaller)
      (.build)))

(def test-method
  (-> (MethodDescriptor/newBuilder)
      (.setType MethodDescriptor$MethodType/SERVER_STREAMING)
      (.setFullMethodName "InstantTesting/Test")
      (.setRequestMarshaller nippy-marshaller)
      (.setResponseMarshaller nippy-marshaller)
      (.build)))
