(ns instant.db.cel-test
  (:require [clojure.test :as test :refer [deftest is testing]]
            [instant.data.resolvers :as resolvers]
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
    (let [standard-macros (set (map #(.getFunction %) (CelStandardMacro/STANDARD_MACROS)))
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

(defn dummy-attrs [specs]
  (attr-model/wrap-attrs (mapv (fn [{:keys [etype field index? checked-data-type]}]
                                 {:id (random-uuid)
                                  :forward-identity [(random-uuid) etype field]
                                  :index? index?
                                  :checked-data-type checked-data-type})
                               specs)))

;; XXX: Test with and without auth
(deftest where-clauses
  (let [make-ctx (fn [attr-specs]
                   {:attrs (dummy-attrs attr-specs)
                    :current-user {:id "__auth.id__" :email "__auth.email__"}})]
    (is (= {:short-circuit? false
            :where-clauses {"members.id" "__auth.id__"}}
           (cel/get-where-clauses (make-ctx [])
                                  "etype"
                                  "cel.bind(member, auth.id in data.ref(\"members.id\"), member)")))

    (is (= {:short-circuit? false
            :where-clauses {:or [{"is_public" true}
                                 {"owner" "__auth.id__"}]}}
           (cel/get-where-clauses (make-ctx [{:etype "etype"
                                              :field "owner"}
                                             {:etype "etype"
                                              :field "is_public"}])
                                  "etype"
                                  "data.is_public || data.owner == auth.id")))

    (is (= {:short-circuit? false
            :where-clauses {"conversationId" {:$isNull false}}}
           (cel/get-where-clauses (make-ctx [{:etype "etype"
                                              :field "conversationId"}])

                                  "etype"
                                  "data.conversationId != null")))

    (is (= {:short-circuit? false
            :where-clauses {"conversationId" {:$not "test"}}}
           (cel/get-where-clauses (make-ctx [{:etype "etype"
                                              :field "conversationId"}])
                                  "etype"
                                  "data.conversationId != 'test'")))

    (is (= {:short-circuit? false
            :where-clauses {"conversationId" {:$isNull true}}}
           (cel/get-where-clauses (make-ctx [{:etype "etype"
                                              :field "conversationId"}])
                                  "etype"
                                  "data.conversationId == null")))

    (is (= {:short-circuit? true
            :where-clauses nil}
           ;; data.ref will never return `null` in the arrays
           ;; XXX: double check that this is right
           (cel/get-where-clauses (make-ctx [])
                                  "etype"
                                  "null in data.ref('owner.id')")))

    ;; XXX: Need a better name than short-circuit?
    ;;      Could either just return the result or come up with a better name
    ;;      always-false?
    ;;      skip-execute-query

    (is (= {:short-circuit? false
            :where-clauses nil}
           (cel/get-where-clauses (make-ctx [{:etype "etype"
                                              :field "name"}])
                                  "etype"
                                  "auth.id == '__auth.id__' || data.name == 'Daniel'")))

    (is (= {:short-circuit? false
            :where-clauses {"name" "Daniel"}}
           (cel/get-where-clauses (make-ctx [{:etype "etype"
                                              :field "name"}])
                                  "etype"
                                  "auth.id == 'random-id' || data.name == 'Daniel'")))

    (is (= {:short-circuit? false,
            :where-clauses {:and [{"deleted_at" {:$isNull false}}
                                  {:or [{"deleted_at" {:$isNull true}}
                                        {"undeleted" true}]}]}}
           (cel/get-where-clauses (make-ctx [{:etype "etype"
                                              :field "deleted_at"}
                                             {:etype "etype"
                                              :field "undeleted"}])
                                  "etype"
                                  "cel.bind(isDeleted, data.deleted_at == null || (data.deleted_at != null && !data.undeleted), !isDeleted)")))

    (is (= {:short-circuit? false
            :where-clauses {"test" true}}
           (cel/get-where-clauses (make-ctx [{:etype "etype"
                                              :field "test"}])
                                  "etype"
                                  "!!data.test")))

    (is (= {:short-circuit? false
            :where-clauses {"path" {:$like "%.jpg"}}}
           (cel/get-where-clauses (make-ctx [{:etype "etype"
                                              :field "path"
                                              :index? true
                                              :checked-data-type :string}])
                                  "etype"
                                  "data.path.endsWith('.jpg')")))

    (testing "!!x == x"
      (let [ctx (make-ctx [{:etype "etype"
                            :field "deleted_at"}
                           {:etype "etype"
                            :field "undeleted"}])
            result {:short-circuit? false,
                    :where-clauses {:or [{"deleted_at" {:$isNull true}}
                                         {:and [{"deleted_at" {:$isNull false}}
                                                {"undeleted" false}]}]}}]
        (is (= result
               (cel/get-where-clauses
                ctx
                "etype"
                "cel.bind(isDeleted, data.deleted_at == null || (data.deleted_at != null && !data.undeleted), !(!isDeleted))")))

        (is (= result
               (cel/get-where-clauses
                ctx
                "etype"
                "cel.bind(isDeleted, data.deleted_at == null || (data.deleted_at != null && !data.undeleted), isDeleted)")))))

    ;; XXX: Do we want to return something else here?  Probably should
    ;;      indicate "can't convert to where clauses" instead of
    ;;      throwing

    ;; XXX: Be more specific about the error
    (doseq [bad-code [ ;; Can't handle size, but maybe we could do something to check empty
                      "size(data) == 0"
                      "size(data.ref('owner.id')) == 0"
                      ;; Can't handle json arrays in data
                      "auth.id in data.adminUserIds"
                      "data.adminUserIds == [1,2,3]"
                      ;; Can't handle ternary yet
                      "data.isPrivate == true ? auth.id == data.ownerId : true"
                      "auth.ref('$user.profile.active_workspace.id') == data.ref('workspace.id')"

                      "(data.ownerId) in data.ref('owner.id')"
                      "type(data.ownerId) == string"]]
      (testing (str "`" bad-code "` throws")
        (is (thrown? Throwable
                     (cel/get-where-clauses (make-ctx [{:etype "etype"
                                                        :field "adminUserIds"}
                                                       {:etype "etype"
                                                        :field "ownerId"}
                                                       {:etype "etype"
                                                        :field "adminUserIds"}])
                                            "etype"
                                            bad-code)))))

    ;; XXX: Need some standard error
    ;; XXX: Test all of the error cases
    ))


(deftest where-clauses-with-auth-ref
  (with-zeneca-app
    (fn [app r]
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
        (println (:id user)
                 (resolvers/->uuid r "eid-alex"))
        ;; XXX: It's not perfect because we have to do a fetch outside of preload
        (is (= {:short-circuit? false
                :where-clauses {"id" (str profile-id)}}
               (cel/get-where-clauses (assoc (make-ctx)
                                             :current-user user)
                                      "profile"
                                      "data.id == (auth.ref('$user.profile.id'))[0]")))))))

(comment
  (test/run-tests *ns*))
