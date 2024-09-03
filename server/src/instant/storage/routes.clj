(ns instant.storage.routes
  (:require [compojure.core :refer [defroutes POST GET DELETE] :as compojure]
            [ring.util.http-response :as response]
            [instant.util.exception :as ex]
            [instant.util.uuid :as uuid-util]
            [instant.util.string :as string-util]
            [instant.util.http :as http-util]
            [instant.util.storage :as storage-util]
            [instant.model.app-user :as app-user-model]
            [instant.model.app-user-refresh-token :as app-user-refresh-token-model]
            [instant.storage.s3 :as s3-util])
  (:import
   (java.util UUID)))

(defn buckets-get [_req]
  (let [buckets (s3-util/list-buckets)]
    (response/ok {:data (map #(select-keys % [:name]) buckets)})))

(defn objects-get [req]
  (let [bucket (-> req :params :bucket)
        objects-resp (s3-util/list-objects bucket)
        objects (:object-summaries objects-resp)]
    (response/ok {:data (map #(select-keys % [:key :size :owner :etag]) objects)})))

(comment
  (def b s3-util/default-bucket)
  (buckets-get {})
  (objects-get {:params {:bucket b}}))

(defn req->app-file! [req params]
  (let [filename (ex/get-param! params [:filename] string-util/coerce-non-blank-str)
        app-id (ex/get-param! params [:app_id] uuid-util/coerce)
        refresh-token (http-util/req->bearer-token req)
        current-user (app-user-model/get-by-refresh-token {:app-id app-id :refresh-token refresh-token})]
    {:app-id app-id :filename filename :current-user current-user}))

(defn signed-download-url-get [req]
  (let [{:keys [app-id filename current-user]} (req->app-file! req (:params req))
        data (storage-util/create-signed-download-url! app-id filename current-user)]
    (response/ok {:data data})))

(defn signed-upload-url-post [req]
  (let [{:keys [app-id filename current-user]} (req->app-file! req (:body req))
        data (storage-util/create-signed-upload-url! app-id filename current-user)]
    (response/ok {:data data})))

(defn file-delete [req]
  (let [{:keys [app-id filename current-user]} (req->app-file! req (:params req))
        data (storage-util/delete-file! app-id filename current-user)]
    (response/ok {:data data})))

(comment
  (def app-id #uuid "524bc106-1f0d-44a0-b222-923505264c47")
  (def user-id #uuid "19020866-1238-4cfc-9a1c-d804fef3fb73")
  (def refresh-token (app-user-refresh-token-model/create! {:id (UUID/randomUUID) :user-id user-id}))
  (def filename "test/images/demo.png")
  (def image-url "https://i.redd.it/bugxrdkjmm1b1.png")
  (def object-key (storage-util/->object-key app-id filename))
  (signed-upload-url-post {:body {:app_id app-id :filename filename}
                           :headers {"authorization" (str "Bearer " (:id refresh-token))}})
  ;; upload image via url for testing
  (s3-util/upload-image-to-s3 object-key image-url)
  ;; check that it exists in storage
  (s3-util/list-app-objects app-id)
  (s3-util/get-object object-key)

  (signed-download-url-get {:params {:app_id app-id :filename filename}
                            :headers {"authorization" (str "Bearer " (:id refresh-token))}})
  (file-delete {:params {:app_id app-id :filename filename}
                :headers {"authorization" (str "Bearer " (:id refresh-token))}})

  (s3-util/delete-object object-key)
  (s3-util/list-app-objects app-id))

(defroutes routes
  (POST "/storage/signed-upload-url" [] signed-upload-url-post)
  (GET "/storage/signed-download-url", [] signed-download-url-get)
  (DELETE "/storage/files" [] file-delete))
