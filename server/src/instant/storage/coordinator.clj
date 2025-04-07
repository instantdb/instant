(ns instant.storage.coordinator
  (:require [instant.storage.s3 :as instant-s3]
            [instant.model.app-file :as app-file-model]
            [instant.model.rule :as rule-model]
            [instant.storage.beta :as storage-beta]
            [instant.util.exception :as ex]
            [instant.db.cel :as cel]
            [instant.model.app-upload-url :as app-upload-url-model]
            [instant.config :as config])
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
