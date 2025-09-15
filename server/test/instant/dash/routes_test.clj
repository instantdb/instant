(ns instant.dash.routes-test
  (:require
   [clj-http.client :as http]
   [clojure.test :refer [deftest is testing use-fixtures]]
   [instant.config :as config]
   [instant.fixtures :refer [random-email with-empty-app with-org with-pro-app with-startup-org with-user]]
   [instant.dash.routes :as routes]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.model.app :as app-model]
   [instant.model.instant-stripe-customer :as stripe-customer-model]
   [instant.stripe :as stripe]
   [instant.util.crypt :as crypt-util]
   [instant.util.json :refer [->json]]
   [instant.util.tracer :as tracer]))

(defn silence-routes-exceptions [f]
  (with-redefs [tracer/*silence-exceptions?* (atom true)]
    (f)))

(use-fixtures :each silence-routes-exceptions)

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
                      (let [_res (http/delete (str config/server-origin "/dash/apps/" (:id app) "/members/remove")
                                              {:headers {:Authorization (str "Bearer " (:refresh-token u))
                                                         :Content-Type "application/json"}
                                               :as :json
                                               :body (->json {:id (:id member)
                                                              :role "collaborator"})})
                            member (sql/select-one (aurora/conn-pool :read)
                                                   ["select * from app_members where app_id = ? and user_id = ?"
                                                    (:id app)
                                                    (:id invitee)])]
                        (is (nil? member))))))))))))))

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
                      (let [_res (http/delete (str config/server-origin "/dash/orgs/" (:id org) "/members/remove")
                                              {:headers {:Authorization (str "Bearer " (:refresh-token u))
                                                         :Content-Type "application/json"}
                                               :as :json
                                               :body (->json {:id (:id member)
                                                              :role "collaborator"})})
                            member (sql/select-one (aurora/conn-pool :read)
                                                   ["select * from org_members where org_id = ? and user_id = ?"
                                                    (:id org)
                                                    (:id invitee)])]
                        (is (nil? member))))))))))))))

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
    true
    (fn [{:keys [app owner collaborator admin outside-user]}]
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
                           (:id (:app (routes/req->app-and-user! role req)))))
                :error (is (thrown? Exception (routes/req->app-and-user! role req)))))))))))

(deftest you-are-an-app-member-of-the-org-if-you-are-a-member-of-an-app
  (with-startup-org
    true
    (fn [{:keys [app org collaborator outside-user]}]
      (with-empty-app
        (fn [app-2]
          ;; Add the second app to the org
          (sql/do-execute! (aurora/conn-pool :write)
                           ["update apps set org_id = ?::uuid where id = ?::uuid"
                            (:id org)
                            (:id app-2)])

          (let [org-path (format "%s/dash/orgs/%s" config/server-origin (:id org))
                dash-path (format "%s/dash" config/server-origin)]
            (testing "org members get all of the apps"
              (let [res (-> (http/get org-path
                                      {:headers {:Authorization (str "Bearer " (:refresh-token collaborator))
                                                 :Content-Type "application/json"}
                                       :as :json})
                            :body)]
                (is (= 3 (count (:members res))))
                (is (= #{(:id app) (:id app-2)}
                       (->> res
                            :apps
                            (map (comp parse-uuid :id))
                            set))))

              (let [res (-> (http/get dash-path
                                      {:headers {:Authorization (str "Bearer " (:refresh-token collaborator))
                                                 :Content-Type "application/json"}
                                       :as :json})
                            :body)]
                (is (= [] (:apps res)))
                (is (= #{(:id org)}
                       (->> res
                            :orgs
                            (map (comp parse-uuid :id))
                            set)))))

            (testing "outside users get a 400"
              (let [res (http/get org-path
                                  {:throw-exceptions false
                                   :headers {:Authorization (str "Bearer " (:refresh-token outside-user))
                                             :Content-Type "application/json"}
                                   :as :json})]
                (is (= 400 (:status res)))))

            (testing "members of an app can see the org details and apps they are a member of"

              (sql/do-execute! (aurora/conn-pool :write)
                               ["insert into app_members (id, user_id, app_id, member_role) values (?, ?, ?, 'collaborator')"
                                (random-uuid)
                                (:id outside-user)
                                (:id app)])

              (let [res (-> (http/get org-path
                                      {:headers {:Authorization (str "Bearer " (:refresh-token outside-user))
                                                 :Content-Type "application/json"}
                                       :as :json})
                            :body)]

                (is (= (:title org)
                       (-> res :org :title)))

                (is (= 0 (count (:members res)))
                    "They shouldn't see the other org members")
                (is (= #{(:id app)}
                       (->> res
                            :apps
                            (map (comp parse-uuid :id))
                            set))))

              (let [res (-> (http/get dash-path
                                      {:headers {:Authorization (str "Bearer " (:refresh-token outside-user))
                                                 :Content-Type "application/json"}
                                       :as :json})
                            :body)]

                (is (= [] (:apps res)))
                (is (= #{(:id org)}
                       (->> res
                            :orgs
                            (map (comp parse-uuid :id))
                            set)))))))))))

(deftest pro-apps-in-an-org-show-up-in-org-apps
  (with-redefs [stripe-customer-model/create-stripe-customer (fn [_]
                                                               (str "test_" (crypt-util/random-hex 8)))]
    (with-startup-org
      true
      (fn [{:keys [app org owner outside-user]}]
        (with-pro-app
          true
          owner
          (fn [{pro-app :app}]
            ;; Add the second app to the org
            (sql/do-execute! (aurora/conn-pool :write)
                             ["update apps set org_id = ?::uuid where id = ?::uuid"
                              (:id org)
                              (:id pro-app)])
            (dotimes [x 2]
              (testing (if (zero? x)
                         "with a paid org"
                         "with a non-paid org")
                ;; reset
                (sql/do-execute! (aurora/conn-pool :write)
                                 ["delete from app_members where app_id = ?::uuid"
                                  (:id pro-app)])
                (when (= x 1)
                  (sql/do-execute! (aurora/conn-pool :write)
                                   ["update orgs set subscription_id = null where id = ?::uuid"
                                    (:id org)]))

                (let [org-path (format "%s/dash/orgs/%s" config/server-origin (:id org))
                      dash-path (format "%s/dash" config/server-origin)]
                  (testing "org members get all of the apps"
                    (let [res (-> (http/get org-path
                                            {:headers {:Authorization (str "Bearer " (:refresh-token owner))
                                                       :Content-Type "application/json"}
                                             :as :json})
                                  :body)]
                      (is (= 3 (count (:members res))))
                      (is (= #{(:id app) (:id pro-app)}
                             (->> res
                                  :apps
                                  (map (comp parse-uuid :id))
                                  set))))

                    (let [res (-> (http/get dash-path
                                            {:headers {:Authorization (str "Bearer " (:refresh-token owner))
                                                       :Content-Type "application/json"}
                                             :as :json})
                                  :body)]
                      (is (= [] (:apps res))
                          "apps should filter out org apps")
                      (is (= #{(:id org)}
                             (->> res
                                  :orgs
                                  (map (comp parse-uuid :id))
                                  set)))))

                  (testing "outside users get a 400"
                    (let [res (http/get org-path
                                        {:throw-exceptions false
                                         :headers {:Authorization (str "Bearer " (:refresh-token outside-user))
                                                   :Content-Type "application/json"}
                                         :as :json})]
                      (is (= 400 (:status res)))))

                  (testing "members of an app can see the org details and apps they are a member of"

                    (sql/do-execute! (aurora/conn-pool :write)
                                     ["insert into app_members (id, user_id, app_id, member_role) values (?, ?, ?, 'collaborator')"
                                      (random-uuid)
                                      (:id outside-user)
                                      (:id pro-app)])

                    (let [res (-> (http/get org-path
                                            {:headers {:Authorization (str "Bearer " (:refresh-token outside-user))
                                                       :Content-Type "application/json"}
                                             :as :json})
                                  :body)]

                      (is (= (:title org)
                             (-> res :org :title)))

                      (is (= 0 (count (:members res)))
                          "They shouldn't see the other org members")
                      (is (= #{(:id pro-app)}
                             (->> res
                                  :apps
                                  (map (comp parse-uuid :id))
                                  set))))

                    (let [res (-> (http/get dash-path
                                            {:headers {:Authorization (str "Bearer " (:refresh-token outside-user))
                                                       :Content-Type "application/json"}
                                             :as :json})
                                  :body)]

                      (is (= [] (:apps res)))
                      (is (= #{(:id org)}
                             (->> res
                                  :orgs
                                  (map (comp parse-uuid :id))
                                  set))))))))))))))

(defn with-org-user-and-app [f]
  (with-user
    (fn [u]
      (with-org
        (:id u)
        (fn [org]
          (with-empty-app
            (:id u)
            (fn [app]
              (f {:org org :user u :app app}))))))))

(deftest transfer-app-to-org
  (with-org-user-and-app
    (fn [{:keys [org user app]}]
      (is (= (:creator_id app)
             (:id user)))
      (is (nil? (-> (http/post (format "%s/dash/apps/%s/transfer_to_org/%s"
                                       config/server-origin
                                       (:id app)
                                       (:id org))
                               {:headers {:Authorization (str "Bearer " (:refresh-token user))
                                          :Content-Type "application/json"}
                                :as :json})
                    :body
                    tool/inspect
                    :credit)))
      (let [app (app-model/get-by-id! {:id (:id app)})]
        (is (nil? (:creator_id app)))
        (is (= (:org_id app)
               (:id org)))))))

(deftest transfer-paid-app-to-paid-org
  (with-startup-org
    false
    (fn [{:keys [org owner]}]
      (with-pro-app
        false
        owner
        (fn [{:keys [app stripe-subscription-id]}]
          (is (neg? (-> (http/post (format "%s/dash/apps/%s/transfer_to_org/%s"
                                           config/server-origin
                                           (:id app)
                                           (:id org))
                                   {:headers {:Authorization (str "Bearer " (:refresh-token owner))
                                              :Content-Type "application/json"}
                                    :as :json})
                        :body
                        :credit)))
          ;; is app transfered
          (is (nil? (:creator_id (app-model/get-by-id! {:id (:id app)}))))
          (is (= (:id org) (:org_id (app-model/get-by-id! {:id (:id app)}))))

          (is (= "canceled" (.getStatus (stripe/subscription stripe-subscription-id))))

          ;; does the customer have a credit
          (let [sub-id (:stripe_subscription_id
                        (sql/select-one (aurora/conn-pool :read)
                                        ["select * from instant_subscriptions s join orgs o on o.subscription_id = s.id where o.id = ?::uuid" (:id org)]))]
            ;; If this fails around midnight on the last day of the month, just try again
            (is (neg? (stripe/customer-balance-by-subscription sub-id)))))))))

(deftest transfer-paid-app-to-unpaid-org
  (with-org-user-and-app
    (fn [{:keys [org user]}]
      (with-pro-app
        false
        user
        (fn [{:keys [app stripe-subscription-id]}]
          (is (nil? (-> (http/post (format "%s/dash/apps/%s/transfer_to_org/%s"
                                           config/server-origin
                                           (:id app)
                                           (:id org))
                                   {:headers {:Authorization (str "Bearer " (:refresh-token user))
                                              :Content-Type "application/json"}
                                    :as :json})
                        :body
                        :credit)))
          (is (nil? (:creator_id (app-model/get-by-id! {:id (:id app)}))))
          (is (= (:id org) (:org_id (app-model/get-by-id! {:id (:id app)}))))

          (is (= "active" (.getStatus (stripe/subscription stripe-subscription-id)))))))))
