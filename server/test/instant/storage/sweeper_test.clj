(ns instant.storage.sweeper-test
  (:require [clojure.test :as test :refer [deftest testing is]]
            [instant.model.app-file :as app-file]
            [instant.storage.sweeper :as sweeper]
            [instant.jdbc.aurora :as aurora]
            [instant.jdbc.sql :as sql]
            [instant.util.test :refer [wait-for]]
            [instant.fixtures :refer [with-empty-app]]
            [clojure.core.async :as a]
            [honey.sql :as hsql]))

(defn delete-sweep-files!
  [conn app-id]
  (sql/execute! ::delete-files
                conn
                (hsql/format
                 {:delete-from :app-files-to-sweep
                  :where [:= :app-id app-id]
                  :returning [:id]})))

(defn count-files-to-sweep [conn app-id]
  (-> (sql/select-one ::count-files
                      conn
                      (hsql/format
                       {:select [[[:count :*] :count]]
                        :from :app-files-to-sweep
                        :where [:= :app-id app-id]}))
      :count))

(defn with-queue [f]
  (let [chan (a/chan 10)
        process (future (sweeper/start-process chan))]
    (try
      (f chan)
      (finally
        (a/close! chan)
        (when (= :timeout (deref process 1000 :timeout))
          (throw (Exception. "Timeout in with-queue")))))))

(deftest test-sweeper-basic-operations
  (with-empty-app
    (fn [app]
      (testing "creating a new file doesn't create sweep entries"
        (let [app-id (:id app)
              conn (aurora/conn-pool :write)]
          (app-file/create! conn
                            {:app-id app-id
                             :path "test.jpg"
                             :location-id "loc1"
                             :metadata {:size 100
                                        :content-type "image/jpeg"
                                        :content-disposition "inline"}})
          (is (zero? (count-files-to-sweep conn app-id)))))

      (testing "deleting non-existent file doesn't create sweep entries"
        (let [app-id (:id app)
              conn (aurora/conn-pool :write)]
          (app-file/delete-by-path! conn
                                    {:app-id app-id
                                     :path "nonexistent.jpg"})
          (is (zero? (count-files-to-sweep conn app-id)))))

      (testing "creating and deleting file creates sweep entry"
        (let [app-id (:id app)
              conn (aurora/conn-pool :write)]
          (app-file/create! conn
                            {:app-id app-id
                             :path "test.jpg"
                             :location-id "loc1"
                             :metadata {:size 100
                                        :content-type "image/jpeg"
                                        :content-disposition "inline"}})
          (app-file/delete-by-path! conn
                                    {:app-id app-id
                                     :path "test.jpg"})
          (is (= 1 (count-files-to-sweep conn app-id)))
          (delete-sweep-files! conn app-id)))

      (testing "updating file with same path creates sweep entry"
        (let [app-id (:id app)
              conn (aurora/conn-pool :write)]

          ;; Create initial file
          (app-file/create! conn
                            {:app-id app-id
                             :path "test.jpg"
                             :location-id "loc1"
                             :metadata {:size 100
                                        :content-type "image/jpeg"
                                        :content-disposition "inline"}})

          ;; Create file with same path but different location
          (app-file/create! conn
                            {:app-id app-id
                             :path "test.jpg"
                             :location-id "loc2"
                             :metadata {:size 200
                                        :content-type "image/jpeg"
                                        :content-disposition "inline"}})
          (is (= 1 (count-files-to-sweep conn app-id)))

          ;; Create one more time should create another sweep entry
          (app-file/create! conn
                            {:app-id app-id
                             :path "test.jpg"
                             :location-id "loc3"
                             :metadata {:size 300
                                        :content-type "image/jpeg"
                                        :content-disposition "inline"}})
          (is (= 2 (count-files-to-sweep conn app-id)))
          (delete-sweep-files! conn app-id))))))

(deftest test-single-sweeper-job
  (with-queue
    (fn [job-queue]
      (with-empty-app
        (fn [app]
          (let [app-id (:id app)
                conn (aurora/conn-pool :write)
                files (for [i (range 500)] ;; Generate 500 files
                        {:file-id (random-uuid)
                         :path (format "file-%d.jpg" i)
                         :location-id (format "loc-%d" i)
                         :metadata {:size 100
                                    :content-type "image/jpeg"
                                    :content-disposition "inline"}})
                file-ids (app-file/bulk-create! conn
                                                {:app-id app-id
                                                 :data files})]
            ;; Verify no sweep entries yet
            (is (zero? (count-files-to-sweep conn app-id)))

            ;; Delete all files
            (app-file/delete-by-ids! conn
                                     {:app-id app-id
                                      :ids file-ids})

            ;; Verify sweep entries created
            (is (= 500 (count-files-to-sweep conn app-id)))

            (let [jobs (sweeper/create-jobs! conn app-id)
                  job (first jobs)]

              ;; Only one job should be created since there are <=1000 files
              (is (= 1 (count jobs)))
              (is (= "waiting" (:job_status job)))

              (sweeper/enqueue-job job-queue job)
              (wait-for #(= "completed"
                            (:job_status (sweeper/get-job-by-id (:id job))))
                        100)

              ;; Verify job completed successfully
              (let [completed-job (sweeper/get-job-by-id (:id job))]
                (is (= 500 (:num_files_claimed completed-job)))
                (is (nil? (:error completed-job)))
                (is (some? (:done_at completed-job))))

              ;; Verify all sweep entries deleted
              (is (= 0 (count-files-to-sweep conn app-id))))))))))

(deftest test-mulitple-sweeper-jobs
  (with-queue
    (fn [job-queue]
      (with-empty-app
        (fn [app]
          (let [app-id (:id app)
                conn (aurora/conn-pool :write)
                files (for [i (range 2500)] ;; Generate 2500 files
                        {:file-id (random-uuid)
                         :path (format "file-%d.jpg" i)
                         :location-id (format "loc-%d" i)
                         :metadata {:size 100
                                    :content-type "image/jpeg"
                                    :content-disposition "inline"}})
                chunks (partition-all 1000 files)
                file-ids (mapcat #(app-file/bulk-create! conn
                                                         {:app-id app-id
                                                          :data %}) chunks)
                delete-chunks (partition-all 1000 file-ids)
                _ (doseq [chunk delete-chunks]
                    (app-file/delete-by-ids! conn
                                             {:app-id app-id
                                              :ids chunk}))
                jobs (sweeper/create-jobs! conn app-id)]

            ;; Verify 2500 sweep entries created
            (is (= 2500 (count-files-to-sweep conn app-id)))

            ;; Verify 3 jobs created (each job processes at most 1000 files)
            (is (= 3 (count jobs)))

            ;; Verify all jobs are in waiting state
            (doseq [job jobs]
              (is (= "waiting" (:job_status job)))
              (is (nil? (:error job)))
              (is (nil? (:done_at job))))

            ;; Enqueue jobs
            (doseq [job jobs]
              (sweeper/enqueue-job job-queue job))

            (wait-for
             (fn []
               (every? #(= "completed" (:job_status %))
                       (mapv sweeper/get-job-by-id (map :id jobs))))
             1000)

            ;; Verify all jobs completed successfully and processed
            ;; correct number of files
            (let [completed-jobs (mapv sweeper/get-job-by-id (map :id jobs))]
              (is (= 2500 (reduce + (map :num_files_claimed completed-jobs))))
              (is (every? nil? (map :error completed-jobs)))
              (is (every? some? (map :done_at completed-jobs))))

            ;; Verify all sweep entries deleted
            (is (= 0 (count-files-to-sweep conn app-id)))))))))

(comment
  (test/run-tests *ns*))
