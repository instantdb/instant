(ns instant.reactive.sse
  (:require
   [instant.config :as config]
   [instant.reactive.ephemeral :as eph]
   [instant.reactive.session :as session]
   [instant.reactive.store :as rs]
   [instant.util.exception :as ex]
   [instant.util.hazelcast :as h]
   [medley.core :refer [find-first]])
  (:import
   (com.hazelcast.cluster Member)
   (com.hazelcast.core ExecutionCallback HazelcastInstance IExecutorService)
   (java.util UUID)))

(deftype SendMessageCallback [error-promise]
  ExecutionCallback
  (onFailure [_ t]
    (deliver error-promise t))
  (onResponse [_ v]
    (if v
      (deliver error-promise (ex-info (:message v) (:ex-data v)))
      (deliver error-promise nil))))

(defn send-message-to-member [^Member member
                              ^UUID app-id
                              ^UUID session-id
                              ^bytes sse-token-hash
                              message]
  (let [executor (HazelcastInstance/.getExecutorService (eph/get-hz) "sse-send-message")
        ^Callable callable (h/->SSEMessage app-id session-id sse-token-hash message)
        error-promise (promise)
        ^ExecutionCallback callback (->SendMessageCallback error-promise)]
    (IExecutorService/.submitToMember executor
                                      callable
                                      member
                                      callback)
    (when-let [error @error-promise]
      (throw error))))


(defn send-message-callable* [^UUID app-id
                              ^UUID session-id
                              ^bytes sse-token-hash
                              message]
  (session/sse-on-message rs/store {:session-id session-id
                                    :sse-token-hash sse-token-hash
                                    :message message}))

;; If you change the name of this function or move it to a different namespace,
;; update instant.util.hazelcast/send-message
(defn send-message-callable [^UUID app-id
                             ^UUID session-id
                             ^bytes sse-token-hash
                             message]
  (try
    (send-message-callable* app-id session-id sse-token-hash message)
    nil
    (catch clojure.lang.ExceptionInfo e
      ;; Reduce the amount of data we send through hz for ordinary errors
      (if-let [instant-ex ^Exception (ex/find-instant-exception)]
        {:message (.getMessage instant-ex)
         :ex-data (ex-data instant-ex)}
        (throw e)))))

(defn skip-hz-in-dev? []
  (and (= (config/dev?))
       ;; In dev, send half the requests to ourself through hazelcast
       ;; so we test both paths while developing.
       (= (rand-int 2) 1)))

(defn enqueue-message [^UUID machine-id
                       ^UUID app-id
                       ^UUID session-id
                       ^bytes sse-token-hash
                       message]

  (if (and (= machine-id config/machine-id)
           (skip-hz-in-dev?))
    ;; Skip hazelcast if the session lives on our machine.
    (send-message-callable* app-id session-id sse-token-hash message)
    (let [member (get eph/hz-member-by-machine-id-cache machine-id)]
      (when-not member
        (ex/throw-member-missing! machine-id))
      (send-message-to-member member app-id session-id sse-token-hash message))))
