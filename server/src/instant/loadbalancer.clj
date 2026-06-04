(ns instant.loadbalancer
  (:require
   [clojure.string]
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
   (software.amazon.awssdk.services.sns.model ListSubscriptionsByTopicRequest SubscribeRequest Subscription UnsubscribeRequest)
   (software.amazon.awssdk.services.sqs SqsClient)
   (software.amazon.awssdk.services.sqs.model CreateQueueRequest DeleteMessageRequest DeleteQueueRequest GetQueueUrlRequest ListQueueTagsRequest ListQueuesRequest Message QueueAttributeName QueueDoesNotExistException ReceiveMessageRequest ReceiveMessageRequest)))

;; There's an EventBridge subscription that publishes loadbalancer events to SNS.
;; Each machine subscribes to SNS through an SQS queue it creates.
;; When we get a `DeregisterTargets` message for our instance-id (all machines get
;; all events), we start closing connections so that they will all be closed before
;; the loadbalancer forcibly closes them.
;; SNS topic: https://us-east-1.console.aws.amazon.com/sns/v3/home?region=us-east-1#/topic/arn:aws:sns:us-east-1:597134865416:instance-events
;; Eventbridge rule: https://us-east-1.console.aws.amazon.com/events/home?region=us-east-1#/eventbus/default/rules/notify-target-group-scaling

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

(def ^{:tag String} queue-prefix "loadbalancer-queue-")

(defn create-queue [suffix]
  (let [queue-name (str queue-prefix @config/process-id suffix)
        queue-arn (str config/instance-events-sqs-topic-arn-prefix queue-name)
        req (.. (CreateQueueRequest/builder)
                (queueName queue-name)
                (attributes {QueueAttributeName/POLICY (sqs-policy queue-arn)})
                (tags {"instance-id" @config/instance-id
                       "created-at" (str (Instant/now))
                       "env" (name (config/get-env))})
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
                (waitTimeSeconds (int 20))
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
                                                 (>= 120 (.toSeconds (Duration/between started-at now))))
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

(defn create-process [queue-suffix]
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
    {:q q
     :queue-suffix queue-suffix
     :sns sns
     :conn-drain-futs conn-drain-futs
     :queue-listener queue-listener
     :shutdown shutdown}))

(defn orphaned-queues []
  (let [req (.. (ListQueuesRequest/builder)
                (maxResults (int 1000))
                (queueNamePrefix queue-prefix)
                (build))
        now (Instant/now)]
    (keep (fn [queue-url]
            (try
              (let [req (.. (ListQueueTagsRequest/builder)
                            (queueUrl queue-url)
                            (build))
                    tags (.tags (.listQueueTags (sqs-client) ^ListQueueTagsRequest req))
                    created-at (some-> tags (get "created-at") (Instant/parse))]
                (when (and (= (get tags "env") (name (config/get-env)))
                           (<= 60 (.toDays (Duration/between created-at now))))
                  {:url queue-url
                   :tags tags
                   :created-at created-at}))
              (catch QueueDoesNotExistException _
                nil)))
          (.queueUrls (.listQueues (sqs-client) ^ListQueuesRequest req)))))

(defn queue-exists-by-queue-name? [queue-name]
  (let [req (.. (GetQueueUrlRequest/builder)
                (queueName queue-name)
                (build))]
    (try
      (.getQueueUrl (sqs-client) ^GetQueueUrlRequest req)
      (catch QueueDoesNotExistException _
        false))))

(defn orphaned-subscriptions []
  (let [req (.. (ListSubscriptionsByTopicRequest/builder)
                (topicArn config/instance-events-sns-topic-arn)
                (build))
        subscriptions (-> (.listSubscriptionsByTopic (sns-client)
                                                     ^ListSubscriptionsByTopicRequest req)
                          (.subscriptions))]
    (keep (fn [^Subscription sub]
            (when (and (= (.protocol sub) "sqs")
                       (some-> (.endpoint sub)
                               (clojure.string/starts-with? (str config/instance-events-sqs-topic-arn-prefix
                                                                 queue-prefix))))
              (let [queue-name (subs (.endpoint sub) (count config/instance-events-sqs-topic-arn-prefix))]
                (when-not (queue-exists-by-queue-name? queue-name)
                  {:arn (.subscriptionArn sub)
                   :endpoint (.endpoint sub)
                   :protocol (.protocol sub)}))))
          subscriptions)))

(defn cleanup-stale []
  (doseq [q (orphaned-queues)]
    (tracer/with-span! {:name "loadbalancer/remove-orphaned-queue"
                        :attributes q}
      (delete-queue (:url q))))
  (doseq [s (orphaned-subscriptions)]
    (tracer/with-span! {:name "loadbalancer/remove-orphaned-subs"
                        :attributes s}
      (unsubscribe-from-sns (:arn s)))))

(defn start
  ([]
   (start nil))
  ([queue-suffix]
   (let [v (create-process queue-suffix)]
     (reset! process v)
     (try
       (cleanup-stale)
       (catch Throwable t
         (tracer/record-exception-span! t {:name "loadbalancer/cleanup-stale-error"})))
     v)))

(defn stop []
  (let [[old _new] (swap-vals! process (fn [_] nil))]
    (when-let [shutdown (:shutdown old)]
      (shutdown))))

(defn restart []
  (stop)
  ;; Give it a suffix because you have to wait 60 seconds
  ;; for the queue to restart
  (start (str "-" (rand-int 10000))))
