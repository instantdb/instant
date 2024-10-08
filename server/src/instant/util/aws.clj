(ns instant.util.aws
  (:require [clj-http.client :as clj-http]
            [amazonica.aws.ec2 :as ec2]))

(def environment-tag-name "elasticbeanstalk:environment-name")

(defn get-tag [tag-name]
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

(defn get-instance-ip []
  (let [token (-> (clj-http/put
                   "http://169.254.169.254/latest/api/token"
                   {:headers {"X-aws-ec2-metadata-token-ttl-seconds" "21600"}})
                  :body)]
    (-> (clj-http.client/get
         "http://169.254.169.254/latest/meta-data/local-ipv4"
         {:headers {"X-aws-ec2-metadata-token" token}})
        :body)))
