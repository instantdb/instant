(ns instant.model.orgs-test
  (:require
   [clojure.test :refer [deftest is]]
   [instant.fixtures :refer [with-startup-org]]
   [instant.model.app :as app-model]
   [instant.model.org :as org-model]))

(deftest apps-for-org
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
