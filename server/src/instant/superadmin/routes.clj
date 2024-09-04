(ns instant.superadmin.routes
  (:require [compojure.core :refer [defroutes POST GET DELETE] :as compojure]
            [ring.util.http-response :as response]
            [clojure.string :as string]
            [instant.util.uuid :as uuid-util]
            [instant.model.app :as app-model]
            [instant.model.instant-user :as instant-user-model]
            [instant.model.instant-personal-access-token :as instant-personal-access-token-model]
            [instant.util.exception :as ex]
            [instant.util.http :as http-util])

  (:import
   (java.util UUID)))

(defn req->superadmin-user! [req]
  (let [personal-access-token (http-util/req->bearer-token! req)]
    (instant-user-model/get-by-personal-access-token!
     {:personal-access-token personal-access-token})))

(defn apps-list-get [req]
  (let [{user-id :id} (req->superadmin-user! req)
        apps (app-model/list-account-apps user-id)]
    (response/ok {:apps apps})))

(defn apps-create-post [req]
  (let [{user-id :id} (req->superadmin-user! req)
        title (ex/get-param! req [:body :title] string/trim)
        app (app-model/create! {:id (UUID/randomUUID)
                                :title title
                                :creator-id user-id
                                :admin-token (UUID/randomUUID)})]
    (response/ok {:app app})))

(defn app-details-get [req]
  (let [{user-id :id} (req->superadmin-user! req)
        app-id (ex/get-param! req [:params :app_id] uuid-util/coerce)
        app (app-model/get-account-app-by-id! {:user-id user-id :app-id app-id})]
    (response/ok {:app app})))

(defn app-update-post [req]
  (let [{user-id :id} (req->superadmin-user! req)
        id (ex/get-param! req [:params :app_id] uuid-util/coerce)
        {app-id :id} (app-model/get-account-app-by-id! {:user-id user-id
                                                        :app-id id})
        title (ex/get-param! req [:body :title] string/trim)
        app (app-model/rename-by-id! {:id app-id :title title})]
    (response/ok {:app app})))

(defn app-delete [req]
  (let [{user-id :id} (req->superadmin-user! req)
        id (ex/get-param! req [:params :app_id] uuid-util/coerce)
        {app-id :id} (app-model/get-account-app-by-id! {:user-id user-id
                                                        :app-id id})
        app (app-model/delete-by-id! {:id app-id})]
    (response/ok {:app app})))

(comment
  (def user (instant-user-model/get-by-email {:email "alex@instantdb.com"}))
  (def token (instant-personal-access-token-model/create! {:id (UUID/randomUUID) :user-id (:id user)}))
  (def headers {"authorization" (str "Bearer " (:id token))})
  (def app-response (apps-create-post {:headers headers :body {:title "Demo App"}}))
  (def app-id (-> app-response :body :app :id))

  (apps-list-get {:headers headers})
  (app-details-get {:headers headers :params {:app_id app-id}})
  (app-update-post {:headers headers :params {:app_id app-id} :body {:title "Updated Demo App"}})
  (app-delete {:headers headers :params {:app_id app-id}}))

(defroutes routes
  (GET "/superadmin/apps" [] apps-list-get)
  (POST "/superadmin/apps" [] apps-create-post)
  (GET "/superadmin/apps/:app_id" [] app-details-get)
  (POST "/superadmin/apps/:app_id" [] app-update-post)
  (DELETE "/superadmin/apps/:app_id" [] app-delete))
