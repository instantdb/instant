(ns instant.model.app-stream
  (:require
   [clojure.string]
   [instant.config :as config]
   [instant.db.model.triple :as triple-model]
   [instant.flags :as flags]
   [instant.grpc :as grpc]
   [instant.grpc-client :as grpc-client]
   [instant.jdbc.aurora :as aurora]
   [instant.model.app-file :as app-file-model]
   [instant.reactive.ephemeral :as eph]
   [instant.reactive.store :as rs]
   [instant.storage.coordinator :as storage-coordinator]
   [instant.storage.s3 :as instant-s3]
   [instant.system-catalog-ops :refer [query-op update-op]]
   [instant.util.async :as ua]
   [instant.util.exception :as ex]
   [instant.util.tracer :as tracer])
  (:import
   (instant.grpc StreamAborted StreamComplete StreamContent StreamError StreamInit StreamRequest)
   (io.grpc Status Status$Code)
   (io.grpc.netty.shaded.io.netty.buffer ByteBufInputStream CompositeByteBuf Unpooled)
   (io.grpc.stub ServerCallStreamObserver StreamObserver)
   (java.nio ByteBuffer)
   (java.util Map)
   (java.util.concurrent ConcurrentHashMap Executors)
   (java.util.function BiFunction)))

(def etype "$streams")

;; XXX: Add permissions (I'll do that later)
#_(defn assert-streams-permission! [action {:keys [app-id
                                                   client-id
                                                   rules-override]
                                            :as ctx}]
    (let [rules (if rules-override
                  rules-override
                  (rule-model/get-by-app-id {:app-id app-id}))
          program (rule-model/get-program! rules "$streams" action)]
      (ex/assert-permitted!
        :has-streams-permission?
        ["$streams" action]
        ;; deny access by default if no permissions are currently set
        (if-not program
          false
          (let [ctx* (assoc ctx
                            :db {:conn-pool (aurora/conn-pool :read)}
                            :attrs
                            (attr-model/get-by-app-id app-id)
                            :datalog-query-fn d/query)]
            (cel/eval-program! ctx* program {:data {"clientId" client-id}}))))))

;; XXX: Check permission
(defn create!
  "Creates a new $stream object"
  ([params] (create! (aurora/conn-pool :write) params))
  ([conn {:keys [app-id client-id machine-id hashed-reconnect-token]}]
   (update-op
     conn
     {:app-id app-id
      :etype etype}
     (fn [{:keys [transact! resolve-id]}]
       (let [lookup [(resolve-id :clientId) client-id]
             res (transact!
                   [[:add-triple lookup (resolve-id :id) lookup {:mode :create}]
                    [:add-triple lookup (resolve-id :machineId) machine-id {:mode :create}]
                    [:add-triple lookup (resolve-id :hashedReconnectToken) hashed-reconnect-token {:mode :create}]])]
         (tool/def-locals)
         {:id (->> (get-in res [:results :add-triple])
                   first
                   :entity_id)})))))

(defn update-machine-id!
  ([params] (update-machine-id! (aurora/conn-pool :write) params))
  ([conn {:keys [app-id stream-id machine-id]}]
   (update-op
     conn
     {:app-id app-id
      :etype etype}
     (fn [{:keys [tx-conn attrs resolve-id]}]
       ;; We need to ensure that we see an update in the wal to the
       ;; machine-id even if the value doesn't change, so we update
       ;; the created_at on the machine-id triple.
       ;; We don't bother creating a transaction because we don't
       ;; expose the field to the user and we handle it in the cache-evict logic,
       ;; which runs whether or not we add a tx-id.
       (let [machine-id-triple [stream-id (resolve-id :machineId) machine-id]]
         (triple-model/insert-multi! tx-conn attrs app-id [machine-id-triple]
                                     {:overwrite-t true}))))))

(defn link-file!
  "Links the $file to the $stream, if the stream is complete, sets the done and size fields."
  ([params] (link-file! (aurora/conn-pool :write) params))
  ([conn {:keys [stream-id app-id file-id done? abort-reason size]}]
   (tool/def-locals)
   (update-op
     conn
     {:app-id app-id
      :etype etype}
     (fn [{:keys [transact! resolve-id]}]
       (transact! (concat
                    [[:add-triple stream-id (resolve-id "$files") file-id]]
                    (when done?
                      [[:add-triple stream-id (resolve-id "done") true]
                       [:add-triple stream-id (resolve-id "size") size]])
                    (when abort-reason
                      [[:add-triple stream-id (resolve-id "abortReason") abort-reason]])))))))

(defn get-stream
  "Gets a stream by its id or client-id"
  ([params] (get-stream (aurora/conn-pool :read) params))
  ([conn {:keys [app-id stream-id client-id]}]
   (query-op conn
             {:app-id app-id
              :etype etype}
             (fn [{:keys [resolve-id get-entity]}]
               (get-entity (if stream-id
                             stream-id
                             [(resolve-id "clientId") client-id]))))))

(defn stream-file-name-prefix [stream-id]
  (format "$stream/%s/" stream-id))

(defn extract-part-num [stream-id file-path]
  (let [prefix (stream-file-name-prefix stream-id)
        _ (tool/def-locals)
        _ (when-not (clojure.string/starts-with? file-path prefix)
            (ex/throw-validation-err! :stream
                                      {:file-path file-path
                                       :stream-id stream-id}
                                      [{:message "Stream is corrupted. File path is missing part number."}]))
        n-str (subs file-path (count prefix))]
    (if-let [n (parse-long n-str)]
      n
      (ex/throw-validation-err! :stream
                                {:file-path file-path
                                 :stream-id stream-id}
                                [{:message "Stream is corrupted. File path has invalid part number."}]))))

(defn get-stream-files
  "Gets the files for a completed stream, with s3 download urls"
  ([params] (get-stream-files (aurora/conn-pool :read) params))
  ([conn {:keys [app-id stream-id]}]
   ;; XXX: Prevent changing the path when it starts or ends with $stream
   (let [files (->> (app-file-model/get-where conn
                                              {:app-id app-id
                                               :where {"$stream" stream-id}})
                    (map (fn [f]
                           (assoc f :part-num (extract-part-num stream-id (:path f)))))
                    (sort-by :part-num))]
     ;; Validate that we're not missing any parts
     (reduce (fn [expected file]
               (when-not (:url file)
                 ;; We get the urls because we use query-where. This is just a defensive
                 ;; check in case the implementation of fetching the files changes.
                 (ex/throw-validation-err! :stream
                                           {:missing-part expected
                                            :stream-id stream-id}
                                           [{:message "Stream is corrupted. Missing file url."}]))
               (if (not= expected (:part-num file))
                 (ex/throw-validation-err! :stream
                                           {:missing-part expected
                                            :stream-id stream-id}
                                           [{:message "Stream is corrupted. Missing file."}])
                 (inc expected)))
             0
             files)
     files)))

;; --------------------------------
;; Listeners for machine-id changes

;; We use the listener to notify the subscribers that the writer may have
;; returned if the writer has gone away. Also helps us guard against
;; multiple writers.

(defonce stream-machine-id-listeners (ConcurrentHashMap.))

(defn remove-machine-id-change-listener [stream-id cb-id]
  (Map/.compute stream-machine-id-listeners stream-id (reify BiFunction
                                                        (apply [_ _k v]
                                                          (let [new (dissoc v cb-id)]
                                                            (when-not (empty? new)
                                                              new))))))

(defn add-machine-id-change-listener
  ([stream-id cb]
   (add-machine-id-change-listener stream-id (random-uuid) cb))
  ([stream-id cb-id cb]
   (Map/.compute stream-machine-id-listeners stream-id (reify BiFunction
                                                         (apply [_ _k v]
                                                           (assoc v cb-id cb))))
   (fn []
     (remove-machine-id-change-listener stream-id cb-id))))

(defn notify-machine-id-changed [stream-id machine-id]
  (doseq [[_k cb] (Map/.get stream-machine-id-listeners stream-id)]
    (cb machine-id)))

(defn new-stream-object [app-id stream-id]
  (let [this (promise)
        cb-id (random-uuid)
        obj (atom {:app-id app-id
                   :stream-id stream-id
                   :buffer []
                   :buffer-byte-size 0
                   ;; Offset of the start of the buffer from the start of the stream
                   ;; (the rest of the stream is stored in the $files)
                   :buffer-byte-offset 0
                   :$files []
                   :done? false
                   :abort-reason nil
                   :flush-promise nil
                   :sinks {}
                   :machine-id-updated false}
                  ;; This is a bit of a hack to allow the store to
                  ;; call cleanup without having to worry about a cyclic dependency
                  ;; between store and app-stream
                  :meta {:cleanup (fn []
                                    (remove-machine-id-change-listener stream-id cb-id)
                                    ;; XXX: Should we persist the buffer to $file here?
                                    (doseq [[_sink-id sink] (:sinks (-> this deref deref))]
                                      (sink {:type ::disconnect})))})]
    (add-machine-id-change-listener stream-id cb-id (fn [machine-id]
                                                      (when (not= machine-id config/machine-id)
                                                        (swap! obj assoc :machine-id-updated true))))
    (deliver this obj)
    obj))

(defn new-stream-object-from-stream [app-id stream]
  (let [obj (new-stream-object app-id (:id stream))
        files (get-stream-files {:app-id app-id
                                 :stream-id (:id stream)})
        buffer-byte-offset (reduce (fn [acc {:keys [size]}]
                                     (+ acc size))
                                   0
                                   files)]
    (swap! obj assoc
           :buffer-byte-offset buffer-byte-offset
           :$files files)
    obj))

(defn add-sink [stream-object sink-id sink]
  (swap! stream-object update :sinks assoc sink-id sink))

(defn remove-sink [stream-object sink-id]
  (swap! stream-object update :sinks dissoc sink-id))

(defn flush-to-file [stream-object flush-promise on-flush-to-file]
  (let [{:keys [app-id stream-id $files done? abort-reason
                buffer buffer-byte-size buffer-byte-offset]} @stream-object
        ^CompositeByteBuf buff
        (reduce (fn [^CompositeByteBuf buff chunk]
                  (.addComponent buff true (Unpooled/wrappedBuffer ^bytes chunk)))
                (Unpooled/compositeBuffer)
                buffer)

        ;; XXX: Make this return everything needed to construct the URL
        file (storage-coordinator/upload-file! {:app-id app-id
                                                :path (str (stream-file-name-prefix stream-id)
                                                           (count $files))
                                                :content-type "application/octet-stream" ;; xxx?
                                                :content-length buffer-byte-size
                                                :skip-perms-check? true
                                                :mode :create}
                                               (ByteBufInputStream. buff))

        _ (link-file! {:app-id app-id
                       :stream-id stream-id
                       :file-id (:id file)
                       :done? done?
                       :abort-reason abort-reason
                       :size (when done?
                               (+ buffer-byte-size buffer-byte-offset))})

        after (swap! stream-object
                     (fn [obj]
                       (-> obj
                           (assoc :buffer (into [] (subvec (:buffer obj) (count buffer))))
                           (update :buffer-byte-size - buffer-byte-size)
                           (update :buffer-byte-offset + buffer-byte-size)
                           (update :$files conj file)
                           (update :flush-promise (fn [p]
                                                    ;; Clear the flush promise, unless someone snuck another
                                                    ;; one in there
                                                    (when-not (= p flush-promise)
                                                      (tracer/record-exception-span!
                                                        (Exception. "concurrent flush-to-file executions.")
                                                        {:name "app-stream/flush-to-file"})
                                                      p))))))]
    (tool/def-locals)
    ;; XXX: Needs to recur a flush when it's finished if the buffer has exceeded our limit while we were flushing
    (on-flush-to-file {:offset (:buffer-byte-offset after)
                       :done? (:done? after)})))

;; XXX: Is cascade-delete removing items when you unlink?

;; XXX: Make sure we're discarding partial messages in the offset

;; Probably need some better handling for errors so that we can determine
;; where we are in the stream. I think if we just tell the client to do a restart, then we should be in a good place?
(defn append
  "Runs on the server that holds the subscription.
   `append` adds the new chunks to the buffer, notifies any sinks of the
   changes (the sinks will send data to the readers through grpc), and flushes
   the buffer to a file if we're over the flush limit (1mb by default).

  `chunks` should be an array of byte[]"
  [stream-object expected-offset chunks done? abort-reason on-flush-to-file]
  (let [chunks-byte-size (reduce (fn [acc ^bytes chunk]
                                   (+ acc (alength chunk)))
                                 0
                                 chunks)
        flush-limit (flags/stream-flush-byte-limit)
        flush-promise (promise)
        updated (swap! stream-object
                       (fn [obj]
                         (when (:done? obj)
                           (ex/throw-validation-err! :append-stream
                                                     {:stream-id (:id obj)}
                                                     [{:message "Stream is completed."}]))
                         (when-not (= (+ (:buffer-byte-size obj)
                                         (:buffer-byte-offset obj))
                                      expected-offset)
                           (ex/throw-validation-err! :append-stream
                                                     {:stream-id (:id obj)
                                                      :expected-offset expected-offset
                                                      :offset (+ (:buffer-byte-size obj)
                                                                 (:buffer-byte-offset obj))}
                                                     [{:message "Invalid offset for stream."}]))
                         (let [next-obj (-> obj
                                            (update :buffer into chunks)
                                            (update :buffer-byte-size + chunks-byte-size)
                                            (assoc :done? (boolean done?))
                                            (assoc :abort-reason abort-reason))]
                           (tool/def-locals)
                           (if (and (not done?)
                                    (not (:flush-promise next-obj))
                                    (>= (:buffer-byte-size next-obj) flush-limit))
                             (assoc next-obj :flush-promise flush-promise)
                             next-obj))))]
    (tool/def-locals)
    (when (= (:flush-promise updated) flush-promise)
      (deliver flush-promise (ua/severed-vfuture (flush-to-file stream-object flush-promise on-flush-to-file))))
    (when (seq (:sinks updated))
      (let [offset (- (+ (:buffer-byte-size updated)
                         (:buffer-byte-offset updated))
                      chunks-byte-size)
            msg (grpc/->StreamContent offset chunks)]
        (doseq [[_sink-id sink] (:sinks updated)]
          (sink msg))))
    (when done?
      (doseq [[_sink-id sink] (:sinks updated)]
        (sink {:type ::completed
               :abort-reason abort-reason}))
      (when-let [p (:flush-promise updated)]
        (-> p
            ;; wait for promise
            deref
            ;; wait for future inside of promise
            deref))
      (flush-to-file stream-object nil on-flush-to-file))))

(defn file-url [app-id location-id]
  (instant-s3/create-signed-download-url! app-id location-id))

(defn file->stream-file [file]
  (grpc/->StreamFile (:id file)
                     (:location-id file)
                     (:size file)))

(defn stream-init-msg
  "Initial stream init message when the reader reconnects.
   The reader will provide an offset and we can avoid resending
   data that it already has."
  [requested-offset {:keys [$files buffer]}]
  (let [{:keys [files start-offset]}
        (reduce (fn [{:keys [files start-offset]} file]
                  (let [next-start-offset (+ start-offset (:size file))]
                    (if (> next-start-offset requested-offset)
                      {:files (conj files (grpc/->StreamFile (:id file)
                                                             (:location-id file)
                                                             (:size file)))
                       :start-offset start-offset}
                      {:files files
                       :start-offset next-start-offset})))
                {:files []
                 :start-offset 0}
                $files)

        {:keys [chunks start-offset]}
        (reduce (fn [{:keys [chunks start-offset]} ^bytes chunk]
                  (let [next-start-offset (+ start-offset (alength chunk))]
                    (if (> next-start-offset requested-offset)
                      {:chunks (conj chunks chunk)
                       :start-offset start-offset}
                      {:chunks chunks
                       :start-offset next-start-offset})))
                {:chunks []
                 :start-offset start-offset}
                buffer)]
    (grpc/->StreamInit start-offset files chunks)))

(defn handle-subscribe
  "Subscribes to a stream-object in the store on this instance.
   Called from the publisher (the machine that the writer is connected to).
   Has a credit store that keeps track of unacknowledged messages. Each time
   we send a message to the subscriber, we decrement the credits. Then the subscriber
   will send back a ping when it handles the message so that we know to increment
   the credits. The credit system prevents us from overloading a reader. If we run
   out of credits, we'll send a rate-limit error to the subscriber and it will have
   its session back off and retry."
  [store ^StreamRequest credits-atom req ^StreamObserver observer]
  (let [stream-object (rs/get-stream-object-for-subscribe store (:app-id req) (:stream-id req))
        sink-id (random-uuid)
        cleanup (fn []
                  (when stream-object
                    (remove-sink stream-object sink-id)))
        sink (fn [v]
               (if (neg? (swap! credits-atom dec))
                 ;; Too many pending sends, tell the caller to back off
                 (do
                   (cleanup)
                   (.onNext observer (grpc/stream-error :rate-limit))
                   (.onCompleted observer))
                 (case (:type v)
                   ::completed
                   (do (if-let [abort-reason (:abort-reason v)]
                         (.onNext observer (grpc/->StreamAborted abort-reason))
                         (.onNext observer (grpc/->StreamComplete)))
                       (.onCompleted observer)
                       (cleanup))

                   ::disconnect
                   (do
                     (.onNext observer (grpc/stream-error :writer-disconnected))
                     (.onCompleted observer))

                   (.onNext observer v))))]

    (tool/def-locals)
    (if-not stream-object
      (sink (grpc/stream-error :stream-missing-on-instance))
      (let [{:keys [$files buffer] :as stream-object-after}
            (add-sink stream-object sink-id sink)
            msg (if (zero? (:offset req))
                  (grpc/->StreamInit 0 (map file->stream-file $files) buffer)
                  (stream-init-msg (:offset req) stream-object-after))]
        (sink msg)))
    cleanup))

(defn handle-bidi-subscribe
  "Sets up the bidirectional stream. Runs on the server that holds the
   subscription. We use the bidirectional stream to put backpressure
   on the publisher if it sends messages faster than we can handle them."
  [store ^ServerCallStreamObserver observer]
  (let [credits (atom (flags/flag :instant-stream-credits 1024))
        cleanup (promise)]
    (.setOnCancelHandler observer (reify Runnable
                                    (run [_]
                                      (when (realized? cleanup)
                                        (@cleanup)))))
    (reify StreamObserver
      (onNext [_ v]
        (if (instance? StreamRequest v)
          (deliver cleanup (handle-subscribe store credits v observer))
          ;; XXX: Where are our credits going?
          (tool/inspect (swap! credits inc))))
      (onError [_ t]
        (when (realized? cleanup)
          (@cleanup))
        (let [status (Status/fromThrowable t)]
          (when (not= (.getCode status) Status$Code/CANCELLED)
            (tracer/record-exception-span! t {:name "app_stream/bidi-error"}))))
      (onCompleted [_]
        (when (realized? cleanup)
          (@cleanup))))))

(defn server-ify-observer
  "Allows us to add an onCancel handler to the observer when we handle it on
   the same machine instead of sending it through GRPC.
   We need to upgrade it to a ServerCallStreamObserver with support for setOnCancelHandler.
   Sets up an executor so that calling `onNext` for a local observer operates the same as
   if we had sent that observer through the gprc server."
  ^ServerCallStreamObserver [^StreamObserver observer on-cancel-atom]
  (let [closed? (atom false)
        check-state (fn []
                      (when @closed?
                        (throw (IllegalStateException. "call already closed"))))
        executor (Executors/newSingleThreadExecutor (.factory (Thread/ofVirtual)))]
    (proxy [ServerCallStreamObserver] []
      ;; Delegate core methods to the existing observer
      (onNext [v]
        (check-state)
        (.execute executor (reify Runnable
                             (run [_]
                               (.onNext observer v)))))
      (onError [t]
        (check-state)
        (reset! closed? true)
        (.execute executor (reify Runnable
                             (run [_]
                               (.onError observer t))))
        (.shutdown executor))
      (onCompleted []
        (check-state)
        (reset! closed? true)
        (.execute executor (reify Runnable
                             (run [_]
                               (.onCompleted observer))))
        (.shutdown executor))

      ;; server methods
      (isReady [] (not @closed?))
      (setOnCancelHandler [r] (reset! on-cancel-atom r))
      (setOnReadyHandler [_r] (throw (Exception. "setOnReadyHandler not implemented")))
      (disableAutoInboundFlowControl [])
      (request [_n])
      (setMessageCompression [_e]))))

(defn chunks->string [chunks]
  (let [total-size (reduce (fn [acc chunk]
                             (+ acc (alength ^bytes chunk)))
                           0
                           chunks)
        buff (ByteBuffer/allocate total-size)]
    (doseq [^bytes chunk chunks]
      (.put buff chunk))
    (String. (.array buff) "UTF-8")))

(defn- make-stream-observer
  "The observer runs on the same machine as the reader's session.
   If the observer is too slow, the publisher will send a :rate-limit
   error and we'll notify the client to resubscribe."
  ^StreamObserver [app-id stream-id {:keys [on-payload
                                            cleanup
                                            machine-id-changed
                                            incr-credits]}]
  (reify StreamObserver
    (onCompleted [_]
      (cleanup))
    (onNext [_ v]
      (tool/def-locals)
      (incr-credits) ;; Notifies the server that we've handled a message
      (let [msg (condp instance? v
                  StreamError
                  (tracer/with-span! {:name "app_stream/stream-error"
                                      :attributes {:stream-id stream-id
                                                   :error (:error v)}}
                    ;; XXX: NEXT UP: set up subscription to machine-id
                    (case (:error v)
                      :rate-limit {:error true
                                   ;; XXX: Send a better error type (e.g. validation error)
                                   :error-type :rate-limit
                                   :retry true}
                      :unknown {:error true
                                :error-type :unknown
                                :retry true}

                      ;; Writer went away. Wait for the stream to be updated
                      ;; with a new writer, then tell the reader to resubscribe
                      (:writer-disconnected
                       :stream-missing-on-instance)
                      ;; XXX: Is there room for a race here?
                      ;;      Maybe we should run a query against the stream to
                      ;;      see if it updated since we started the whole thing
                      (when @machine-id-changed
                        {:error true
                         :error-type :retry})

                      :instance-missing (when @machine-id-changed
                                          {:error true
                                           :error-type :retry})))

                  StreamInit
                  {:offset (:offset v)
                   :files (map (fn [{:keys [id size location-id]}]
                                 {:id id
                                  :size size
                                  :url (file-url app-id location-id)})
                               (:files v))
                   :content (chunks->string (:chunks v))}

                  StreamContent
                  {:offset (:offset v)
                   :content (chunks->string (:chunks v))}

                  StreamComplete
                  {:done true}

                  StreamAborted
                  {:done true
                   :abort-reason (:abort-reason v)}

                  (tracer/with-span! {:name "app_stream/unknown-payload-type"
                                      :attributes {:type (type v)
                                                   :stream-id stream-id}}
                    {:error true}))]
        (when msg
          (on-payload msg))))
    (onError [_ t]
      (cleanup)
      (let [status (Status/fromThrowable t)]
        (if (and (= (.getCode status) Status$Code/CANCELLED)
                 (= (.getDescription status) rs/stream-unsubscribe-reason))
          nil
          ;; XXX: do something with error
          (do (tracer/record-exception-span! t {:name "app_stream/subscribe-error"})
              (on-payload {:error true
                           :retry true})))))))

;; XXX: How do I prevent a race between when I get notified of the machine-id or
;;      instance-id change and when it actually happens
(defn connect-to-stream [store stream app-id machine-id offset on-payload]
  (tool/def-locals)
  (let [channel (grpc-client/grpc-client-for-machine-id machine-id)
        req (grpc/->StreamRequest app-id (:id stream) offset)
        use-local? (or (not channel)
                       (and (= machine-id config/machine-id)
                            true        ; false ;true ;false
                            ;; In dev, hit the grpc server half the time to exercise the route
                            (or (not (config/dev?))
                                (= 0 (rand-int 2)))))
        machine-id-changed (promise)
        cleanup-cbs [(add-machine-id-change-listener (:id stream)
                                                     (fn [_machine-id]
                                                       (deliver machine-id-changed true)))
                     (if use-local?
                       identity
                       (eph/add-hz-member-callback machine-id (fn [_]
                                                                (deliver machine-id-changed true))))]
        cleanup (fn []
                  (deliver machine-id-changed false)
                  (doseq [cb cleanup-cbs]
                    (cb)))
        outbound-observer-promise (promise)
        incr-credits (fn []
                       (when (realized? outbound-observer-promise)
                         (tool/def-locals)
                         (.onNext ^StreamObserver @outbound-observer-promise nil)))
        stream-observer (make-stream-observer app-id (:id stream) {:machine-id-changed machine-id-changed
                                                                   :on-payload on-payload
                                                                   :cleanup cleanup
                                                                   :incr-credits incr-credits})]
    ;; XXX: make use-local? work
    (if-not use-local?
      (let [{:keys [outbound-observer cancel]}
            (grpc-client/subscribe-to-instant-stream channel req stream-observer)]
        (deliver outbound-observer-promise outbound-observer)
        {:cancel cancel})

      (let [on-cancel-atom (atom nil)
            wrapped-observer (server-ify-observer stream-observer on-cancel-atom)]
        (handle-bidi-subscribe store wrapped-observer)
        (if channel
          (.onNext wrapped-observer req)
          (.onNext wrapped-observer (grpc/->StreamError :instance-missing)))
        {:cancel (fn [reason]
                   ;; Mimic what happens when the grpc client cancels
                   ;; First it fires the onError, then it runs cancel
                   (.onError stream-observer (-> Status/CANCELLED
                                                 (.withDescription reason)
                                                 (.asException)))
                   (when-let [cancel @on-cancel-atom]
                     (.run ^Runnable cancel)))}))))
