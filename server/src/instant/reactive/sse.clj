(ns instant.reactive.sse
  (:require
   [instant.config :as config]
   [instant.reactive.ephemeral :as eph]
   [instant.reactive.session :as session]
   [instant.reactive.store :as rs]
   [instant.util.exception :as ex]
   [instant.util.hazelcast :as h]
   [instant.util.tracer :as tracer])
  (:import
   (com.hazelcast.cluster Member)
   (com.hazelcast.core HazelcastInstance IExecutorService)
   (java.util UUID)))

(defn send-messages-to-member [^Member member
                               ^UUID app-id
                               ^UUID session-id
                               ^bytes sse-token-hash
                               messages]
  (let [executor (HazelcastInstance/.getExecutorService (eph/get-hz) "sse-send-message")
        ^Callable callable (h/->SSEMessage app-id session-id sse-token-hash messages)
        instant-error (deref (IExecutorService/.submitToMember executor
                                                               callable
                                                               member))]
    (when instant-error
      (throw (ex-info (:message instant-error)
                      (:ex-data instant-error))))))

(defn send-messages-callable* [^UUID app-id
                               ^UUID session-id
                               ^bytes sse-token-hash
                               messages]
  (session/sse-on-messages rs/store {:app-id app-id
                                     :session-id session-id
                                     :sse-token-hash sse-token-hash
                                     :messages messages}))

;; If you change the name of this function or move it to a different
;; namespace, update instant.util.hazelcast/send-messages
(defn send-messages-callable [^UUID app-id
                              ^UUID session-id
                              ^bytes sse-token-hash
                              messages]
  (tracer/with-span! {:name "sse/send-messages-callable"
                      :attributes {:app-id app-id
                                   :session-id session-id}}
    (try
      (send-messages-callable* app-id session-id sse-token-hash messages)
      nil
      (catch clojure.lang.ExceptionInfo e
        ;; Reduce the amount of data we send through hz for ordinary errors
        (if-let [instant-ex ^Exception (ex/find-instant-exception e)]
          {:message (.getMessage instant-ex)
           :ex-data (ex-data instant-ex)}
          (throw e))))))

(defn skip-hz-in-dev? []
  (and (config/dev?)
       ;; In dev, send half the requests to ourself through hazelcast
       ;; so we test both paths while developing.
       (= (rand-int 2) 1)))

(defn enqueue-messages [^UUID machine-id
                        ^UUID app-id
                        ^UUID session-id
                        ^bytes sse-token-hash
                        messages]
  (let [handle-locally? (and (= machine-id config/machine-id)
                             (skip-hz-in-dev?))]
    (tracer/with-span! {:name "sse/enqueue-messages"
                        :attributes {:app-id app-id
                                     :machine-id machine-id
                                     :session-id session-id
                                     :handle-locally? handle-locally?
                                     :message-count (count messages)}}
      (if handle-locally?
        ;; Skip hazelcast if the session lives on our machine.
        (send-messages-callable* app-id session-id sse-token-hash messages)
        (let [member (get eph/hz-member-by-machine-id-cache machine-id)]
          (when-not member
            (ex/throw-member-missing! machine-id))
          (send-messages-to-member member app-id session-id sse-token-hash messages))))))
