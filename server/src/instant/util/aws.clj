(ns instant.util.aws
  (:require [clj-http.client :as clj-http]
            [amazonica.aws.ec2 :as ec2]))

(def environment-tag-name "elasticbeanstalk:environment-name")

(defn get-tag
  "Gets instance id from the metadata API
   https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/instancedata-data-retrieval.html
   Then fetches the instance info from the aws api to get the tags."
  [tag-name]
  (let [token (-> (clj-http/put

                   "http://169.254.169.254/latest/api/token"
                   {:headers {"X-aws-ec2-metadata-token-ttl-seconds" "21600"}})
                  :body)
        instance-id (-> (clj-http.client/get
                         "http://169.254.169.254/latest/meta-data/instance-id"
                         {:headers {"X-aws-ec2-metadata-token" token}})
                        :body)]
    (->> (ec2/describe-instances {:instance-ids [instance-id]})
         :reservations
         first
         :instances
         first
         :tags
         (filter (fn [t] (= (:key t) tag-name)))
         first
         :value)))

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

(defn oldest-instance-timestamp []
  (some->> (ec2/describe-instances
            {:filters [{:Name (str "tag:" environment-tag-name)
                        :Values [(get-environment-tag)]}]})
           :reservations
           (mapcat :instances)
           (map :launch-time)
           sort
           first
           (.getMillis)))
