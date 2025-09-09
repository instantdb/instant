(ns instant.model.instnat-user-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [instant.fixtures :refer [with-empty-app with-org with-user]]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.model.instant-user :as instant-user]))

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
