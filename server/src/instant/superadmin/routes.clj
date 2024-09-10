(ns instant.superadmin.routes
  (:require [compojure.core :refer [defroutes POST GET DELETE] :as compojure]
            [ring.util.http-response :as response]
            [clojure.string :as string]
            [instant.util.uuid :as uuid-util]
            [instant.model.app :as app-model]
            [instant.model.instant-user :as instant-user-model]
            [instant.model.instant-personal-access-token :as instant-personal-access-token-model]
            [instant.util.exception :as ex]
            [instant.util.http :as http-util]
            [instant.util.email :as email]
            [instant.postmark :as postmark]
            [instant.model.app-member-invites :as instant-app-member-invites-model])

  (:import
   (java.util UUID)))

(defn req->superadmin-user! [req]
  (let [personal-access-token (http-util/req->bearer-token! req)]
    (instant-user-model/get-by-personal-access-token!
     {:personal-access-token personal-access-token})))

(defn apps-list-get [req]
  (let [{user-id :id} (req->superadmin-user! req)
        apps (app-model/list-by-creator-id user-id)]
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
        app (app-model/get-by-id-and-creator! {:user-id user-id :app-id app-id})]
    (response/ok {:app app})))

(defn app-update-post [req]
  (let [{user-id :id} (req->superadmin-user! req)
        id (ex/get-param! req [:params :app_id] uuid-util/coerce)
        {app-id :id} (app-model/get-by-id-and-creator! {:user-id user-id
                                                        :app-id id})
        title (ex/get-param! req [:body :title] string/trim)
        app (app-model/rename-by-id! {:id app-id :title title})]
    (response/ok {:app app})))

(defn app-delete [req]
  (let [{user-id :id} (req->superadmin-user! req)
        id (ex/get-param! req [:params :app_id] uuid-util/coerce)
        {app-id :id} (app-model/get-by-id-and-creator! {:user-id user-id
                                                        :app-id id})
        app (app-model/delete-by-id! {:id app-id})]
    (response/ok {:app app})))

(defn transfer-app-invite-email [{:keys [invitee-email inviter-id app-id]}]
  (let [title "Instant"
        user (instant-user-model/get-by-id! {:id inviter-id})
        app (app-model/get-by-id! {:id app-id})]
    {:from (str title " <teams@pm.instantdb.com>")
     :to invitee-email
     :subject (str "[Instant] You've been asked to take ownership of " (:title app))
     :html
     (postmark/standard-body
      "<p><strong>Hey there!</strong></p>
       <p>
         " (:email user) " invited you to become the new owner of " (:title app) ".
       </p>
       <p>
         Navigate to <a href=\"https://instantdb.com/dash?s=invites\">Instant</a> to accept the invite.
       </p>
       <p>
         Note: This invite will expire in 3 days. If you
         don't know the user inviting you, please reply to this email.
       </p>")}))

(defn app-transfer-send-invite-post [req]
  (let [{user-id :id} (req->superadmin-user! req)
        id (ex/get-param! req [:params :app_id] uuid-util/coerce)
        {app-id :id} (app-model/get-by-id-and-creator! {:user-id user-id
                                                        :app-id id})
        invitee-email (ex/get-param! req [:body :dest_email] email/coerce)
        {invite-id :id} (instant-app-member-invites-model/create!
                         {:app-id app-id
                          :inviter-id user-id
                          :email invitee-email
                          :role "creator"})]
    (instant-app-member-invites-model/create!
     {:app-id app-id
      :inviter-id user-id
      :email invitee-email
      :role "creator"})
    (postmark/send!
     (transfer-app-invite-email
      {:inviter-id user-id
       :invitee-email invitee-email
       :app-id app-id}))
    (response/ok {:id invite-id})))

(defn app-transfer-revoke-post [req]
  (let [{user-id :id} (req->superadmin-user! req)
        dest-email (ex/get-param! req [:body :dest_email] email/coerce)
        rejected-count (count (instant-app-member-invites-model/reject-by-email-and-role
                               {:inviter-id user-id
                                :invitee-email dest-email
                                :role "creator"}))]

    (response/ok {:count rejected-count})))

(comment
  (def user (instant-user-model/get-by-email {:email "stepan.p@gmail.com"}))
  (def token (instant-personal-access-token-model/create! {:id (UUID/randomUUID)
                                                           :user-id (:id user)
                                                           :name "Test Token"}))
  (def headers {"authorization" (str "Bearer " (:id token))})
  (def app-response (apps-create-post {:headers headers :body {:title "Demo App"}}))
  (def app-id (-> app-response :body :app :id))

  (apps-list-get {:headers headers})
  (app-details-get {:headers headers :params {:app_id app-id}})
  (app-update-post {:headers headers :params {:app_id app-id} :body {:title "Updated Demo App"}})
  (app-transfer-send-invite-post {:headers headers
                                  :params {:app_id app-id}
                                  :body {:dest_email "stopa@instantdb.com"}})
  (app-transfer-revoke-post {:headers headers
                             :params {:app_id app-id}
                             :body {:dest_email "stopa@instantdb.com"}})
  (app-delete {:headers headers :params {:app_id app-id}}))

(defroutes routes
  (GET "/superadmin/apps" [] apps-list-get)
  (POST "/superadmin/apps" [] apps-create-post)
  (GET "/superadmin/apps/:app_id" [] app-details-get)
  (POST "/superadmin/apps/:app_id" [] app-update-post)
  (POST "/superadmin/apps/:app_id/transfers/send" [] app-transfer-send-invite-post)
  (POST "/superadmin/apps/:app_id/transfers/revoke" [] app-transfer-revoke-post)
  (DELETE "/superadmin/apps/:app_id" [] app-delete))
