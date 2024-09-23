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
            [instant.model.app-member-invites :as instant-app-member-invites-model]
            [clojure.walk :as w]
            [instant.model.rule :as rule-model]
            [instant.model.schema :as schema-model]
            [instant.jdbc.aurora :as aurora])

  (:import
   (java.util UUID)))

(defn req->superadmin-user! [req]
  (let [personal-access-token (http-util/req->bearer-token! req)]
    (instant-user-model/get-by-personal-access-token!
     {:personal-access-token personal-access-token})))

(defn req->superadmin-user-and-app! [req]
  (let [{user-id :id :as user} (req->superadmin-user! req)
        id (ex/get-param! req [:params :app_id] uuid-util/coerce)
        app (app-model/get-by-id-and-creator! {:user-id user-id
                                               :app-id id})]
    {:user user :app app}))

;; -------- 
;; App crud 

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
  (let [{:keys [app]} (req->superadmin-user-and-app! req)]
    (response/ok {:app app})))

(defn app-update-post [req]
  (let [{{app-id :id} :app} (req->superadmin-user-and-app! req)
        title (ex/get-param! req [:body :title] string/trim)
        app (app-model/rename-by-id! {:id app-id :title title})]
    (response/ok {:app app})))

(defn app-delete [req]
  (let [{{app-id :id} :app} (req->superadmin-user-and-app! req)
        app (app-model/delete-by-id! {:id app-id})]
    (response/ok {:app app})))

;; ---------- 
;; Transfers 

(defn transfer-app-invite-email [inviter-user app invitee-email]
  (let [title "Instant"]
    {:from (str title " <teams@pm.instantdb.com>")
     :to invitee-email
     :subject (str "[Instant] You've been asked to take ownership of " (:title app))
     :html
     (postmark/standard-body
      "<p><strong>Hey there!</strong></p>
       <p>
         " (:email inviter-user) " invited you to become the new owner of " (:title app) ".
       </p>
       <p>
         Navigate to <a href=\"https://instantdb.com/dash?s=invites\">Instant</a> to accept the invite.
       </p>
       <p>
         Note: This invite will expire in 3 days. If you
         don't know the user inviting you, please reply to this email.
       </p>")}))

(defn app-transfer-send-invite-post [req]
  (let [{:keys [app user]} (req->superadmin-user-and-app! req)
        invitee-email (ex/get-param! req [:body :dest_email] email/coerce)
        {app-id :id} app
        {user-id :id} user
        {invite-id :id} (instant-app-member-invites-model/create!
                         {:app-id app-id
                          :inviter-id user-id
                          :email invitee-email
                          :role "creator"})]
    (postmark/send!
     (transfer-app-invite-email user app invitee-email))
    (response/ok {:id invite-id})))

(defn app-transfer-revoke-post [req]
  (let [{{user-id :id} :user {app-id :id} :app} (req->superadmin-user-and-app! req)
        dest-email (ex/get-param! req [:body :dest_email] email/coerce)
        rejected-count (count (instant-app-member-invites-model/reject-by-email-and-role
                               {:inviter-id user-id
                                :app-id app-id
                                :invitee-email dest-email
                                :role "creator"}))]

    (response/ok {:count rejected-count})))

;; --------- 
;; Rules 

(defn app-rules-get [req]
  (let [{{app-id :id} :app} (req->superadmin-user-and-app! req)
        {:keys [code]} (rule-model/get-by-app-id aurora/conn-pool {:app-id app-id})]
    (response/ok {:perms code})))

(defn app-rules-post [req]
  (let [{{app-id :id} :app} (req->superadmin-user-and-app! req)
        code (ex/get-param! req [:body :code] w/stringify-keys)]
    (ex/assert-valid! :rule code (rule-model/validation-errors code))
    (response/ok {:rules (rule-model/put! {:app-id app-id
                                           :code code})})))

;; --------- 
;; Schema 

(defn app-schema-plan-post [req]
  (let [{{app-id :id} :app} (req->superadmin-user-and-app! req)
        client-defs (-> req :body :schema)]
    (response/ok (schema-model/plan! app-id client-defs))))

(defn app-schema-apply-post [req]
  (let [{{app-id :id} :app} (req->superadmin-user-and-app! req)
        client-defs (-> req :body :schema)
        plan (schema-model/plan! app-id client-defs)]
    (schema-model/apply-plan! app-id plan)
    (response/ok plan)))

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

  (POST "/superadmin/apps/:app_id/schema/push/plan" [] app-schema-plan-post)
  (POST "/superadmin/apps/:app_id/schema/push/apply" [] app-schema-apply-post)

  (GET "/superadmin/apps/:app_id/perms" [] app-rules-get)
  (POST "/superadmin/apps/:app_id/perms" [] app-rules-post)

  (DELETE "/superadmin/apps/:app_id" [] app-delete))
