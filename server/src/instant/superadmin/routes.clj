(ns instant.superadmin.routes
  (:require [compojure.core :refer [defroutes POST GET DELETE] :as compojure]
            [ring.util.http-response :as response]
            [clojure.string :as string]
            [instant.util.uuid :as uuid-util]
            [instant.model.app :as app-model]
            [instant.model.instant-user :as instant-user-model]
            [instant.util.exception :as ex]
            [instant.util.http :as http-util])

  (:import
   (java.util UUID)))

(defn req->auth-user! [req]
  (let [refresh-token (http-util/req->bearer-token! req)]
    (instant-user-model/get-by-refresh-token! {:refresh-token refresh-token})))

(defn apps-list-get [req]
  (let [{user-id :id} (req->auth-user! req)
        apps (app-model/list-account-apps user-id)]
    (response/ok {:apps apps})))

(defn apps-create-post [req]
  (let [{user-id :id} (req->auth-user! req)
        title (ex/get-param! req [:body :title] string/trim)
        app (app-model/create! {:id (UUID/randomUUID)
                                :title title
                                :creator-id user-id
                                :admin-token (UUID/randomUUID)})]
    (response/ok {:app app})))

(defn app-details-get [req]
  (let [{user-id :id} (req->auth-user! req)
        app-id (ex/get-param! req [:params :app_id] uuid-util/coerce)
        app (app-model/get-account-app-by-id! {:user-id user-id :app-id app-id})]
    (response/ok {:app app})))

(defn app-update-post [req]
  (let [{user-id :id} (req->auth-user! req)
        id (ex/get-param! req [:params :app_id] uuid-util/coerce)
        {app-id :id} (app-model/get-account-app-by-id! {:user-id user-id
                                                        :app-id id})
        title (ex/get-param! req [:body :title] string/trim)
        app (app-model/rename-by-id! {:id app-id :title title})]
    (response/ok {:app app})))

(defn app-delete [req]
  (let [{user-id :id} (req->auth-user! req)
        id (ex/get-param! req [:params :app_id] uuid-util/coerce)
        {app-id :id} (app-model/get-account-app-by-id! {:user-id user-id
                                                        :app-id id})
        app (app-model/delete-by-id! {:id app-id})]
    (response/ok {:app app})))

(defroutes routes
  (GET "/superadmin/apps" [] apps-list-get)
  (POST "/superadmin/apps" [] apps-create-post)
  (GET "/superadmin/apps/:app_id" [] app-details-get)
  (POST "/superadmin/apps/:app_id" [] app-update-post)
  (DELETE "/superadmin/apps/:app_id" [] app-delete))
