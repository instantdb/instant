(ns instant.aurora-config
  (:require
   [instant.util.json :refer [<-json]])
  (:import
   (software.amazon.awssdk.services.rds RdsClient)
   (software.amazon.awssdk.services.rds.model DBCluster DescribeDbClustersRequest)
   (software.amazon.awssdk.services.secretsmanager SecretsManagerClient)
   (software.amazon.awssdk.services.secretsmanager.model GetSecretValueRequest)))

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
                  (<-json true))
        {:keys [username password]} creds]
    (assert username "missing username")
    (assert password "missing password")
    {:user username
     :password password}))

(defn rds-cluster-id->db-config [cluster-id]
  (let [rds-client (-> (RdsClient/builder)
                       (.build))
        request (-> (DescribeDbClustersRequest/builder)
                    (.dbClusterIdentifier cluster-id)
                    (.build))
        clusters (-> (.describeDBClusters ^RdsClient rds-client
                                          ^DescribeDbClustersRequest request)
                     (.dbClusters))

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
    {:dbtype "postgres"
     :dbname dbname
     :host endpoint
     :port port
     :secret-arn secret-arn}))
