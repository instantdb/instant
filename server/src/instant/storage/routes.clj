(ns instant.storage.routes
  (:require [compojure.core :refer [defroutes POST GET] :as compojure]
            [ring.util.http-response :as response]
            [instant.util.exception :as ex]
            [instant.util.uuid :as uuid-util]
            [instant.util.string :as string-util]
            [instant.util.http :as http-util]
            [instant.util.storage :as storage-util]
            [instant.model.app :as app-model]
            [instant.storage.s3 :as s3-util]))

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

(defn signed-download-url-get [req]
  (let [app-id-param (ex/get-param! req [:params :app_id] uuid-util/coerce)
        {app-id :id} (app-model/get-by-id! {:id app-id-param})
        filename (ex/get-param! req [:params :filename] string-util/coerce-non-blank-str)
        refresh-token (http-util/req->bearer-token req)
        data (storage-util/create-signed-download-url! app-id filename refresh-token)]
    (response/ok {:data data})))

(defn signed-upload-url-post [req]
  (let [app-id-param (ex/get-param! req [:body :app_id] uuid-util/coerce)
        {app-id :id} (app-model/get-by-id! {:id app-id-param})
        filename (ex/get-param! req [:body :filename] string-util/coerce-non-blank-str)
        refresh-token (http-util/req->bearer-token req)
        data (storage-util/create-signed-upload-url! app-id filename refresh-token)]
    (response/ok {:data data})))

(defroutes routes
  (POST "/storage/signed-upload-url" [] signed-upload-url-post)
  (GET "/storage/signed-download-url", [] signed-download-url-get))
