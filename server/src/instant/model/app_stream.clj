(ns instant.model.app-stream
  (:require
   [clojure.core.async :as a]
   [clojure.string]
   [honey.sql :as hsql]
   [instant.config :as config]
   [instant.db.model.attr :as attr-model]
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
   (instant.grpc StreamContent StreamError StreamInit StreamMissing StreamRequest)
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
  (atom {:app-id app-id
         :stream-id stream-id
         :buffer []
         :buffer-byte-size 0
         ;; Offset of the start of the buffer from the start of the stream
         ;; (the rest of the stream is stored in the $files)
         :buffer-byte-offset 0
         :$files []
         :done? false
         :flush-promise nil
         :sinks []}))
         ;; xxx: maybe need some kind of offset
         ;; Need some kind of process for flushing to disk

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

    (on-flush-to-file {:offset (:buffer-byte-offset after)
                       :done? (:done? after)})))

;; XXX: Is cascade-delete removing items when you unlink?

;; Probably need some better handling for errors so that we can determine
;; where we are in the stream. I think if we just tell the client to do a restart, then we should be in a good place?
(defn append
  "`chunks` should be an array of byte[]"
  [stream-object chunks done? on-flush-to-file]
  (let [chunks-byte-size (reduce (fn [acc chunk]
                                   (+ acc (count chunk)))
                                 0
                                 chunks)
        flush-limit (flags/flag :stream-flush-byte-limit 1048576)
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
                                    (> (:buffer-byte-size next-obj) flush-limit))
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

(defn handle-subscribe [store ^StreamRequest req ^ServerCallStreamObserver observer]
  (if-let [stream-object (rs/get-stream-object-for-subscribe store (:app-id req) (:stream-id req))]
    (let [sink-ch (a/chan)
          error-signal-ch (a/chan)
          cancel-signal-ch (a/chan)
          sink (fn [v]
                 (if (= v ::complete)
                   (a/close! sink-ch)
                   (try
                     (a/put! sink-ch v)
                     (catch Throwable -t
                       (a/close! error-signal-ch)))))
          remove-sink (fn []
                        (tool/inspect (swap! stream-object
                                             (fn [obj]
                                               (update obj :sinks (fn [sinks]
                                                                    (filter #(not= % sink) sinks)))))))

          {:keys [$files buffer buffer-byte-offset]}
          (swap! stream-object update :sinks conj sink)]
      (.setOnCancelHandler observer (reify Runnable
                                      (run [_]
                                        (println "CANCELLLL!!!!!!!!!!!!!")
                                        (a/close! cancel-signal-ch))))
      (.onNext observer (grpc/->StreamInit (mapv (fn [file]
                                                   (grpc/->StreamFile (:id file)
                                                                      (:location-id file)
                                                                      (:size file)))
                                                 $files)))
      (tool/def-locals)
      (when (seq buffer)
        (.onNext observer (grpc/->StreamContent buffer-byte-offset
                                                buffer)))
      (tool/def-locals)
      (a/go-loop []
        (let [[val ch] (a/alts! [sink-ch cancel-signal-ch error-signal-ch])]
          (cond (and (= sink-ch ch)
                     (not (nil? val)))
                (do (.onNext observer val)
                    (recur))

                (= ch error-signal-ch)
                (do (remove-sink)
                    (.onNext observer (grpc/->StreamError))
                    (.onCompleted observer))

                (= ch cancel-signal-ch)
                (remove-sink)

                (nil? val)
                (do (remove-sink)
                    (.onCompleted observer))))))
    ;; XXX: Handle the case where the listener unsubscribes or goes away
    ;;      Probably need to put something into the store
    ;;        - need a store gc that removes unknown sessions
    (do
      (.onNext observer (grpc/->StreamMissing))
      (.onCompleted observer))))

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

(def stream-unsubscribe-reason "u")

(defn connect-to-stream [store stream app-id machine-id on-payload]
  (tool/def-locals)
  (let [observer (reify StreamObserver
                   (onCompleted [_]
                     ;; XXX: It would be nice to have an offset to send here
                     ;;      Maybe we ignore onCompleted instead and send something
                     ;;      through onNext?
                     (on-payload {:done true}))
                   (onNext [_ v]
                     (tool/def-locals)
                     (on-payload
                      (condp instance? v
                        StreamError
                        {:error true}

                        StreamInit
                        {:offset 0
                         :files (map (fn [{:keys [id size location-id]}]
                                       {:id id
                                        :size size
                                        :url (file-url app-id location-id)})
                                     (:files v))}

                        StreamContent
                        {:offset (:offset v)
                         :content (let [total-size (reduce (fn [acc ba]
                                                             (+ acc (count ba)))
                                                           0
                                                           (:chunks v))
                                        buff (ByteBuffer/allocate total-size)]
                                    (doseq [^bytes chunk (:chunks v)]
                                      (.put buff chunk))
                                    (String. (.array buff) "UTF-8"))}

                        ;; record exception
                        {:error true})))
                   (onError [_ t]
                     (tool/def-locals)
                     (let [status (Status/fromThrowable t)]
                       (if (and (= (.getCode status) Status$Code/CANCELLED)
                                (= (.getDescription status) stream-unsubscribe-reason))
                         nil
                         ;; XXX: do something with error
                         (on-payload {:error true})))))]
    (def -ii observer)
    (if (and (= machine-id config/machine-id)
             ;; In dev, hit the grpc server half the time to exercise the route

             #_(or (not (config/dev?))
                   (= 0 (rand-int 2))))
      (let [on-cancel-atom (atom nil)
            wrapped-observer (server-ify-observer observer on-cancel-atom)]
        (handle-subscribe store (grpc/->StreamRequest app-id (:id stream)) wrapped-observer)
        {:cancel (fn [reason]
                   ;; Mimic what happens when the grpc client cancels
                   ;; First it fires the onError, then it runs cancel
                   (.onError observer (-> Status/CANCELLED
                                          (.withDescription stream-unsubscribe-reason)
                                          (.asException)))
                   (when-let [cancel @on-cancel-atom]
                     (.run ^Runnable cancel)))})
      ;; XXX: Deal with missing grpc client
      (let [channel (grpc-client/grpc-client-for-machine-id machine-id)]
        (grpc-client/subscribe-to-instant-stream channel app-id (:id stream) observer)))))

;; grpc-server -> calls in to app_stream
;; grpc-client -> app_stream calls into it
