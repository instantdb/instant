(ns instant.cloudwatch
  (:require
   [clojure.string]
   [instant.config :as config]
   [instant.util.coll :as ucoll]
   [instant.util.crypt :as crypt-util]
   [instant.util.tracer :as tracer])
  (:import
   (com.google.common.collect EvictingQueue Queues)
   (java.io ByteArrayInputStream)
   (java.time Instant)
   (java.time.temporal ChronoUnit)
   (java.util Queue)
   (software.amazon.awssdk.auth.credentials AwsBasicCredentials StaticCredentialsProvider)
   (software.amazon.awssdk.core.client.config ClientOverrideConfiguration)
   (software.amazon.awssdk.core.interceptor ExecutionInterceptor)
   (software.amazon.awssdk.http AbortableInputStream ExecutableHttpRequest HttpExecuteResponse SdkHttpClient SdkHttpResponse)
   (software.amazon.awssdk.regions Region)
   (software.amazon.awssdk.services.cloudwatch CloudWatchClient CloudWatchClientBuilder)
   (software.amazon.awssdk.services.cloudwatch.model GetMetricDataRequest GetMetricDataResponse MetricDataQuery MetricDataResult MetricDatum PutMetricDataRequest ScanBy StandardUnit)
   (software.amazon.awssdk.services.rds RdsClient)
   (software.amazon.awssdk.services.rds.model DBInstance DescribeDbInstancesResponse)))

(defonce cloudwatch-client (delay (CloudWatchClient/create)))

(defonce rds-client (delay (-> (RdsClient/builder)
                               (.build))))

(defonce ^{:tag Queue} captured-metric-data
  (Queues/synchronizedQueue (EvictingQueue/create 1000)))

(def ^:private capturing-interceptor
  (reify ExecutionInterceptor
    (beforeTransmission [_ context _attrs]
      (let [req (.request context)]
        (when (instance? PutMetricDataRequest req)
          (doseq [data (PutMetricDataRequest/.metricData req)]
            (.add captured-metric-data data)))))))

(def ^{:tag String} fake-put-metric-response-xml
  "<PutMetricDataResponse xmlns=\"http://monitoring.amazonaws.com/doc/2010-08-01/\"><ResponseMetadata><RequestId>dev-mock</RequestId></ResponseMetadata></PutMetricDataResponse>")

(def ^{:tag SdkHttpClient} noop-http-client
  (reify SdkHttpClient
    (prepareRequest [_ _req]
      (reify ExecutableHttpRequest
        (call [_]
          (-> (HttpExecuteResponse/builder)
              (.response (-> (SdkHttpResponse/builder)
                             (.statusCode 200)
                             (.putHeader "Content-Type" "text/xml")
                             (.build)))
              (.responseBody (AbortableInputStream/create
                              (ByteArrayInputStream.
                               (.getBytes fake-put-metric-response-xml))))
              (.build)))
        (abort [_])))
    (close [_])))

(defn- make-capturing-cloudwatch-client
  "Creates a dev/test client that stores the last 1000 metrics in
  `captured-metric-data` instead of posting to cloudwatch."
  ^CloudWatchClient []
  (let [^ClientOverrideConfiguration override-config
        (-> (ClientOverrideConfiguration/builder)
            (.addExecutionInterceptor capturing-interceptor)

            (.build))]
    (-> (CloudWatchClient/builder)
        (.region Region/US_EAST_1)
        (.credentialsProvider (StaticCredentialsProvider/create
                               (AwsBasicCredentials/create "fake" "fake")))

        (CloudWatchClientBuilder/.httpClient noop-http-client)
        (CloudWatchClientBuilder/.overrideConfiguration override-config)
        (.build))))

(defonce write-cloudwatch-client
  (delay (if (config/aws-env?)
           (CloudWatchClient/create)
           (make-capturing-cloudwatch-client))))

(defn record-webhook-latency-ms!
  ([^Instant recorded-at latency-ms]
   (record-webhook-latency-ms! @write-cloudwatch-client recorded-at latency-ms))
  ([^CloudWatchClient client recorded-at latency-ms]
   (let [datum (-> (MetricDatum/builder)
                   (.metricName "webhook-latency")
                   (.value (double latency-ms))
                   (.unit StandardUnit/MILLISECONDS)
                   (.timestamp recorded-at)
                   (.build))
         request (-> (PutMetricDataRequest/builder)
                     (.namespace "Instant")
                     (.metricData (ucoll/array-of MetricDatum [datum]))
                     (.build))]
     (.putMetricData client ^PutMetricDataRequest request))))

(defn all-rds-instance-ids
  "Returns all resource ids for all database instances in RDS."
  []
  (let [^RdsClient client @rds-client
        paginator (.describeDBInstancesPaginator client)]
    (->> (mapcat #(.dbInstances ^DescribeDbInstancesResponse %)
                 (iterator-seq (.iterator paginator)))
         (filter #(.performanceInsightsEnabled ^DBInstance %))
         (mapv (fn [^DBInstance i]
                 (.dbiResourceId i))))))

(defn total-db-queries-for-resources
  "Returns the queries per second over the last minute across all database
   instances in RDS."
  [resource-ids]
  (let [^CloudWatchClient client @cloudwatch-client
        now (Instant/now)
        start (.minus now 5 ChronoUnit/MINUTES)
        period (int 60)
        queries (mapcat (fn [resource-id]
                          (let [m-id (str "m_" (crypt-util/random-hex 8))

                                m (-> (MetricDataQuery/builder)
                                      (.id m-id)
                                      (.expression (format "DB_PERF_INSIGHTS('RDS', '%s',['db.SQL.queries_started.sum'])"
                                                           resource-id))

                                      (.period period)
                                      (.returnData false)
                                      (.build))
                                total (-> (MetricDataQuery/builder)
                                          (.id (str "total_" m-id))
                                          (.expression (format "SUM(%s)" m-id))
                                          (.label "total_activity_per_sec")
                                          (.build))]
                            [m total]))
                        resource-ids)

        request (-> (GetMetricDataRequest/builder)
                    (.metricDataQueries (ucoll/array-of MetricDataQuery queries))
                    (.startTime start)
                    (.endTime now)
                    (.scanBy ScanBy/TIMESTAMP_DESCENDING)
                    (.build))

        ^GetMetricDataResponse response (.getMetricData client ^GetMetricDataRequest request)
        result (.metricDataResults response)]
    (int (/ (reduce (fn [acc ^MetricDataResult result]
                      (if-some [total (first (.values result))]
                        (+ acc total)
                        acc))
                    0
                    result)
            period))))

(def query-cache (atom nil))
(def cache-millis (* 1000 60))

(defn total-queries-cached
  "Gets the total queries per second over the the last minute across all databases.
   Caches response for 1 minute."
  []
  (let [[cache-time cache-data] @query-cache
        now (.toEpochMilli (Instant/now))]
    (if (and cache-time
             (> (+ cache-time cache-millis)
                now))
      @cache-data
      (let [our-promise (promise)
            result-promise (second (swap! query-cache (fn [c]
                                                        (if (or (not (second c))
                                                                (= (second c) cache-data))
                                                          [now our-promise]
                                                          c))))]
        (when (= result-promise our-promise)
          (try
            (tracer/with-span! {:name "cloudwatch/total-queries-cached"}
              (let [resource-ids (all-rds-instance-ids)
                    total (total-db-queries-for-resources resource-ids)]
                (deliver result-promise total)))
            (catch Throwable _t
              (deliver result-promise (if (and cache-data (realized? cache-data))
                                        @cache-data
                                        1000)))))
        @result-promise))))
