(ns instant.model.orgs-test
  (:require
   [clojure.test :refer [deftest is]]
   [instant.fixtures :refer [with-startup-org]]
   [instant.model.app :as app-model]
   [instant.model.app-members :as app-members]
   [instant.model.org :as org-model]))

(deftest apps-for-org-filters-deletions
  (with-startup-org
    true
    (fn [{:keys [owner org app]}]
      (is (= [(:id app)]
             (map :id
                  (org-model/apps-for-org {:org-id (:id org)
                                           :user-id (:id owner)}))))

      (app-model/mark-for-deletion! {:id (:id app)})

      (is (= []
             (map :id
                  (org-model/apps-for-org {:org-id (:id org)
                                           :user-id (:id owner)})))))))

(deftest apps-for-org-filters-deletions-for-app-members
  (with-startup-org
    true
    (fn [{:keys [owner org app outside-user]}]
      (is (= []
             (map :id
                  (org-model/apps-for-org {:org-id (:id org)
                                           :user-id (:id outside-user)}))))

      (app-members/create! {:app-id (:id app)
                            :user-id (:id outside-user)
                            :role "admin"})

      (is (= [(:id app)]
             (map :id
                  (org-model/apps-for-org {:org-id (:id org)
                                           :user-id (:id outside-user)}))))

      (app-model/mark-for-deletion! {:id (:id app)})

      (is (= []
             (map :id
                  (org-model/apps-for-org {:org-id (:id org)
                                           :user-id (:id owner)})))))))
