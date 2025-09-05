(ns instant.dash.routes-test
  (:require
   [clj-http.client :as http]
   [clojure.test :refer [deftest is testing]]
   [instant.config :as config]
   [instant.fixtures :refer [random-email with-empty-app with-org with-user with-startup-org]]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.util.json :refer [->json]]
   [instant.dash.routes :as route]))

(deftest app-invites-work
  (with-redefs [config/postmark-send-enabled? (constantly false)]
    (with-user
      (fn [u]
        (with-empty-app
          (:id u)
          (fn [app]
            (let [invitee-email (random-email)
                  resp (http/post (str config/server-origin "/dash/apps/" (:id app) "/invite/send")
                                  {:headers {:Authorization (str "Bearer " (:refresh-token u))
                                             :Content-Type "application/json"}
                                   :as :json
                                   :body (->json {:invitee-email invitee-email
                                                  :role "admin"})})
                  _ (is (= 200 (:status resp)))
                  invite (sql/select-one (aurora/conn-pool :read)
                                         ["select * from app_member_invites where invitee_email = ?" invitee-email])]

              (is (= "pending" (:status invite)))
              (is (= "admin" (:invitee_role invite)))

              (testing "random users can't accept"
                (with-user
                  (fn [u2]
                    (let [resp (http/post (str config/server-origin "/dash/invites/accept")
                                          {:throw-exceptions false
                                           :headers {:Authorization (str "Bearer " (:refresh-token u2))
                                                     :Content-Type "application/json"}
                                           :as :json
                                           :body (->json {:invite-id (:id invite)})})
                          member (sql/select-one (aurora/conn-pool :read)
                                                 ["select * from app_members where app_id = ? and user_id = ?"
                                                  (:id app)
                                                  (:id u2)])
                          invite (sql/select-one (aurora/conn-pool :read)
                                                 ["select * from app_member_invites where invitee_email = ?" invitee-email])]
                      (is (= 400 (:status resp)))
                      (is (not member))
                      (is (= "pending" (:status invite)))))))

              (with-user
                {:email invitee-email}
                (fn [invitee]
                  (let [_res (http/post (str config/server-origin "/dash/invites/accept")
                                        {:headers {:Authorization (str "Bearer " (:refresh-token invitee))
                                                   :Content-Type "application/json"}
                                         :as :json
                                         :body (->json {:invite-id (:id invite)})})
                        member (sql/select-one (aurora/conn-pool :read)
                                               ["select * from app_members where app_id = ? and user_id = ?"
                                                (:id app)
                                                (:id invitee)])
                        invite (sql/select-one (aurora/conn-pool :read)
                                               ["select * from app_member_invites where invitee_email = ?" invitee-email])]

                    (is member)
                    (is (= "admin" (:member_role member)))
                    (is (= "accepted" (:status invite)))

                    (testing "roles can be updated"
                      (let [_res (http/post (str config/server-origin "/dash/apps/" (:id app) "/members/update")
                                            {:headers {:Authorization (str "Bearer " (:refresh-token u))
                                                       :Content-Type "application/json"}
                                             :as :json
                                             :body (->json {:id (:id member)
                                                            :role "collaborator"})})
                            member (sql/select-one (aurora/conn-pool :read)
                                                   ["select * from app_members where app_id = ? and user_id = ?"
                                                    (:id app)
                                                    (:id invitee)])]
                        (is (= "collaborator" (:member_role member)))))

                    (testing "members can be removed"
                      (let [_res (http/post (str config/server-origin "/dash/apps/" (:id app) "/members/update")
                                            {:headers {:Authorization (str "Bearer " (:refresh-token u))
                                                       :Content-Type "application/json"}
                                             :as :json
                                             :body (->json {:id (:id member)
                                                            :role "collaborator"})})
                            member (sql/select-one (aurora/conn-pool :read)
                                                   ["select * from app_members where app_id = ? and user_id = ?"
                                                    (:id app)
                                                    (:id invitee)])]
                        (is (= "collaborator" (:member_role member)))))))))))))))

(deftest app-invites-can-be-revoked
  (with-redefs [config/postmark-send-enabled? (constantly false)]
    (with-user
      (fn [u]
        (with-empty-app
          (:id u)
          (fn [app]
            (let [invitee-email (random-email)
                  resp (http/post (str config/server-origin "/dash/apps/" (:id app) "/invite/send")
                                  {:headers {:Authorization (str "Bearer " (:refresh-token u))
                                             :Content-Type "application/json"}
                                   :as :json
                                   :body (->json {:invitee-email invitee-email
                                                  :role "admin"})})
                  _ (is (= 200 (:status resp)))
                  invite (sql/select-one (aurora/conn-pool :read)
                                         ["select * from app_member_invites where invitee_email = ?" invitee-email])]

              (is (= "pending" (:status invite)))
              (is (= "admin" (:invitee_role invite)))

              (testing "random users can't revoke"
                (with-user
                  (fn [u2]
                    (let [resp (http/delete (str config/server-origin "/dash/apps/" (:id app) "/invite/revoke")
                                            {:throw-exceptions false
                                             :headers {:Authorization (str "Bearer " (:refresh-token u2))
                                                       :Content-Type "application/json"}
                                             :as :json
                                             :body (->json {:invite-id (:id invite)})})
                          invite (sql/select-one (aurora/conn-pool :read)
                                                 ["select * from app_member_invites where invitee_email = ?" invitee-email])]
                      (is (= 400 (:status resp)))
                      (is (= "pending" (:status invite)))))))


              (let [_res (http/delete (str config/server-origin "/dash/apps/" (:id app) "/invite/revoke")
                                      {:headers {:Authorization (str "Bearer " (:refresh-token u))
                                                 :Content-Type "application/json"}
                                       :as :json
                                       :body (->json {:invite-id (:id invite)})})
                    invite (sql/select-one (aurora/conn-pool :read)
                                           ["select * from app_member_invites where invitee_email = ?" invitee-email])]

                (is (= "revoked" (:status invite))))

              (testing "revoked invites can't be accepted"
                (with-user
                  {:email invitee-email}
                  (fn [invitee]
                    (let [resp (http/post (str config/server-origin "/dash/invites/accept")
                                          {:throw-exceptions false
                                           :headers {:Authorization (str "Bearer " (:refresh-token invitee))
                                                     :Content-Type "application/json"}
                                           :as :json
                                           :body (->json {:invite-id (:id invite)})})
                          member (sql/select-one (aurora/conn-pool :read)
                                                 ["select * from app_members where app_id = ? and user_id = ?"
                                                  (:id app)
                                                  (:id invitee)])
                          invite (sql/select-one (aurora/conn-pool :read)
                                                 ["select * from app_member_invites where invitee_email = ?" invitee-email])]

                      (is (= 400 (:status resp)))

                      (is (not member))
                      (is (= "revoked" (:status invite))))))))))))))

(deftest app-invites-can-be-rejected
  (with-redefs [config/postmark-send-enabled? (constantly false)]
    (with-user
      (fn [u]
        (with-empty-app
          (:id u)
          (fn [app]
            (let [invitee-email (random-email)
                  resp (http/post (str config/server-origin "/dash/apps/" (:id app) "/invite/send")
                                  {:headers {:Authorization (str "Bearer " (:refresh-token u))
                                             :Content-Type "application/json"}
                                   :as :json
                                   :body (->json {:invitee-email invitee-email
                                                  :role "admin"})})
                  _ (is (= 200 (:status resp)))
                  invite (sql/select-one (aurora/conn-pool :read)
                                         ["select * from app_member_invites where invitee_email = ?" invitee-email])]

              (is (= "pending" (:status invite)))
              (is (= "admin" (:invitee_role invite)))


              (with-user
                {:email invitee-email}
                (fn [invitee]
                  (let [_res (http/post (str config/server-origin "/dash/invites/decline")
                                        {:headers {:Authorization (str "Bearer " (:refresh-token invitee))
                                                   :Content-Type "application/json"}
                                         :as :json
                                         :body (->json {:invite-id (:id invite)})})
                        member (sql/select-one (aurora/conn-pool :read)
                                               ["select * from app_members where app_id = ? and user_id = ?"
                                                (:id app)
                                                (:id invitee)])
                        invite (sql/select-one (aurora/conn-pool :read)
                                               ["select * from app_member_invites where invitee_email = ?" invitee-email])]

                    (is (not member))
                    (is (= "revoked" (:status invite)))))))))))))

(deftest org-invites-work
  (with-redefs [config/postmark-send-enabled? (constantly false)]
    (with-user
      (fn [u]
        (with-org
          (:id u)
          (fn [org]
            (let [invitee-email (random-email)
                  resp (http/post (str config/server-origin "/dash/orgs/" (:id org) "/invite/send")
                                  {:headers {:Authorization (str "Bearer " (:refresh-token u))
                                             :Content-Type "application/json"}
                                   :as :json
                                   :body (->json {:invitee-email invitee-email
                                                  :role "admin"})})
                  _ (is (= 200 (:status resp)))
                  invite (sql/select-one (aurora/conn-pool :read)
                                         ["select * from org_member_invites where invitee_email = ?" invitee-email])]

              (is (= "pending" (:status invite)))
              (is (= "admin" (:invitee_role invite)))

              (testing "random users can't accept"
                (with-user
                  (fn [u2]
                    (let [resp (http/post (str config/server-origin "/dash/invites/accept")
                                          {:throw-exceptions false
                                           :headers {:Authorization (str "Bearer " (:refresh-token u2))
                                                     :Content-Type "application/json"}
                                           :as :json
                                           :body (->json {:invite-id (:id invite)})})
                          member (sql/select-one (aurora/conn-pool :read)
                                                 ["select * from org_members where org_id = ? and user_id = ?"
                                                  (:id org)
                                                  (:id u2)])
                          invite (sql/select-one (aurora/conn-pool :read)
                                                 ["select * from org_member_invites where invitee_email = ?" invitee-email])]
                      (is (= 400 (:status resp)))
                      (is (not member))
                      (is (= "pending" (:status invite)))))))

              (with-user
                {:email invitee-email}
                (fn [invitee]
                  (let [_res (http/post (str config/server-origin "/dash/invites/accept")
                                        {:headers {:Authorization (str "Bearer " (:refresh-token invitee))
                                                   :Content-Type "application/json"}
                                         :as :json
                                         :body (->json {:invite-id (:id invite)})})
                        member (sql/select-one (aurora/conn-pool :read)
                                               ["select * from org_members where org_id = ? and user_id = ?"
                                                (:id org)
                                                (:id invitee)])
                        invite (sql/select-one (aurora/conn-pool :read)
                                               ["select * from org_member_invites where invitee_email = ?" invitee-email])]

                    (is member)
                    (is (= "admin" (:role member)))
                    (is (= "accepted" (:status invite)))

                    (testing "roles can be updated"
                      (let [_res (http/post (str config/server-origin "/dash/orgs/" (:id org) "/members/update")
                                            {:headers {:Authorization (str "Bearer " (:refresh-token u))
                                                       :Content-Type "application/json"}
                                             :as :json
                                             :body (->json {:id (:id member)
                                                            :role "collaborator"})})
                            member (sql/select-one (aurora/conn-pool :read)
                                                   ["select * from org_members where org_id = ? and user_id = ?"
                                                    (:id org)
                                                    (:id invitee)])]
                        (is (= "collaborator" (:role member)))))

                    (testing "members can be removed"
                      (let [_res (http/post (str config/server-origin "/dash/orgs/" (:id org) "/members/update")
                                            {:headers {:Authorization (str "Bearer " (:refresh-token u))
                                                       :Content-Type "application/json"}
                                             :as :json
                                             :body (->json {:id (:id member)
                                                            :role "collaborator"})})
                            member (sql/select-one (aurora/conn-pool :read)
                                                   ["select * from org_members where org_id = ? and user_id = ?"
                                                    (:id org)
                                                    (:id invitee)])]
                        (is (= "collaborator" (:role member)))))))))))))))

(deftest org-invites-can-be-revoked
  (with-redefs [config/postmark-send-enabled? (constantly false)]
    (with-user
      (fn [u]
        (with-org
          (:id u)
          (fn [org]
            (let [invitee-email (random-email)
                  resp (http/post (str config/server-origin "/dash/orgs/" (:id org) "/invite/send")
                                  {:headers {:Authorization (str "Bearer " (:refresh-token u))
                                             :Content-Type "application/json"}
                                   :as :json
                                   :body (->json {:invitee-email invitee-email
                                                  :role "admin"})})
                  _ (is (= 200 (:status resp)))
                  invite (sql/select-one (aurora/conn-pool :read)
                                         ["select * from org_member_invites where invitee_email = ?" invitee-email])]

              (is (= "pending" (:status invite)))
              (is (= "admin" (:invitee_role invite)))

              (testing "random users can't revoke"
                (with-user
                  (fn [u2]
                    (let [resp (http/delete (str config/server-origin "/dash/orgs/" (:id org) "/invite/revoke")
                                            {:throw-exceptions false
                                             :headers {:Authorization (str "Bearer " (:refresh-token u2))
                                                       :Content-Type "application/json"}
                                             :as :json
                                             :body (->json {:invite-id (:id invite)})})
                          invite (sql/select-one (aurora/conn-pool :read)
                                                 ["select * from org_member_invites where invitee_email = ?" invitee-email])]
                      (is (= 400 (:status resp)))
                      (is (= "pending" (:status invite)))))))


              (let [_res (http/delete (str config/server-origin "/dash/orgs/" (:id org) "/invite/revoke")
                                      {:headers {:Authorization (str "Bearer " (:refresh-token u))
                                                 :Content-Type "application/json"}
                                       :as :json
                                       :body (->json {:invite-id (:id invite)})})
                    invite (sql/select-one (aurora/conn-pool :read)
                                           ["select * from org_member_invites where invitee_email = ?" invitee-email])]

                (is (= "revoked" (:status invite))))

              (testing "revoked invites can't be accepted"
                (with-user
                  {:email invitee-email}
                  (fn [invitee]
                    (let [resp (http/post (str config/server-origin "/dash/invites/accept")
                                          {:throw-exceptions false
                                           :headers {:Authorization (str "Bearer " (:refresh-token invitee))
                                                     :Content-Type "application/json"}
                                           :as :json
                                           :body (->json {:invite-id (:id invite)})})
                          member (sql/select-one (aurora/conn-pool :read)
                                                 ["select * from org_members where org_id = ? and user_id = ?"
                                                  (:id org)
                                                  (:id invitee)])
                          invite (sql/select-one (aurora/conn-pool :read)
                                                 ["select * from org_member_invites where invitee_email = ?" invitee-email])]

                      (is (= 400 (:status resp)))

                      (is (not member))
                      (is (= "revoked" (:status invite))))))))))))))

(deftest org-invites-can-be-rejected
  (with-redefs [config/postmark-send-enabled? (constantly false)]
    (with-user
      (fn [u]
        (with-org
          (:id u)
          (fn [org]
            (let [invitee-email (random-email)
                  resp (http/post (str config/server-origin "/dash/orgs/" (:id org) "/invite/send")
                                  {:headers {:Authorization (str "Bearer " (:refresh-token u))
                                             :Content-Type "application/json"}
                                   :as :json
                                   :body (->json {:invitee-email invitee-email
                                                  :role "admin"})})
                  _ (is (= 200 (:status resp)))
                  invite (sql/select-one (aurora/conn-pool :read)
                                         ["select * from org_member_invites where invitee_email = ?" invitee-email])]

              (is (= "pending" (:status invite)))
              (is (= "admin" (:invitee_role invite)))


              (with-user
                {:email invitee-email}
                (fn [invitee]
                  (let [_res (http/post (str config/server-origin "/dash/invites/decline")
                                        {:headers {:Authorization (str "Bearer " (:refresh-token invitee))
                                                   :Content-Type "application/json"}
                                         :as :json
                                         :body (->json {:invite-id (:id invite)})})
                        member (sql/select-one (aurora/conn-pool :read)
                                               ["select * from org_members where org_id = ? and user_id = ?"
                                                (:id org)
                                                (:id invitee)])
                        invite (sql/select-one (aurora/conn-pool :read)
                                               ["select * from org_member_invites where invitee_email = ?" invitee-email])]

                    (is (not member))
                    (is (= "revoked" (:status invite)))))))))))))

(deftest app-access-works-through-orgs
  (with-startup-org
    (fn [{:keys [app org owner collaborator admin outside-user]}]
      ;; Check a path available to all members of the app
      (let [auth-path (format "%s/dash/apps/%s/auth" config/server-origin (:id app))]
        (doseq [{:keys [user expected type]} [{:type "owner"
                                               :user owner
                                               :expected 200}
                                              {:type "collaborator"
                                               :user collaborator
                                               :expected 200}
                                              {:type "admin"
                                               :user admin
                                               :expected 200}
                                              {:type "outside-user"
                                               :user outside-user
                                               :expected 400}]]
          (testing type
            (is (= expected (:status (http/get auth-path
                                               {:throw-exceptions false
                                                :headers {:Authorization (str "Bearer " (:refresh-token user))
                                                          :Content-Type "application/json"}
                                                :as :json})))))))

      (testing "req->app-and-user!"
        (doseq [{:keys [user expected type role]} [{:type "owner"
                                                    :user owner
                                                    :role :owner
                                                    :expected :ok}
                                                   {:type "owner"
                                                    :user owner
                                                    :role :admin
                                                    :expected :ok}
                                                   {:type "owner"
                                                    :user owner
                                                    :role :collaborator
                                                    :expected :ok}

                                                   {:type "collaborator"
                                                    :user collaborator
                                                    :role :owner
                                                    :expected :error}
                                                   {:type "collaborator"
                                                    :user collaborator
                                                    :role :admin
                                                    :expected :error}
                                                   {:type "collaborator"
                                                    :user collaborator
                                                    :role :collaborator
                                                    :expected :ok}

                                                   {:type "admin"
                                                    :user admin
                                                    :role :owner
                                                    :expected :error}
                                                   {:type "admin"
                                                    :user admin
                                                    :role :admin
                                                    :expected :ok}
                                                   {:type "admin"
                                                    :user admin
                                                    :role :collaborator
                                                    :expected :ok}

                                                   {:type "outside-user"
                                                    :user outside-user
                                                    :role :owner
                                                    :expected :error}
                                                   {:type "outside-user"
                                                    :user outside-user
                                                    :role :admin
                                                    :expected :error}
                                                   {:type "outside-user"
                                                    :user outside-user
                                                    :role :collaborator
                                                    :expected :error}]]
          (testing (format "%s with role %s" type role)
            (let [req {:params {:app_id (:id app)}
                       :headers {"authorization" (str "Bearer " (:refresh-token user))}}]
              (case expected
                :ok (is (= (:id app)
                           (:id (:app (route/req->app-and-user! role req)))))
                :error (is (thrown? Exception (route/req->app-and-user! role req)))))))))))
