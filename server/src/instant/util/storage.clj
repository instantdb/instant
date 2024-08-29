(ns instant.util.storage
  (:require [clojure.string :as string]
            [instant.util.exception :as ex]
            [instant.model.app-user :as app-user-model]
            [instant.model.rule :as rule-model]
            [instant.db.cel :as cel]
            [instant.util.json :refer [->json <-json]]
            [instant.storage.s3 :as s3-util]
            [instant.storage.beta :as storage-beta]))

(comment
  (def rules {:code
              {"$files" {"bind" ["isLoggedIn" "auth.id != null"]
                         "allow" {"view" "isLoggedIn"
                                  "create" "data.path.contains('demo')"}}}})
  (def program (rule-model/get-program! rules "$files" "create"))
  (cel/eval-program! program {"auth" (cel/->cel-map {"id" "alex"})
                              "data" (cel/->cel-map {"path" "demo/image.png"})}))


(defn assert-storage-permission! [action {:keys [app-id refresh-token filepath]}]
  (let [rules (rule-model/get-by-app-id {:app-id app-id})
        current-user (when refresh-token
                       (app-user-model/get-by-refresh-token {:app-id app-id
                                                             :refresh-token refresh-token}))
        program (rule-model/get-program! rules "$files" action)]
    (ex/assert-permitted!
     :has-storage-permission?
     ["$files" action]
     (if-not program
       ;; deny access by default if no permissions are currently set
       false
       ;; otherwise, evaluate the permissions code
       (cel/eval-program! program
                          {"auth" (cel/->cel-map (<-json (->json current-user)))
                           "data" (cel/->cel-map {"path" filepath})})))))


(defn upload-image-to-s3 [app-id filename image-url]
  (let [object-key (s3-util/->object-key app-id filename)]
    (storage-beta/assert-storage-enabled! app-id)
    (s3-util/upload-image-to-s3 object-key image-url)))

(defn create-signed-download-url!
  ([app-id filename refresh-token]
   (assert-storage-permission! "read" {:app-id app-id
                                       :refresh-token refresh-token
                                       :filepath filename})
   (create-signed-download-url! app-id filename))
  ([app-id filename]
   (let [expiration (+ (System/currentTimeMillis) (* 1000 60 60 24 7)) ;; 7 days
         object-key (s3-util/->object-key app-id filename)]
     (storage-beta/assert-storage-enabled! app-id)
     (str (s3-util/signed-download-url object-key expiration)))))

(defn create-signed-upload-url!
  ([app-id filename refresh-token]
   (assert-storage-permission! "create" {:app-id app-id
                                         :refresh-token refresh-token
                                         :filepath filename})
   (create-signed-upload-url! app-id filename))
  ([app-id filename]
   (let [object-key (s3-util/->object-key app-id filename)]
     (storage-beta/assert-storage-enabled! app-id)
     (str (s3-util/signed-upload-url object-key)))))

(comment
  (def app-id  #uuid "524bc106-1f0d-44a0-b222-923505264c47")
  (def filename "demo.png")
  (def image-url "https://i.redd.it/bugxrdkjmm1b1.png")
  (create-signed-upload-url! app-id filename)
  (upload-image-to-s3 app-id filename image-url)
  (create-signed-download-url! app-id filename))

(defn format-object [{:keys [key size owner etag last-modified]}]
  {:key key
   :size size
   :owner owner
   :etag etag
   :last_modified (.getMillis last-modified)})

;; Retrieves all files that have been uploaded via Storage APIs
(defn list-files! [app-id subdirectory]
  (let [_ (storage-beta/assert-storage-enabled! app-id)
        prefix (if (string/blank? subdirectory)
                 app-id
                 (str app-id "/" subdirectory))
        objects-resp (s3-util/list-app-objects prefix)
        objects (:object-summaries objects-resp)]
    (map format-object objects)))

;; Deletes a single file by name/path (e.g. "demo.png", "profiles/me.jpg")
(defn delete-file! [app-id filename]
  (let [_ (storage-beta/assert-storage-enabled! app-id)
        key (s3-util/->object-key app-id filename)]
    (s3-util/delete-object key)))

;; Deletes a multiple files by name/path (e.g. "demo.png", "profiles/me.jpg")
(defn bulk-delete-files! [app-id filenames]
  (let [_ (storage-beta/assert-storage-enabled! app-id)
        keys (mapv (fn [filename] (s3-util/->object-key app-id filename)) filenames)]
    (s3-util/delete-objects keys)))

(comment
  (def app-id #uuid "524bc106-1f0d-44a0-b222-923505264c47")
  (def filename "demo.png")
  (def image-url "https://i.redd.it/bugxrdkjmm1b1.png")
  (upload-image-to-s3 app-id filename image-url)
  (list-files! app-id "")
  (delete-file! app-id filename)
  (bulk-delete-files! app-id [filename])
  (list-files! app-id ""))