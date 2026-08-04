(ns instant.model.instant-user-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [instant.fixtures :refer [with-empty-app with-org with-user]]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.model.instant-user :as instant-user]
   [instant.model.instant-user-refresh-token :as instant-user-refresh-token]))

(deftest disabled-dashboard-login-prevents-token-creation
  (with-user
    (fn [user]
      (sql/execute-one!
       (aurora/conn-pool :write)
       ["INSERT INTO user_flags (id, user_id, flag_name)
         VALUES (?::uuid, ?::uuid, 'dashboard-login-disabled')"
        (random-uuid) (:id user)])
      (is (thrown? Exception
                   (instant-user-refresh-token/create!
                    {:id (random-uuid) :user-id (:id user)}))))))

(deftest get-by-app-id
  (with-user
    (fn [u]
      (testing "works for apps with creators"
        (with-empty-app
          (:id u)
          (fn [app]
            (is (= (:id u)
                   (:id (instant-user/get-by-app-id {:app-id (:id app)})))))))
      (testing "works for apps on orgs"
        (with-org
          (:id u)
          (fn [org]
            (with-empty-app
              (fn [app]
                (sql/do-execute! (aurora/conn-pool :write)
                                 ["update apps set creator_id = null, org_id = ?::uuid where id = ?::uuid"
                                  (:id org)
                                  (:id app)])
                (is (= (:id u)
                       (:id (instant-user/get-by-app-id {:app-id (:id app)}))))))))))))
