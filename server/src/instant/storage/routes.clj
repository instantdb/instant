(ns instant.storage.routes
  (:require [compojure.core :refer [defroutes POST GET DELETE PUT] :as compojure]
            [ring.util.http-response :as response]
            [instant.util.exception :as ex]
            [instant.util.uuid :as uuid-util]
            [instant.util.string :as string-util]
            [instant.util.http :as http-util]
            [instant.model.app-user :as app-user-model]
            [instant.storage.coordinator :as storage-coordinator]
            [clojure.walk :as w]))

(defn req->content-length! [{:keys [content-length] :as _req}]
  content-length)

(defn req->app-file! [req params]
  (let [app-id (ex/get-param! params [:app_id] uuid-util/coerce)
        refresh-token (http-util/req->bearer-token req)
        current-user (app-user-model/get-by-refresh-token
                      {:app-id app-id
                       :refresh-token refresh-token})
        content-length (req->content-length! req)]
    {:app-id app-id
     :current-user current-user
     :path (ex/get-some-param! params [[:path] [:filename]] string-util/coerce-non-blank-str)
     :content-type (ex/get-optional-param! params [:content-type] string-util/coerce-non-blank-str)
     :content-length content-length
     :content-disposition (ex/get-optional-param! params [:content-disposition] string-util/coerce-non-blank-str)}))

(defn upload-put [req]
  (let [params (w/keywordize-keys (:headers req))
        ctx (req->app-file! req params)
        file (ex/get-param! req [:body] identity)
        data (storage-coordinator/upload-file! ctx file)]
    (response/ok {:data data})))

(defn file-delete [req]
  (let [{:keys [app-id path current-user]}
        (req->app-file! req (:params req))
        data (storage-coordinator/delete-file! {:app-id app-id
                                                :path path
                                                :current-user current-user})]
    (response/ok {:data data})))

;; Legacy routes for backwards compatibility (deprecated Jan 2025)
;; -------------------------

(defn create-upload-url-post [req]
  (let [{:keys [app-id path current-user]} (req->app-file! req (:body req))
        data (storage-coordinator/create-upload-url! {:app-id app-id
                                                      :path path
                                                      :current-user current-user})]
    (response/ok {:data data})))

(defn consume-upload-url-put [req]
  (let [upload-id (ex/get-param! req [:params :upload-id] uuid-util/coerce)
        file (ex/get-param! req [:body] identity)
        content-type (or (ex/get-optional-param! req [:headers "content-type"] string-util/coerce-non-blank-str)
                         "application/octet-stream")
        content-length (req->content-length! req)
        data (storage-coordinator/consume-upload-url!
              {:upload-id upload-id :content-type content-type :content-length content-length} file)]
    (response/ok {:data data})))

(defn signed-download-url-get [req]
  (let [{:keys [app-id path current-user]} (req->app-file! req (:params req))
        data (storage-coordinator/create-download-url {:app-id app-id
                                                       :path path
                                                       :current-user current-user})]
    (response/ok {:data data})))

(defroutes routes
  (PUT "/storage/upload" [] upload-put)
  (DELETE "/storage/files" [] file-delete)
  (POST "/storage/signed-upload-url" [] create-upload-url-post)
  (PUT "/storage/:upload-id/consume-upload-url" [] consume-upload-url-put)
  (GET "/storage/signed-download-url" [] signed-download-url-get))
