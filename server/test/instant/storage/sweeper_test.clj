(ns instant.storage.sweeper-test
  (:require [clojure.test :as test :refer [deftest testing is use-fixtures]]
            [instant.model.app-file :as app-file]
            [instant.storage.sweeper :as sweeper]
            [instant.jdbc.aurora :as aurora]
            [instant.jdbc.sql :as sql]
            [instant.fixtures :refer [with-empty-app]]
            [honey.sql :as hsql]
            [instant.util.s3 :as s3-util]
            [instant.storage.s3 :as s3-storage]))

(defn with-s3-mock [f]
  (with-redefs [s3-util/delete-objects (constantly nil)
                s3-storage/s3-client (constantly nil)]
    (f)))

(use-fixtures :each with-s3-mock)

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

(deftest single-loop-sweep
  (with-empty-app
    (fn [app]
      (let [app-id (:id app)
            conn (aurora/conn-pool :write)
            files (for [i (range 800)] ;; Generate < 1000 files
                    {:file-id (random-uuid)
                     :path (format "file-%d.jpg" i)
                     :location-id (format "loc-%d" i)
                     :metadata {:size 100
                                :content-type "image/jpeg"
                                :content-disposition "inline"}})
            file-ids (app-file/bulk-create! conn {:app-id app-id
                                                  :data files})
            _ (app-file/delete-by-ids! conn
                                       {:app-id app-id
                                        :ids file-ids})]

        ;; 800 files should be marked for sweep
        (is (= 800 (count-files-to-sweep conn app-id)))

        (sweeper/handle-sweep! conn {:app-id app-id
                                     :limit 1000})

        ;; All files should now be swept
        (is (= 0 (count-files-to-sweep conn app-id)))))))

(deftest mulit-loop-sweep
  (with-empty-app
    (fn [app]
      (let [app-id (:id app)
            conn (aurora/conn-pool :write)
            files (for [i (range 2500)]
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
                                          :ids chunk}))]

        ;; 2500 files should be marked for sweep
        (is (= 2500 (count-files-to-sweep conn app-id)))

        (sweeper/handle-sweep! conn {:app-id app-id
                                     :limit 1000})

        ;; All files should now be swept
        (is (= 0 (count-files-to-sweep conn app-id)))))))

(deftest warn-too-many-loops
  (with-empty-app
    (fn [app]
      (let [app-id (:id app)
            conn (aurora/conn-pool :write)
            files (for [i (range 5)] ;; Generate < 5 files
                    {:file-id (random-uuid)
                     :path (format "file-%d.jpg" i)
                     :location-id (format "loc-%d" i)
                     :metadata {:size 100
                                :content-type "image/jpeg"
                                :content-disposition "inline"}})
            file-ids (app-file/bulk-create! conn {:app-id app-id
                                                  :data files})
            _ (app-file/delete-by-ids! conn
                                       {:app-id app-id
                                        :ids file-ids})]

        ;; 5 files should be marked for sweep
        (is (= 5 (count-files-to-sweep conn app-id)))

        ;; Warn should be triggered
        (is (:warn (sweeper/handle-sweep! conn {:app-id app-id
                                                :limit 1
                                                :max-loops 3})))

        ;; 2 files should remain
        (is (= 2 (count-files-to-sweep conn app-id)))

        ;; Should be able to run again without issue
        (sweeper/handle-sweep! conn {:app-id app-id
                                     :limit 1
                                     :max-loops 2})

        ;; All files should now be swept
        (is (= 0 (count-files-to-sweep conn app-id)))))))

(comment
  (test/run-tests *ns*))
