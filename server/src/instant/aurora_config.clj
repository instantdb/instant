(ns instant.aurora-config
  (:require
   [clojure.set]
   [instant.util.json :refer [<-json]])
  (:import
   (software.amazon.awssdk.services.secretsmanager SecretsManagerClient)
   (software.amazon.awssdk.services.secretsmanager.model GetSecretValueRequest
                                                         GetSecretValueResponse)
   (software.amazon.awssdk.services.rds RdsClient)
   (software.amazon.awssdk.services.rds.model DBCluster
                                              DescribeDbClustersRequest
                                              DescribeDbClustersResponse)))

(set! *warn-on-reflection* true)

(def secrets-manager-client* (delay (.build (SecretsManagerClient/builder))))
(defn secrets-manager-client ^SecretsManagerClient []
  @secrets-manager-client*)

(defn secret-arn->db-creds [secret-arn]
  (let [request (-> (GetSecretValueRequest/builder)
                    (.secretId secret-arn)
                    (.build))
        creds (-> (.getSecretValue (secrets-manager-client)
                                   ^GetSecretValueRequest request)

                  (.secretString)
                  (#(<-json % true)))]
    (assert (:username creds) "missing username")
    (assert (:password creds) "missing password")
    creds))

(defn rds-cluster-id->db-config [cluster-id]
  (let [rds-client (-> (RdsClient/builder)
                       (.build))
        request (-> (DescribeDbClustersRequest/builder)
                    (.dbClusterIdentifier cluster-id)
                    (.build))
        clusters (-> (.describeDBClusters ^RdsClient rds-client
                                          ^DescribeDbClustersRequest request)
                     (.dbClusters))

        _ (tool/def-locals)
        _ (assert (= 1 (count clusters))

                  (format "Could not determine db cluster, found %d clusters."
                          (count clusters)))
        ^DBCluster cluster (first clusters)
        endpoint (.endpoint cluster)
        port (.port cluster)
        dbname (.databaseName cluster)
        secret-arn (.secretArn (.masterUserSecret cluster))]
    (assert endpoint "missing endpoint")
    (assert port "missing port")
    (assert dbname "missing dbname")
    (assert secret-arn "missing secret-arn")
    (tool/def-locals)
    {:dbtype "postgres"
     :dbname dbname
     :host endpoint
     :port port
     :secret-arn secret-arn}))
