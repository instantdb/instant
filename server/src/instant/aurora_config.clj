(ns instant.aurora-config
  (:require
   [instant.util.coll :as ucoll]
   [instant.util.json :refer [<-json]])
  (:import
   (software.amazon.awssdk.services.rds RdsClient)
   (software.amazon.awssdk.services.rds.model DBCluster
                                              DBClusterMember
                                              DBInstance
                                              DescribeDbClustersRequest
                                              DescribeDbInstancesRequest)
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
  (let [^RdsClient rds-client (-> (RdsClient/builder)
                                  (.build))
        request (-> (DescribeDbClustersRequest/builder)
                    (.dbClusterIdentifier cluster-id)
                    (.build))
        clusters (-> (.describeDBClusters rds-client
                                          ^DescribeDbClustersRequest request)
                     (.dbClusters))

        _ (assert (= 1 (count clusters))
                  (format "Could not determine db cluster, found %d clusters."
                          (count clusters)))
        ^DBCluster cluster (first clusters)
        writer-instance-id (some->> cluster
                                    (.dbClusterMembers)
                                    ^DBClusterMember (ucoll/seek (fn [^DBClusterMember m]
                                                                   (.isClusterWriter m)))
                                    (.dbInstanceIdentifier))
        _ (assert writer-instance-id "no writer instance")
        instance-request (-> (DescribeDbInstancesRequest/builder)
                             (.dbInstanceIdentifier writer-instance-id)
                             (.build))
        instances (-> (.describeDBInstances rds-client
                                            ^DescribeDbInstancesRequest instance-request)
                      (.dbInstances))
        _ (assert (= 1 (count instances))
                  (format "Could not determine db instance, found %d instances."
                          (count instances)))
        ^DBInstance instance (first instances)
        endpoint (-> instance
                     (.endpoint)
                     (.address))
        port (-> instance
                 (.endpoint)
                 (.port))
        dbname (.dbName instance)
        secret-arn (.secretArn (.masterUserSecret cluster))]
    (assert endpoint "missing endpoint")
    (assert port "missing port")
    (assert dbname "missing dbname")
    (assert secret-arn "missing secret-arn")
    {:dbtype "postgres"
     :dbname dbname
     :host endpoint
     :port port
     :secret-arn secret-arn
     :cluster-id cluster-id
     :instance-id writer-instance-id
     :cluster-status (.status cluster)}))
