(ns instant.grpc
  (:require
   [clojure.set]
   [taoensso.nippy :as nippy])
  (:import
   (io.grpc MethodDescriptor MethodDescriptor$Marshaller MethodDescriptor$MethodType)
   (java.io ByteArrayInputStream DataInputStream)
   (java.util UUID)))

;; These defrecords are used to transfer messages between machines.
;; If you need to change anything or add new ones, you must do a 2-phase deploy.
;; Also update the encoders in instant.nippy

(defrecord StreamRequest [^UUID app-id ^UUID stream-id ^long offset])

(defrecord StreamFile [^UUID id ^String location-id ^long size])

(defrecord StreamInit [^long offset files chunks])

(defrecord StreamContent [^long offset chunks])

(defrecord StreamComplete [])
(defrecord StreamAborted [^String abort-reason])

;; Stream errors take a single keyword to indicate the error type
;; make sure to add the key to the stream-error-map so that nippy
;; can serialize/deserialize it

(defrecord StreamError [error])

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
      value
      (ByteArrayInputStream. (nippy/fast-freeze value)))
    (parse [_ stream]
      (nippy/thaw-from-in! (DataInputStream. stream)))))

(def subscribe-method
  (-> (MethodDescriptor/newBuilder)
      (.setType MethodDescriptor$MethodType/SERVER_STREAMING)
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
