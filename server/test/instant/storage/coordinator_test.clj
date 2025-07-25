(ns instant.storage.coordinator-test
  (:require [clojure.test :as test :refer [deftest is testing]]
            [instant.storage.coordinator :as coordinator]
            [instant.fixtures :refer [with-empty-app]]
            [instant.model.app-user :as app-user-model]
            [instant.model.rule :as rule-model]
            [instant.db.model.attr :as attr-model]
            [instant.db.transaction :as tx]
            [instant.util.test :as test-util :refer [perm-err?]]
            [instant.jdbc.aurora :as aurora]))

(deftest assert-storage-permission-test
  (with-empty-app
    (fn [{app-id :id}]
      (let [conn (aurora/conn-pool :write)
            auth-etype-attr-id (random-uuid)
            auth-role-attr-id (random-uuid)
            user-auth-link-attr-id (random-uuid)
            rules {"$files" {"allow" {"view" "'authorized' in auth.ref('$user.authorization.role')"
                                      "update" "'authorized' in auth.ref('$user.authorization.role')"
                                      "create" "'authorized' in auth.ref('$user.authorization.role')"
                                      "delete" "'authorized' in auth.ref('$user.authorization.role')"}}}]
        ;; Set up schema
        (tx/transact! conn
                      (attr-model/get-by-app-id app-id)
                      app-id
                      [[:add-attr {:id auth-etype-attr-id
                                   :forward-identity [(random-uuid) "authorization" "id"]
                                   :unique? true
                                   :index? false
                                   :value-type :blob
                                   :cardinality :one}]
                       [:add-attr {:id auth-role-attr-id
                                   :forward-identity [(random-uuid) "authorization" "role"]
                                   :unique? false
                                   :index? false
                                   :value-type :blob
                                   :cardinality :one}]
                       [:add-attr {:id user-auth-link-attr-id
                                   :forward-identity [(random-uuid) "authorization" "$user"]
                                   :reverse-identity [(random-uuid) "$users" "authorization"]
                                   :unique? false
                                   :index? false
                                   :value-type :ref
                                   :cardinality :one}]])

        ;; Create data and rules
        (let [pass-user-id (random-uuid)
              fail-user-id (random-uuid)
              pass-user (app-user-model/create! conn
                                                {:app-id app-id
                                                 :id pass-user-id
                                                 :email "pass@example.com"})
              fail-user (app-user-model/create! conn
                                                {:app-id app-id
                                                 :id fail-user-id
                                                 :email "fail@example.com"})
              pass-auth-id (random-uuid)
              fail-auth-id (random-uuid)]
          (tx/transact! conn
                        (attr-model/get-by-app-id app-id)
                        app-id
                        [;; Create authorization entities
                         [:add-triple pass-auth-id auth-etype-attr-id (str pass-auth-id)]
                         [:add-triple pass-auth-id auth-role-attr-id "authorized"]
                         [:add-triple fail-auth-id auth-etype-attr-id (str fail-auth-id)]
                         [:add-triple fail-auth-id auth-role-attr-id "pending"]
                         ;; Link authorization to users
                         [:add-triple pass-auth-id user-auth-link-attr-id (:id pass-user)]
                         [:add-triple fail-auth-id user-auth-link-attr-id (:id fail-user)]])

          (rule-model/put! conn {:app-id app-id :code rules})

          (let [actions ["view" "create" "update" "delete"]]
            (testing "auth.ref should pass for authorized user"
              (doseq [action actions]
                (is (= true
                       (coordinator/assert-storage-permission!
                        action
                        {:app-id app-id
                         :path "/test/file.txt"
                         :current-user pass-user})))))

            (testing "auth.ref should fail for unauthorized user"
              (doseq [action actions]
                (is (perm-err?
                     (coordinator/assert-storage-permission!
                      action
                      {:app-id app-id
                       :path "/test/file.txt"
                       :current-user fail-user})))))

            (testing "no permissions set should deny by default"
              (rule-model/put! conn {:app-id app-id :code {}})
              (doseq [action actions]
                (is (perm-err?
                     (coordinator/assert-storage-permission!
                      action
                      {:app-id app-id
                       :path "/test/file.txt"
                       :current-user pass-user})))))))))))

(comment
  (test/run-tests *ns*))
