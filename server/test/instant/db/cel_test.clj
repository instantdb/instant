(ns instant.db.cel-test
  (:require [clojure.test :as test :refer [deftest is testing]]
            [instant.db.model.attr :as attr-model]
            [instant.fixtures :refer [with-zeneca-app]]
            [instant.jdbc.aurora :as aurora]
            [instant.model.app-user :as app-user-model]
            [instant.db.cel :as cel]
            [instant.db.datalog :as d]
            [instant.db.transaction :as tx])
  (:import (dev.cel.parser CelStandardMacro)
           (dev.cel.common CelValidationException)
           (java.util Map)))

(deftest test-standard-macros
  (testing "STANDARD_MACROS set contains expected macros"
    (let [standard-macros (set (map #(CelStandardMacro/.getFunction %) CelStandardMacro/STANDARD_MACROS))
          expected-macros #{"has" "all" "exists" "exists_one" "map" "filter"}]
      (is (every? standard-macros expected-macros)))))

(deftest test-cel-evaluation
  (testing "Evaluation of CEL expressions with standard macros"
    (let [program (cel/rule->program :view "has({'name': 'Alice'}.name)")]
      (is (true? (cel/eval-program! {} {:cel-program program} {}))))

    (let [program (cel/rule->program :delete "[1, 2, 3].all(x, x > 0)")]
      (is (true? (cel/eval-program! {} {:cel-program program} {}))))

    (let [program (cel/rule->program :update "[1, 2, 3].exists(x, x > 2)")]
      (is (true? (cel/eval-program! {} {:cel-program program} {}))))

    (let [program (cel/rule->program :create "[1, 2, 3].exists_one(x, x > 2)")]
      (is (true? (cel/eval-program! {} {:cel-program program} {}))))

    (let [program (cel/rule->program :view "[1, 2, 3].map(x, x * 2)")]
      (is (= [2 4 6] (cel/eval-program! {} {:cel-program program} {}))))

    (let [program (cel/rule->program :view "[1, 2, 3, 4].filter(x, x % 2 == 0)")]
      (is (= [2 4] (cel/eval-program! {} {:cel-program program} {}))))))

(deftest parse-false-correctly
  (let [program (cel/rule->program :view "data.isFavorite")
        bindings {:data {"isFavorite" false}}]
    (is (false? (cel/eval-program! {} {:cel-program program} bindings))))
  (let [program (cel/rule->program :view "!data.isFavorite")
        bindings {:data {"isFavorite" false}}]
    (is (true? (cel/eval-program! {} {:cel-program program} bindings)))))

(deftest view-delete-does-not-allow-newData
  (is
   (thrown-with-msg?
    CelValidationException
    #"(?i)undeclared reference to 'newData'"
    (cel/rule->program :view "newData.isFavorite")))
  (is
   (thrown-with-msg?
    CelValidationException
    #"(?i)undeclared reference to 'newData'"
    (cel/rule->program :delete "newData.isFavorite"))))

(deftest unknown-results-throw
  (let [program (cel/rule->program :write "newData.isFavorite")
        bindings {} ;; note! new-data is not provided. This will cause CEL to return
                    ;; a CelUnknownSet
        ]
    (is (thrown-with-msg?
         Throwable
         #"Could not evaluate permission rule"
         (cel/eval-program! {} {:cel-program program} bindings)))))

(defn dummy-attrs [specs]
  (attr-model/wrap-attrs (mapv (fn [{:keys [etype
                                            field
                                            index?
                                            checked-data-type
                                            rev-etype
                                            rev-field]}]
                                 (merge {:id (random-uuid)
                                         :forward-identity [(random-uuid) etype field]
                                         :index? index?
                                         :checked-data-type checked-data-type}
                                        (when (and rev-etype
                                                   rev-field)
                                          {:reverse-identity [(random-uuid) rev-etype rev-field]})))
                               specs)))

(deftest where-clauses
  (let [make-ctx (fn [attr-specs]
                   {:attrs (dummy-attrs attr-specs)
                    :current-user {:id "__auth.id__" :email "__auth.email__"}
                    :preloaded-refs (cel/create-preloaded-refs-cache)})
        get-where-clauses (fn [fields code]
                            (let [res (cel/get-all-where-clauses
                                       (make-ctx (map (fn [field]
                                                        (if (string? field)
                                                          {:etype "etype"
                                                           :field field}
                                                          field))
                                                      fields))
                                       {}
                                       [{:etype "etype"
                                         :where-clauses-program (cel/where-clauses-program code)}])
                                  res (get res "etype")]
                              (when-let [t (:thrown res)]
                                (throw t))
                              (testing (str "ensure no short-circuit? on " code)
                                (is (false? (:short-circuit? res))))
                              (:where-clauses res)))]

    (is (= {"owner.id" "__auth.id__"}
           (get-where-clauses [{:etype "etype"
                                :field "owner"
                                :rev-etype "owners"
                                :rev-field "etype"}
                               {:etype "owners"
                                :field "id"}]
                              "cel.bind(owner, auth.id in data.ref(\"owner.id\"), owner)")))

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
           (get-where-clauses [{:etype "etype"
                                :field "path"
                                :index? true
                                :checked-data-type :string}]
                              "data.path.endsWith('.jpg')")))

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

    (is (= {:or [{"owner" {:$isNull true}} {"owner" {:$isNull true}}]}
           (get-where-clauses [{:etype "etype"
                                :field "owner"
                                :rev-etype "owners"
                                :rev-field "etype"}
                               {:etype "owners"
                                :field "id"}]
                              "[] == data.ref('owner.id') || data.ref('owner.id') == []")))

    (is (= {:or [{"owner" {:$isNull false}} {"owner" {:$isNull false}}]}
           (get-where-clauses [{:etype "etype"
                                :field "owner"
                                :rev-etype "owners"
                                :rev-field "etype"}
                               {:etype "owners"
                                :field "id"}]
                              "[] != data.ref('owner.id') || data.ref('owner.id') != []")))

    (is (= {:or [{"owner" {:$isNull true}} {"owner" {:$isNull true}}]}
           (get-where-clauses [{:etype "etype"
                                :field "owner"
                                :rev-etype "owners"
                                :rev-field "etype"}
                               {:etype "owners"
                                :field "id"}]
                              "size(data.ref('owner.id')) == 0 || 0 == size(data.ref('owner.id'))")))

    (is (= {:or [{"owner" {:$isNull false}} {"owner" {:$isNull false}}]}
           (get-where-clauses [{:etype "etype"
                                :field "owner"
                                :rev-etype "owners"
                                :rev-field "etype"}
                               {:etype "owners"
                                :field "id"}]
                              "size(data.ref('owner.id')) != 0 || 0 != size(data.ref('owner.id'))")))))

(deftest rule-wheres-short-circuit?
  (let [make-ctx (fn [attr-specs]
                   {:attrs (dummy-attrs attr-specs)
                    :current-user {:id "__auth.id__" :email "__auth.email__"}
                    :preloaded-refs (cel/create-preloaded-refs-cache)})
        get-where-clauses (fn [fields code]
                            (let [res (cel/get-all-where-clauses
                                       (make-ctx (map (fn [field]
                                                        (if (string? field)
                                                          {:etype "etype"
                                                           :field field}
                                                          field))
                                                      fields))
                                       {}
                                       [{:etype "etype"
                                         :where-clauses-program (cel/where-clauses-program code)}])
                                  res (get res "etype")]
                              (when-let [t (:thrown res)]
                                (throw t))
                              res))]

    (is (= {:short-circuit? true
            :where-clauses nil}
           (select-keys (get-where-clauses [{:etype "etype"
                                             :field "owner"
                                             :rev-etype "owners"
                                             :rev-field "etype"}
                                            {:etype "owners"
                                             :field "id"}]
                                           "null in data.ref('owner.id')")
                        [:short-circuit?
                         :where-clauses])))

    (is (= {:short-circuit? true
            :where-clauses nil}
           (select-keys (get-where-clauses []
                                           "auth.id == 1")
                        [:short-circuit?
                         :where-clauses])))

    (is (= {:short-circuit? true
            :where-clauses nil}
           (select-keys (get-where-clauses ["field"]
                                           "auth.id == 1 && data.field == 2")
                        [:short-circuit?
                         :where-clauses])))))

(deftest bad-code-fails
  (let [make-ctx (fn [attr-specs]
                   {:attrs (dummy-attrs attr-specs)
                    :current-user {:id "__auth.id__" :email "__auth.email__"}
                    :preloaded-refs (cel/create-preloaded-refs-cache)})
        get-where-clauses (fn [fields code]
                            (let [res (cel/get-all-where-clauses
                                       (make-ctx (map (fn [field]
                                                        (if (string? field)
                                                          {:etype "etype"
                                                           :field field}
                                                          field))
                                                      fields))
                                       {}
                                       [{:etype "etype"
                                         :action "view"
                                         :where-clauses-program (cel/where-clauses-program code)}])
                                  _ (def -res1 res)
                                  res (get res "etype")]
                              (when-let [t (:thrown res)]
                                (throw (or (ex-cause t)
                                           t)))
                              res))]

    (doseq [[bad-code msg] [ ;; Can't handle size, but maybe we could do something to check empty
                            ["size(data) == 0",
                             #"size"]

                            ["size(data.ref('owner.id')) == 1"
                             #"Function '_eq_dynamic' failed with arg"]

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

                            ["[1,2,3] == data.ref('owner.id')"
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
                              (get-where-clauses [{:etype "etype"
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
                                                   :checked-data-type :string}
                                                  {:etype "etype"
                                                   :field "owner"
                                                   :rev-etype "owners"
                                                   :rev-field "etype"}
                                                  {:etype "owners"
                                                   :field "id"}]
                                                 bad-code)))))

    (doseq [code ["auth.email == 'random-email'"
                  "false && data.ownerId == 'me'"
                  "false"
                  "null"]]
      (testing (str "`" code "` short-circuits")
        (is (true? (:short-circuit?
                    (get-where-clauses [{:etype "etype"
                                         :field "adminUserIds"}
                                        {:etype "etype"
                                         :field "ownerId"}
                                        {:etype "etype"
                                         :field "adminUserIds"}]
                                       code))))))))

(deftest where-clauses-with-auth-ref
  (with-zeneca-app
    (fn [app _r]
      (let [make-ctx (fn []
                       {:db {:conn-pool (aurora/conn-pool :read)}
                        :app-id (:id app)
                        :attrs (attr-model/get-by-app-id (:id app))
                        :datalog-query-fn d/query
                        :preloaded-refs (cel/create-preloaded-refs-cache)})
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
               (->
                (cel/get-all-where-clauses (assoc (make-ctx)
                                                  :current-user user)
                                           {}
                                           [{:etype "profile"
                                             :action "view"
                                             :where-clauses-program (cel/where-clauses-program
                                                                     "data.id == (auth.ref('$user.profile.id'))[0]")}])
                (get "profile")
                :where-clauses)))

        (is (= {"id" (str (:id user))}
               (->
                (cel/get-all-where-clauses (assoc (make-ctx)
                                                  :current-user user)
                                           {}
                                           [{:etype "profile"
                                             :action "view"
                                             :where-clauses-program (cel/where-clauses-program
                                                                     "data.id == auth.id")}])
                (get "profile")
                :where-clauses)))))))

(deftest advance-program-works
  (with-zeneca-app
    (fn [app _r]
      (let [user (app-user-model/get-by-email! {:app-id (:id app)
                                                :email "alex@instantdb.com"})
            make-ctx (fn []
                       {:db {:conn-pool (aurora/conn-pool :read)}
                        :app-id (:id app)
                        :attrs (attr-model/get-by-app-id (:id app))
                        :datalog-query-fn d/query
                        :current-user user})
            code (format "auth.ref('$user.id') == ['%s']"
                         (:id user))
            program {:cel-program (cel/rule->program "view" code)}]
        (testing "returns missing-refs if they're not in the cache"
          (let [result (cel/advance-program! (make-ctx)
                                             program
                                             {})]
            (is (cel/is-missing-ref-data? result))
            (is (= (cel/missing-ref-datas result)
                   #{{:eid (:id user)
                      :etype "$users"
                      :path-str "id"}}))))
        (testing "returns result once missing refs are in cache"
          (let [prefetched (cel/prefetch-missing-ref-datas
                            (make-ctx)
                            (cel/missing-ref-datas
                             (cel/advance-program! (make-ctx)
                                                   program
                                                   {})))
                preloaded-refs (cel/create-preloaded-refs-cache)
                _ (Map/.putAll preloaded-refs prefetched)
                result (cel/advance-program! (assoc (make-ctx)
                                                    :preloaded-refs preloaded-refs)
                                             program
                                             {})]
            (is (= result true))))))))

(deftest eval-programs!-works
  (with-zeneca-app
    (fn [app _r]
      (let [user (app-user-model/get-by-email! {:app-id (:id app)
                                                :email "alex@instantdb.com"})
            queries (atom [])
            query-fn (fn [ctx patterns]
                       (swap! queries conj patterns)
                       (d/query ctx patterns))
            preloaded-refs (cel/create-preloaded-refs-cache)
            make-ctx (fn []
                       {:db {:conn-pool (aurora/conn-pool :read)}
                        :app-id (:id app)
                        :attrs (attr-model/get-by-app-id (:id app))
                        :datalog-query-fn query-fn
                        :current-user user
                        :preloaded-refs preloaded-refs})
            code (format "auth.ref('$user.id') == ['%s']"
                         (:id user))
            program (cel/rule->program "view" code)
            results (cel/eval-programs! (make-ctx)
                                        {:first {:program {:cel-program program}
                                                 :bindings {}}
                                         :second {:program {:cel-program program}
                                                  :bindings {}}})]

        (is (= true (-> results :first :result)))
        (is (= true (-> results :second :result)))
        (is (= 1 (count @queries)))
        (is (= {{:eid (:id user), :etype "$users", :path-str "id"} [(str (:id user))]}
               preloaded-refs))
        (is (= 1 (count preloaded-refs)))))))

(comment
  (test/run-tests *ns*))
