(ns instant.webhook-processor
  (:require
   [chime.core :as chime-core]
   [instant.config :as config]
   [instant.flags :as flags]
   [instant.model.webhook :as webhook-model]
   [instant.util.async :as ua]
   [instant.util.json :as json]
   [instant.util.tracer :as tracer]
   [instant.webhook-jwt :as webhook-jwt]
   [instant.webhook-sender :as webhook-sender])
  (:import
   (java.sql Timestamp)
   (java.io ByteArrayOutputStream)
   (java.time Duration Instant)
   (java.util.concurrent ArrayBlockingQueue TimeUnit)))

(defonce process (atom nil))

(def default-worker-count 10)
(def default-retry-worker-count 10)

(def stop-signal ::stop)

(defn notify-events
  "Notifies the workers that there may be a webhook event in the queue.
   We're provided with a set of primary keys for the events, but we ignore
   them for now and just fetch the latest items from the database."
  ([event-primary-keys]
   (when-let [p @process]
     (notify-events event-primary-keys p)))
  ([_event-primary-keys {:keys [notify-ready]}]
   (notify-ready)))

(defn webhook-body [{:keys [app_id webhook_id isn] :as _event}]
  (let [out (ByteArrayOutputStream.)
        gen (.createGenerator json/object-mapper out)
        payload-url (str config/server-origin "/webhooks/payload/" app_id "/" webhook_id "/" isn)]
    (.writeStartObject gen)
    (.writeStringField gen "payloadUrl" payload-url)
    (.writeStringField gen "token" (webhook-jwt/webhook-payload-jwt app_id webhook_id isn))
    (.writeEndObject gen)
    (.close gen)
    (.toByteArray out)))

(defn handle-event!
  "Takes an event and the base-time that we should use to calculate latency."
  [event ^Instant base-time]
  (let [webhook (webhook-model/get-by-app-id-and-webhook-id! {:app-id (:app_id event)
                                                              :webhook-id (:webhook_id event)})]
    (if-not (= (:status webhook) "active")
      (webhook-model/record-attempt! event (webhook-sender/->WebhookAttempt (Instant/now)
                                                                            0
                                                                            false
                                                                            nil
                                                                            nil
                                                                            "disabled"
                                                                            "Webhook is disabled."))
      (let [idempotency-key (webhook-model/payload-idempotency-key {:webhook-id (:webhook_id event)
                                                                    :isn (:isn event)})
            body (webhook-body event)
            url (-> webhook :sink (get "url"))
            latency-ms (.toMillis (Duration/between base-time (Instant/now)))
            attempt (webhook-sender/send-webhook url idempotency-key latency-ms body)]
        (webhook-model/record-attempt! event attempt)))))

(defn should-repeat?
  "Returns true if we hit max-apps or max-per-app, indicating that
   there are more unhandled events that we didn't grab."
  [events max-apps max-per-app]
  (loop [events events
         acc (transient {})]
    (when-let [event (first events)]
      (let [{:keys [app_id]} event
            next-count ((fnil inc 0) (get acc app_id))
            next-acc (assoc! acc app_id next-count)]
        (if (or (= next-count max-per-app)
                (= (count next-acc) max-apps))
          true
          (recur (rest events)
                 next-acc))))))

(defn work! []
  (try
    (let [max-apps 10
          max-per-app 10
          events (webhook-model/claim-events! {:max-apps max-apps
                                               :max-per-app max-per-app})
          futs (mapv (fn [event]
                       (ua/vfuture (handle-event! event (Timestamp/.toInstant
                                                         (:created_at event)))))
                     events)]
      (mapv deref futs)
      (when (should-repeat? events max-apps max-per-app)
        ::repeat))
    (catch Throwable t
      (tracer/record-exception-span! t {:name "webhook-processor/work!-error"}))))

(defn start-worker [executor ^ArrayBlockingQueue q i notify-ready]
  (ua/worker-vfuture
   executor
   (loop [item (.take q)]
     (if (identical? item stop-signal)
       (tracer/record-info! {:name "webhook-processor/worker-finish"
                             :attributes {:worker i}})
       (do (when (= ::repeat (work!))
             (notify-ready))
           (recur (.take q)))))))

(defn work-retry! []
  (try
    (let [max-events 100
          events (webhook-model/claim-retry-events! {:max-events max-events
                                                     :attempt-after (Instant/now)})
          futs (mapv (fn [event]
                       (ua/vfuture (handle-event! event (Timestamp/.toInstant
                                                         (:next_attempt_after event)))))
                     events)]
      (mapv deref futs)
      (when (= max-events (count events))
        ::repeat))
    (catch Throwable t
      (tracer/record-exception-span! t {:name "webhook-processor/work-retry!-error"}))))

(defn start-retry-worker [executor ^ArrayBlockingQueue q i notify-retry]
  (ua/worker-vfuture
   executor
   (loop [item (.take q)]
     (if (identical? item stop-signal)
       (tracer/record-info! {:name "webhook-processor/retry-worker-finish"
                             :attributes {:worker i}})
       (do (when (= ::repeat (work-retry!))
             ;; Run this twice so that we ramp up worker saturation if the
             ;; queue gets backed up.
             (notify-retry)
             (notify-retry))
           (recur (.take q)))))))

(defn start []
  (let [worker-count (max 1 (flags/flag :webhook-worker-count default-worker-count))
        retry-worker-count (max 1 (flags/flag :webhook-retry-worker-count
                                              default-retry-worker-count))]
    (tracer/with-span! {:name "webhook-processor/start"
                        :attributes {:worker-count worker-count
                                     :retry-worker-count retry-worker-count}}
      (let [q (ArrayBlockingQueue. worker-count)
            executor (ua/make-virtual-thread-executor)
            notify-ready (fn []
                           (.offer q 0))
            workers (mapv (fn [i]
                            (start-worker executor q i notify-ready))
                          (range worker-count))

            retry-q (ArrayBlockingQueue. retry-worker-count)
            notify-retry (fn []
                           (.offer retry-q 0))
            retry-workers (mapv (fn [i]
                                  (start-retry-worker executor retry-q i notify-retry))
                                (range retry-worker-count))
            shutdown? (atom false)
            kicker (chime-core/chime-at (chime-core/periodic-seq (Instant/now)
                                                                 (Duration/ofMinutes (if (config/dev?)
                                                                                       10
                                                                                       2)))
                                        (fn [_]
                                          (when-not @shutdown?
                                            (webhook-model/free-stuck-events!)
                                            (notify-ready)
                                            (notify-retry))))
            shutdown (fn []
                       (tracer/with-span! {:name "webhook-processor/shutdown"}
                         (reset! shutdown? true)
                         (.clear q)
                         (dotimes [_ worker-count]
                           (.offer q stop-signal 10 TimeUnit/SECONDS))
                         (.clear retry-q)
                         (dotimes [_ retry-worker-count]
                           (.offer retry-q stop-signal 10 TimeUnit/SECONDS))
                         (doseq [worker workers]
                           (try
                             (when (= ::timeout (deref worker 10000 ::timeout))
                               (future-cancel worker))
                             (catch Throwable t
                               (tracer/record-exception-span! t {:name "webhook-processor/shutdown-error"}))))
                         (doseq [worker retry-workers]
                           (try
                             (when (= ::timeout (deref worker 10000 ::timeout))
                               (future-cancel worker))
                             (catch Throwable t
                               (tracer/record-exception-span! t {:name "webhook-processor/shutdown-error"}))))
                         (.shutdownNow executor)
                         (.close kicker)))]
        {:q q
         :retry-q retry-q
         :worker-count worker-count
         :retry-worker-count retry-worker-count
         :workers workers
         :retry-workers retry-workers
         :shutdown? (fn []
                      @shutdown?)
         :shutdown shutdown
         :notify-ready notify-ready
         :notify-retry notify-retry}))))

(defn stop [process]
  ((:shutdown process)))

(defn start-global []
  (reset! process (start)))

(defn stop-global []
  (when-let [p @process]
    (stop p)
    (reset! process nil)))

(defn restart []
  (stop-global)
  (start-global))

;; Allows us to modify the number of workers at runtime if necessary
(defonce _watch-worker-count-change
  [(flags/add-flag-listener :webhook-worker-count
                            (fn [_path _old-value new-value]
                              (when (not= new-value (:worker-count @process))
                                (restart))))
   (flags/add-flag-listener :webhook-retry-worker-count
                            (fn [_path _old-value new-value]
                              (when (not= new-value (:retry-worker-count @process))
                                (restart))))])
