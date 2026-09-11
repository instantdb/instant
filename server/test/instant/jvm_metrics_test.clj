(ns instant.jvm-metrics-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [instant.cloudwatch :as cloudwatch]
   [instant.jvm-metrics :as jvm-metrics])
  (:import
   (java.time Instant)
   (software.amazon.awssdk.services.cloudwatch.model Dimension MetricDatum StandardUnit)))

(def sample
  {:heap-used 90
   :heap-committed 100
   :heap-max 100
   :uptime-ms 120000
   :monotonic-ns 120000000000
   :collectors {"G1 Young Generation" {:time-ms 100 :count 2
                                      :after-gc {:end-ms 119000 :heap-used 35}}
                "G1 Old Generation" {:time-ms 0 :count 0}
                "G1 Concurrent GC" {:time-ms 5 :count 1
                                   :after-gc {:end-ms 100000 :heap-used 20}}}})

(deftest heap-pressure-uses-recent-collection-result
  (testing "Committed and transient used heap do not replace the latest after-GC result"
    (is (= {"UptimeSeconds" 120.0 "HeapPressurePercent" 35.0}
           (jvm-metrics/metrics nil sample))))
  (testing "The latest collection wins, regardless of collector type"
    (is (= 20.0 (get (jvm-metrics/metrics nil (assoc-in sample [:collectors "G1 Concurrent GC" :after-gc :end-ms] 119500))
                     "HeapPressurePercent"))))
  (testing "Old, absent, or future collection results fall back to current used heap"
    (doseq [collectors [(update-vals (:collectors sample) #(dissoc % :after-gc))
                       (update-vals (:collectors sample) #(cond-> % (:after-gc %) (assoc-in [:after-gc :end-ms] 0)))
                       (assoc-in (:collectors sample) ["G1 Young Generation" :after-gc :end-ms] 120001)]]
      (is (= 90.0 (get (jvm-metrics/metrics nil (assoc sample :collectors collectors)) "HeapPressurePercent")))))
  (testing "Undefined heap maximum is missing data, not a zero utilization sample"
    (is (not (contains? (jvm-metrics/metrics nil (assoc sample :heap-max -1)) "HeapPressurePercent")))))

(def next-sample
  (-> sample
      (update :uptime-ms + 30000)
      (update :monotonic-ns + 30000000000)
      (update-in [:collectors "G1 Young Generation" :time-ms] + 6000)
      (update-in [:collectors "G1 Young Generation" :count] inc)
      (update-in [:collectors "G1 Concurrent GC" :time-ms] + 1500)
      (update-in [:collectors "G1 Concurrent GC" :count] inc)))

(deftest gc-pressure-uses-counter-deltas
  (testing "G1 concurrent collector's stop-the-world phases contribute to pressure"
    (is (= 25.0 (get (jvm-metrics/metrics sample next-sample) "GcPausePercent"))))
  (testing "No collections is a measured zero only after a valid previous sample"
    (is (= 0.0 (get (jvm-metrics/metrics sample (assoc sample :uptime-ms 150000 :monotonic-ns 150000000000))
                    "GcPausePercent")))
    (is (not (contains? (jvm-metrics/metrics nil sample) "GcPausePercent"))))
  (testing "Counter resets, process restarts and missing sampling intervals cannot imply safety"
    (doseq [current [(assoc-in next-sample [:collectors "G1 Young Generation" :time-ms] 0)
                     (assoc-in next-sample [:collectors "G1 Young Generation" :count] 0)
                     (assoc next-sample :uptime-ms 100)
                     (assoc next-sample :monotonic-ns (:monotonic-ns sample))
                     (assoc next-sample :monotonic-ns 300000000000)
                     (update next-sample :collectors dissoc "G1 Concurrent GC")]]
      (is (not (contains? (jvm-metrics/metrics sample current) "GcPausePercent")))))
  (testing "Boundary accounting cannot publish percentages above 100"
    (is (= 100.0 (get (jvm-metrics/metrics sample (assoc-in next-sample [:collectors "G1 Young Generation" :time-ms] 60000))
                      "GcPausePercent")))))

(deftest unsupported-collectors-omit-pressure
  (doseq [collectors [{"ZGC Cycles" {:time-ms 0 :count 0}}
                     (assoc (:collectors sample) "Unknown collector" {:time-ms 0 :count 0})
                     (assoc-in (:collectors sample) ["G1 Old Generation" :time-ms] -1)
                     (dissoc (:collectors sample) "G1 Old Generation")]]
    (is (= {"UptimeSeconds" 120.0}
           (jvm-metrics/metrics nil (assoc sample :collectors collectors))))))

(deftest cloudwatch-metrics-include-node-and-group-dimensions
  (let [now (Instant/parse "2026-09-11T22:00:00Z")
        _ (.clear cloudwatch/captured-metric-data)
        values (jvm-metrics/metrics sample next-sample)
        _ (jvm-metrics/record-metrics! @cloudwatch/write-cloudwatch-client
                                      {:asg-name "test-group" :instance-id "i-test"}
                                      now values)
        captured (mapv (fn [^MetricDatum datum]
                         {:name (.metricName datum)
                          :value (.value datum)
                          :unit (.unit datum)
                          :timestamp (.timestamp datum)
                          :dimensions (into {} (map (fn [^Dimension d] [(.name d) (.value d)]))
                                            (.dimensions datum))})
                       cloudwatch/captured-metric-data)
        by-name (group-by :name captured)]
    (is (= 5 (count captured)))
    (is (every? #(= now (:timestamp %)) captured))
    (is (= [{:name "UptimeSeconds" :value 150.0 :unit StandardUnit/SECONDS :timestamp now
             :dimensions {"AutoScalingGroupName" "test-group" "InstanceId" "i-test"}}]
           (get by-name "UptimeSeconds")))
    (doseq [name ["HeapPressurePercent" "GcPausePercent"]]
      (is (= #{{"AutoScalingGroupName" "test-group" "InstanceId" "i-test"}
               {"AutoScalingGroupName" "test-group"}}
             (set (map :dimensions (get by-name name)))))
      (is (every? #(= StandardUnit/PERCENT (:unit %)) (get by-name name)))
      (is (every? #(= (get values name) (:value %)) (get by-name name))))))
