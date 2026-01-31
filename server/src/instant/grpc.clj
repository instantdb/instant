(ns instant.grpc
  (:require
   [taoensso.nippy :as nippy])
  (:import
   (io.grpc MethodDescriptor MethodDescriptor$Marshaller MethodDescriptor$MethodType)
   (java.io ByteArrayInputStream DataInputStream)
   (java.util UUID)))

;; These defrecords are used to transfer messages between machines.
;; If you need to change anything or add new ones, you must do a 2-phase deploy.
;; Also update the encoders in instant.nippy

(defrecord StreamRequest [^UUID app-id ^UUID stream-id])

(defrecord StreamFile [^UUID id ^String location-id ^long size])

(defrecord StreamInit [files])

(defrecord StreamContent [^long offset chunks])

(defrecord StreamMissing [])

(defrecord StreamError [])

(def nippy-marshaller
  (reify MethodDescriptor$Marshaller
    (stream [_ value]
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

;; What's left to be implemented?
;; 1. The subscribe call
;;   a. Let's start in the admin SDK or should we start in the client SDK?
;;     i. I need some way to inform the client that they can discard their cached state
;;       1. Easy enough with the browser client, harder with the admin client.
;;         a. I think we should set up an SSE connection on the admin sdk and post messages like we do with the client
;;         b. Maybe start with the browser client, then?
