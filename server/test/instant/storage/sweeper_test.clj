(ns instant.storage.sweeper-test
  (:require [clojure.test :as test :refer [deftest testing is use-fixtures]]
            [instant.model.app-file :as app-file]
            [instant.storage.sweeper :as sweeper]
            [instant.jdbc.aurora :as aurora]
            [instant.jdbc.sql :as sql]
            [instant.fixtures :refer [with-empty-app]]
            [honey.sql :as hsql]
            [instant.util.s3 :as s3-util]
            [instant.storage.s3 :as s3-storage]
            [instant.storage.coordinator :as storage-coordinator]))

(defn with-s3-mock [f]
  (with-redefs [s3-util/delete-objects (constantly nil)
                s3-storage/s3-client (fn [] {:some :mock-client})
                s3-storage/create-signed-download-url! (constantly "https://mock-url.com/file")]
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

(deftest test-file-move
  (with-empty-app
    (fn [app]
      (testing "moving a single file updates the path but keeps same location-id"
        (let [app-id (:id app)
              conn (aurora/conn-pool :write)
              original-path "test-original.jpg"
              new-path "renamed/test-original.jpg"
              location-id "test-loc-123"]
          
          ;; Create a file
          (app-file/create! conn
                            {:app-id app-id
                             :path original-path
                             :location-id location-id
                             :metadata {:size 100
                                        :content-type "image/jpeg"
                                        :content-disposition "inline"}})
          
          ;; Verify file exists at original path
          (let [original-file (app-file/get-by-path conn {:app-id app-id :path original-path})]
            (is (some? original-file))
            (is (= original-path (:path original-file)))
            (is (= location-id (:location-id original-file))))
          
          ;; Move the file using the new move operation
          (storage-coordinator/move-files! {:app-id app-id
                                           :targets [original-path]
                                           :dest "renamed"
                                           :skip-perms-check? true})
          
          ;; Verify old path no longer exists
          (is (nil? (app-file/get-by-path conn {:app-id app-id :path original-path})))
          
          ;; Verify new path exists with same location-id
          (let [moved-file (app-file/get-by-path conn {:app-id app-id :path new-path})]
            (is (some? moved-file))
            (is (= new-path (:path moved-file)))
            (is (= location-id (:location-id moved-file)))))))))

(deftest test-directory-move
  (with-empty-app
    (fn [app]
      (testing "moving a directory updates all files under that directory"
        (let [app-id (:id app)
              conn (aurora/conn-pool :write)
              old-dir "photos/"
              new-dir "images"
              location-ids ["loc-1" "loc-2" "loc-3"]]
          
          ;; Create multiple files under the directory
          (app-file/create! conn
                            {:app-id app-id
                             :path "photos/vacation/beach.jpg"
                             :location-id (nth location-ids 0)
                             :metadata {:size 100
                                        :content-type "image/jpeg"
                                        :content-disposition "inline"}})
          
          (app-file/create! conn
                            {:app-id app-id
                             :path "photos/vacation/sunset.png"
                             :location-id (nth location-ids 1)
                             :metadata {:size 200
                                        :content-type "image/png"
                                        :content-disposition "inline"}})
          
          (app-file/create! conn
                            {:app-id app-id
                             :path "photos/profile.jpg"
                             :location-id (nth location-ids 2)
                             :metadata {:size 150
                                        :content-type "image/jpeg"
                                        :content-disposition "inline"}})
          
          ;; Verify files exist at original paths
          (is (some? (app-file/get-by-path conn {:app-id app-id :path "photos/vacation/beach.jpg"})))
          (is (some? (app-file/get-by-path conn {:app-id app-id :path "photos/vacation/sunset.png"})))
          (is (some? (app-file/get-by-path conn {:app-id app-id :path "photos/profile.jpg"})))
          
          ;; Move the directory using the new move operation
          (let [result (storage-coordinator/move-files! {:app-id app-id
                                                        :targets [old-dir]
                                                        :dest new-dir
                                                        :skip-perms-check? true})]
            (is (= 3 (:moved-count result)))
            (is (= 3 (count (:files result)))))
          
          ;; Verify old paths no longer exist
          (is (nil? (app-file/get-by-path conn {:app-id app-id :path "photos/vacation/beach.jpg"})))
          (is (nil? (app-file/get-by-path conn {:app-id app-id :path "photos/vacation/sunset.png"})))
          (is (nil? (app-file/get-by-path conn {:app-id app-id :path "photos/profile.jpg"})))
          
          ;; Verify new paths exist with same location-ids
          (let [beach-file (app-file/get-by-path conn {:app-id app-id :path "images/photos/vacation/beach.jpg"})
                sunset-file (app-file/get-by-path conn {:app-id app-id :path "images/photos/vacation/sunset.png"})
                profile-file (app-file/get-by-path conn {:app-id app-id :path "images/photos/profile.jpg"})]
            
            (is (some? beach-file))
            (is (= "images/photos/vacation/beach.jpg" (:path beach-file)))
            (is (= (nth location-ids 0) (:location-id beach-file)))
            
            (is (some? sunset-file))
            (is (= "images/photos/vacation/sunset.png" (:path sunset-file)))
            (is (= (nth location-ids 1) (:location-id sunset-file)))
            
            (is (some? profile-file))
            (is (= "images/photos/profile.jpg" (:path profile-file)))
            (is (= (nth location-ids 2) (:location-id profile-file))))))
      
      (testing "moving a directory doesn't affect files outside the directory"
        (let [app-id (:id app)
              conn (aurora/conn-pool :write)]
          
          ;; Create a file outside the photos directory
          (app-file/create! conn
                            {:app-id app-id
                             :path "documents/report.pdf"
                             :location-id "doc-loc-1"
                             :metadata {:size 500
                                        :content-type "application/pdf"
                                        :content-disposition "attachment"}})
          
          ;; Create another file that starts with "photos" but isn't in the directory
          (app-file/create! conn
                            {:app-id app-id
                             :path "photos_backup.zip"
                             :location-id "backup-loc-1"
                             :metadata {:size 1000
                                        :content-type "application/zip"
                                        :content-disposition "attachment"}})
          
          ;; Move photos/ to images/ using new move operation
          (storage-coordinator/move-files! {:app-id app-id
                                           :targets ["photos/"]
                                           :dest "images"
                                           :skip-perms-check? true})
          
          ;; Verify unrelated files are unchanged
          (is (some? (app-file/get-by-path conn {:app-id app-id :path "documents/report.pdf"})))
          (is (some? (app-file/get-by-path conn {:app-id app-id :path "photos_backup.zip"}))))))))

(deftest test-empty-directory-move
  (with-empty-app
    (fn [app]
      (testing "empty directory move"
        (let [app-id (:id app)
              result (storage-coordinator/move-files! {:app-id app-id
                                                      :targets ["empty/"]
                                                      :dest "still-empty"
                                                      :skip-perms-check? true})]
          ;; Should handle empty results gracefully
          (is (= 0 (:moved-count result)))
          (is (= 0 (count (:files result)))))))))

(deftest test-move-multiple-files-and-directories
  (with-empty-app
    (fn [app]
      (testing "move multiple files and directories"
        (let [app-id (:id app)
              conn (aurora/conn-pool :write)]
          
          ;; Create test files
          (app-file/create! conn
                            {:app-id app-id
                             :path "photos/beach.jpg"
                             :location-id "beach-loc"
                             :metadata {:size 100
                                        :content-type "image/jpeg"
                                        :content-disposition "inline"}})
          
          (app-file/create! conn
                            {:app-id app-id
                             :path "docs/readme.txt"
                             :location-id "readme-loc"
                             :metadata {:size 50
                                        :content-type "text/plain"
                                        :content-disposition "inline"}})
          
          (app-file/create! conn
                            {:app-id app-id
                             :path "videos/vacation/sunset.mp4"
                             :location-id "sunset-loc"
                             :metadata {:size 500
                                        :content-type "video/mp4"
                                        :content-disposition "inline"}})
          
          (app-file/create! conn
                            {:app-id app-id
                             :path "videos/vacation/beach.mp4"
                             :location-id "beach-vid-loc"
                             :metadata {:size 600
                                        :content-type "video/mp4"
                                        :content-disposition "inline"}})
          
          ;; Move individual files and a directory to archive
          (let [result (storage-coordinator/move-files! 
                        {:app-id app-id
                         :targets ["photos/beach.jpg" "docs/readme.txt" "videos/vacation/"]
                         :dest "archive"
                         :skip-perms-check? true})]
            
            ;; Should have moved 4 files (1 from photos, 1 from docs, 2 from videos/vacation/)
            (is (= 4 (:moved-count result)))
            (is (= 4 (count (:files result))))
            
            ;; Verify old paths no longer exist
            (is (nil? (app-file/get-by-path conn {:app-id app-id :path "photos/beach.jpg"})))
            (is (nil? (app-file/get-by-path conn {:app-id app-id :path "docs/readme.txt"})))
            (is (nil? (app-file/get-by-path conn {:app-id app-id :path "videos/vacation/sunset.mp4"})))
            (is (nil? (app-file/get-by-path conn {:app-id app-id :path "videos/vacation/beach.mp4"})))
            
            ;; Verify new paths exist
            (is (some? (app-file/get-by-path conn {:app-id app-id :path "archive/beach.jpg"})))
            (is (some? (app-file/get-by-path conn {:app-id app-id :path "archive/readme.txt"})))
            (is (some? (app-file/get-by-path conn {:app-id app-id :path "archive/vacation/sunset.mp4"})))
            (is (some? (app-file/get-by-path conn {:app-id app-id :path "archive/vacation/beach.mp4"})))
            
            ;; Verify location-ids are preserved
            (is (= "beach-loc" (:location-id (app-file/get-by-path conn {:app-id app-id :path "archive/beach.jpg"}))))
            (is (= "readme-loc" (:location-id (app-file/get-by-path conn {:app-id app-id :path "archive/readme.txt"}))))
            (is (= "sunset-loc" (:location-id (app-file/get-by-path conn {:app-id app-id :path "archive/vacation/sunset.mp4"}))))
            (is (= "beach-vid-loc" (:location-id (app-file/get-by-path conn {:app-id app-id :path "archive/vacation/beach.mp4"})))))))))

(deftest test-move-with-missing-targets
  (with-empty-app
    (fn [app]
      (testing "move with non-existent targets - skips missing files"
        (let [app-id (:id app)
              conn (aurora/conn-pool :write)]
          
          ;; Create one file
          (app-file/create! conn
                            {:app-id app-id
                             :path "real-file.txt"
                             :location-id "real-loc"
                             :metadata {:size 100
                                        :content-type "text/plain"
                                        :content-disposition "inline"}})
          
          ;; Try to move both real and non-existent files
          (let [result (storage-coordinator/move-files! 
                        {:app-id app-id
                         :targets ["real-file.txt" "missing-file.txt" "missing-dir/"]
                         :dest "destination"
                         :skip-perms-check? true})]
            
            ;; Should only move the one real file
            (is (= 1 (:moved-count result)))
            (is (= 1 (count (:files result))))
            
            ;; Verify file was moved
            (is (nil? (app-file/get-by-path conn {:app-id app-id :path "real-file.txt"})))
            (is (some? (app-file/get-by-path conn {:app-id app-id :path "destination/real-file.txt"})))))))))

(deftest test-move-all-missing-targets
  (with-empty-app
    (fn [app]
      (testing "move with all non-existent targets - no-op"
        (let [app-id (:id app)]
          (let [result (storage-coordinator/move-files! 
                        {:app-id app-id
                         :targets ["missing1.txt" "missing2.txt" "missing-dir/"]
                         :dest "destination"
                         :skip-perms-check? true})]
            
            ;; Should be a no-op
            (is (= 0 (:moved-count result)))
            (is (= 0 (count (:files result))))))))))

(deftest test-move-ancestor-validation
  (with-empty-app
    (fn [app]
      (testing "move fails when target is ancestor of destination"
        (let [app-id (:id app)]
          
          ;; Should throw validation error when target is ancestor of dest
          (is (thrown-with-msg? 
               Exception 
               #"target is an ancestor of destination"
               (storage-coordinator/move-files! 
                {:app-id app-id
                 :targets ["photos/"]
                 :dest "photos/archive"
                 :skip-perms-check? true})))
          
          ;; Should also fail when target equals dest
          (is (thrown-with-msg? 
               Exception 
               #"target is an ancestor of destination"
               (storage-coordinator/move-files! 
                {:app-id app-id
                 :targets ["photos"]
                 :dest "photos"
                 :skip-perms-check? true})))
          
          ;; Should also fail when target is parent of dest
          (is (thrown-with-msg? 
               Exception 
               #"target is an ancestor of destination"
               (storage-coordinator/move-files! 
                {:app-id app-id
                 :targets ["docs"]
                 :dest "docs/archive"
                 :skip-perms-check? true}))))))))

(deftest test-move-valid-destinations
  (with-empty-app
    (fn [app]
      (testing "move works when dest is NOT under target"
        (let [app-id (:id app)
              conn (aurora/conn-pool :write)]
          
          ;; Create test file
          (app-file/create! conn
                            {:app-id app-id
                             :path "photos/test.jpg"
                             :location-id "test-loc"
                             :metadata {:size 100
                                        :content-type "image/jpeg"
                                        :content-disposition "inline"}})
          
          ;; This should work - moving photos/ to documents/ (not under photos/)
          (let [result (storage-coordinator/move-files! 
                        {:app-id app-id
                         :targets ["photos/"]
                         :dest "documents"
                         :skip-perms-check? true})]
            
            (is (= 1 (:moved-count result)))
            (is (nil? (app-file/get-by-path conn {:app-id app-id :path "photos/test.jpg"})))
            (is (some? (app-file/get-by-path conn {:app-id app-id :path "documents/photos/test.jpg"}))))))

      (testing "move handles overlapping targets correctly"
        (let [app-id (:id app)
              conn (aurora/conn-pool :write)]
          
          ;; Create files in a directory structure
          (app-file/create! conn
                            {:app-id app-id
                             :path "project/src/main.js"
                             :location-id "main-loc"
                             :metadata {:size 100
                                        :content-type "application/javascript"
                                        :content-disposition "inline"}})
          
          (app-file/create! conn
                            {:app-id app-id
                             :path "project/src/utils.js"
                             :location-id "utils-loc"
                             :metadata {:size 50
                                        :content-type "application/javascript"
                                        :content-disposition "inline"}})
          
          ;; Move with overlapping targets: both the specific file and its parent directory
          (let [result (storage-coordinator/move-files! 
                        {:app-id app-id
                         :targets ["project/src/main.js" "project/src/"]
                         :dest "backup"
                         :skip-perms-check? true})]
            
            ;; Should move both files (de-duplicated automatically)
            (is (= 2 (:moved-count result)))
            
            ;; Verify files were moved
            (is (nil? (app-file/get-by-path conn {:app-id app-id :path "project/src/main.js"})))
            (is (nil? (app-file/get-by-path conn {:app-id app-id :path "project/src/utils.js"})))
            (is (some? (app-file/get-by-path conn {:app-id app-id :path "backup/src/main.js"})))
            (is (some? (app-file/get-by-path conn {:app-id app-id :path "backup/src/utils.js"}))))))))))

(comment
  (test/run-tests *ns*)
  
  ;; To test move functionality:
  ;; 1. Use the test runner: clojure -M:dev test/instant/run_storage_tests.clj
  ;; 2. Or test specific functions in REPL:
  ;;    (storage-coordinator/move-files! {:app-id app-id :targets ["photos/"] :dest "archive" :skip-perms-check? true})
  ;;    (app-file/get-by-path-prefix {:app-id app-id :path-prefix "photos/"})
  )
