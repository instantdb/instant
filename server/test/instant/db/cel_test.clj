(ns instant.db.cel-test
  (:require [clojure.test :as test :refer [deftest is testing]]
            [instant.db.model.attr :as attr-model]
            [instant.fixtures :refer [with-zeneca-app]]
            [instant.jdbc.aurora :as aurora]
            [instant.model.app-user :as app-user-model]
            [instant.db.cel :as cel]
            [instant.db.datalog :as d]
            [instant.db.transaction :as tx])
  (:import (dev.cel.parser CelStandardMacro)))

(deftest test-standard-macros
  (testing "STANDARD_MACROS set contains expected macros"
    (let [standard-macros (set (map #(CelStandardMacro/.getFunction %) CelStandardMacro/STANDARD_MACROS))
          expected-macros #{"has" "all" "exists" "exists_one" "map" "filter"}]
      (is (every? standard-macros expected-macros)))))

(deftest test-cel-evaluation
  (testing "Evaluation of CEL expressions with standard macros"
    (let [program (cel/->program (cel/->ast "has({'name': 'Alice'}.name)"))]
      (is (true? (cel/eval-program! {:cel-program program} {}))))

    (let [program (cel/->program (cel/->ast "[1, 2, 3].all(x, x > 0)"))]
      (is (true? (cel/eval-program! {:cel-program program} {}))))

    (let [program (cel/->program (cel/->ast "[1, 2, 3].exists(x, x > 2)"))]
      (is (true? (cel/eval-program! {:cel-program program} {}))))

    (let [program (cel/->program (cel/->ast "[1, 2, 3].exists_one(x, x > 2)"))]
      (is (true? (cel/eval-program! {:cel-program program} {}))))

    (let [program (cel/->program (cel/->ast "[1, 2, 3].map(x, x * 2)"))]
      (is (= [2 4 6] (cel/eval-program! {:cel-program program} {}))))

    (let [program (cel/->program (cel/->ast "[1, 2, 3, 4].filter(x, x % 2 == 0)"))]
      (is (= [2 4] (cel/eval-program! {:cel-program program} {}))))))

(deftest parse-false-correctly
  (let [program (cel/->program (cel/->ast "data.isFavorite"))
        bindings {"data" (cel/->cel-map {} {"isFavorite" false})}]
    (is (false? (cel/eval-program! {:cel-program program} bindings))))
  (let [program (cel/->program (cel/->ast "!data.isFavorite"))
        bindings {"data" (cel/->cel-map {} {"isFavorite" false})}]
    (is (true? (cel/eval-program! {:cel-program program} bindings)))))

(deftest unknown-values-are-not-allowed
  (let [program (cel/->program (cel/->ast "newData.isFavorite"))
        bindings {} ;; note! newData is not provided
        ]
    (is (thrown-with-msg?
         Throwable
         #"Could not evaluate permission rule"
         (cel/eval-program! {:cel-program program} bindings)))))

(defn dummy-attrs [specs]
  (attr-model/wrap-attrs (mapv (fn [{:keys [etype field index? checked-data-type]}]
                                 {:id (random-uuid)
                                  :forward-identity [(random-uuid) etype field]
                                  :index? index?
                                  :checked-data-type checked-data-type})
                               specs)))

(deftest where-clauses
  (let [make-ctx (fn [attr-specs]
                   {:attrs (dummy-attrs attr-specs)
                    :current-user {:id "__auth.id__" :email "__auth.email__"}})
        get-where-clauses (fn [fields code]
                            (let [res (cel/get-where-clauses (make-ctx (map (fn [field]
                                                                              {:etype "etype"
                                                                               :field field})
                                                                            fields))
                                                             "etype"
                                                             code)]
                              (testing (str "ensure no short-circuit? on " code)
                                (is (false? (:short-circuit? res))))
                              (:where-clauses res)))]

    (is (= {"members.id" "__auth.id__"}
           (get-where-clauses [] "cel.bind(member, auth.id in data.ref(\"members.id\"), member)")))

    (is (= {:or [{"is_public" true}
                 {"owner" "__auth.id__"}]}
           (get-where-clauses ["owner"
                               "is_public"]
                              "data.is_public || data.owner == auth.id")))

    (is (= {"conversationId" {:$isNull false}}
           (get-where-clauses ["conversationId"]
                              "data.conversationId != null")))

    (is (= {"conversationId" {:$not "test"}}
           (get-where-clauses ["conversationId"]
                              "data.conversationId != 'test'")))

    (is (= {"conversationId" {:$isNull true}}
           (get-where-clauses ["conversationId"]
                              "data.conversationId == null")))

    (is (= {:short-circuit? true
            :where-clauses nil}
           (select-keys (cel/get-where-clauses (make-ctx [])
                                               "etype"
                                               "null in data.ref('owner.id')")
                        [:short-circuit?
                         :where-clauses])))

    (is (= nil
           (get-where-clauses ["name"]
                              "auth.id == '__auth.id__' || data.name == 'Daniel'")))

    (is (= {"name" "Daniel"}
           (get-where-clauses ["name"]
                              "auth.id == 'random-id' || data.name == 'Daniel'")))

    (is (= {:and [{"deleted_at" {:$isNull false}}
                  {:or [{"deleted_at" {:$isNull true}}
                        {"undeleted" {:$not false}}]}]}
           (get-where-clauses ["deleted_at"
                               "undeleted"]
                              "cel.bind(isDeleted, data.deleted_at == null || (data.deleted_at != null && !data.undeleted), !isDeleted)")))

    (is (= {"test" {:$not false}}
           (get-where-clauses ["test"]
                              "!!data.test")))

    (is (= {"path" {:$like "%.jpg"}}
           (:where-clauses
            (cel/get-where-clauses (make-ctx [{:etype "etype"
                                               :field "path"
                                               :index? true
                                               :checked-data-type :string}])
                                   "etype"
                                   "data.path.endsWith('.jpg')"))))

    (testing "!!x == x"
      (let [fields ["deleted_at" "undeleted"]
            result {:or [{"deleted_at" {:$isNull true}}
                         {:and [{"deleted_at" {:$isNull false}}
                                {"undeleted" false}]}]}]
        (is (= result
               (get-where-clauses
                fields
                "cel.bind(isDeleted, data.deleted_at == null || (data.deleted_at != null && !data.undeleted), !(!isDeleted))")))

        (is (= result
               (get-where-clauses
                fields
                "cel.bind(isDeleted, data.deleted_at == null || (data.deleted_at != null && !data.undeleted), isDeleted)")))))

    (doseq [[bad-code msg] [;; Can't handle size, but maybe we could do something to check empty
                            ["size(data) == 0",
                             #"size"]

                            ["size(data.ref('owner.id')) == 0"
                             #"size"]

                            ;; Can't handle json arrays in data
                            ["auth.id in data.adminUserIds"
                             #"Function '_in_dynamic' failed"]

                            ["data.adminUserIds == [1,2,3]"
                             #"Function '_eq_dynamic' failed"]

                            ;; Can't handle ternary yet, we could implement it but may need
                            ;; to rewrite the ast
                            ["data.isPrivate == true ? auth.id == data.ownerId : true"
                             #"expected boolean value"]

                            ["!data.badfield"
                             #"key 'badfield' is not present in map."]

                            ["[1,2,3] == data.ref('workspace.id')"
                             #"Function '_eq_dynamic' failed"]

                            ["(data.ownerId) in data.ref('owner.id')"
                             #"Function '_in_dynamic' failed"]

                            ["type(data.ownerId) == string"
                             #"Function '_type_datakey_override' failed"]

                            ["data.ownerId"
                             #"Invalid return type from the cel rule"]

                            ;; Can't negate {:path {:$like "%.jpb"}}
                            ["!(data.path.endsWith('.jpg'))"
                             #"Function '_not_whereclause' failed"]

                            ;; `like` only works on indexed strings
                            ["!(data.ownerId.endsWith('.jpg'))"
                             #"Function '_datakey_ends_with' failed"]]]
      (testing (str "`" bad-code "` throws")
        (is (thrown-with-msg? Throwable
                              msg
                              (cel/get-where-clauses (make-ctx [{:etype "etype"
                                                                 :field "adminUserIds"}
                                                                {:etype "etype"
                                                                 :field "ownerId"}
                                                                {:etype "etype"
                                                                 :field "adminUserIds"}
                                                                {:etype "etype"
                                                                 :field "isPrivate"}
                                                                {:etype "etype"
                                                                 :field "path"
                                                                 :index? true
                                                                 :checked-data-type :string}])
                                                     "etype"
                                                     bad-code)))))

    (doseq [code ["auth.email == 'random-email'"
                  "false && data.ownerId == 'me'"
                  "false"
                  "null"]]
      (testing (str "`" code "` short-circuits")
        (is (true? (:short-circuit?
                    (cel/get-where-clauses (make-ctx [{:etype "etype"
                                                       :field "adminUserIds"}
                                                      {:etype "etype"
                                                       :field "ownerId"}
                                                      {:etype "etype"
                                                       :field "adminUserIds"}])
                                           "etype"
                                           code))))))))

(deftest where-clauses-with-auth-ref
  (with-zeneca-app
    (fn [app _r]
      (let [make-ctx (fn []
                       {:db {:conn-pool (aurora/conn-pool :read)}
                        :app-id (:id app)
                        :attrs (attr-model/get-by-app-id (:id app))
                        :datalog-query-fn d/query})
            user (app-user-model/get-by-email! {:app-id (:id app)
                                                :email "alex@instantdb.com"})
            id-attr-id (random-uuid)
            link-attr-id (random-uuid)
            profile-id (random-uuid)]
        (tx/transact! (aurora/conn-pool :write)
                      (attr-model/get-by-app-id (:id app))
                      (:id app)
                      [[:add-attr {:id id-attr-id
                                   :forward-identity [(random-uuid) "profile" "id"]
                                   :unique? true
                                   :index? false
                                   :value-type :blob
                                   :cardinality :one}]
                       [:add-attr {:id link-attr-id
                                   :forward-identity [(random-uuid) "profile" "$user"]
                                   :reverse-identity [(random-uuid) "$users" "profile"]
                                   :unique? false
                                   :index? false
                                   :value-type :ref
                                   :cardinality :many}]
                       [:add-triple profile-id id-attr-id (str profile-id)]
                       [:add-triple profile-id link-attr-id (str (:id user))]])
        (is (= {"id" (str profile-id)}
               (:where-clauses
                (cel/get-where-clauses (assoc (make-ctx)
                                              :current-user user)
                                       "profile"
                                       "data.id == (auth.ref('$user.profile.id'))[0]"))))))))

(comment
  (test/run-tests *ns*))
