(ns instant.model.org-members-test
  (:require
   [clojure.test :refer [deftest is]]
   [instant.fixtures :refer [with-org with-user]]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.model.org-members :as org-members]))

(deftest cant-remove-last-owner
  (with-user
    (fn [u]
      (with-org
        (:id u)
        (fn [org]
          (tool/def-locals)
          (println (sql/select (aurora/conn-pool :read)
                               ["select * from org_members where org_id = ?::uuid" (:id org)]))
          (let [member-id (:id (sql/select-one (aurora/conn-pool :read)
                                               ["select id from org_members where org_id = ?::uuid" (:id org)]))]
            (is member-id)
            (is (thrown-with-msg? clojure.lang.ExceptionInfo
                                  #"There must be at least one member of the org that is an owner"
                                  (org-members/update-role {:role "admin"
                                                            :id member-id})))
            (is (thrown-with-msg? clojure.lang.ExceptionInfo
                                  #"There must be at least one member of the org that is an owner"
                                  (sql/do-execute! (aurora/conn-pool :write)
                                                   ["delete from org_members where org_id = ?::uuid" (:id org)])))

            (is (thrown-with-msg? clojure.lang.ExceptionInfo
                                  #"There must be at least one member of the org that is an owner"
                                  (sql/do-execute! (aurora/conn-pool :write)
                                                   ["delete from instant_users where id = ?::uuid" (:id u)])))))))))
