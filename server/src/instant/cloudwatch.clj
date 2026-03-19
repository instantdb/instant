(ns instant.cloudwatch
  (:require
   [clojure.string]
   [instant.util.coll :as ucoll]
   [instant.util.crypt :as crypt-util]
   [instant.util.tracer :as tracer])
  (:import
   (java.time Instant)
   (java.time.temporal ChronoUnit)
   (software.amazon.awssdk.services.cloudwatch CloudWatchClient)
   (software.amazon.awssdk.services.cloudwatch.model GetMetricDataRequest GetMetricDataResponse MetricDataQuery MetricDataResult ScanBy)
   (software.amazon.awssdk.services.rds RdsClient)
   (software.amazon.awssdk.services.rds.model DBInstance DescribeDbInstancesRequest)))

;; XXX: Check that we've got the permissions here
(defonce cloudwatch-client (delay (CloudWatchClient/create)))

(defonce rds-client (delay (-> (RdsClient/builder)
                               (.build))))

(defn all-rds-instance-ids []
  (let [^RdsClient client @rds-client
        ^DescribeDbInstancesRequest req (-> (DescribeDbInstancesRequest/builder) .build)
        response (.describeDBInstances client req)]
    (->> (.dbInstances response)
         (filter #(.performanceInsightsEnabled ^DBInstance %))
         (mapv (fn [^DBInstance i]
                 (.dbiResourceId i))))))

(defn total-db-queries-for-resources [resource-ids]
  (let [^CloudWatchClient client @cloudwatch-client
        now (Instant/now)
        start (.minus now 2 ChronoUnit/MINUTES)

        queries (mapcat (fn [resource-id]
                          (let [m-id (str "m_" (crypt-util/random-hex 8))

                                m (-> (MetricDataQuery/builder)
                                      (.id m-id)
                                      (.expression (format "DB_PERF_INSIGHTS('RDS', '%s',
                                                            ['db.SQL.queries_started.avg',
                                                             'db.Transactions.xact_commit.avg',
                                                             'db.Transactions.xact_rollback.avg'])"
                                                           resource-id))
                                      (.period (int 60))
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
        ^MetricDataResult result (.metricDataResults response)]
    (int (reduce (fn [acc ^MetricDataResult result]
                   (+ acc (first (.values result))))
                 0
                 result))))

(def query-cache (atom nil))
(def cache-millis (* 1000 60))

(defn total-queries-cached []
  (let [[cache-time cache-data] @query-cache
        now (.toEpochMilli (Instant/now))]
    (if (and cache-time
             (> (+ cache-time cache-millis)
                (.toEpochMilli (Instant/now))))
      @cache-data
      (let [our-promise (promise)
            result-promise (second (swap! query-cache (fn [c]
                                                        (if (or (not cache-data)
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
              (deliver result-promise 1000))))
        @result-promise))))
