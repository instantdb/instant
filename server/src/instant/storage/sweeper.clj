(ns instant.storage.sweeper
  (:require
   [chime.core :as chime-core]
   [instant.storage.s3 :as instant-s3]
   [instant.util.s3 :as s3-util]
   [instant.util.tracer :as tracer]
   [clojure.tools.logging :as log]
   [instant.jdbc.aurora :as aurora]
   [honey.sql :as hsql]
   [instant.jdbc.sql :as sql]
   [instant.config :as config]
   [instant.discord :as discord])

  (:import
   (java.time Duration Instant)
   (java.lang AutoCloseable)
   (java.time.temporal ChronoUnit)))

(def max-loops 10) ;; max loops per sweep job
(def batch-size 1000) ;; max number of files to process in one loop

(defn ms-between [^Instant start ^Instant end]
  (.between ChronoUnit/MILLIS start end))

(defn span-attrs [{:keys [loops max-loops start-ms app-id limit]}]
  {:loops loops
   :max-loops max-loops
   :limit limit
   :app-id app-id
   :start-at (str start-ms)
   :end-at (str (Instant/now))
   :run-time-ms (ms-between start-ms (Instant/now))})

(defn files-available-wheres []
  [:or
   [:is :process-id nil]
   [:and
    [:is-not :process-id nil]
    [:< :updated-at
     [:- :%now [:raw "interval '5 minutes'"]]]]])

(defn claim-files!
  ([params]
   (claim-files! (aurora/conn-pool :write) params))
  ([conn {:keys [app-id limit]}]
   (sql/execute! ::claim-files!
                 conn
                 (hsql/format
                  {:with [[:to-update
                           {:select [:id]
                            :from :app-files-to-sweep
                            :where (if app-id
                                     [:and
                                      [:= :app-id app-id]
                                      (files-available-wheres)]
                                     (files-available-wheres))
                            :order-by :created-at
                            :for "UPDATE SKIP LOCKED"
                            :limit limit}]]
                   :update :app-files-to-sweep
                   :set {:process-id @config/process-id
                         :updated-at :%now}
                   :where [:in :id {:select [:id]
                                    :from :to-update}]
                   :returning [:*]}))))

(defn delete-files!
  ([params]
   (delete-files! (aurora/conn-pool :write) params))
  ([conn {:keys [ids]}]
   (sql/execute! ::delete-files!
                 conn
                 (hsql/format
                  {:delete-from :app-files-to-sweep
                   :where [:in :id ids]
                   :returning [:id]}))))

(defn process-sweep!
  ([params]
   (process-sweep! (aurora/conn-pool :write) params))
  ([conn {:keys [app-id limit]}]
   (tracer/with-span! {:name "storage-sweeper/process-sweep!"}
     (let [files (claim-files! conn {:app-id app-id :limit limit})
           keys-to-delete
           (mapv #(instant-s3/->object-key (:app_id %) (:location_id %)) files)]
       (when (seq keys-to-delete)
         (s3-util/delete-objects (instant-s3/s3-client) instant-s3/bucket-name keys-to-delete)
         (delete-files! conn {:ids (mapv :id files)}))))))

(defn warn-too-many-loops!
  [{:keys [current-loop max-loops start-ms app-id limit]}]
  (when (= :prod (config/get-env))
    (discord/send-error-async!
     (str (:nezaj discord/mention-constants)
          " Storage sweeper processed more than "
          max-loops
          " loops in one job, it may be backed up!")))
  (tracer/record-info!
   {:name "storage-sweeper/warn-too-many-loops!"
    :attributes (span-attrs {:current-loop current-loop
                             :start-ms start-ms
                             :limit limit
                             :app-id app-id})})
  {:warn true})

(defn handle-sweep!
  ([params] (handle-sweep! (aurora/conn-pool :write) params))
  ([conn {:keys [app-id max-loops limit]
          :or {max-loops 10
               limit batch-size}}]
   (tracer/with-span! {:name "storage-sweeper/handle-sweep!"}
     (let [start-ms (Instant/now)
           loop-num 1]
       (loop [current-loop loop-num]
         (if (<= current-loop max-loops)
           (let [n-deleted (count (process-sweep! conn {:app-id app-id
                                                        :limit limit}))]
             (if (or (< n-deleted limit) (zero? n-deleted))
               (tracer/record-info!
                {:name "storage-sweeper/finsh-sweep!"
                 :attributes (span-attrs {:loops current-loop
                                          :max-loops max-loops
                                          :start-ms start-ms
                                          :limit limit
                                          :app-id app-id})})

               (recur (inc current-loop))))
           (warn-too-many-loops!
            {:current-loop current-loop
             :max-loops max-loops
             :start-ms start-ms
             :app-id app-id})))))))

(defonce schedule (atom nil))

(defn start []
  (log/info "Starting storage sweeper daemon")
  (swap! schedule (fn [curr-schedule]
                    (if curr-schedule
                      curr-schedule
                      (chime-core/chime-at
                       (chime-core/periodic-seq
                        (Instant/now)
                        (Duration/ofMinutes 60))
                       (fn [_time]
                         (handle-sweep! {:max-loops 10})))))))

(defn stop []
  (when-let [curr-schedule @schedule]
    (.close ^AutoCloseable curr-schedule)
    (reset! schedule nil)))

(defn restart []
  (stop)
  (start))
