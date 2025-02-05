(ns instant.util.aws
  (:require [clj-http.client :as clj-http]
            [instant.util.coll :as ucoll])
  (:import
   (java.time Instant)
   (software.amazon.awssdk.services.ec2 Ec2Client)
   (software.amazon.awssdk.services.ec2.model DescribeInstancesRequest
                                              DescribeInstancesResponse
                                              Filter
                                              Instance
                                              Reservation
                                              Tag)))

(set! *warn-on-reflection* true)

(def environment-tag-name "elasticbeanstalk:environment-name")

(defn get-instance-id ^String []
  (let [token (-> (clj-http/put

                   "http://169.254.169.254/latest/api/token"
                   {:headers {"X-aws-ec2-metadata-token-ttl-seconds" "21600"}})
                  :body)]
    (-> (clj-http.client/get
         "http://169.254.169.254/latest/meta-data/instance-id"
         {:headers {"X-aws-ec2-metadata-token" token}})
        :body)))

(defn get-tag
  "Gets instance id from the metadata API
   https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/instancedata-data-retrieval.html
   Then fetches the instance info from the aws api to get the tags."
  [tag-name]
  (let [^java.util.Collection instance-ids [(get-instance-id)]
        ^Ec2Client client (.build (Ec2Client/builder))
        ^DescribeInstancesRequest req (-> (DescribeInstancesRequest/builder)
                                          (.instanceIds instance-ids)
                                          (.build))
        ^DescribeInstancesResponse resp (.describeInstances client req)]
    (some->> resp
             (.reservations)
             first
             (#(.instances ^Reservation % ))
             first
             (#(.tags ^Instance %))
             (filter (fn [^Tag t]
                       (= (.key t) tag-name)))
             first
             (#(.value ^Tag %)))))

(defn get-environment-tag []
  (get-tag environment-tag-name))

(defn get-instance-ip
  "Gets ip from the metadata API:
   https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/instancedata-data-retrieval.html"
  []
  (let [token (-> (clj-http/put
                   "http://169.254.169.254/latest/api/token"
                   {:headers {"X-aws-ec2-metadata-token-ttl-seconds" "21600"}})
                  :body)]
    (-> (clj-http.client/get
         "http://169.254.169.254/latest/meta-data/local-ipv4"
         {:headers {"X-aws-ec2-metadata-token" token}})
        :body)))

(defn oldest-instance-timestamp
  ([]
   (oldest-instance-timestamp (get-environment-tag)))
  ([^String env-tag-value]
   (let [^Ec2Client client (.build (Ec2Client/builder))
         filters (ucoll/array-of Filter [(-> (Filter/builder)
                                             (.name (str "tag:" environment-tag-name))
                                             (.values (ucoll/array-of String [env-tag-value]))
                                             (.build))])
         ^DescribeInstancesRequest req (-> (DescribeInstancesRequest/builder)
                                           (.filters filters)
                                           (.build))
         ^DescribeInstancesResponse resp (.describeInstances client req)]
     (some->> resp
              (.reservations)
              (mapcat (fn [^Reservation r] (.instances r)))
              (map (fn [^Instance i] (.launchTime i)))
              sort
              first
              (#(.toEpochMilli ^Instant %))))))
