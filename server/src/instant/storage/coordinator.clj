(ns instant.storage.coordinator
  (:require [instant.storage.s3 :as instant-s3]
            [instant.model.app-file :as app-file-model]
            [instant.model.rule :as rule-model]
            [instant.storage.beta :as storage-beta]
            [instant.util.exception :as ex]
            [instant.db.cel :as cel]
            [instant.model.app-upload-url :as app-upload-url-model]
            [instant.config :as config]
            [clojure.string :as str])
  (:import
   (java.time Instant)
   (java.util Date)))

(defn assert-storage-permission! [action {:keys [app-id
                                                 path
                                                 rules-override]
                                          :as ctx}]
  (let [rules (if rules-override
                rules-override
                (rule-model/get-by-app-id {:app-id app-id}))
        program (rule-model/get-program! rules "$files" action)]
    (ex/assert-permitted!
     :has-storage-permission?
     ["$files" action]
     (if-not program
       ;; deny access by default if no permissions are currently set
       false
       ;; otherwise, evaluate the permissions code
       (cel/eval-program! ctx
                          program
                          {:data {"path" path}})))))

(defn upload-file!
  "Uploads a file to S3 and tracks it in Instant. Returns a file id"
  [{:keys [app-id path skip-perms-check? current-user] :as ctx} file]
  (storage-beta/assert-storage-enabled! app-id)
  (when (not skip-perms-check?)
    (assert-storage-permission! "create" {:app-id app-id
                                          :path path
                                          :current-user current-user}))
  (let [location-id (str (random-uuid))]
    (instant-s3/upload-file-to-s3 (assoc ctx :location-id location-id) file)
    (app-file-model/create!
     {:app-id app-id
      :path path
      :location-id location-id
      :metadata (instant-s3/get-object-metadata app-id location-id)})))

(defn delete-files!
  "Deletes multiple files from both Instant and S3."
  [{:keys [app-id paths]}]
  (storage-beta/assert-storage-enabled! app-id)
  (let [deleted (app-file-model/delete-by-paths! {:app-id app-id :paths paths})
        locations (mapv :location-id deleted)
        ids (mapv :id deleted)
        _ (instant-s3/bulk-delete-files! app-id locations)]
    {:ids ids}))

(defn delete-file!
  "Deletes a file from both Instant and S3."
  [{:keys [app-id path current-user skip-perms-check?]}]
  (when (not skip-perms-check?)
    (assert-storage-permission! "delete" {:app-id app-id
                                          :path path
                                          :current-user current-user}))
  (let [{:keys [id location-id]} (app-file-model/delete-by-path! {:app-id app-id :path path})
        _ (instant-s3/delete-file! app-id location-id)]
    {:id id}))

(defn- is-ancestor? [potential-ancestor path]
  "Checks if potential-ancestor is an ancestor of path.
   Returns true if path starts with potential-ancestor (considering path separators)."
  (or (= potential-ancestor path)
      (and (.startsWith ^String path ^String potential-ancestor)
           (or (.endsWith ^String potential-ancestor "/")
               (= (nth path (count potential-ancestor) nil) \/)))))

(defn move-files!
  "Moves multiple files/directories to a destination.
   - targets: list of paths to move
   - dest: destination path
   - Errors if any target is an ancestor of the destination
   - Skips targets that don't exist
   - No-op if none of the targets exist"
  [{:keys [app-id targets dest current-user skip-perms-check?]}]
  (storage-beta/assert-storage-enabled! app-id)
  
  ;; Validate that no target is an ancestor of destination
  (doseq [target targets]
    (when (is-ancestor? target dest)
      (ex/throw-validation-err!
       :invalid-move
       {:target target :dest dest}
       (format "Cannot move '%s' to '%s': target is an ancestor of destination" target dest))))
  
  ;; Get all existing files for all targets
  (let [existing-files (mapcat (fn [target]
                                ;; Check if target is a file
                                (if-let [file (app-file-model/get-by-path {:app-id app-id :path target})]
                                  [file]
                                  ;; If not a file, check if it's a directory prefix
                                  (app-file-model/get-by-path-prefix {:app-id app-id :path-prefix target})))
                              targets)
        ;; Remove duplicates that might occur if targets overlap
        unique-files (distinct existing-files)]
    
    ;; If no files exist, it's a no-op
    (if (empty? unique-files)
      {:moved-count 0
       :files []}
      
      (do
        ;; Check permissions for all files that will be moved
        (when (not skip-perms-check?)
          (doseq [file unique-files]
            (let [old-path (:path file)
                  ;; Determine the new path based on which target this file belongs to
                  new-path (loop [remaining-targets targets]
                            (if (empty? remaining-targets)
                              ;; This shouldn't happen, but fallback
                              (str dest "/" (last (str/split old-path #"/")))
                              (let [target (first remaining-targets)]
                                (cond
                                  ;; Exact match - file is the target itself
                                  (= old-path target)
                                  (str dest "/" (last (str/split target #"/")))
                                  
                                  ;; File is under this target directory
                                  (and (.startsWith ^String old-path ^String target)
                                       (or (.endsWith ^String target "/")
                                           (= (nth old-path (count target) nil) \/)))
                                  (let [target-dir-name (if (.endsWith ^String target "/")
                                                         (last (filter #(not (empty? %)) (str/split target #"/")))
                                                         (last (str/split target #"/")))
                                        ;; Get the remaining path after the target, ensuring we include the separator
                                        remaining-path (if (.endsWith ^String target "/")
                                                        (subs old-path (count target))
                                                        (subs old-path (inc (count target))))]
                                    (str dest "/" target-dir-name "/" remaining-path))
                                  
                                  ;; Try next target
                                  :else
                                  (recur (rest remaining-targets))))))]
              ;; Check "update" permission on the old path
              (assert-storage-permission! "update" {:app-id app-id
                                                   :path old-path
                                                   :current-user current-user})
              ;; Check "create" permission on the new path
              (assert-storage-permission! "create" {:app-id app-id
                                                   :path new-path
                                                   :current-user current-user}))))
        
        ;; Perform the moves
        (let [moved-files (for [file unique-files]
                           (let [old-path (:path file)
                                 ;; Determine the new path based on which target this file belongs to
                                 new-path (loop [remaining-targets targets]
                                           (if (empty? remaining-targets)
                                             ;; This shouldn't happen, but fallback
                                             (str dest "/" (last (str/split old-path #"/")))
                                             (let [target (first remaining-targets)]
                                               (cond
                                                 ;; Exact match - file is the target itself
                                                 (= old-path target)
                                                 (str dest "/" (last (str/split target #"/")))
                                                 
                                                 ;; File is under this target directory
                                                 (and (.startsWith ^String old-path ^String target)
                                                      (or (.endsWith ^String target "/")
                                                          (= (nth old-path (count target) nil) \/)))
                                                 (let [target-dir-name (if (.endsWith ^String target "/")
                                                                        (last (filter #(not (empty? %)) (str/split target #"/")))
                                                                        (last (str/split target #"/")))
                                                                       ;; Get the remaining path after the target, ensuring we include the separator
                                                                       remaining-path (if (.endsWith ^String target "/")
                                                                                       (subs old-path (count target))
                                                                                       (subs old-path (inc (count target))))]
                                                                       (str dest "/" target-dir-name "/" remaining-path))
                                                 
                                                 ;; Try next target
                                                 :else
                                                 (recur (rest remaining-targets))))))]
                             ;; Update the file path
                             (app-file-model/update-path! {:app-id app-id
                                                          :path old-path
                                                          :new-path new-path})
                             (assoc file :path new-path)))]
          
          ;; Return summary of the operation
          {:moved-count (count moved-files)
           :files moved-files})))))

;; Logic for legacy S3 upload/download URLs
;; -------------------------

(defn create-upload-url!
  "Creates a limited time url for uploading a file to Instant"
  [{:keys [app-id path skip-perms-check? current-user]}]
  (storage-beta/assert-storage-enabled! app-id)
  (when (not skip-perms-check?)
    (assert-storage-permission! "create" {:app-id app-id
                                          :path path
                                          :current-user current-user}))
  (let [{upload-id :id} (app-upload-url-model/create! {:app-id app-id :path path})]
    (str config/server-origin "/storage/" upload-id "/consume-upload-url")))

(defn consume-upload-url!
  "Consume an Instant upload url and if it's valid kicks off our upload process"
  [{:keys [upload-id content-type content-length]} file]
  (let [{app-id :app_id path :path expired-at :expired_at}
        (app-upload-url-model/consume! {:upload-id upload-id})]
    (when (or (not expired-at)
              (.isBefore (Date/.toInstant expired-at) (Instant/now)))
      (throw (ex/throw-validation-err!
              :app-upload-url
              upload-id
              "The upload URL is expired or invalid.")))
    (upload-file!
     {:app-id app-id
      :path path
      :content-type content-type
      :content-length content-length
      :skip-perms-check? true} file)))

(defn create-download-url
  "Returns a temporary url for downloading a file from Instant"
  [{:keys [app-id path skip-perms-check? current-user]}]
  (storage-beta/assert-storage-enabled! app-id)
  (when (not skip-perms-check?)
    (assert-storage-permission! "view" {:app-id app-id
                                        :path path
                                        :current-user current-user}))
  (let [{:keys [location-id]} (app-file-model/get-by-path {:app-id app-id :path path})]
    (instant-s3/create-signed-download-url! app-id location-id)))
