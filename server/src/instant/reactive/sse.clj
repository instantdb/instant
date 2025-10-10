(ns instant.reactive.sse
  (:require
   [instant.reactive.ephemeral :refer [get-hz]]
   [instant.reactive.session :as session]
   [instant.reactive.store :as rs]
   [instant.util.hazelcast :as h]
   [medley.core :refer [find-first]])
  (:import
   (com.hazelcast.cluster Member)
   (com.hazelcast.core ExecutionCallback HazelcastInstance IExecutorService)
   (java.util UUID)))

(defn get-hz-member-by-machine-id ^Member [^UUID machine-id]
  (find-first (fn [^Member member]
                (= (str machine-id)
                   (.getAttribute member "machine-id")))
              (.getMembers (.getCluster (get-hz)))))

;; XXX: Not sure I need this?
(deftype SendMessageCallback [x]
  ExecutionCallback
  (onFailure [_ t]
    (println "EXCEPTION!!" t))
  (onResponse [_ v]
    (println "RESPONSE!!!!!" v)))

(defn send-message-to-member [^Member member app-id session-id sse-token-hash message]
  (let [executor (HazelcastInstance/.getExecutorService (get-hz) "sse-send-message")
        ^Callable callable (h/->SSEMessage app-id session-id sse-token-hash message)
        ^ExecutionCallback callback (->SendMessageCallback 1)]
    (IExecutorService/.submitToMember executor
                                      callable
                                      member
                                      callback)))

;; If you change the name of this function or move it to a different namespace,
;; update instant.util.hazelcast/send-message
(defn send-message-callable [app-id session-id sse-token-hash message]
  (try
    (session/sse-on-message rs/store {:session-id session-id
                                      :sse-token-hash sse-token-hash
                                      :message message})
    nil
    (catch clojure.lang.ExceptionInfo e
      ;; xxx: extract instant exception
      (ex-data e))))
