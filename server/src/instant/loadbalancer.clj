(ns instant.loadbalancer
  (:require
   [instant.config :as config]
   [instant.flags :as flags]
   [instant.reactive.store :as rs]
   [instant.util.async :as ua]
   [instant.util.coll :as ucoll]
   [instant.util.json :as json]
   [instant.util.tracer :as tracer])
  (:import
   (java.time Duration Instant)
   (software.amazon.awssdk.services.sns SnsClient)
   (software.amazon.awssdk.services.sns.model SubscribeRequest UnsubscribeRequest)
   (software.amazon.awssdk.services.sqs SqsClient)
   (software.amazon.awssdk.services.sqs.model CreateQueueRequest DeleteMessageRequest DeleteQueueRequest Message QueueAttributeName ReceiveMessageRequest ReceiveMessageRequest)))

(defonce process (atom nil))

(defonce sns-client* (delay (.. (SnsClient/builder)
                                (build))))

(defn sns-client ^SnsClient [] @sns-client*)

(defonce sqs-client* (delay (.. (SqsClient/builder)
                                (build))))

(defn sqs-client ^SqsClient [] @sqs-client*)

(defn sqs-policy ^String [queue-arn]
  (json/->json
   {:Version "2012-10-17"
    :Statement [{:Effect "Allow"
                 :Principal {:Service "sns.amazonaws.com"}
                 :Action "sqs:SendMessage"
                 :Resource queue-arn
                 :Condition {:ArnEquals {"aws:SourceArn" config/instance-events-sns-topic-arn}}}]}))

(defn create-queue [suffix]
  (let [queue-name (str "loadbalancer-queue-" @config/process-id suffix)
        queue-arn (str config/instance-events-sqs-topic-arn-prefix queue-name)
        req (.. (CreateQueueRequest/builder)
                (queueName queue-name)
                (attributes {QueueAttributeName/POLICY (sqs-policy queue-arn)})
                (tags {"instance-id" @config/instance-id
                       "created-at" (str (Instant/now))})
                (build))]
    {:url (-> (.createQueue (sqs-client) ^CreateQueueRequest req)
              (.queueUrl))
     :arn queue-arn}))

(defn delete-queue [queue-url]
  (let [req (.. (DeleteQueueRequest/builder)
                (queueUrl queue-url)
                (build))]
    (.deleteQueue (sqs-client) ^DeleteQueueRequest req)))

(defn subscribe-to-sns [queue-arn]
  (let [req (.. (SubscribeRequest/builder)
                (topicArn config/instance-events-sns-topic-arn)
                (protocol "sqs")
                (endpoint queue-arn)
                (attributes {"RawMessageDelivery" "true"})
                (build))
        resp (.subscribe (sns-client) ^SubscribeRequest req)]
    {:arn (.subscriptionArn resp)}))

(defn unsubscribe-from-sns [subscription-arn]
  (let [req (.. (UnsubscribeRequest/builder)
                (subscriptionArn subscription-arn)
                (build))]
    (.unsubscribe (sns-client) ^UnsubscribeRequest req)))

(defn get-messages [queue-url]
  (let [req (.. (ReceiveMessageRequest/builder)
                (queueUrl queue-url)
                (maxNumberOfMessages (int 10))
                (waitTimeSeconds (int 1)) ; 20
                (build))]
    (-> (.receiveMessage (sqs-client) ^ReceiveMessageRequest req)
        (.messages))))

(defn delete-message [queue-url ^Message message]
  (let [req (.. (DeleteMessageRequest/builder)
                (queueUrl queue-url)
                (receiptHandle (.receiptHandle message))
                (build))]
    (.deleteMessage (sqs-client) ^DeleteMessageRequest req)))

(defn poll-queue [queue-url on-message]
  (loop [backoff 0]
    (let [next-action (try
                        (let [messages (get-messages queue-url)]
                          (doseq [^Message message messages]
                            (on-message (json/<-json (.body message) true))
                            (delete-message queue-url message))
                          :continue)
                        (catch Throwable t
                          (tracer/record-exception-span! t {:name "loadbalancer/get-messages-errror"})
                          :backoff))]
      (case next-action
        :continue (recur 0)
        :backoff
        (do (Thread/sleep (long (* 1000
                                   (get [2 10 30 60] backoff 60))))
            (recur (inc backoff))))))
  (tracer/record-exception-span! (ex-info "Poll Queue Existed Early" {:queue-url queue-url})
                                 {:name "loadbalancer/poll-queue-error"}))

(defn add-conn-drain [conn-drain-futs]
  (let [drain-id (random-uuid)
        conn-drains (swap! conn-drain-futs
                           (fn [futs]
                             (let [now (Instant/now)]
                               (if (ucoll/seek (fn [[_k {:keys [started-at]}]]
                                                 (pos? (compare (Duration/ofMinutes 2)
                                                                (Duration/between started-at now))))
                                               futs)
                                 ;; We already started a shutdown in the last 2 minutes
                                 futs
                                 (assoc futs drain-id {:started-at now
                                                       :process (promise)})))))]
    (when-let [process-promise (-> conn-drains (get drain-id) :process)]
      (let [total-ms (flags/deregister-targets-drain-ms)]
        (deliver process-promise (ua/vfut-bg
                                  (try
                                    (tracer/with-span! {:name "loadbalancer/close-connections"}
                                      (rs/close-connections rs/store {:total-ms total-ms
                                                                      :max-gap-ms 1000}))
                                    (finally
                                      (swap! conn-drain-futs dissoc drain-id)))))))))

(defn handle-message [conn-drain-futs body]
  (let [event (-> body :detail :eventName)]
    (tracer/with-span! {:name "loadbalancer/handle-sns-message"
                        :attributes {:event event
                                     :body body}}
      (when (= "DeregisterTargets" event)
        (let [target-ids (->> body
                              :detail
                              :requestParameters
                              :targets
                              (map :id))]
          (when (ucoll/seek (fn [instance-id]
                              (and instance-id
                                   (= instance-id @config/instance-id)))
                            target-ids)
            (add-conn-drain conn-drain-futs)))))))

;; XXX: Needs a cleanup process

(defn start
  ([] (start nil))
  ([queue-suffix]
   (let [q (create-queue queue-suffix)
         sns (subscribe-to-sns (:arn q))
         conn-drain-futs (atom {})
         queue-listener (ua/vfut-bg
                         (poll-queue (:url q)
                                     (partial handle-message conn-drain-futs)))
         shutdown (fn []
                    (future-cancel queue-listener)
                    (doseq [drain-fut @conn-drain-futs]
                      (future-cancel drain-fut))
                    (try
                      (unsubscribe-from-sns (:arn sns))
                      (catch Throwable t
                        (tracer/record-exception-span! t {:name "loadbalancer/unsubscribe-sns-error"})))
                    (try
                      (delete-queue (:url q))
                      (catch Throwable t
                        (tracer/record-exception-span! t {:name "loadbalancer/delete-sqs-queue-error"}))))]
     (reset! process {:q q
                      :queue-suffix queue-suffix
                      :sns sns
                      :conn-drain-futs conn-drain-futs
                      :queue-listener queue-listener
                      :shutdown shutdown}))))

(defn stop []
  (let [[old _new] (swap-vals! process (fn [_] nil))]
    (when-let [shutdown (:shutdown old)]
      (shutdown))))

(defn restart []
  (stop)
  ;; Give it a suffix because you have to wait 60 seconds
  ;; for the queue to restart
  (start (str "-" (rand-int 10000))))
