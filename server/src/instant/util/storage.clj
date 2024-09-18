(ns instant.util.storage
  (:require [clojure.string :as string]
            [instant.util.exception :as ex]
            [instant.model.app-user :as app-user-model]
            [instant.model.rule :as rule-model]
            [instant.model.app-user-refresh-token :as app-user-refresh-token-model]
            [instant.db.cel :as cel]
            [instant.util.json :refer [->json <-json]]
            [instant.storage.s3 :as s3-util]
            [instant.storage.beta :as storage-beta])

  (:import
   (java.util UUID)))


;; scopes filename to app-id directory
(defn ->object-key [app-id filename]
  (str app-id "/" filename))

;; extracts app-id
(defn object-key->app-id [object-key]
  (first (string/split object-key #"/")))

;; extracts filename from app-id directory scope
(defn object-key->filename [object-key]
  (string/join "/" (rest (string/split object-key #"/"))))

(comment
  (def rules {:code
              {"$files" {"bind" ["isLoggedIn" "auth.id != null"]
                         "allow" {"view" "isLoggedIn"
                                  "create" "data.path.contains('demo')"}}}})
  (def program (rule-model/get-program! rules "$files" "create"))
  (cel/eval-program! program {"auth" (cel/->cel-map {"id" "alex"})
                              "data" (cel/->cel-map {"path" "demo/image.png"})}))


(defn assert-storage-permission! [action {:keys [app-id filepath current-user rules-override]}]
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
       (cel/eval-program! program
                          {"auth" (cel/->cel-map (<-json (->json current-user)))
                           "data" (cel/->cel-map {"path" filepath})})))))


(defn upload-image-to-s3 [app-id filename image-url]
  (let [object-key (->object-key app-id filename)]
    (storage-beta/assert-storage-enabled! app-id)
    (s3-util/upload-image-to-s3 object-key image-url)))

(defn create-signed-download-url!
  ([app-id filename current-user]
   (assert-storage-permission! "view" {:app-id app-id
                                       :current-user current-user
                                       :filepath filename})
   (create-signed-download-url! app-id filename))
  ([app-id filename]
   (let [expiration (+ (System/currentTimeMillis) (* 1000 60 60 24 7)) ;; 7 days
         object-key (->object-key app-id filename)]

     (storage-beta/assert-storage-enabled! app-id)
     (str (s3-util/signed-download-url object-key expiration)))))

(defn create-signed-upload-url!
  ([app-id filename current-user]
   (assert-storage-permission! "create" {:app-id app-id
                                         :current-user current-user
                                         :filepath filename})
   (create-signed-upload-url! app-id filename))
  ([app-id filename]
   (let [object-key (->object-key app-id filename)]
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
   :name (object-key->filename key)
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
(defn delete-file!
  ([app-id filename current-user]
   (assert-storage-permission! "delete" {:app-id app-id
                                         :current-user current-user
                                         :filepath filename})
   (delete-file! app-id filename))
  ([app-id filename]
   (let [key (->object-key app-id filename)]
     (storage-beta/assert-storage-enabled! app-id)
     (s3-util/delete-object key))))

;; Deletes a multiple files by name/path (e.g. "demo.png", "profiles/me.jpg")
(defn bulk-delete-files! [app-id filenames]
  (let [keys (mapv (fn [filename] (->object-key app-id filename)) filenames)]
    (storage-beta/assert-storage-enabled! app-id)
    (s3-util/delete-objects keys)))


(comment
  (def app-id #uuid "524bc106-1f0d-44a0-b222-923505264c47")
  (def filename "demo.png")
  (def image-url "https://i.redd.it/bugxrdkjmm1b1.png")

  (create-signed-upload-url! app-id filename)
  (upload-image-to-s3 app-id filename image-url)
  (create-signed-download-url! app-id filename)
  (list-files! app-id "")
  (delete-file! app-id filename)
  (bulk-delete-files! app-id [filename])
  (list-files! app-id "")

  (def user-id #uuid "19020866-1238-4cfc-9a1c-d804fef3fb73")
  (def refresh-token (app-user-refresh-token-model/create! {:id (UUID/randomUUID) :user-id user-id}))
  (def current-user (app-user-model/get-by-refresh-token! {:app-id app-id :refresh-token (:id refresh-token)}))
  (def object-key (->object-key app-id filename))

  (defn storage-rules-mock [action logic] {:code {"$files" {"allow" {action logic}}}})

  ;; using db permission rules
  (create-signed-upload-url! app-id filename current-user)
  (create-signed-download-url! app-id filename current-user)

  ;; custom permission rules
  (assert-storage-permission! "create"  {:app-id app-id
                                         :filename filename
                                         :current-user nil
                                         :rules-override (storage-rules-mock "create" "true")})
  (assert-storage-permission! "create"  {:app-id app-id
                                         :filename filename
                                         :current-user nil
                                         :rules-override (storage-rules-mock "create" "data.path.contains('demo')")})
  (assert-storage-permission! "create"  {:app-id app-id
                                         :filename filename
                                         :current-user current-user
                                         :rules-override (storage-rules-mock "create" "auth.id != null")})

  (assert-storage-permission! "view" {:app-id app-id
                                      :filename filename
                                      :current-user nil
                                      :rules-override (storage-rules-mock "view" "true")})
  (assert-storage-permission! "view" {:app-id app-id
                                      :filename filename
                                      :current-user nil
                                      :rules-override (storage-rules-mock "view" "data.path.contains('demo')")})
  (assert-storage-permission! "view" {:app-id app-id
                                      :filename filename
                                      :current-user current-user
                                      :rules-override (storage-rules-mock "view" "auth.id != null")})

  (assert-storage-permission! "delete" {:app-id app-id
                                        :filename filename
                                        :current-user nil
                                        :rules-override (storage-rules-mock "delete" "true")})
  (assert-storage-permission! "delete" {:app-id app-id
                                        :filename filename
                                        :current-user nil
                                        :rules-override (storage-rules-mock "delete" "data.path.contains('demo')")})
  (assert-storage-permission! "delete" {:app-id app-id
                                        :filename filename
                                        :current-user current-user
                                        :rules-override (storage-rules-mock "delete" "auth.id != null")}))

;; Usage metrics

(defn list-all-app-objects []
  (loop [all-objects []
         continuation-token nil]
    (let [opts (if continuation-token
                 {:continuation-token continuation-token}
                 {})
          {:keys [object-summaries next-continuation-token truncated?]}
          (s3-util/list-objects-v2 opts)]
      (if truncated?
        (recur (into all-objects object-summaries) next-continuation-token)
        (into all-objects object-summaries)))))

(defn objects-by-app-id [objects]
  (group-by #(object-key->app-id (:key %)) objects))

(defn list-objects-by-app []
  (objects-by-app-id (list-all-app-objects)))

(defn calculate-app-metrics []
  (let [objects-by-app-id (list-objects-by-app)]
    (reduce (fn [acc [app-id objects]]
              (assoc acc app-id {:total-byte-size (reduce (fn [acc obj] (+ acc (:size obj))) 0 objects)
                                 :total-file-count (count objects)}))
            {} objects-by-app-id)))

(comment
  (count (list-all-app-objects))
  (list-objects-by-app)
  (calculate-app-metrics))
