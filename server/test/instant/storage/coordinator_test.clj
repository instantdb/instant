(ns instant.storage.coordinator-test
  (:require [clojure.test :as test :refer [deftest is testing]]
            [instant.storage.coordinator :as coordinator]
            [instant.fixtures :refer [with-empty-app]]
            [instant.model.app-user :as app-user-model]
            [instant.model.rule :as rule-model]
            [instant.util.test :as test-util :refer [perm-err? make-attrs insert-entities suid]]))

(deftest storage-permission-can-traverse-refs
  (with-empty-app
    (fn [{app-id :id}]
      (let [rules {"$files" {"allow" {"view" "'authorized' in auth.ref('$user.authorization.role')"
                                      "update" "'authorized' in auth.ref('$user.authorization.role')"
                                      "create" "'authorized' in auth.ref('$user.authorization.role')"
                                      "delete" "'authorized' in auth.ref('$user.authorization.role')"}}}
            path "/test/file.txt"
            attr->id (make-attrs app-id
                                 [[:authorizations/role]
                                  [[:authorizations/$user :$users/authorization]]])
            pass-user (app-user-model/create!
                       {:app-id app-id
                        :id (suid "1111")
                        :email "pass@example.com"})
            fail-user (app-user-model/create!
                       {:app-id app-id
                        :id (suid "2222")
                        :email "fail@example.com"})]

        (insert-entities app-id attr->id
                         [{:db/id (suid "aaaa")
                           :authorizations/role "authorized"
                           :authorizations/$user (:id pass-user)}
                          {:db/id (suid "bbbb")
                           :authorizations/role "pending"
                           :authorizations/$user (:id fail-user)}])

        (rule-model/put! {:app-id app-id :code rules})

        (let [actions ["view" "create" "update" "delete"]]
          (testing "auth.ref should pass for authorized user"
            (doseq [action actions]
              (is (coordinator/assert-storage-permission!
                   action
                   {:app-id app-id
                    :path path
                    :current-user pass-user}))))

          (testing "auth.ref should fail for unauthorized user"
            (doseq [action actions]
              (is (perm-err?
                   (coordinator/assert-storage-permission!
                    action
                    {:app-id app-id
                     :path path
                     :current-user fail-user})))))

          (testing "no permissions set should deny by default"
            (rule-model/put! {:app-id app-id :code {}})
            (doseq [action actions]
              (is (perm-err?
                   (coordinator/assert-storage-permission!
                    action
                    {:app-id app-id
                     :path path
                     :current-user pass-user}))))))))))

(deftest storage-permissions-can-mix-data-and-auth
  (with-empty-app
    (fn [{app-id :id}]
      (let [rules {"$files" {"allow" {"create" "data.path.startsWith('profiles/' + auth.ref('$user.profile.handle')[0] + '/')"}}}
            handle "moop"
            attr->id (make-attrs app-id
                                 [[:profiles/handle]
                                  [[:profiles/$user :$users/profile]]])
            user (app-user-model/create!
                  {:app-id app-id
                   :id (suid "1")
                   :email "moop@instantdb.com"})]

        (insert-entities app-id attr->id
                         [{:db/id (suid "a")
                           :profiles/handle handle
                           :profiles/$user (:id user)}])

        (rule-model/put! {:app-id app-id :code rules})

        (testing "Valid path should pass"
          (is (coordinator/assert-storage-permission!
               "create"
               {:app-id app-id
                :path (str "profiles/" handle "/some-file.txt")
                :current-user user})))

        (testing "Invalid path should fail"
          (is (perm-err?
               (coordinator/assert-storage-permission!
                "create"
                {:app-id app-id
                 :path (str "profiles/" "random" "/some-file.txt")
                 :current-user user}))))))))

(comment
  (test/run-tests *ns*))
