(ns instant.model.app-stream
  (:require
   [clojure.core.async :as a]
   [clojure.string]
   [honey.sql :as hsql]
   [instant.config :as config]
   [instant.db.model.attr :as attr-model]
   [instant.db.model.transaction :as tx-model]
   [instant.db.model.triple :as triple-model]
   [instant.flags :as flags]
   [instant.grpc :as grpc]
   [instant.grpc-client :as grpc-client]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.model.app-file :as app-file-model]
   [instant.reactive.store :as rs]
   [instant.storage.coordinator :as storage-coordinator]
   [instant.storage.s3 :as instant-s3]
   [instant.system-catalog :refer [all-attrs] :rename {all-attrs $system-attrs}]
   [instant.system-catalog-ops :refer [query-op update-op]]
   [instant.util.async :as ua]
   [instant.util.exception :as ex]
   [instant.util.tracer :as tracer])
  (:import
   (instant.grpc StreamContent StreamError StreamInit StreamRequest StreamComplete)
   (io.grpc Status Status$Code)
   (io.grpc.netty.shaded.io.netty.buffer ByteBufInputStream CompositeByteBuf Unpooled)
   (io.grpc.stub ServerCallStreamObserver StreamObserver)
   (java.nio ByteBuffer)))

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
  ([conn {:keys [id app-id client-id machine-id hashed-reconnect-token]}]
   (update-op
     conn
     {:app-id app-id
      :etype etype}
     (fn [{:keys [transact! resolve-id]}]
       (transact!
         (concat [[:add-triple id (resolve-id :id) id {:mode :create}]
                  [:add-triple id (resolve-id :machineId) machine-id {:mode :create}]
                  [:add-triple id (resolve-id :hashedReconnectToken) hashed-reconnect-token {:mode :create}]]
                 (when client-id
                   [[:add-triple id (resolve-id :clientId) client-id {:mode :create}]])))))))

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
  ([conn {:keys [stream-id app-id file-id done? size]}]
   (update-op
     conn
     {:app-id app-id
      :etype etype}
     (fn [{:keys [transact! resolve-id]}]
       (transact! (concat
                    [[:add-triple stream-id (resolve-id "$files") file-id]]
                    (when done?
                      [[:add-triple stream-id (resolve-id "done") true]
                       [:add-triple stream-id (resolve-id "size") size]])))))))

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

(defn notify-machine-id-changed [app-id stream-id machine-id]
  ;; XXX: DO something here
  (tool/def-locals))

(defn get-stream-files
  "Gets the files for a completed stream, with s3 download urls"
  ([params] (get-stream-files (aurora/conn-pool :read) params))
  ([conn {:keys [app-id stream-id]}]
   ;; XXX: Prevent changing the path when it starts or ends with $stream
   (let [files (->> (app-file-model/get-where {:app-id app-id
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

;; Upload the file, link it to the stream, then do a swap that removes
;; the buffer chunks, updates the buffer size, and adds the file to the files array

(defn new-stream-object [app-id stream-id]
  (let [this (promise)
        obj (atom {:app-id app-id
                   :stream-id stream-id
                   :buffer []
                   :buffer-byte-size 0
                   ;; Offset of the start of the buffer from the start of the stream
                   ;; (the rest of the stream is stored in the $files)
                   :buffer-byte-offset 0
                   :$files []
                   :done? false
                   :flush-promise nil
                   :sinks []}
                  ;; This is a bit of a hack to allow the store to
                  ;; call cleanup without having to worry about a cyclic dependency
                  ;; between store and app-stream
                  :meta {:cleanup (fn []
                                    (doseq [sink (:sinks (-> this deref deref))]
                                      (sink ::disconnect)))})]
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

(defn flush-to-file [stream-object flush-promise on-flush-to-file]
  (let [{:keys [app-id stream-id $files done?
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

;; Probably need some better handling for errors so that we can determine
;; where we are in the stream. I think if we just tell the client to do a restart, then we should be in a good place?
(defn append
  "`chunks` should be an array of byte[]"
  [stream-object chunks done? on-flush-to-file]
  (let [chunks-byte-size (reduce (fn [acc ^bytes chunk]
                                   (+ acc (alength chunk)))
                                 0
                                 chunks)
        flush-limit (flags/stream-flush-byte-limit)
        ;; XXX: double-check that's right
        flush-promise (promise)
        updated (swap! stream-object
                       (fn [obj]
                         (when (:done? obj)
                           (ex/throw-validation-err! :append-stream
                                                     {:stream-id (:id obj)}
                                                     [{:message "Stream is completed."}]))
                         (let [next-obj (-> obj
                                            (update :buffer into chunks)
                                            (update :buffer-byte-size + chunks-byte-size)
                                            (assoc :done? (boolean done?)))]
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
        (doseq [sink (:sinks updated)]
          (sink msg))))
    (when done?
      (doseq [sink (:sinks updated)]
        (sink ::completed))
      (when-let [p (:flush-promise updated)]
        (-> p
            ;; wait for promise
            deref
            ;; wait for future inside of promise
            deref))
      (flush-to-file stream-object nil on-flush-to-file))))

(defn file-url [app-id location-id]
  (instant-s3/create-signed-download-url! app-id location-id))

(defn handle-subscribe
  "Subscribes to a stream-object in the store on this instance."
  [store ^StreamRequest req ^ServerCallStreamObserver observer]
  (tool/def-locals)
  (if-let [stream-object (rs/get-stream-object-for-subscribe store (:app-id req) (:stream-id req))]
    (let [sink-ch (a/chan)
          error-ch (a/chan)
          put-error! (fn [error-kw]
                       (a/put! error-ch error-kw)
                       (a/close! error-ch))
          cancel-signal-ch (a/chan)
          sink (fn [v]
                 (case v
                   ::completed
                   (a/close! sink-ch)

                   ::disconnect
                   (put-error! (grpc/stream-error :writer-disconnected))

                   (try
                     (a/put! sink-ch v)
                     (catch AssertionError -e
                       ;; Too many puts, let's just tell the caller to backoff
                       (put-error! (grpc/stream-error :rate-limit))))))
          remove-sink (fn []
                        (swap! stream-object
                               (fn [obj]
                                 (update obj :sinks (fn [sinks]
                                                      (filter #(not= % sink) sinks))))))

          {:keys [$files buffer buffer-byte-offset]}
          (swap! stream-object update :sinks conj sink)]
      (.setOnCancelHandler observer (reify Runnable
                                      (run [_]
                                        (a/close! cancel-signal-ch))))

      ;; XXX: Handle offset
      (let [{:keys [files start-offset]}
            (reduce (fn [{:keys [files start-offset]} file]
                      (let [next-start-offset (+ start-offset (:size file))]
                        (if (>= next-start-offset (:offset req))
                          {:files (conj files (grpc/->StreamFile (:id file)
                                                                 (:location-id file)
                                                                 (:size file)))
                           :start-offset start-offset}
                          {:files files
                           :start-offset next-start-offset})))
                    {:files []
                     :start-offset 0}
                    $files)]
        (tool/def-locals)
        ;; XXX: offset for buffer
        (.onNext observer (grpc/->StreamInit start-offset files buffer)))

      (tool/def-locals)
      (a/go-loop []
        (let [[val ch] (a/alts! [sink-ch cancel-signal-ch error-ch])]
          (cond (and (= sink-ch ch)
                     (not (nil? val)))
                (do (.onNext observer val)
                    (recur))

                (= ch error-ch)
                (do (remove-sink)
                    ;; Log an error if it's unknown
                    (.onNext observer (or val (grpc/stream-error :unknown)))
                    (.onCompleted observer))

                ;; The subscriber canceled. They're no longer interested in
                ;; updates, so we can just remove our sink
                (= ch cancel-signal-ch)
                (remove-sink)

                (nil? val)
                (do (remove-sink)
                    (.onNext observer (grpc/->StreamComplete))
                    (.onCompleted observer))))))
    ;; XXX: Handle the case where the listener unsubscribes or goes away
    ;;      Probably need to put something into the store
    ;;        - need a store gc that removes unknown sessions
    (.onNext observer (grpc/stream-error :stream-missing-on-instance))))

(defn server-ify-observer [^StreamObserver observer on-cancel-atom]
  "Allows us to add an onCancel handler to the observer when we handle it on
   the same machine instead of sending it through GRPC.
   We need to upgrade it to a ServerCallStreamObserver with support for setOnCancelHandler"
  (proxy [ServerCallStreamObserver] []
    ;; Delegate core methods to the existing observer
    (onNext [v] (.onNext observer v))
    (onError [t] (.onError observer t))
    (onCompleted [] (.onCompleted observer))

    ;; server methods
    (isReady [] true)
    (setOnCancelHandler [r] (reset! on-cancel-atom r))
    (setOnReadyHandler [_r] (throw (Exception. "setOnReadyHandler not implemented")))
    (disableAutoInboundFlowControl [])
    (request [_n])
    (setMessageCompression [_e])))

(defn chunks->string [chunks]
  (let [total-size (reduce (fn [acc chunk]
                             (+ acc (alength ^bytes chunk)))
                           0
                           chunks)
        buff (ByteBuffer/allocate total-size)]
    (doseq [^bytes chunk chunks]
      (.put buff chunk))
    (String. (.array buff) "UTF-8")))

(defn connect-to-stream [store stream app-id machine-id offset on-payload]
  (tool/def-locals)
  (let [req (grpc/->StreamRequest app-id (:id stream) offset)
        observer (reify StreamObserver
                   (onCompleted [_]
                     ;; XXX: It would be nice to have an offset to send here
                     ;;      Maybe we ignore onCompleted instead and send something
                     ;;      through onNext?
                     ;; XXX: Don't send anything on onCompleted
                     ;; XXX: Do we want to do something in onCompleted, like make sure the
                     ;;      last message was terminal?? Maybe in dev?
                     ;;(on-payload {:done true})
                     )
                   (onNext [_ v]
                     (tool/def-locals)
                     (let [msg (condp instance? v
                                 StreamError
                                 (tracer/with-span! {:name "app_stream/stream-error"
                                                     :attributes {:stream-id (:id stream)
                                                                  :error (:error v)}}
                                   ;; XXX: NEXT UP: set up subscription to machine-id
                                   (case (:error v)
                                     :rate-limit {:error true
                                                  ;; XXX: Send a better error type (e.g. validation error
                                                  :error-type :rate-limit}
                                     :unknown {:error true
                                               :error-type :unknown}
                                     ;; XXX: Here is where we add some kind of subscription that waits for the
                                     ;;      session to come back online
                                     :stream-missing-on-instance {:error true
                                                                  :error-type :retry}
                                     ;; XXX: This should also wait for session to come back online
                                     :writer-disconnected {:error true
                                                           :error-type :retry}
                                     ;; XXX: We need to subscribe to both the machine-id showing up in hz
                                     ;;      and the stream coming back online
                                     ;; I could pass this observer as the thing that gets activated
                                     :instance-missing {:error true
                                                        :error-type :retry}))

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


                                 (tracer/with-span! {:name "app_stream/unknown-payload-type"
                                                     :attributes {:type (type v)
                                                                  :stream-id (:id stream)}}
                                   {:error true}))]
                       (when msg
                         (on-payload msg))))
                   (onError [_ t]
                     (tool/def-locals)
                     (def -ttt t)
                     (let [status (Status/fromThrowable t)]
                       (if (and (= (.getCode status) Status$Code/CANCELLED)
                                (= (.getDescription status) rs/stream-unsubscribe-reason))
                         nil
                         ;; XXX: do something with error
                         (do (tracer/record-exception-span! t {:name "app_stream/subscribe-error"})
                             (on-payload {:error true}))))))]
    (def -ii observer)
    (if (and (= machine-id config/machine-id)
             ;; In dev, hit the grpc server half the time to exercise the route
             (or (not (config/dev?))
                 (= 0 (rand-int 2))))
      (let [on-cancel-atom (atom nil)
            wrapped-observer (server-ify-observer observer on-cancel-atom)]
        (handle-subscribe store req wrapped-observer)
        {:cancel (fn [reason]
                   ;; Mimic what happens when the grpc client cancels
                   ;; First it fires the onError, then it runs cancel
                   (.onError observer (-> Status/CANCELLED
                                          (.withDescription rs/stream-unsubscribe-reason)
                                          (.asException)))
                   (when-let [cancel @on-cancel-atom]
                     (.run ^Runnable cancel)))})
      ;; XXX: Deal with missing grpc client
      (if-let [channel (grpc-client/grpc-client-for-machine-id machine-id)]
        (grpc-client/subscribe-to-instant-stream channel req observer)
        (.onNext observer (grpc/->StreamError :instance-missing))))))
