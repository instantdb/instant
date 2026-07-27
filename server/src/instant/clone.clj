(ns instant.clone
  "Creates a copy-on-write Aurora clone of the production cluster so that we can
   run long-lived, snapshot-holding reads (e.g. the nightly backup) against a
   throwaway cluster instead of the primary.

   A clone is a separate cluster with copy-on-write storage: near-instant to
   create, cheap while it lives, and torn down when we're done. Use `with-clone`
   so teardown is guaranteed even on failure."
  (:require
   [clojure.string]
   [instant.aurora-config :as aurora-config]
   [instant.config :as config]
   [instant.jdbc.aurora :as aurora]
   [instant.util.coll :as ucoll]
   [instant.util.tracer :as tracer])
  (:import
   (java.time LocalTime ZoneOffset)
   (java.time.format DateTimeFormatter)
   (software.amazon.awssdk.services.rds RdsClient)
   (software.amazon.awssdk.services.rds.model CreateDbInstanceRequest DBCluster DBClusterMember DBInstance DeleteDbClusterRequest DeleteDbInstanceRequest DescribeDbClustersRequest DescribeDbInstancesRequest ModifyDbClusterRequest RestoreDbClusterToPointInTimeRequest Tag VpcSecurityGroupMembership)))

(set! *warn-on-reflection* true)

(def rds-client* (delay (.build (RdsClient/builder))))
(defn rds-client ^RdsClient []
  @rds-client*)

;; ---------
;; describes

(defn describe-cluster ^DBCluster [cluster-id]
  (let [request (-> (DescribeDbClustersRequest/builder)
                    (.dbClusterIdentifier cluster-id)
                    (.build))
        clusters (-> (.describeDBClusters (rds-client)
                                          ^DescribeDbClustersRequest request)
                     (.dbClusters))]
    (assert (= 1 (count clusters))
            (format "Expected 1 cluster for %s, found %d." cluster-id (count clusters)))
    (first clusters)))

(defn describe-instance ^DBInstance [instance-id]
  (let [request (-> (DescribeDbInstancesRequest/builder)
                    (.dbInstanceIdentifier instance-id)
                    (.build))
        instances (-> (.describeDBInstances (rds-client)
                                            ^DescribeDbInstancesRequest request)
                      (.dbInstances))]
    (assert (= 1 (count instances))
            (format "Expected 1 instance for %s, found %d." instance-id (count instances)))
    (first instances)))

(defn writer-instance-id [^DBCluster cluster]
  (some->> (.dbClusterMembers cluster)
           ^DBClusterMember (ucoll/seek (fn [^DBClusterMember m]
                                          (.isClusterWriter m)))
           (.dbInstanceIdentifier)))

(defn default-source-cluster-id []
  (or (System/getenv "DATABASE_CLUSTER_ID")
      (:cluster-id (config/get-aurora-config))))

;; ------
;; naming

(defn gen-clone-id
  "RDS identifiers must start with a letter, be <=63 chars, and contain only
   ASCII letters, digits, and single hyphens."
  []
  (str "instant-clone-" (subs (str (random-uuid)) 0 12)))

(def window-fmt (DateTimeFormatter/ofPattern "HH:mm"))

(defn- minutes-since-midnight [^LocalTime t]
  (+ (* 60 (.getHour t)) (.getMinute t)))

(defn- parse-maintenance-window-times [maintenance-window]
  (when-let [[_ start end] (some->> maintenance-window
                                    (re-find #"(?i)[a-z]{3}:(\d\d:\d\d)-[a-z]{3}:(\d\d:\d\d)"))]
    [(minutes-since-midnight (LocalTime/parse start window-fmt))
     (minutes-since-midnight (LocalTime/parse end window-fmt))]))

(defn- parse-backup-window-times [backup-window]
  (when-let [[_ start end] (some->> backup-window
                                    (re-find #"(\d\d:\d\d)-(\d\d:\d\d)"))]
    [(minutes-since-midnight (LocalTime/parse start window-fmt))
     (minutes-since-midnight (LocalTime/parse end window-fmt))]))

(defn- window-segments [[start end]]
  (if (< start end)
    [[start end]]
    [[start (* 24 60)]
     [0 end]]))

(defn- windows-overlap? [a b]
  (boolean
   (some (fn [[a-start a-end]]
           (some (fn [[b-start b-end]]
                   (and (< a-start b-end)
                        (< b-start a-end)))
                 (window-segments b)))
         (window-segments a))))

(defn- backup-window [hours-from-now]
  (let [start (-> (LocalTime/now ZoneOffset/UTC)
                  (.withMinute 0)
                  (.withSecond 0)
                  (.withNano 0)
                  (.plusHours hours-from-now))
        end (.plusMinutes start 30)]
    {:window (str (.format start window-fmt) "-" (.format end window-fmt))
     :range [(minutes-since-midnight start)
             (minutes-since-midnight end)]}))

(defn farthest-backup-window
  "A 30-minute PreferredBackupWindow ~12 hours from now (UTC) — as far from the
   current time as a 24-hour clock allows. Aurora forces >=1 day of backups, but
   a short-lived clone is usually deleted before this window arrives. If that
   overlaps the source's inherited maintenance window, try nearby hours."
  [^DBCluster source]
  (let [maintenance-range (parse-maintenance-window-times (.preferredMaintenanceWindow source))]
    (or (->> (range 12 36)
             (map backup-window)
             (ucoll/seek (fn [{:keys [range]}]
                           (not (and maintenance-range
                                     (windows-overlap? range maintenance-range)))))
             :window)
        (throw (ex-info "Could not choose a backup window that avoids maintenance."
                        {:source-cluster-id (.dbClusterIdentifier source)
                         :preferred-maintenance-window (.preferredMaintenanceWindow source)})))))

(defn farthest-maintenance-window
  "A 30-minute PreferredMaintenanceWindow near the generated backup window, but
   never overlapping the clone's actual backup window."
  [^DBCluster clone]
  (let [backup-range (parse-backup-window-times (.preferredBackupWindow clone))
        window (or (->> (range 13 37)
                        (map backup-window)
                        (ucoll/seek (fn [{:keys [range]}]
                                      (not (and backup-range
                                                (windows-overlap? range backup-range)))))
                        :window)
                   (throw (ex-info "Could not choose a maintenance window that avoids backups."
                                   {:clone-cluster-id (.dbClusterIdentifier clone)
                                    :preferred-backup-window (.preferredBackupWindow clone)})))
        [start end] (clojure.string/split window #"-")]
    (str "sun:" start "-sun:" end)))

;; ------
;; create

(defn- restore-clone-cluster!
  "Clones `source` as a copy-on-write clone, reusing its networking so the clone
   is reachable from the same VPC. `useLatestRestorableTime` points the clone at
   the source's latest restorable volume data — this is the documented way to
   clone. (A point-in-time RestoreToTime is what's rejected for copy-on-write.)"
  [{:keys [^DBCluster source clone-cluster-id tags]}]
  (let [sg-ids (mapv (fn [^VpcSecurityGroupMembership m]
                       (.vpcSecurityGroupId m))
                     (.vpcSecurityGroups source))
        request (-> (RestoreDbClusterToPointInTimeRequest/builder)
                    (.dbClusterIdentifier clone-cluster-id)
                    (.sourceDBClusterIdentifier (.dbClusterIdentifier source))
                    (.restoreType "copy-on-write")
                    (.useLatestRestorableTime true)
                    (.preferredBackupWindow (farthest-backup-window source))
                    (.dbSubnetGroupName (.dbSubnetGroup source))
                    (.vpcSecurityGroupIds (ucoll/array-of String sg-ids))
                    (.port (.port source))
                    (.tags (ucoll/array-of Tag tags))
                    (.build))]
    (.restoreDBClusterToPointInTime (rds-client)
                                    ^RestoreDbClusterToPointInTimeRequest request)))

(defn- add-clone-instance!
  [{:keys [clone-cluster-id instance-id instance-class engine
           publicly-accessible availability-zone tags]}]
  (let [request (-> (CreateDbInstanceRequest/builder)
                    (.dbInstanceIdentifier instance-id)
                    (.dbClusterIdentifier clone-cluster-id)
                    (.dbInstanceClass instance-class)
                    (.engine engine)
                    (.publiclyAccessible ^Boolean publicly-accessible)
                    (.availabilityZone availability-zone)
                    (.monitoringInterval 0)
                    (.tags (ucoll/array-of Tag tags))
                    (.build))]
    (.createDBInstance (rds-client) ^CreateDbInstanceRequest request)))

(defn- wait-until-cluster-available! [cluster-id]
  (let [request (-> (DescribeDbClustersRequest/builder)
                    (.dbClusterIdentifier cluster-id)
                    (.build))]
    (-> (.waiter (rds-client))
        (.waitUntilDBClusterAvailable ^DescribeDbClustersRequest request))))

(defn- wait-until-instance-available! [instance-id]
  (let [request (-> (DescribeDbInstancesRequest/builder)
                    (.dbInstanceIdentifier instance-id)
                    (.build))]
    (-> (.waiter (rds-client))
        (.waitUntilDBInstanceAvailable ^DescribeDbInstancesRequest request))))

(defn- enable-managed-master-password!
  "Gives the clone its own password in a fresh managed Secrets Manager secret,
   applied immediately, so it never shares the primary's credentials. The
   restore-to-point-in-time API doesn't support this. Also moves maintenance to
   a generated window that does not overlap our generated backup window."
  [clone-cluster-id]
  (let [clone (describe-cluster clone-cluster-id)
        request (-> (ModifyDbClusterRequest/builder)
                    (.dbClusterIdentifier clone-cluster-id)
                    (.manageMasterUserPassword true)
                    (.preferredMaintenanceWindow (farthest-maintenance-window clone))
                    (.applyImmediately true)
                    (.build))]
    (.modifyDBCluster (rds-client) ^ModifyDbClusterRequest request)))

(defn- wait-for-master-secret-arn!
  "Polls the clone's managed master user secret until it's active (RDS creates it
   asynchronously after we enable a managed password), returning its ARN."
  [clone-cluster-id]
  (loop [tries 0]
    (let [secret (.masterUserSecret (describe-cluster clone-cluster-id))
          status (some-> secret (.secretStatus))]
      (cond
        (= "active" status)
        (.secretArn secret)

        (>= tries 60)
        (throw (ex-info "Clone master user secret never became active."
                        {:clone-cluster-id clone-cluster-id :status status}))

        :else
        (do (Thread/sleep 5000)
            (recur (inc tries)))))))

(defn clone-db-config
  "Shapes a db-config for the clone that mirrors `config/get-aurora-config`, so
   it's a drop-in for the code that consumes the prod config."
  [clone-cluster-id]
  (assoc (aurora-config/rds-cluster-id->db-config clone-cluster-id (config/db-application-name))
         ;; Make sure we can use this for a copy command that shuttles lots of data
         ;; More details: https://bugs.openjdk.org/browse/JDK-8329548
         :sslfactory "instant.jdbc.Tls12SocketFactory"))

(defn start-clone-pool
  [pool-size clone-cluster-id]
  (aurora/start-pool pool-size (clone-db-config clone-cluster-id)))

(defn stop-clone-pool [pool]
  (aurora/close-pool pool))

(defn create-clone!
  "Creates a copy-on-write clone of `:source-cluster-id` (defaults to the prod
   cluster) on a `instance-class` instance (e.g. \"db.r8gd.xlarge\" — pass a small
   one, the clone only serves read-only backup scans), waits until it's
   queryable, and returns:

     {:cluster-id   <clone cluster id>
      :instance-id  <clone instance id>
      :snapshot-time  <Instant the clone was restored to>}

   The clone gets its own managed Secrets Manager secret; it never shares the
   primary's password.

   The clone reflects the source's current state (copy-on-write clones can't be
   taken at a historical point-in-time).

   Parameters:
     :instance-class - aws instance class, e.g. db.r8gd.xlarge
     :source-cluster-id - id of the cluster to clone"
  [{:keys [instance-class source-cluster-id]}]
  (assert instance-class "instance-class is required (e.g. \"db.r8gd.xlarge\")")
  (assert source-cluster-id "source-cluster-id is required")
  (let [clone-cluster-id (gen-clone-id)
        instance-id (str clone-cluster-id "-0")
        tags [(-> (Tag/builder) (.key "instant:purpose") (.value "clone") (.build))
              (-> (Tag/builder) (.key "instant:source-cluster") (.value source-cluster-id) (.build))]]
    (tracer/with-span! {:name "clone/create"
                        :attributes {:source-cluster-id source-cluster-id
                                     :clone-cluster-id clone-cluster-id
                                     :instance-class instance-class}}
      (let [source (describe-cluster source-cluster-id)
            writer (describe-instance (writer-instance-id source))
            publicly-accessible (.publiclyAccessible writer)
            ;; Put the clone's instance in the same AZ as the source writer.
            availability-zone (.availabilityZone writer)
            ;; The clone forks at the source's latest restorable time (we use
            ;; useLatestRestorableTime), so that — not now() — is the point-in-time
            ;; the clone's data represents. Read before the restore, so it's a
            ;; lower bound on the true fork point.
            snapshot-time (.latestRestorableTime source)]
        (tracer/with-span! {:name "clone/restore-cluster"}
          (restore-clone-cluster! {:source source
                                   :clone-cluster-id clone-cluster-id
                                   :tags tags}))
        ;; An instance can only be added once the restored cluster is available.
        (tracer/with-span! {:name "clone/wait-cluster-available"}
          (wait-until-cluster-available! clone-cluster-id))
        (tracer/with-span! {:name "clone/add-instance"
                            :attributes {:availability-zone availability-zone
                                         :publicly-accessible publicly-accessible}}
          (add-clone-instance! {:clone-cluster-id clone-cluster-id
                                :instance-id instance-id
                                :instance-class instance-class
                                :engine (.engine source)
                                :publicly-accessible publicly-accessible
                                :availability-zone availability-zone
                                :tags tags}))
        (tracer/with-span! {:name "clone/wait-instance-available"}
          (wait-until-instance-available! instance-id))
        (tracer/with-span! {:name "clone/enable-managed-password"}
          (enable-managed-master-password! clone-cluster-id))
        (tracer/with-span! {:name "clone/wait-master-secret"}
          (wait-for-master-secret-arn! clone-cluster-id))
        {:cluster-id clone-cluster-id
         :instance-id instance-id
         :snapshot-time snapshot-time}))))

;; ------
;; delete

(defn- delete-instance! [instance-id]
  (let [request (-> (DeleteDbInstanceRequest/builder)
                    (.dbInstanceIdentifier instance-id)
                    (.skipFinalSnapshot true)
                    (.deleteAutomatedBackups true)
                    (.build))]
    (.deleteDBInstance (rds-client) ^DeleteDbInstanceRequest request)
    (let [describe (-> (DescribeDbInstancesRequest/builder)
                       (.dbInstanceIdentifier instance-id)
                       (.build))]
      (-> (.waiter (rds-client))
          (.waitUntilDBInstanceDeleted ^DescribeDbInstancesRequest describe)))))

(defn- delete-cluster! [cluster-id]
  (let [request (-> (DeleteDbClusterRequest/builder)
                    (.dbClusterIdentifier cluster-id)
                    (.skipFinalSnapshot true)
                    (.deleteAutomatedBackups true)
                    (.build))]
    (.deleteDBCluster (rds-client) ^DeleteDbClusterRequest request)))

(defn- cluster-instance-ids [cluster-id]
  (->> (.dbClusterMembers (describe-cluster cluster-id))
       (mapv (fn [^DBClusterMember m] (.dbInstanceIdentifier m)))))

(defn delete-clone!
  "Tears down a clone created by `create-clone!`. Deletes the instance first
   (waiting for it to drain) since a cluster can't be deleted while it still has
   members. Asserts the clone has the single instance we create, so we never
   silently leave one behind."
  [cluster-id]
  (tracer/with-span! {:name "clone/delete"
                      :attributes {:clone-cluster-id cluster-id}}
    (when cluster-id
      (let [instance-ids (cluster-instance-ids cluster-id)]
        (assert (= 1 (count instance-ids))
                (format "Expected clone %s to have 1 instance, found %d."
                        cluster-id (count instance-ids)))
        (tracer/with-span! {:name "clone/delete-instance"
                            :attributes {:instance-id (first instance-ids)}}
          (delete-instance! (first instance-ids)))
        (tracer/with-span! {:name "clone/delete-cluster"
                            :attributes {:clone-cluster-id cluster-id}}
          (delete-cluster! cluster-id))))))
