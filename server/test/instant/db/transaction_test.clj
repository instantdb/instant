(ns instant.db.transaction-test
  (:require
   [clojure.string :as string]
   [clojure.test :as test :refer [are deftest is testing]]
   [instant.db.cel :as cel]
   [instant.data.bootstrap :as bootstrap]
   [instant.data.constants :refer [test-user-id]]
   [instant.data.resolvers :as resolvers]
   [instant.db.datalog :as d]
   [instant.db.instaql :as iq]
   [instant.db.model.attr :as attr-model]
   [instant.db.model.triple :as triple-model]
   [instant.model.app-file :as app-file-model]
   [instant.db.permissioned-transaction :as permissioned-tx]
   [instant.db.transaction :as tx]
   [instant.fixtures :refer [with-empty-app
                             with-zeneca-app
                             with-zeneca-app-no-indexing]]
   [instant.jdbc.aurora :as aurora]
   [instant.model.app :as app-model]
   [instant.model.app-user :as app-user-model]
   [instant.model.rule :as rule-model]
   [instant.util.instaql :refer [instaql-nodes->object-tree]]
   [instant.util.exception :as ex]
   [instant.util.test :as test-util :refer [suid validation-err? perm-err?]])
  (:import
   (java.util UUID)))

(defn- fetch-triples
  ([app-id] (fetch-triples app-id []))
  ([app-id where-clause]
   (set (map :triple
             (triple-model/fetch
              (aurora/conn-pool :read)
              app-id
              where-clause)))))

(deftest attrs-create-delete
  (doseq [{:keys [test tx-fn]} [{:test "tx/transact!"
                                 :tx-fn (fn [app-id tx-steps]
                                          (tx/transact! (aurora/conn-pool :write)
                                                        (attr-model/get-by-app-id app-id)
                                                        app-id
                                                        tx-steps))}
                                {:test "permissioned-tx/transact!"
                                 :tx-fn (fn [app-id tx-steps]
                                          (let [ctx {:db {:conn-pool (aurora/conn-pool :write)}
                                                     :app-id app-id
                                                     :attrs (attr-model/get-by-app-id app-id)
                                                     :datalog-query-fn d/query
                                                     :rules (rule-model/get-by-app-id (aurora/conn-pool :read) {:app-id app-id})
                                                     :current-user nil}]
                                            (permissioned-tx/transact! ctx tx-steps)))}]]
    (testing test
      (with-empty-app
        (fn [{app-id :id}]
          (let [name-attr-id #uuid "75cad5c3-1e6b-4490-a8f7-17342618c260"
                name-fwd-ident #uuid "2ad158d4-2df7-42e3-91fd-630e814ed066"
                color-attr-id #uuid "dc990f2a-9351-41ba-9e68-0642b0f5b094"
                color-fwd-ident #uuid "e7221e56-ad5e-4c69-87cf-73fb17a1f407"
                stopa-eid #uuid "168b1f73-1b3d-4e14-884d-543142b9e597"]
            (tx-fn
             app-id
             [[:add-attr
               {:id name-attr-id
                :forward-identity [name-fwd-ident "users" "name"]
                :value-type :blob
                :cardinality :one
                :unique? false
                :index? false}]
              [:add-attr
               {:id color-attr-id
                :forward-identity [color-fwd-ident "users" "color"]
                :value-type :blob
                :cardinality :one
                :unique? false
                :index? false}]
              [:add-triple stopa-eid name-attr-id "Stopa"]
              [:add-triple stopa-eid color-attr-id "Blue"]])
            (testing "attrs are created"
              (is (= #{"name" "color"}
                     (->> (attr-model/get-by-app-id app-id)
                          (filter #(not= :system (:catalog %)))
                          (map :forward-identity)
                          (map last)
                          set))))
            (testing "triples are created"
              (is (= #{"Stopa" "Blue"}
                     (->> (triple-model/fetch (aurora/conn-pool :read) app-id)
                          (map :triple)
                          (map last)
                          set))))
            (when (= test "tx/transact!")
              (tx-fn
               app-id
               [[:delete-attr color-attr-id]])
              (testing "attr is deleted"
                (is (= #{"name"}
                       (->> (attr-model/get-by-app-id app-id)
                            (filter #(not= :system (:catalog %)))
                            (map :forward-identity)
                            (map last)
                            set))))
              (testing "associated triples are deleted"
                (is (= #{"Stopa"}
                       (->> (triple-model/fetch (aurora/conn-pool :read) app-id)
                            (map :triple)
                            (map last)
                            set)))))))))))

(deftest required-attrs
  (with-empty-app
    (fn [{app-id :id}]
      (let [{attr-book-id      :book/id
             attr-book-title   :book/title
             attr-book-desc    :book/desc
             attr-user-id      :user/id
             attr-user-name    :user/name
             attr-user-company :user/company
             attr-company-id   :company/id
             attr-company-name :company/name}
            (test-util/make-attrs
             app-id
             [[:book/id :required? :index? :unique?]
              [:book/title :required?]
              [:book/desc]
              [:user/id :required? :index? :unique?]
              [:user/name]
              [[:user/company :company/users] :on-delete]
              [:company/id :required? :index? :unique?]
              [:company/name]])
            attr-book-author (suid "baac")
            make-ctx         (fn make-ctx
                               ([]
                                (make-ctx {}))
                               ([{:keys [admin?]}]
                                {:db               {:conn-pool (aurora/conn-pool :write)}
                                 :app-id           app-id
                                 :attrs            (attr-model/get-by-app-id app-id)
                                 :datalog-query-fn d/query
                                 :rules            (rule-model/get-by-app-id (aurora/conn-pool :read) {:app-id app-id})
                                 :current-user     nil
                                 :admin?           admin?}))
            user-id          (suid "ffff")
            book-id          (suid "b00c")
            company-id       (suid "aaaa")
            extra-user-id    (suid "fffe")
            extra-book-id    (suid "b00d")]

        (testing "add-attr without existing entities"
          (permissioned-tx/transact!
           (make-ctx)
           [[:add-attr {:id               attr-book-author
                        :forward-identity [(random-uuid) "book" "author"]
                        :reverse-identity [(random-uuid) "user" "books"]
                        :value-type       :ref
                        :cardinality      :one
                        :unique?          false
                        :index?           false
                        :required?        true}]]))

        (permissioned-tx/transact!
         (make-ctx)
         [[:add-triple extra-user-id attr-user-id extra-user-id]
          [:add-triple extra-user-id attr-user-name "extra user"]
          [:add-triple extra-book-id attr-book-id extra-book-id]
          [:add-triple extra-book-id attr-book-title "extra title"]
          [:add-triple extra-book-id attr-book-author extra-user-id]])

        (testing "add-attr with existing entities"
          (is (validation-err?
               (permissioned-tx/transact!
                (make-ctx)
                [[:add-attr {:id               (random-uuid)
                             :forward-identity [(random-uuid) "book" "price"]
                             :reverse-identity [(random-uuid) "user" "books"]
                             :value-type       :blob
                             :cardinality      :one
                             :unique?          false
                             :index?           false
                             :required?        true}]]))))

        (doseq [add-op [:add-triple :deep-merge-triple]]
          (testing add-op
            (permissioned-tx/transact!
             (make-ctx)
             [[add-op      user-id    attr-user-id      user-id]
              [add-op      user-id    attr-user-name    "user"]
              [:add-triple user-id    attr-user-company company-id]
              [add-op      company-id attr-company-id   company-id]
              [add-op      company-id attr-company-name "company"]])

            (testing "add without required"
              (is (validation-err?
                   (permissioned-tx/transact!
                    (make-ctx)
                    [[add-op book-id attr-book-id   book-id]
                     [add-op book-id attr-book-desc "no title"]]))))

            (testing "add with required"
              (is (not (validation-err?
                        (permissioned-tx/transact!
                         (make-ctx)
                         [[add-op book-id attr-book-id   book-id]
                          [add-op book-id attr-book-title "title"]
                          [add-op book-id attr-book-desc "desc"]
                          [:add-triple book-id attr-book-author user-id]])))))

            (testing "update-attr"
              (testing "set :required? with invalid entities"
                (is (validation-err?
                     (permissioned-tx/transact!
                      (make-ctx {:admin? true})
                      [[:update-attr {:id attr-book-desc
                                      :required? true}]]))))

              (testing "unset required"
                (is (not (validation-err?
                          (permissioned-tx/transact!
                           (make-ctx {:admin? true})
                           [[:update-attr {:id attr-book-title
                                           :required? false}]])))))

              (testing "set :required? with valid entities"
                (is (not (validation-err?
                          (permissioned-tx/transact!
                           (make-ctx {:admin? true})
                           [[:update-attr {:id attr-book-title
                                           :required? true}]]))))))

            (testing "update required"
              (is (not (validation-err?
                        (permissioned-tx/transact!
                         (make-ctx)
                         [[add-op book-id attr-book-id    book-id]
                          [add-op book-id attr-book-title "title upd"]])))))

            (testing "retract + insert required"
              (is (not (validation-err?
                        (permissioned-tx/transact!
                         (make-ctx)
                         [[add-op book-id attr-book-id    book-id]
                          [:retract-triple book-id attr-book-title "title upd"]
                          [add-op book-id attr-book-title "title upd 2"]])))))

            (testing "update non-required"
              (is (not (validation-err?
                        (permissioned-tx/transact!
                         (make-ctx)
                         [[add-op book-id attr-book-id   book-id]
                          [add-op book-id attr-book-desc "desc upd"]])))))

            (testing "remove required"
              (testing "regular attr"
                (is (validation-err?
                     (permissioned-tx/transact!
                      (make-ctx)
                      [[:retract-triple book-id attr-book-title "title upd 2"]]))))

              (testing "link"
                (is (validation-err?
                     (permissioned-tx/transact!
                      (make-ctx)
                      [[:retract-triple book-id attr-book-author user-id]]))))

              (testing "through delete-entity"
                (is (validation-err?
                     (permissioned-tx/transact!
                      (make-ctx)
                      [[:delete-entity user-id "user"]]))))

              (testing "through cascade"
                (is (validation-err?
                     (permissioned-tx/transact!
                      (make-ctx)
                      [[:delete-entity company-id "company"]])))))

            (testing "remove non-required"
              (is (not (validation-err?
                        (permissioned-tx/transact!
                         (make-ctx)
                         [[:retract-triple book-id attr-book-desc "desc upd"]])))))

            (testing "update last required"
              (is (not (validation-err?
                        (permissioned-tx/transact!
                         (make-ctx)
                         [[add-op book-id attr-book-id    book-id]
                          [add-op book-id attr-book-title "title upd 3"]])))))

            (testing "remove last required"
              (is (not (validation-err?
                        (permissioned-tx/transact!
                         (make-ctx)
                         [[:retract-triple book-id attr-book-id    book-id]
                          [:retract-triple book-id attr-book-title "title upd 3"]
                          [:retract-triple book-id attr-book-author user-id]])))))

            (testing "delete-entity"
              (permissioned-tx/transact!
               (make-ctx)
               [[add-op book-id attr-book-id    book-id]
                [add-op book-id attr-book-title "title"]
                [add-op book-id attr-book-desc  "desc"]
                [:add-triple book-id attr-book-author user-id]])
              (is (not (validation-err?
                        (permissioned-tx/transact!
                         (make-ctx)
                         [[:delete-entity book-id "book"]])))))))))))

(deftest required-attrs-shared-entity
  (with-empty-app
    (fn [{app-id :id}]
      (let [{attr-users-id   :users/id
             attr-users-name :users/name
             attr-profiles-id   :profiles/id
             attr-profiles-name :profiles/name}
            (test-util/make-attrs
             app-id
             [[:users/id :required? :index? :unique?]
              [:users/name :required?]
              [:profiles/id :required? :index? :unique?]
              [:profiles/name :required?]])
            make-ctx (fn make-ctx
                       ([]
                        (make-ctx {}))
                       ([{:keys [admin?]}]
                        {:db               {:conn-pool (aurora/conn-pool :write)}
                         :app-id           app-id
                         :attrs            (attr-model/get-by-app-id app-id)
                         :datalog-query-fn d/query
                         :rules            (rule-model/get-by-app-id (aurora/conn-pool :read) {:app-id app-id})
                         :current-user     nil
                         :admin?           admin?}))
            user-id  (suid "ffff")]
        (permissioned-tx/transact!
         (make-ctx)
         [[:add-triple user-id attr-profiles-id   user-id]
          [:add-triple user-id attr-profiles-name "profile name"]
          [:add-triple user-id attr-users-id      user-id]
          [:add-triple user-id attr-users-name    "user name"]])

        (permissioned-tx/transact!
         (make-ctx)
         [[:delete-entity user-id "users"]])))))

(deftest update-modes
  (with-empty-app
    (fn [{app-id :id}]
      (let [{attr-book-title :book/title
             attr-book-desc  :book/desc}
            (test-util/make-attrs app-id [[:book/title :unique?] [:book/desc]])
            make-ctx (fn make-ctx
                       ([]
                        (make-ctx {}))
                       ([{:keys [admin?]}]
                        {:db               {:conn-pool (aurora/conn-pool :write)}
                         :app-id           app-id
                         :attrs            (attr-model/get-by-app-id app-id)
                         :datalog-query-fn d/query
                         :rules            (rule-model/get-by-app-id (aurora/conn-pool :read) {:app-id app-id})
                         :current-user     nil
                         :admin?           admin?}))
            book1-id    (suid "b00c")
            book2-id    (suid "b00d")]

        (permissioned-tx/transact!
         (make-ctx)
         [[:add-triple book1-id attr-book-title "book 1"]
          [:add-triple book1-id attr-book-desc "book 1 desc"]
          [:add-triple book2-id attr-book-title "book 2"]])

        (doseq [op [:add-triple :deep-merge-triple]]
          (testing op
            (testing "create"
              (testing "new id"
                (let [new-book-id (random-uuid)]
                  (is (not (validation-err?
                            (permissioned-tx/transact!
                             (make-ctx)
                             [[op new-book-id attr-book-title (str "book " (rand)) {:mode :create}]
                              [op new-book-id attr-book-desc  (str "book desc " (rand)) {:mode :create}]]))))))

              (testing "new lookup ref"
                (is (not (validation-err?
                          (permissioned-tx/transact!
                           (make-ctx)
                           [[op [attr-book-title (str "book " (rand))] attr-book-desc (str "book desc " (rand)) {:mode :create}]])))))

              (testing "existing id"
                (is (validation-err?
                     (permissioned-tx/transact!
                      (make-ctx)
                      [[op book1-id attr-book-title (str "book 1 " (rand)) {:mode :create}]]))))

              (testing "existing lookup ref"
                (is (validation-err?
                     (permissioned-tx/transact!
                      (make-ctx)
                      [[op [attr-book-title "book 2"] attr-book-desc (str "book 2 desc " (rand)) {:mode :create}]])))))

            (testing "update"
              (testing "new id"
                (let [new-book-id (random-uuid)]
                  (is (validation-err?
                       (permissioned-tx/transact!
                        (make-ctx)
                        [[op new-book-id attr-book-title (str "book " (rand)) {:mode :update}]
                         [op new-book-id attr-book-desc  (str "book desc " (rand)) {:mode :update}]])))))

              (testing "new lookup ref"
                (is (validation-err?
                     (permissioned-tx/transact!
                      (make-ctx)
                      [[op [attr-book-title "book 3"] attr-book-desc (str "book 3 desc " (rand)) {:mode :update}]]))))

              (testing "existing id"
                (is (not (validation-err?
                          (permissioned-tx/transact!
                           (make-ctx)
                           [[op book1-id attr-book-title (str "book 1 " (rand)) {:mode :update}]
                            [op book1-id attr-book-desc  (str "book 1 desc " (rand)) {:mode :update}]])))))

              (testing "existing lookup ref"
                (is (not (validation-err?
                          (permissioned-tx/transact!
                           (make-ctx)
                           [[op [attr-book-title "book 2"] attr-book-desc (str "book 2 desc " (rand)) {:mode :update}]]))))))

            (testing "all together"
              (let [new-book-id (random-uuid)]
                (is (not (validation-err?
                          (permissioned-tx/transact!
                           (make-ctx)
                           [[op new-book-id attr-book-title (str "book " (rand)) {:mode :create}]
                            [op new-book-id attr-book-desc  (str "book desc " (rand)) {:mode :create}]
                            [op [attr-book-title (str "book " (rand))] attr-book-desc (str "book desc " (rand)) {:mode :create}]
                            [op book1-id attr-book-title (str "book 1 " (rand)) {:mode :update}]
                            [op book1-id attr-book-desc  (str "book 1 desc " (rand)) {:mode :update}]
                            [op [attr-book-title "book 2"] attr-book-desc (str "book 2 desc " (rand)) {:mode :update}]])))))

              (let [new-book-id (random-uuid)]
                (is (validation-err?
                     (permissioned-tx/transact!
                      (make-ctx)
                      [[op book1-id attr-book-title (str "book 1 " (rand)) {:mode :create}]
                       [op [attr-book-title "book 2"] attr-book-desc (str "book 2 desc " (rand)) {:mode :create}]
                       [op new-book-id attr-book-title (str "book " (rand)) {:mode :update}]
                       [op new-book-id attr-book-desc  (str "book desc " (rand)) {:mode :update}]
                       [op [attr-book-title "book 3"] attr-book-desc (str "book 3 desc " (rand)) {:mode :update}]])))))))))))


(deftest attrs-update
  (with-empty-app
    (fn [{app-id :id}]
      (let [tag-attr-id #uuid "f62e00dc-156c-47fb-a532-4dbb0bbd31b3"
            tag-fwd-ident #uuid "4770a8bb-5c35-4681-bcb3-78b4f3efea37"
            tag-rev-ident #uuid "cf92b287-2338-483a-8909-676a868bfc1f"
            stopa-eid #uuid "0a348563-c343-4fd5-a18a-c699d1099a8d"
            name-attr-id #uuid "ba2fbd34-3934-4b13-9f9d-415f8181bdfe"
            name-fwd-ident #uuid "e33d8ba7-a6fb-41bb-92a8-17582dec616d"
            tag-one-eid #uuid "da5e3210-c002-4743-ad9e-27206e048926"]
        (tx/transact!
         (aurora/conn-pool :write)
         (attr-model/get-by-app-id app-id)
         app-id
         [[:add-attr
           {:id tag-attr-id
            :forward-identity [tag-fwd-ident "users" "tags"]
            :reverse-identity [tag-rev-ident "tags" "taggers"]
            :value-type :ref
            :cardinality :many
            :unique? false
            :index? false}]
          [:add-attr
           {:id name-attr-id
            :forward-identity [name-fwd-ident "users" "name"]
            :value-type :blob
            :cardinality :one
            :unique? false
            :index? false}]
          [:add-triple stopa-eid tag-attr-id tag-one-eid]
          [:add-triple stopa-eid name-attr-id "Stopa"]])
        (testing "attrs are created"
          (is (= #{"tags" "name"}
                 (->> (attr-model/get-by-app-id app-id)
                      (filter #(not= :system (:catalog %)))
                      (map :forward-identity)
                      (map last)
                      set))))
        (testing "changing forward-identity works"
          (tx/transact!
           (aurora/conn-pool :write)
           (attr-model/get-by-app-id app-id)
           app-id
           [[:update-attr
             {:id tag-attr-id
              :forward-identity [tag-fwd-ident "users" "tagz"]}]])
          (is (= #{"tagz" "name"}
                 (->> (attr-model/get-by-app-id app-id)
                      (filter #(not= :system (:catalog %)))
                      (map :forward-identity)
                      (map last)
                      set))))
        (testing "changing reverse-identity works"
          (tx/transact!
           (aurora/conn-pool :write)
           (attr-model/get-by-app-id app-id)
           app-id
           [[:update-attr
             {:id tag-attr-id
              :reverse-identity [tag-rev-ident "tags" "taggerz"]}]])
          (is (= #{"taggerz"}
                 (->> (attr-model/get-by-app-id app-id)
                      (filter #(not= :system (:catalog %)))
                      (keep :reverse-identity)
                      (map last)
                      set))))
        (testing "indexes are what we expect"
          (is  (= [#{:eav :vae}]
                  (->> (triple-model/fetch (aurora/conn-pool :read) app-id
                                           [[:= :attr-id tag-attr-id]])
                       (map :index))))
          (is  (= [#{:ea}]
                  (->> (triple-model/fetch (aurora/conn-pool :read) app-id
                                           [[:= :attr-id name-attr-id]])
                       (map :index)))))
        (testing "changing a column that affects an index works"
          (tx/transact!
           (aurora/conn-pool :write)
           (attr-model/get-by-app-id app-id)
           app-id
           [[:update-attr
             {:id tag-attr-id
              :cardinality :one}]])
          (is (= {:id tag-attr-id
                  :forward-identity [tag-fwd-ident "users" "tagz"]
                  :reverse-identity [tag-rev-ident "tags" "taggerz"]
                  :value-type :ref
                  :cardinality :one
                  :unique? false
                  :index? false
                  :required? false
                  :inferred-types #{:string}
                  :catalog :user}
                 (attr-model/seek-by-id
                  tag-attr-id
                  (attr-model/get-by-app-id app-id))))
          (is (= [#{:eav :vae :ea}]
                 (->> (triple-model/fetch (aurora/conn-pool :read) app-id
                                          [[:= :attr-id tag-attr-id]])
                      (map :index))))
          (is (= [#{:ea}]
                 (->> (triple-model/fetch (aurora/conn-pool :read) app-id
                                          [[:= :attr-id name-attr-id]])
                      (map :index)))))
        (testing "changing multiple columns at once works"
          (tx/transact!
           (aurora/conn-pool :write)
           (attr-model/get-by-app-id app-id)
           app-id
           [[:update-attr
             {:id name-attr-id
              :forward-identity [name-fwd-ident "users" "floopy"]
              :unique? true}]])
          (is (= {:id name-attr-id
                  :forward-identity [name-fwd-ident "users" "floopy"]
                  :value-type :blob
                  :cardinality :one
                  :unique? true
                  :index? false
                  :required? false
                  :inferred-types #{:string}
                  :catalog :user}
                 (attr-model/seek-by-id
                  name-attr-id
                  (attr-model/get-by-app-id app-id))))
          (is (= [#{:eav :vae :ea}]
                 (->> (triple-model/fetch (aurora/conn-pool :read) app-id
                                          [[:= :attr-id tag-attr-id]])
                      (map :index))))
          (is (= [#{:av :ea}]
                 (->> (triple-model/fetch (aurora/conn-pool :read) app-id
                                          [[:= :attr-id name-attr-id]])
                      (map :index)))))))))

(deftest obj-normal
  (with-empty-app
    (fn [{app-id :id}]
      (let [name-attr-id #uuid "5f410bcd-0fea-4592-b391-5c8a0dba4d3d"
            name-fwd-ident #uuid "8935944f-1371-4600-b66b-153feeb19124"
            stopa-eid #uuid "476c9d7f-14db-4ee3-8639-0fe2a135f438"]
        (tx/transact!
         (aurora/conn-pool :write)
         (attr-model/get-by-app-id app-id)
         app-id
         [[:add-attr
           {:id name-attr-id
            :forward-identity [name-fwd-ident "users" "name"]
            :value-type :blob
            :cardinality :one
            :unique? false
            :index? false}]
          [:add-triple stopa-eid name-attr-id "Stopa"]])
        (testing "attr is created"
          (is (= {:id name-attr-id
                  :value-type :blob,
                  :cardinality :one,
                  :forward-identity
                  [name-fwd-ident "users" "name"],
                  :unique? false,
                  :index? false,
                  :required? false,
                  :inferred-types #{:string}
                  :catalog :user}
                 (attr-model/seek-by-id
                  name-attr-id
                  (attr-model/get-by-app-id app-id)))))
        (testing "triple is created with ea index"
          (is (= [{:triple
                   [stopa-eid
                    name-attr-id
                    "Stopa"],
                   :md5 "d9beab677fefb1bb874e6894f92ff8ef",
                   :index #{:ea}}]
                 (triple-model/fetch
                  (aurora/conn-pool :read)
                  app-id
                  [[:= :attr-id name-attr-id]]))))
        (testing "implicit retract works"
          (tx/transact!
           (aurora/conn-pool :write)
           (attr-model/get-by-app-id app-id)
           app-id
           [[:add-triple stopa-eid name-attr-id "Joe"]])
          (is (=
               [{:triple
                 [stopa-eid
                  name-attr-id
                  "Joe"],
                 :md5 "55f6507b8e39426e7d559db45ab1fdd0",
                 :index #{:ea}}]
               (triple-model/fetch
                (aurora/conn-pool :read)
                app-id
                [[:= :attr-id name-attr-id]]))))))))

(deftest obj-indexed
  (with-empty-app
    (fn [{app-id :id}]
      (let [zip-attr-id #uuid "06b87294-81df-4316-bb09-4d63b17fb768"
            zip-fwd-ident #uuid "0d5e1430-1f97-4fa3-ab8d-486c3ddcc4fe"
            stopa-eid #uuid "72aa9c7b-a288-4579-b308-d314219a1e1f"]
        (tx/transact!
         (aurora/conn-pool :write)
         (attr-model/get-by-app-id app-id)
         app-id
         [[:add-attr
           {:id zip-attr-id
            :forward-identity [zip-fwd-ident "users" "zip"]
            :value-type :blob
            :cardinality :one
            :unique? false
            :index? true}]
          [:add-triple
           stopa-eid zip-attr-id "11206"]])
        (testing "attr is created"
          (is (= {:id zip-attr-id
                  :value-type :blob,
                  :cardinality :one,
                  :forward-identity
                  [zip-fwd-ident "users" "zip"],
                  :unique? false,
                  :index? true,
                  :required? false,
                  :inferred-types #{:string}
                  :catalog :user}
                 (attr-model/seek-by-id
                  zip-attr-id
                  (attr-model/get-by-app-id app-id)))))
        (testing "triple is created with ea and ave index"
          (is (= [{:triple
                   [stopa-eid
                    zip-attr-id
                    "11206"],
                   :md5 "70ce574f8884b16169e3e5a8e691c028",
                   :index #{:ave :ea}}]
                 (triple-model/fetch
                  (aurora/conn-pool :read)
                  app-id
                  [[:= :attr-id zip-attr-id]]))))
        (testing "implicit retract still works"
          (tx/transact!
           (aurora/conn-pool :write)
           (attr-model/get-by-app-id app-id)
           app-id
           [[:add-triple stopa-eid zip-attr-id "11207"]])
          (is (= [{:triple
                   [stopa-eid
                    zip-attr-id
                    "11207"],
                   :md5 "ed5e18951da7c0bb257840c7c98706cb"
                   :index #{:ave :ea}}]
                 (triple-model/fetch
                  (aurora/conn-pool :read)
                  app-id
                  [[:= :attr-id zip-attr-id]]))))))))

(deftest obj-unique
  (with-empty-app
    (fn [{app-id :id}]
      (let [email-attr-id #uuid "4f3b1902-0025-4f5a-9624-12c5ee27a191"
            email-fwd-ident #uuid "8fb42d0d-40f6-4baa-b7d6-982b9ba55ac9"
            stopa-eid #uuid "23c6400b-72a5-4147-8a06-79cdcda0b0d1"
            joe-eid #uuid "9f64613b-286a-44f8-a228-3c3e6a4fa4ce"]
        (tx/transact!
         (aurora/conn-pool :write)
         (attr-model/get-by-app-id app-id)
         app-id
         [[:add-attr
           {:id email-attr-id
            :forward-identity [email-fwd-ident "users" "email"]
            :value-type :blob
            :cardinality :one
            :unique? true
            :index? true}]
          [:add-triple stopa-eid email-attr-id "test@instantdb.com"]])
        (testing "attr is created"
          (is (= {:id email-attr-id
                  :value-type :blob,
                  :cardinality :one,
                  :forward-identity
                  [email-fwd-ident "users" "email"],
                  :unique? true,
                  :index? true,
                  :required? false,
                  :inferred-types #{:string}
                  :catalog :user}
                 (attr-model/seek-by-id
                  email-attr-id
                  (attr-model/get-by-app-id app-id)))))
        (testing "triple is created with ea ave av index"
          (is (= [{:triple
                   [stopa-eid
                    email-attr-id
                    "test@instantdb.com"]
                   :md5 "66c461730d99ab77911770a07fcce6bf"
                   :index #{:ave :ea :av}}]
                 (triple-model/fetch
                  (aurora/conn-pool :read)
                  app-id
                  [[:= :attr-id email-attr-id]]))))

        (testing "implicit retract still works"
          (tx/transact!
           (aurora/conn-pool :write)
           (attr-model/get-by-app-id app-id)
           app-id
           [[:add-triple stopa-eid email-attr-id "test2@instantdb.com"]])
          (is (= [{:triple
                   [stopa-eid email-attr-id "test2@instantdb.com"]
                   :md5 "3f073721c34987c8f438e1bad08f48cc"
                   :index #{:ave :ea :av}}]
                 (triple-model/fetch
                  (aurora/conn-pool :read)
                  app-id
                  [[:= :attr-id email-attr-id]]))))
        (testing "unicity throws"
          (let [ex-data  (test-util/instant-ex-data
                          (tx/transact!
                           (aurora/conn-pool :write)
                           (attr-model/get-by-app-id app-id)
                           app-id
                           [[:add-triple joe-eid email-attr-id "test2@instantdb.com"]]))]
            (is (= ::ex/record-not-unique
                   (::ex/type ex-data)))
            (is (= "`email` is a unique attribute on `users` and an entity already exists with `users.email` = \"test2@instantdb.com\""
                   (::ex/message ex-data)))))))))

(deftest duplicate-ident-data-test
  (with-empty-app
    (fn [{app-id :id}]
      (let [created-at-attr-id #uuid "5f3b1902-0025-4f5a-9624-12c5ee27a192"
            created-at-fwd-ident #uuid "9fb42d0d-40f6-4baa-b7d6-982b9ba55ac8"
            duplicate-attr-id #uuid "6f3b1902-0025-4f5a-9624-12c5ee27a193"
            duplicate-fwd-ident #uuid "7fb42d0d-40f6-4baa-b7d6-982b9ba55ac7"]

        ;; Add the original createdAt attribute
        (tx/transact!
         (aurora/conn-pool :write)
         (attr-model/get-by-app-id app-id)
         app-id
         [[:add-attr
           {:id created-at-attr-id
            :forward-identity [created-at-fwd-ident "todos" "createdAt"]
            :value-type :instant
            :cardinality :one
            :unique? false
            :index? true}]])

        (testing "original attribute is created successfully"
          (is (= {:id created-at-attr-id
                  :value-type :instant,
                  :cardinality :one,
                  :forward-identity
                  [created-at-fwd-ident "todos" "createdAt"],
                  :unique? false,
                  :index? true,
                  :required? false,
                  :inferred-types nil,
                  :catalog :user}
                 (attr-model/seek-by-id
                  created-at-attr-id
                  (attr-model/get-by-app-id app-id)))))

        (testing "adding duplicate attribute label throws with proper error message"
          (let [ex-data (test-util/instant-ex-data
                         (tx/transact!
                          (aurora/conn-pool :write)
                          (attr-model/get-by-app-id app-id)
                          app-id
                          [[:add-attr
                            {:id duplicate-attr-id
                             :forward-identity [duplicate-fwd-ident "todos" "createdAt"]
                             :value-type :string
                             :cardinality :one
                             :index? true}]]))]

            (is (= ::ex/record-not-unique
                   (::ex/type ex-data)))

            (is (= "`createdAt` already exists on `todos`"
                   (::ex/message ex-data)))

            (is (= {:record-type :ident
                    :etype "todos"
                    :label "createdAt"}
                   (::ex/hint ex-data)))))))))

(deftest tx-ref-many-to-many
  (with-empty-app
    (fn [{app-id :id}]
      (let [tag-attr-id #uuid "0192cabe-916f-48b1-acb9-637c35fd3e8b"
            tag-fwd-ident #uuid "bb2a679d-76df-48da-a048-9b5505da968b"
            tag-rev-ident #uuid "445aab17-fd94-4a6d-93b3-263ffc94c8a2"
            stopa-eid #uuid "77832968-d093-460e-bf62-360e5c4b1388"
            tag-one-eid #uuid "0651748f-cf27-49a6-b895-7baa00ebf805"
            tag-two-eid #uuid "374b9692-fdf5-4682-b2c3-3ce87f267784"]
        (tx/transact!
         (aurora/conn-pool :write)
         (attr-model/get-by-app-id app-id)
         app-id
         [[:add-attr
           {:id tag-attr-id
            :forward-identity [tag-fwd-ident "users" "tags"]
            :reverse-identity [tag-rev-ident "tags" "taggers"]
            :value-type :ref
            :cardinality :many
            :unique? false
            :index? false}]
          [:add-triple stopa-eid tag-attr-id tag-one-eid]])
        (testing "attr is created"
          (is (= {:id tag-attr-id
                  :value-type :ref,
                  :cardinality :many,
                  :forward-identity
                  [tag-fwd-ident "users" "tags"],
                  :reverse-identity
                  [tag-rev-ident "tags" "taggers"],
                  :unique? false,
                  :index? false,
                  :required? false,
                  :inferred-types #{:string}
                  :catalog :user}
                 (attr-model/seek-by-id
                  tag-attr-id
                  (attr-model/get-by-app-id app-id)))))
        (testing "triple is created with eav, vae indexes"
          (is (= [{:triple
                   [stopa-eid tag-attr-id tag-one-eid]
                   :md5 "d0a560693570bacd7b02574480981f33"
                   :index #{:eav :vae}}]
                 (triple-model/fetch
                  (aurora/conn-pool :read)
                  app-id
                  [[:= :attr-id tag-attr-id]]))))
        (testing "cardinality many works"
          (tx/transact!
           (aurora/conn-pool :write)
           (attr-model/get-by-app-id app-id)
           app-id
           [[:add-triple stopa-eid tag-attr-id tag-two-eid]])
          (is (= #{{:triple
                    [stopa-eid tag-attr-id tag-one-eid]
                    :md5 "d0a560693570bacd7b02574480981f33"
                    :index #{:eav :vae}}
                   {:triple
                    [stopa-eid tag-attr-id tag-two-eid]
                    :md5 "797a59d372e168dd573b6e42080a4d1e"
                    :index #{:eav :vae}}}
                 (set (triple-model/fetch
                       (aurora/conn-pool :read)
                       app-id
                       [[:= :attr-id tag-attr-id]])))))
        (testing "invalid uuids are rejected"
          (is
           (= ::ex/validation-failed
              (->  (test-util/instant-ex-data
                    (tx/transact!
                     (aurora/conn-pool :write)
                     (attr-model/get-by-app-id app-id)
                     app-id
                     [[:add-triple stopa-eid tag-attr-id "Foo"]]))
                   ::ex/type)))
          (is
           (= "Linked value must be a valid uuid."
              (-> (test-util/instant-ex-data
                   (tx/transact!
                    (aurora/conn-pool :write)
                    (attr-model/get-by-app-id app-id)
                    app-id
                    [[:add-triple stopa-eid tag-attr-id {:foo "bar"}]]))
                  ::ex/message))))))))

(deftest tx-ref-many-to-one
  (with-empty-app
    (fn [{app-id :id}]

      (let [owner-attr-id #uuid "71e6c46e-5559-41ea-8a5c-1c812ef6fd83"
            owner-fwd-ident #uuid "a1b3c27e-3c75-4e67-8667-479082bebbe5"
            owner-rev-ident #uuid "0b72175e-99eb-499d-8134-1d1f9dd203eb"
            post-eid #uuid "9ad3b0f6-e251-40a9-a39e-ea36154b2128"
            stopa-eid #uuid "75297d98-bc86-484d-94cd-170f4f607a22"
            joe-eid #uuid "2d9d4ed7-6b72-46e1-8564-af033861a5b1"]
        (tx/transact!
         (aurora/conn-pool :write)
         (attr-model/get-by-app-id app-id)
         app-id
         [[:add-attr
           {:id owner-attr-id
            :forward-identity [owner-fwd-ident "posts" "owner"]
            :reverse-identity [owner-rev-ident "users" "posts"]
            :value-type :ref
            :cardinality :one
            :unique? false
            :index? false}]
          [:add-triple post-eid owner-attr-id stopa-eid]])
        (testing "attr is created"
          (is (= {:id owner-attr-id
                  :value-type :ref,
                  :cardinality :one,
                  :forward-identity
                  [owner-fwd-ident "posts" "owner"],
                  :reverse-identity
                  [owner-rev-ident "users" "posts"],
                  :unique? false,
                  :index? false,
                  :required? false,
                  :inferred-types #{:string}
                  :catalog :user}
                 (attr-model/seek-by-id
                  owner-attr-id
                  (attr-model/get-by-app-id app-id)))))
        (testing "triple is created with eav vae ea"
          (is (= [{:triple [post-eid owner-attr-id stopa-eid]
                   :md5 "cf4a51ae88088110a27c1742ad1dedae"
                   :index #{:eav :vae :ea}}]
                 (triple-model/fetch
                  (aurora/conn-pool :read)
                  app-id
                  [[:= :attr-id owner-attr-id]]))))
        (testing "implicit retract works"
          (tx/transact!
           (aurora/conn-pool :write)
           (attr-model/get-by-app-id app-id)
           app-id
           [[:add-triple post-eid owner-attr-id joe-eid]])
          (is (= [{:triple [post-eid owner-attr-id joe-eid]
                   :md5 "460869771b15d18ffcbeda1f64b80d97"
                   :index #{:eav :vae :ea}}]
                 (triple-model/fetch
                  (aurora/conn-pool :read)
                  app-id
                  [[:= :attr-id owner-attr-id]]))))))))

(deftest tx-ref-one-to-one
  (with-empty-app
    (fn [{app-id :id}]
      (let [config-attr-id #uuid "864cc199-c4e8-4e13-8da5-87f27b98400d"
            config-fwd-ident #uuid "6d1dd901-42bf-4889-b371-de3938f6cfdd"
            config-rev-ident #uuid "fc972641-4989-4fa9-8067-ea598ddf2a1b"
            config-eid #uuid "9ad3b0f6-e251-40a9-a39e-ea36154b2128"
            second-config-eid #uuid "897faeb2-8aa9-48c9-a358-87ead4188f5a"
            stopa-eid #uuid "75297d98-bc86-484d-94cd-170f4f607a22"
            joe-eid #uuid "2d9d4ed7-6b72-46e1-8564-af033861a5b1"]
        (tx/transact!
         (aurora/conn-pool :write)
         (attr-model/get-by-app-id app-id)
         app-id
         [[:add-attr
           {:id config-attr-id
            :forward-identity [config-fwd-ident "users" "configObject"]
            :reverse-identity [config-rev-ident "configObjects" "user"]
            :value-type :ref
            :cardinality :one
            :unique? true
            :index? false}]
          [:add-triple stopa-eid config-attr-id config-eid]])
        (testing "attr is created"
          (is (= {:id config-attr-id
                  :value-type :ref,
                  :cardinality :one,
                  :forward-identity
                  [config-fwd-ident "users" "configObject"],
                  :reverse-identity
                  [config-rev-ident "configObjects" "user"],
                  :unique? true,
                  :index? false,
                  :required? false,
                  :inferred-types #{:string}
                  :catalog :user}
                 (attr-model/seek-by-id
                  config-attr-id
                  (attr-model/get-by-app-id app-id)))))
        (testing "triple is created with eav, vae, ea, av indexes"
          (is (= [{:triple [stopa-eid config-attr-id config-eid]
                   :md5 "c0071c9a4cc18dc66115d788b76c12b5"
                   :index #{:eav :vae :ea :av}}]
                 (triple-model/fetch
                  (aurora/conn-pool :read)
                  app-id
                  [[:= :attr-id config-attr-id]]))))
        (testing "implicit retract works"
          (tx/transact!
           (aurora/conn-pool :write)
           (attr-model/get-by-app-id app-id)
           app-id
           [[:add-triple stopa-eid config-attr-id second-config-eid]])
          (is (= [{:triple [stopa-eid config-attr-id second-config-eid]
                   :md5 "6635175fed8c0da3dd51bdeda050eee4"
                   :index #{:eav :vae :ea :av}}]
                 (triple-model/fetch
                  (aurora/conn-pool :read)
                  app-id
                  [[:= :attr-id config-attr-id]]))))

        (is
         (= ::ex/record-not-unique
            (::ex/type (test-util/instant-ex-data
                        (tx/transact!
                         (aurora/conn-pool :write)
                         (attr-model/get-by-app-id app-id)
                         app-id
                         [[:add-triple joe-eid config-attr-id second-config-eid]])))))))))

(deftest lookup-refs
  (with-zeneca-app
    (fn [{app-id :id} r]
      (let [attrs (attr-model/get-by-app-id app-id)
            ctx {:db {:conn-pool (aurora/conn-pool :read)}
                 :app-id app-id
                 :attrs attrs
                 :datalog-query-fn d/query}
            id-attr-id (resolvers/->uuid r :users/id)
            email-attr-id (resolvers/->uuid r :users/email)
            handle-attr-id (resolvers/->uuid r :users/handle)
            bookshelf-attr-id (resolvers/->uuid r :bookshelves/books)
            alex-eid (resolvers/->uuid r "eid-alex")
            stopa-eid (resolvers/->uuid r "eid-stepan-parunashvili")
            eid-nonfiction (resolvers/->uuid r "eid-nonfiction")
            isbn-attr-eid (resolvers/->uuid r :books/isbn13)]
        (testing "updates existing entities"
          (is (= #{[alex-eid
                    email-attr-id
                    "alex@instantdb.com"]}
                 (fetch-triples app-id [[:= :attr-id email-attr-id]
                                        [:= :entity-id alex-eid]])))
          (tx/transact! (aurora/conn-pool :write)
                        (attr-model/get-by-app-id app-id)
                        app-id
                        [[:add-triple [handle-attr-id "alex"] email-attr-id "a@example.com"]])
          (is (= #{[alex-eid
                    email-attr-id
                    "a@example.com"]}
                 (fetch-triples app-id [[:= :attr-id email-attr-id]
                                        [:= :entity-id alex-eid]]))))
        (testing "upserts if necessary"
          (tx/transact! (aurora/conn-pool :write)
                        (attr-model/get-by-app-id app-id)
                        app-id
                        [[:add-triple [handle-attr-id "nobody"] email-attr-id "nobody@example.com"]])
          (is (= {"users" [{"handle" "nobody", "email" "nobody@example.com"}]}
                 (instaql-nodes->object-tree
                  ctx
                  (iq/query ctx {:users {:$ {:where {:handle "nobody"}}}})))))

        (testing "setting ids works"
          (tx/transact! (aurora/conn-pool :write)
                        (attr-model/get-by-app-id app-id)
                        app-id
                        [[:add-triple [handle-attr-id "id-test"] email-attr-id "id-test@example.com"]
                         [:add-triple [handle-attr-id "id-test"] id-attr-id [handle-attr-id "id-test"]]])
          (let [res (instaql-nodes->object-tree
                     ctx
                     (iq/query ctx {:users {:$ {:where {:handle "id-test"}}}}))
                user (-> res (get "users") first)]
            (is (= {"handle" "id-test", "email" "id-test@example.com"}
                   (select-keys user ["handle" "email"])))
            (is (uuid? (parse-uuid (get user "id"))))))

        (testing "retractions work"
          (tx/transact! (aurora/conn-pool :write)
                        (attr-model/get-by-app-id app-id)
                        app-id
                        [[:retract-triple [handle-attr-id "alex"] email-attr-id "a@example.com"]])
          (is (= #{}
                 (fetch-triples app-id [[:= :attr-id email-attr-id]
                                        [:= :entity-id alex-eid]]))))

        (testing "delete entity works"
          (is (seq (fetch-triples app-id [[:= :entity-id stopa-eid]])))
          (tx/transact! (aurora/conn-pool :write)
                        (attr-model/get-by-app-id app-id)
                        app-id
                        [[:delete-entity [handle-attr-id "stopa"]]])
          (is (= #{}
                 (fetch-triples app-id [[:= :entity-id stopa-eid]]))))

        (testing "value lookup refs work"
          (let [feynman-isbn "9780393079814"]
            ;; Check the setup
            (is (= feynman-isbn (as-> (instaql-nodes->object-tree
                                       ctx
                                       (iq/query ctx {:bookshelves {:$ {:where {:name "Nonfiction"}}
                                                                    :books {:$ {:where {:isbn13 feynman-isbn}}}}}))
                                      %
                                  (get % "bookshelves")
                                  (first %)
                                  (get % "books")
                                  (filter (fn [b] (= feynman-isbn (get b "isbn13"))) %)
                                  (first %)
                                  (get % "isbn13"))))

            ;; check retract
            (tx/transact! (aurora/conn-pool :write)
                          (attr-model/get-by-app-id app-id)
                          app-id
                          [[:retract-triple eid-nonfiction bookshelf-attr-id [isbn-attr-eid feynman-isbn]]])

            (is (empty? (as-> (instaql-nodes->object-tree
                               ctx
                               (iq/query ctx {:bookshelves {:$ {:where {:name "Nonfiction"}}
                                                            :books {:$ {:where {:isbn13 feynman-isbn}}}}}))
                              %
                          (get % "bookshelves")
                          (first %)
                          (get % "books"))))

            ;; check adding back
            (tx/transact! (aurora/conn-pool :write)
                          (attr-model/get-by-app-id app-id)
                          app-id
                          [[:add-triple eid-nonfiction bookshelf-attr-id [isbn-attr-eid feynman-isbn]]])

            (is (= feynman-isbn (as-> (instaql-nodes->object-tree
                                       ctx
                                       (iq/query ctx {:bookshelves {:$ {:where {:name "Nonfiction"}}
                                                                    :books {:$ {:where {:isbn13 feynman-isbn}}}}}))
                                      %
                                  (get % "bookshelves")
                                  (first %)
                                  (get % "books")
                                  (filter (fn [b] (= feynman-isbn (get b "isbn13"))) %)
                                  (first %)
                                  (get % "isbn13"))))))

        (testing "value lookup refs are ignored for regular attributes"
          (tx/transact! (aurora/conn-pool :write)
                        (attr-model/get-by-app-id app-id)
                        app-id
                        [[:add-triple alex-eid email-attr-id [email-attr-id "test"]]])
          (let [res (instaql-nodes->object-tree
                     ctx
                     (iq/query ctx {:users {:$ {:where {:handle "alex"}}}}))
                user (-> res (get "users") first)]
            (is (= [(str email-attr-id) "test"] (get user "email")))))))))

(deftest tx-retract
  (with-empty-app
    (fn [{app-id :id}]
      (let [color-attr-id #uuid "cb0423a4-9d12-4e88-87aa-cbf8e29564f7"
            color-fwd-ident #uuid "dc1a22b4-e7f0-443c-9e99-d82a1021ff92"
            stopa-eid #uuid "38f7038b-19e4-4c5e-9a3f-4ca9949014bc"
            joe-eid #uuid "efdaf919-9384-4afc-9629-6aef505ff589"]
        (tx/transact!
         (aurora/conn-pool :write)
         (attr-model/get-by-app-id app-id)
         app-id
         [[:add-attr
           {:id color-attr-id
            :forward-identity [color-fwd-ident "users" "color"]
            :value-type :blob
            :cardinality :one
            :unique? false
            :index? false}]
          [:add-triple stopa-eid color-attr-id "Blue"]
          [:add-triple joe-eid color-attr-id "Red"]])
        (testing "triples are created"
          (is (= #{[stopa-eid color-attr-id "Blue"]
                   [joe-eid color-attr-id "Red"]}
                 (fetch-triples app-id [[:= :attr-id color-attr-id]]))))
        (testing "retract works"
          (tx/transact!
           (aurora/conn-pool :write)
           (attr-model/get-by-app-id app-id)
           app-id
           [[:retract-triple stopa-eid color-attr-id "Blue"]])
          (is (= #{[joe-eid color-attr-id "Red"]}
                 (fetch-triples app-id [[:= :attr-id color-attr-id]]))))))))

(deftest tx-dupes
  (with-empty-app
    (fn [{app-id :id}]
      (let [likes-attr-id #uuid "49632e3c-d0a1-490b-8c48-551dfb118ab4"
            likes-fwd-ident #uuid "3407d5ef-7fe7-411e-853c-808cc42926f3"
            like-rev-ident #uuid "62917f6a-31d8-4b2c-ad81-f38042a460ab"
            fav-nickname-attr-id #uuid "1615e33c-791a-4435-a3c4-743447d46d8d"
            nick-fwd-ident #uuid "4b82186c-60a7-4414-a114-9671f88c0ab5"
            stopa-eid #uuid "df934243-0697-4de0-a8d8-c4ca054ec115"
            joe-eid #uuid "6ea7045a-0d1b-4d30-bd91-dacaf6655206"
            billy-eid #uuid "29d5eaa4-8eee-4a30-bb3a-1aa6ee4ce3f9"]
        (tx/transact!
         (aurora/conn-pool :write)
         (attr-model/get-by-app-id app-id)
         app-id
         [[:add-attr {:id likes-attr-id
                      :forward-identity [likes-fwd-ident "users" "likes"]
                      :reverse-identity [like-rev-ident "users" "likedBy"]
                      :value-type :ref
                      :cardinality :many
                      :unique? false
                      :index? false}]
          [:add-attr {:id fav-nickname-attr-id
                      :forward-identity [nick-fwd-ident "users" "favNickname"]
                      :value-type :blob
                      :cardinality :one
                      :unique? true
                      :index? false}]])

        (testing "double-inserting on ea works"
          (tx/transact!
           (aurora/conn-pool :write)
           (attr-model/get-by-app-id app-id)
           app-id
           [[:add-triple stopa-eid fav-nickname-attr-id "Stoopa"]
            [:add-triple joe-eid  fav-nickname-attr-id "Joski"]
            [:add-triple stopa-eid fav-nickname-attr-id "Stopachka"]])
          (is (= #{[stopa-eid fav-nickname-attr-id "Stopachka"]
                   [joe-eid fav-nickname-attr-id "Joski"]}
                 (fetch-triples app-id [[:= :attr-id fav-nickname-attr-id]]))))
        (testing "double-inserting on eav works"
          (tx/transact!
           (aurora/conn-pool :write)
           (attr-model/get-by-app-id app-id)
           app-id
           [[:add-triple stopa-eid likes-attr-id billy-eid]
            [:add-triple joe-eid likes-attr-id stopa-eid]
            [:add-triple stopa-eid likes-attr-id joe-eid]
            [:add-triple stopa-eid likes-attr-id joe-eid]])
          (is (= #{[stopa-eid likes-attr-id billy-eid]
                   [stopa-eid likes-attr-id joe-eid]
                   [joe-eid  likes-attr-id stopa-eid]}
                 (fetch-triples app-id [[:= :attr-id likes-attr-id]]))))))))

(deftest delete-entity
  (with-empty-app
    (fn [{app-id :id}]
      (let [likes-attr-id #uuid "49632e3c-d0a1-490b-8c48-551dfb118ab4"
            likes-fwd-ident #uuid "3407d5ef-7fe7-411e-853c-808cc42926f3"
            like-rev-ident #uuid "62917f6a-31d8-4b2c-ad81-f38042a460ab"
            fav-nickname-attr-id #uuid "1615e33c-791a-4435-a3c4-743447d46d8d"
            nick-fwd-ident #uuid "4b82186c-60a7-4414-a114-9671f88c0ab5"
            stopa-eid #uuid "df934243-0697-4de0-a8d8-c4ca054ec115"
            joe-eid #uuid "6ea7045a-0d1b-4d30-bd91-dacaf6655206"
            billy-eid #uuid "29d5eaa4-8eee-4a30-bb3a-1aa6ee4ce3f9"]
        (tx/transact!
         (aurora/conn-pool :write)
         (attr-model/get-by-app-id app-id)
         app-id
         [[:add-attr {:id likes-attr-id
                      :forward-identity [likes-fwd-ident "users" "likes"]
                      :reverse-identity [like-rev-ident "users" "likedBy"]
                      :value-type :ref
                      :cardinality :many
                      :unique? false
                      :index? false}]
          [:add-attr {:id fav-nickname-attr-id
                      :forward-identity [nick-fwd-ident "users" "favNickname"]
                      :value-type :blob
                      :cardinality :one
                      :unique? true
                      :index? false}]])

        ;; add and verify some data
        (tx/transact!
         (aurora/conn-pool :write)
         (attr-model/get-by-app-id app-id)
         app-id
         [[:add-triple stopa-eid fav-nickname-attr-id "Stopa"]
          [:add-triple joe-eid fav-nickname-attr-id "Joski"]
          [:add-triple billy-eid fav-nickname-attr-id "Billy"]
          [:add-triple stopa-eid likes-attr-id billy-eid]
          [:add-triple stopa-eid likes-attr-id joe-eid]])

        (is (= #{[stopa-eid fav-nickname-attr-id "Stopa"]
                 [joe-eid fav-nickname-attr-id "Joski"]
                 [billy-eid fav-nickname-attr-id "Billy"]
                 [stopa-eid likes-attr-id billy-eid]
                 [stopa-eid likes-attr-id joe-eid]}
               (fetch-triples app-id)))

        ;; delete entity removes both object triples and references
        (tx/transact!
         (aurora/conn-pool :write)
         (attr-model/get-by-app-id app-id)
         app-id
         [[:delete-entity billy-eid]])

        (is (= #{[stopa-eid fav-nickname-attr-id "Stopa"]
                 [joe-eid fav-nickname-attr-id "Joski"]
                 [stopa-eid likes-attr-id joe-eid]}
               (fetch-triples app-id)))))))

(deftest delete-entity-cleans-references
  (with-empty-app
    (fn [{app-id :id}]
      (let [board-id-attr-id (UUID/randomUUID)
            node-id-attr-id (UUID/randomUUID)
            board-nodes-attr-id (UUID/randomUUID)
            ex-board (UUID/randomUUID)
            ex-node (UUID/randomUUID)]
        (tx/transact!
         (aurora/conn-pool :write)
         (attr-model/get-by-app-id app-id)
         app-id
         [[:add-attr {:id board-id-attr-id
                      :forward-identity [(UUID/randomUUID) "boards" "id"]
                      :value-type :blob
                      :cardinality :one
                      :unique? false
                      :index? false}]
          [:add-attr {:id node-id-attr-id
                      :forward-identity [(UUID/randomUUID) "nodes" "id"]
                      :value-type :blob
                      :cardinality :one
                      :unique? false
                      :index? false}]
          [:add-attr {:id board-nodes-attr-id
                      :forward-identity [(UUID/randomUUID) "boards" "nodes"]
                      :reverse-identity [(UUID/randomUUID) "nodes" "board"]
                      :value-type :ref
                      :cardinality :many
                      :unique? true
                      :index? false}]
          [:add-triple ex-board board-id-attr-id ex-board]
          [:add-triple ex-node node-id-attr-id ex-node]
          [:add-triple ex-board board-nodes-attr-id ex-node]])
        (is (= #{[ex-board board-id-attr-id (str ex-board)]
                 [ex-node node-id-attr-id (str ex-node)]
                 [ex-board board-nodes-attr-id ex-node]}
               (fetch-triples app-id)))
        (tx/transact! (aurora/conn-pool :write)
                      (attr-model/get-by-app-id app-id)
                      app-id
                      [[:delete-entity ex-node "nodes"]])
        (is (= #{[ex-board board-id-attr-id (str ex-board)]}
               (fetch-triples app-id)))))))

(comment
  (def app-id #uuid "2f23dfa2-c921-4988-9243-adf602339bab")
  (def app
    (app-model/create! {:title "test app"
                        :creator-id test-user-id
                        :id app-id
                        :admin-token (UUID/randomUUID)}))
  (bootstrap/add-zeneca-to-app! app-id)
  (def r (resolvers/make-zeneca-resolver app-id))
  (app-model/delete-immediately-by-id! {:id app-id}))

(deftest write-perms-merged
  (with-zeneca-app
    (fn [{app-id :id :as _app} r]
      (let [make-ctx (fn [] {:db {:conn-pool (aurora/conn-pool :write)}
                             :app-id app-id
                             :attrs (attr-model/get-by-app-id app-id)
                             :datalog-query-fn d/query
                             :rules (rule-model/get-by-app-id (aurora/conn-pool :read) {:app-id app-id})
                             :current-user nil})]
        (testing "updates are sequentially merged"
          (rule-model/put!
           (aurora/conn-pool :write)
           {:app-id app-id :code {:users {:allow {:update "newData.handle.foo == '1' && newData.handle.bar == '2' && newData.handle.baz == '3'"}}}})
          (permissioned-tx/transact!
           (make-ctx)
           [[:add-triple (resolvers/->uuid r "eid-stepan-parunashvili")
             (resolvers/->uuid r :users/handle) {:foo "0" :baz "3"}]
            [:deep-merge-triple (resolvers/->uuid r "eid-stepan-parunashvili")
             (resolvers/->uuid r :users/handle) {:foo "1"}]
            [:deep-merge-triple (resolvers/->uuid r "eid-stepan-parunashvili")
             (resolvers/->uuid r :users/handle) {:bar "2"}]])
          (is
           (= #{"alex" "joe" "nicolegf" {:foo "1" :bar "2" :baz "3"}}
              (->>  (test-util/pretty-perm-q
                     {:app-id app-id :current-user nil}
                     {:users {}})
                    :users
                    (map :handle)
                    set))))))))

(deftest write-perms
  (doseq [[title get-lookup] [["with eid" (fn [r] (resolvers/->uuid r "eid-stepan-parunashvili"))]
                              ["with lookup ref" (fn [r] [(resolvers/->uuid r :users/email) "stopa@instantdb.com"])]]]
    (with-zeneca-app
      (fn [{app-id :id :as _app} r]
        (let [make-ctx (fn [] {:db {:conn-pool (aurora/conn-pool :write)}
                               :app-id app-id
                               :attrs (attr-model/get-by-app-id app-id)
                               :datalog-query-fn d/query
                               :rules (rule-model/get-by-app-id (aurora/conn-pool :read) {:app-id app-id})
                               :current-user nil})
              lookup (get-lookup r)]
          (testing title
            (testing "no perms accepts"
              (rule-model/put!
               (aurora/conn-pool :write)
               {:app-id app-id :code {}})
              (permissioned-tx/transact!
               (make-ctx)
               [[:add-triple lookup (resolvers/->uuid r :users/handle) "stopa2"]])
              (is
               (= #{"alex" "joe" "nicolegf" "stopa2"}
                  (->>  (test-util/pretty-perm-q
                         {:app-id app-id :current-user nil}
                         {:users {}})
                        :users
                        (map :handle)
                        set))))
            (testing "false blocks updates"
              (rule-model/put!
               (aurora/conn-pool :write)
               {:app-id app-id :code {:users {:allow {:update "false"}}}})
              (is
               (perm-err?
                (permissioned-tx/transact!
                 (make-ctx)
                 [[:add-triple lookup (resolvers/->uuid r :users/handle) "stopa3"]]))))
            (testing "right value successfully updates"
              (rule-model/put!
               (aurora/conn-pool :write)
               {:app-id app-id :code {:users {:allow {:update "newData.handle == 'stopado'"}}}})
              (permissioned-tx/transact!
               (make-ctx)
               [[:add-triple lookup (resolvers/->uuid r :users/handle) "stopado"]])
              (is
               (= #{"alex" "joe" "nicolegf" "stopado"}
                  (->>  (test-util/pretty-perm-q
                         {:app-id app-id :current-user nil}
                         {:users {}})
                        :users
                        (map :handle)
                        set))))
            (testing "wrong value blocks update"
              (rule-model/put!
               (aurora/conn-pool :write)
               {:app-id app-id :code {:users {:allow {:update "newData.handle == 'stopado'"}}}})
              (is
               (perm-err?
                (permissioned-tx/transact!
                 (make-ctx)
                 [[:add-triple lookup (resolvers/->uuid r :users/handle) "stopa"]]))))
            (testing "bind works"
              (rule-model/put!
               (aurora/conn-pool :write)
               {:app-id app-id :code {:users {:allow {:update "newData.handle == handle"}
                                              :bind ["handle" "'strooper'"]}}})
              (permissioned-tx/transact!
               (make-ctx)
               [[:add-triple lookup (resolvers/->uuid r :users/handle) "strooper"]])
              (is
               (= #{"alex" "joe" "nicolegf" "strooper"}
                  (->>  (test-util/pretty-perm-q
                         {:app-id app-id :current-user nil}
                         {:users {}})
                        :users
                        (map :handle)
                        set))))

            (testing "ref works"
              (rule-model/put!
               (aurora/conn-pool :write)
               {:app-id app-id :code {:bookshelves {:allow {:update "handle in data.ref('users.handle')"}
                                                    :bind ["handle" "'alex'"]}}})
              (permissioned-tx/transact!
               (make-ctx)
               [[:add-triple (resolvers/->uuid r "eid-short-stories") (resolvers/->uuid r :bookshelves/name) "Long Stories"]])
              (is
               (= #{"Long Stories" "Nonfiction"}
                  (->>  (test-util/pretty-perm-q
                         {:app-id app-id :current-user nil}
                         {:bookshelves {:$ {:where {:users.handle "alex"}}}})
                        :bookshelves
                        (map :name)
                        set))))
            (testing "invalid ref blocks"
              (rule-model/put!
               (aurora/conn-pool :write)
               {:app-id app-id :code {:bookshelves {:allow {:update "handle in data.ref('users.handle')"}
                                                    :bind ["handle" "'alex'"]}}})
              (is
               (perm-err?
                (permissioned-tx/transact!
                 (make-ctx)
                 [[:add-triple (resolvers/->uuid r "eid-2022") (resolvers/->uuid r :bookshelves/name) "2022!"]]))))

            (testing "correct auth works"
              (rule-model/put!
               (aurora/conn-pool :write)
               {:app-id app-id :code {:bookshelves {:allow {:update "handle in data.ref('users.handle')"}
                                                    :bind ["handle" "auth.handle"]}}})
              (permissioned-tx/transact!
               (assoc (make-ctx)
                      :current-user {:handle "alex"})
               [[:add-triple (resolvers/->uuid r "eid-short-stories") (resolvers/->uuid r :bookshelves/name) "Longer Stories"]])
              (is
               (= #{"Longer Stories" "Nonfiction"}
                  (->>  (test-util/pretty-perm-q
                         {:app-id app-id :current-user nil}
                         {:bookshelves {:$ {:where {:users.handle "alex"}}}})
                        :bookshelves
                        (map :name)
                        set))))

            (testing "incorrect auth fails"
              (rule-model/put!
               (aurora/conn-pool :write)
               {:app-id app-id :code {:bookshelves {:allow {:update "handle in data.ref('users.handle')"}
                                                    :bind ["handle" "auth.handle"]}}})
              (is
               (perm-err?
                (permissioned-tx/transact!
                 (assoc (make-ctx)
                        :current-user {:handle "joe"})
                 [[:add-triple (resolvers/->uuid r "eid-short-stories") (resolvers/->uuid r :bookshelves/name) "Longer Stories"]]))))
            (testing "admin can do anything"
              (rule-model/put!
               (aurora/conn-pool :write)
               {:app-id app-id :code {:users {:allow {:update "false"}}}})
              (permissioned-tx/transact!
               (assoc (make-ctx) :admin? true)
               [[:add-triple lookup (resolvers/->uuid r :users/handle) "stopa-admin"]])
              (is
               (= #{"alex" "joe" "nicolegf" "stopa-admin"}
                  (->>  (test-util/pretty-perm-q
                         {:app-id app-id :current-user nil}
                         {:users {}})
                        :users
                        (map :handle)
                        set))))

            (testing "create can block"
              (rule-model/put!
               (aurora/conn-pool :write)
               {:app-id app-id :code {:users {:allow {:create "false"}}}})
              (let [boop-id (UUID/randomUUID)]
                (is
                 (perm-err?
                  (permissioned-tx/transact!
                   (make-ctx)
                   [[:add-triple boop-id (resolvers/->uuid r :users/id) boop-id]
                    [:add-triple boop-id (resolvers/->uuid r :users/handle) "boop"]])))))

            (testing "ref in create allows"
              (rule-model/put!
               (aurora/conn-pool :write)
               {:app-id app-id :code {:bookshelves {:allow {:create "handle in data.ref('users.handle')"}
                                                    :bind ["handle" "auth.handle"]}}})
              (let [alex-id (resolvers/->uuid r "eid-alex")
                    adventure-bookshelf-id (UUID/randomUUID)]
                (permissioned-tx/transact!
                 (assoc (make-ctx)
                        :current-user {:handle "alex"})
                 [[:add-triple adventure-bookshelf-id (resolvers/->uuid r :bookshelves/id) adventure-bookshelf-id]
                  [:add-triple adventure-bookshelf-id (resolvers/->uuid r :bookshelves/name) "Adventure"]
                  [:add-triple alex-id  (resolvers/->uuid r :users/bookshelves) adventure-bookshelf-id]])
                (is
                 (= #{"Longer Stories" "Nonfiction" "Adventure"}
                    (->>  (test-util/pretty-perm-q
                           {:app-id app-id :current-user nil}
                           {:bookshelves {:$ {:where {:users.handle "alex"}}}})
                          :bookshelves
                          (map :name)
                          set)))))
            (testing "ref in create blocks"
              (rule-model/put!
               (aurora/conn-pool :write)
               {:app-id app-id :code {:bookshelves {:allow {:create "handle in data.ref('users.handle')"}
                                                    :bind ["handle" "auth.handle"]}}})
              (let [joe-id (resolvers/->uuid r "eid-joe-averbukh")
                    scifi-bookshelf-id (UUID/randomUUID)]
                (is
                 (perm-err?
                  (permissioned-tx/transact!
                   (assoc (make-ctx)
                          :current-user {:handle "alex"})
                   [[:add-triple scifi-bookshelf-id (resolvers/->uuid r :bookshelves/id) scifi-bookshelf-id]
                    [:add-triple scifi-bookshelf-id (resolvers/->uuid r :bookshelves/name) "Scifi"]
                    [:add-triple joe-id  (resolvers/->uuid r :users/bookshelves) scifi-bookshelf-id]])))))

            (testing "delete can block"
              (rule-model/put!
               (aurora/conn-pool :write)
               {:app-id app-id :code {:users {:allow {:delete "false"}}}})
              (is
               (perm-err?
                (permissioned-tx/transact!
                 (make-ctx)
                 [[:delete-entity lookup]]))))

            (testing "delete non-existent-entity"
              (is
               (validation-err?
                (permissioned-tx/transact!
                 (make-ctx)
                 [[:delete-entity (random-uuid)]]))))

            (testing "attr can block"
              (rule-model/put!
               (aurora/conn-pool :write)
               {:app-id app-id :code {:attrs {:allow {:create "false"}}}})
              (is
               (perm-err?
                (permissioned-tx/transact!
                 (make-ctx)
                 [[:add-attr
                   {:id (UUID/randomUUID)
                    :forward-identity [(UUID/randomUUID) "users" "favoriteColor"]
                    :value-type :blob
                    :cardinality :one
                    :unique? false
                    :index? false}]]))))

            (testing "attr update/delete blocks unless admin"
              (is
               (perm-err?
                (permissioned-tx/transact!
                 (make-ctx)
                 [[:delete-attr
                   (resolvers/->uuid r :users/handle)]])))

              (is
               (perm-err?
                (permissioned-tx/transact!
                 (make-ctx)
                 [[:update-attr
                   {:id (resolvers/->uuid r :users/fullName)
                    :index? true}]]))))
            (testing "attr update/delete succeed when admin"
              (let [bloop-attr-id (UUID/randomUUID)
                    bloop-fwd-ident (UUID/randomUUID)
                    bloop-attr {:id bloop-attr-id
                                :forward-identity [bloop-fwd-ident "users" "bloop"]
                                :value-type :blob
                                :cardinality :one
                                :unique? false
                                :index? false}]
                (permissioned-tx/transact!
                 (assoc (make-ctx) :admin? true)
                 [[:add-attr bloop-attr]])

                (is (not (nil?
                          (attr-model/seek-by-id
                           bloop-attr-id
                           (attr-model/get-by-app-id app-id)))))

                (permissioned-tx/transact!
                 (assoc (make-ctx) :admin? true)
                 [[:update-attr
                   {:id bloop-attr-id
                    :index? true}]])
                (is (= true
                       (:index?
                        (attr-model/seek-by-id
                         bloop-attr-id
                         (attr-model/get-by-app-id app-id)))))
                (permissioned-tx/transact!
                 (assoc (make-ctx) :admin? true)
                 [[:delete-attr bloop-attr-id]])
                (is (nil?
                     (attr-model/seek-by-id
                      bloop-attr-id
                      (attr-model/get-by-app-id app-id))))))
            (testing "you can't smuggle in transactions"
              (let [common-id (random-uuid)
                    delete-id (random-uuid)]
                (rule-model/put!
                 (aurora/conn-pool :write)
                 {:app-id app-id :code {:users {:allow {:delete "false"
                                                        :view "false"
                                                        :update "false"
                                                        :create "false"}}}})

                (testing "adding triples"
                  (is
                   (perm-err?
                    (permissioned-tx/transact! (make-ctx)
                                               [[:add-triple common-id (resolvers/->uuid r :users/id) common-id]
                                                [:add-triple common-id (resolvers/->uuid r :users/handle) "dww"]])))
                  (is
                   (perm-err?
                    (permissioned-tx/transact! (make-ctx)
                                               [[:add-triple common-id (resolvers/->uuid r :books/id) common-id]
                                                [:add-triple common-id (resolvers/->uuid r :users/id) common-id]
                                                [:add-triple common-id (resolvers/->uuid r :users/handle) "dww"]]))))

                (testing "deleting entities"
                ;; setup
                  (permissioned-tx/transact! (assoc (make-ctx) :admin? true)
                                             [[:add-triple delete-id (resolvers/->uuid r :users/id) delete-id]])
                  (is (= delete-id
                         (-> (triple-model/fetch
                              (aurora/conn-pool :read)
                              app-id
                              [[:= :entity-id delete-id]])
                             first
                             :triple
                             first)))

                  (permissioned-tx/transact! (make-ctx)
                                             [[:add-triple delete-id (resolvers/->uuid r :books/id) delete-id]])
                  (is
                   (perm-err?
                    (permissioned-tx/transact! (make-ctx)
                                               [[:delete-entity delete-id]]))))))))))))

(deftest create-perms-rule-params
  (with-zeneca-app
    (fn [{app-id :id :as _app} r]
      (let [make-ctx (fn [] {:db {:conn-pool (aurora/conn-pool :write)}
                             :app-id app-id
                             :attrs (attr-model/get-by-app-id app-id)
                             :datalog-query-fn d/query
                             :rules (rule-model/get-by-app-id (aurora/conn-pool :read) {:app-id app-id})
                             :current-user nil})]
        (rule-model/put!
         (aurora/conn-pool :write)
         {:app-id app-id :code {:users {:allow {:create "newData.handle == ruleParams.handle"}}}})

        (testing "with eid"
          (let [eid (random-uuid)]
            (is (perm-err? (permissioned-tx/transact!
                            (make-ctx)
                            [[:add-triple eid (resolvers/->uuid r :users/id) eid]
                             [:add-triple eid (resolvers/->uuid r :users/handle) "alyssa"]])))

            (is (perm-err? (permissioned-tx/transact!
                            (make-ctx)
                            [[:rule-params eid "users" {"handle" "not alyssa"}]
                             [:add-triple eid (resolvers/->uuid r :users/id) eid]
                             [:add-triple eid (resolvers/->uuid r :users/handle) "alyssa"]])))

            (is (not (perm-err? (permissioned-tx/transact!
                                 (make-ctx)
                                 [[:rule-params eid "users" {"handle" "alyssa"}]
                                  [:add-triple eid (resolvers/->uuid r :users/id) eid]
                                  [:add-triple eid (resolvers/->uuid r :users/handle) "alyssa"]]))))

            (is (contains?
                 (->> (test-util/pretty-perm-q {:app-id app-id :current-user nil} {:users {}})
                      :users
                      (map :handle)
                      set)
                 "alyssa"))))

        (testing "with lookup ref"
          (let [lookup [(resolvers/->uuid r :users/handle) "louis"]]
            (is (perm-err? (permissioned-tx/transact!
                            (make-ctx)
                            [[:add-triple lookup (resolvers/->uuid r :users/id) lookup]
                             [:add-triple lookup (resolvers/->uuid r :users/email) "louis@instantdb.com"]])))

            (is (perm-err? (permissioned-tx/transact!
                            (make-ctx)
                            [[:rule-params lookup "users" {"handle" "not louis"}]
                             [:add-triple lookup (resolvers/->uuid r :users/id) lookup]
                             [:add-triple lookup (resolvers/->uuid r :users/email) "louis@instantdb.com"]])))

            (is (not (perm-err? (permissioned-tx/transact!
                                 (make-ctx)
                                 [[:rule-params lookup "users" {"handle" "louis"}]
                                  [:add-triple lookup (resolvers/->uuid r :users/id) lookup]
                                  [:add-triple lookup (resolvers/->uuid r :users/email) "louis@instantdb.com"]]))))

            (is (contains?
                 (->> (test-util/pretty-perm-q {:app-id app-id :current-user nil} {:users {}})
                      :users
                      (map :handle)
                      set)
                 "louis"))))))))

(deftest update-perms-rule-params
  (doseq [[title get-lookup] [["with eid" (fn [r] (resolvers/->uuid r "eid-stepan-parunashvili"))]
                              ["with lookup ref" (fn [r] [(resolvers/->uuid r :users/email) "stopa@instantdb.com"])]]
          op [:add-triple :deep-merge-triple]]
    (with-zeneca-app
      (fn [{app-id :id :as _app} r]
        (let [make-ctx (fn [] {:db {:conn-pool (aurora/conn-pool :write)}
                               :app-id app-id
                               :attrs (attr-model/get-by-app-id app-id)
                               :datalog-query-fn d/query
                               :rules (rule-model/get-by-app-id (aurora/conn-pool :read) {:app-id app-id})
                               :current-user nil})
              lookup (get-lookup r)
              full-name-attr-id (resolvers/->uuid r :users/fullName)]
          (testing title
            (testing op
              (rule-model/put!
               (aurora/conn-pool :write)
               {:app-id app-id :code {:users {:allow {:update "data.handle == ruleParams.handle"}}}})
              (is (perm-err? (permissioned-tx/transact! (make-ctx) [[op lookup full-name-attr-id "Stepashka"]])))
              (is (perm-err? (permissioned-tx/transact! (make-ctx) [[:rule-params lookup "users" {"handle" "not stopa"}]
                                                                    [op lookup full-name-attr-id "Stepashka"]])))
              (is (not (perm-err? (permissioned-tx/transact! (make-ctx) [[:rule-params lookup "users" {"handle" "stopa"}]
                                                                         [op lookup full-name-attr-id "Stepashka"]])))))))))))

(deftest delete-without-etype-perms-rule-params
  (doseq [[title get-lookup] [["with eid" (fn [r] (resolvers/->uuid r "eid-stepan-parunashvili"))]
                              ["with lookup ref" (fn [r] [(resolvers/->uuid r :users/email) "stopa@instantdb.com"])]]]
    (with-zeneca-app
      (fn [{app-id :id :as _app} r]
        (let [make-ctx (fn [] {:db {:conn-pool (aurora/conn-pool :write)}
                               :app-id app-id
                               :attrs (attr-model/get-by-app-id app-id)
                               :datalog-query-fn d/query
                               :rules (rule-model/get-by-app-id (aurora/conn-pool :read) {:app-id app-id})
                               :current-user nil})
              lookup (get-lookup r)]
          (testing title
            (rule-model/put!
             (aurora/conn-pool :write)
             {:app-id app-id :code {:users {:allow {:delete "data.handle == ruleParams.handle"}}
                                    :$users {:allow {:delete "true"}}}})
            (is (perm-err? (permissioned-tx/transact! (make-ctx) [[:delete-entity lookup]])))
            (is (perm-err? (permissioned-tx/transact! (make-ctx) [[:rule-params lookup "users" {"handle" "not stopa"}]
                                                                  [:delete-entity lookup]])))
            (is (not (perm-err? (permissioned-tx/transact! (make-ctx) [[:rule-params lookup "users" {"handle" "stopa"}]
                                                                       [:delete-entity lookup]]))))))))))

(deftest delete-perms-rule-params
  (doseq [[title get-lookup] [["with eid" (fn [r] (resolvers/->uuid r "eid-stepan-parunashvili"))]
                              ["with lookup ref" (fn [r] [(resolvers/->uuid r :users/email) "stopa@instantdb.com"])]]]
    (with-zeneca-app
      (fn [{app-id :id :as _app} r]
        (let [make-ctx (fn [] {:db {:conn-pool (aurora/conn-pool :write)}
                               :app-id app-id
                               :attrs (attr-model/get-by-app-id app-id)
                               :datalog-query-fn d/query
                               :rules (rule-model/get-by-app-id (aurora/conn-pool :read) {:app-id app-id})
                               :current-user nil})
              lookup (get-lookup r)]
          (testing title
            (rule-model/put!
             (aurora/conn-pool :write)
             {:app-id app-id :code {:users {:allow {:delete "data.handle == ruleParams.handle"}}}})
            (is (perm-err? (permissioned-tx/transact! (make-ctx) [[:delete-entity lookup "users"]])))
            (is (perm-err? (permissioned-tx/transact! (make-ctx) [[:rule-params lookup "users" {"handle" "not stopa"}]
                                                                  [:delete-entity lookup "users"]])))
            (is (not (perm-err? (permissioned-tx/transact! (make-ctx) [[:rule-params lookup "users" {"handle" "stopa"}]
                                                                       [:delete-entity lookup "users"]]))))))))))

(deftest rule-params-view-check-on-link
  (with-zeneca-app
    (fn [{app-id :id} r]
      (let [bookshelf-id (resolvers/->uuid r "eid-nonfiction")
            book-id (resolvers/->uuid r "eid-how-to-win-friends-and-influence-people")

            make-ctx (fn [] {:db {:conn-pool (aurora/conn-pool :write)}
                             :app-id app-id
                             :attrs (attr-model/get-by-app-id app-id)
                             :datalog-query-fn d/query
                             :rules (rule-model/get-by-app-id (aurora/conn-pool :read) {:app-id app-id})
                             :current-user nil})]

        (rule-model/put!
         (aurora/conn-pool :write)
         {:app-id app-id
          :code {:books {:allow {:view "data.id == ruleParams.knownBookId"}}}})
        (testing "Link with correct ruleParams works"
          (is (not (perm-err?
                    (permissioned-tx/transact!
                     (make-ctx)
                     [[:rule-params bookshelf-id "bookshelves" {"knownBookId" book-id}]
                      [:add-triple bookshelf-id (resolvers/->uuid r :bookshelves/books) book-id]]))))

          (is (contains?
               (->> (triple-model/fetch
                     (aurora/conn-pool :read)
                     app-id
                     [[:= :entity-id bookshelf-id]
                      [:= :attr-id (resolvers/->uuid r :bookshelves/books)]])
                    (map (comp last :triple))
                    set)
               book-id)))))))

(deftest lookup-perms
  (with-empty-app
    (fn [{app-id :id}]
      (let [p-id-aid (random-uuid)
            p-handle-aid (random-uuid)

            p-fullname-aid (random-uuid)

            org-id-aid (random-uuid)
            org-members-aid (random-uuid)
            org-name-aid (random-uuid)

            stopa-eid (random-uuid)
            instant-org-eid (random-uuid)

            acme-org-eid (random-uuid)]
        (tx/transact!
         (aurora/conn-pool :write)
         (attr-model/get-by-app-id app-id)
         app-id
         [[:add-attr
           {:id p-id-aid
            :forward-identity [(random-uuid) "profiles" "id"]
            :value-type :blob
            :cardinality :one
            :unique? true
            :index? false}]
          [:add-attr
           {:id p-handle-aid
            :forward-identity [(random-uuid) "profiles" "handle"]
            :value-type :blob
            :cardinality :one
            :unique? true
            :index? false}]
          [:add-attr
           {:id p-fullname-aid
            :forward-identity [(random-uuid) "profiles" "fullName"]
            :value-type :blob
            :cardinality :one
            :unique? false
            :index? false}]
          [:add-attr
           {:id org-id-aid
            :forward-identity [(random-uuid) "orgs" "id"]
            :value-type :blob
            :cardinality :one
            :unique? true
            :index? false}]
          [:add-attr
           {:id org-members-aid
            :forward-identity [(random-uuid) "orgs" "members"]
            :reverse-identity [(random-uuid) "profiles" "org"]
            :value-type :ref
            :cardinality :many
            :unique? true
            :index? false}]
          [:add-attr
           {:id org-name-aid
            :forward-identity [(random-uuid) "orgs" "name"]
            :value-type :blob
            :cardinality :one
            :unique? false
            :index? false}]
          [:add-triple stopa-eid p-id-aid stopa-eid]
          [:add-triple stopa-eid p-handle-aid "stopa"]
          [:add-triple stopa-eid p-fullname-aid "Stepan Parunashvili"]
          [:add-triple instant-org-eid org-id-aid instant-org-eid]
          [:add-triple instant-org-eid org-members-aid stopa-eid]
          [:add-triple instant-org-eid org-name-aid "InstantDB"]
          [:add-triple acme-org-eid org-id-aid acme-org-eid]
          [:add-triple acme-org-eid org-name-aid "ACME"]])
        (let [attrs (attr-model/get-by-app-id app-id)
              _ (rule-model/put!
                 (aurora/conn-pool :write)
                 {:app-id app-id
                  :code {:profiles {:allow
                                    {:create "size(data.ref('org.id')) == 1"
                                     :update  "size(data.ref('org.id')) == 1"
                                     :view  "size(data.ref('org.id')) == 1"
                                     :delete  "size(data.ref('org.id')) == 1"}}}})
              rules (rule-model/get-by-app-id {:app-id app-id})
              ctx {:db {:conn-pool (aurora/conn-pool :write)}
                   :app-id app-id
                   :attrs attrs
                   :datalog-query-fn d/query
                   :rules rules}]
          ;; all operations should work with preload-refs
          (with-redefs [cel/get-ref (fn [& _args]
                                      (throw (IllegalAccessError. "Should not be called")))]

            (testing "Create works"
              (permissioned-tx/transact!
               ctx
               [[:add-triple [p-handle-aid "alyssa"] p-fullname-aid "Alyssa P Hacker"]
                [:add-triple [p-handle-aid "alyssa"] p-id-aid [p-handle-aid "alyssa"]]
                [:add-triple instant-org-eid org-members-aid [p-handle-aid "alyssa"]]])
              (is (= #{"stopa" "alyssa"}
                     (->>  (triple-model/fetch (aurora/conn-pool :read)
                                               app-id
                                               [[:= :attr-id p-handle-aid]])
                           (map (comp last :triple))
                           set)))
              (is (perm-err?
                   (permissioned-tx/transact!
                    ctx
                    [[:add-triple [p-handle-aid "ben"] p-fullname-aid "Ben BitDiddle"]
                     [:add-triple [p-handle-aid "ben"] p-id-aid [p-handle-aid "ben"]]]))))
            (testing "Delete works"
              (permissioned-tx/transact!
               ctx
               [[:delete-entity [p-handle-aid "alyssa"] "profiles"]])
              (is (= #{"stopa"}
                     (->>  (triple-model/fetch (aurora/conn-pool :read)
                                               app-id
                                               [[:= :attr-id p-handle-aid]])
                           (map (comp last :triple))
                           set))))
            (testing "Update works"
              (permissioned-tx/transact!
               ctx
               [[:add-triple [p-handle-aid "stopa"] p-fullname-aid "Stopachka"]])
              (is
               (=  "Stopachka"
                   (->  (triple-model/fetch (aurora/conn-pool :read)
                                            app-id
                                            [[:= :attr-id p-fullname-aid]
                                             [:= :entity-id stopa-eid]])

                        first
                        :triple
                        last))))

            (testing "Update alongside view check works"
              (permissioned-tx/transact!
               ctx
               [[:add-triple [p-handle-aid "stopa"] p-fullname-aid "Stopanado"]
                [:add-triple [p-handle-aid "stopa"] p-id-aid [p-handle-aid "stopa"]]
                [:add-triple instant-org-eid org-members-aid [p-handle-aid "stopa"]]])
              (is
               (=  "Stopanado"
                   (->  (triple-model/fetch (aurora/conn-pool :read)
                                            app-id
                                            [[:= :attr-id p-fullname-aid]
                                             [:= :entity-id stopa-eid]])

                        first
                        :triple
                        last))))))))))

(deftest indexed-attrs-get-nulls
  (testing "no nulls for unindexed attrs"
    (with-zeneca-app-no-indexing
      (fn [app r]
        (let [handles-before (triple-model/fetch (aurora/conn-pool :read)
                                                 (:id app)
                                                 [[:= :attr_id (resolvers/->uuid r :users/handle)]])
              id (random-uuid)
              _ (tx/transact! (aurora/conn-pool :write)
                              (attr-model/get-by-app-id (:id app))
                              (:id app)
                              [[:add-triple id (resolvers/->uuid r :users/id) (str id)]
                               [:add-triple id (resolvers/->uuid r :users/email) "test@example.com"]])
              handles-after (triple-model/fetch (aurora/conn-pool :read)
                                                (:id app)
                                                [[:= :attr_id (resolvers/->uuid r :users/handle)]])]
          (is (pos? (count handles-before)))
          (is (= handles-before
                 handles-after))
          (is (= #{"alex" "stopa" "joe" "nicolegf"}
                 (set (map (fn [h]
                             (-> h :triple (nth 2)))
                           handles-after))))))))
  (testing "nulls for indexed attrs"
    ;; handles are indexed in zeneca-app
    (with-zeneca-app
      (fn [app r]
        (let [handles-before (triple-model/fetch (aurora/conn-pool :read)
                                                 (:id app)
                                                 [[:= :attr_id (resolvers/->uuid r :users/handle)]])
              id (random-uuid)
              _ (tx/transact! (aurora/conn-pool :write)
                              (attr-model/get-by-app-id (:id app))
                              (:id app)
                              [[:add-triple id (resolvers/->uuid r :users/id) (str id)]
                               [:add-triple id (resolvers/->uuid r :users/email) "test@example.com"]])
              handles-after (triple-model/fetch (aurora/conn-pool :read)
                                                (:id app)
                                                [[:= :attr_id (resolvers/->uuid r :users/handle)]])]
          (is (pos? (count handles-before)))
          (is (= (inc (count handles-before))
                 (count handles-after))
              "created a single handle")
          (is (= #{nil "alex" "stopa" "joe" "nicolegf"}
                 (set (map (fn [h]
                             (-> h :triple (nth 2)))
                           handles-after)))))))))

(deftest new-indexed-blobs-get-nulls
  (with-zeneca-app
    (fn [app _r]
      (let [make-ctx (fn [] {:db {:conn-pool (aurora/conn-pool :write)}
                             :app-id (:id app)
                             :attrs (attr-model/get-by-app-id (:id app))
                             :datalog-query-fn d/query
                             :rules (rule-model/get-by-app-id (aurora/conn-pool :read) {:app-id (:id app)})
                             :current-user nil})
            attr-id (random-uuid)]
        (permissioned-tx/transact! (make-ctx)
                                   [[:add-attr {:id attr-id
                                                :forward-identity [(random-uuid) "users" "new-attr"]
                                                :value-type :blob
                                                :cardinality :one
                                                :unique? false
                                                :index? true}]])
        (let [new-attr-triples (triple-model/fetch (aurora/conn-pool :read)
                                                   (:id app)
                                                   [[:= :attr-id attr-id]])]
          (is (= [nil nil nil nil] (map (fn [r] (-> r :triple (nth 2)))
                                        new-attr-triples))))))))

(deftest perms-rejects-updates-to-lookups
  (with-empty-app
    (fn [app]
      (let [id-attr-id (random-uuid)
            handle-attr-id (random-uuid)
            make-ctx (fn [] {:db {:conn-pool (aurora/conn-pool :write)}
                             :app-id (:id app)
                             :attrs (attr-model/get-by-app-id (:id app))
                             :datalog-query-fn d/query
                             :rules (rule-model/get-by-app-id (aurora/conn-pool :read) {:app-id (:id app)})
                             :current-user nil})
            existing-id (random-uuid)]
        (tx/transact!
         (aurora/conn-pool :write)
         (attr-model/get-by-app-id (:id app))
         (:id app)
         [[:add-attr
           {:id id-attr-id
            :forward-identity [(random-uuid) "profiles" "id"]
            :value-type :blob
            :cardinality :one
            :unique? true
            :index? false}]
          [:add-attr
           {:id handle-attr-id
            :forward-identity [(random-uuid) "profiles" "handle"]
            :value-type :blob
            :cardinality :one
            :unique? true
            :index? false}]
          [:add-triple existing-id id-attr-id (str existing-id)]
          [:add-triple existing-id handle-attr-id "c"]])

        (rule-model/put!
         (aurora/conn-pool :write)
         {:app-id (:id app)
          :code {:profiles {:allow
                            {:create "data.handle != 'a'"
                             :update "newData.handle != 'b'"}}}})

        (testing "non-lookups-fail"
          (testing "create"
            (let [id (random-uuid)]
              (is (perm-err?
                   (permissioned-tx/transact! (make-ctx)
                                              [[:add-triple id id-attr-id (str id)]
                                               [:add-triple id handle-attr-id "a"]])))))

          (testing "update"
            (is (perm-err?
                 (permissioned-tx/transact! (make-ctx)
                                            [[:add-triple existing-id handle-attr-id "b"]])))))

        (testing "lookup fail"
          (testing "create"
            (is (perm-err?
                 (permissioned-tx/transact! (make-ctx)
                                            [[:add-triple [handle-attr-id "a"] id-attr-id [handle-attr-id "a"]]])))

            ;; n.b. if this validation-err? is fixed, make sure that this is still a permisison error
            ;;      right now you can't edit a lookup attr in the same transaction you create the lookup attr
            (is (validation-err?
                 (permissioned-tx/transact! (make-ctx)
                                            [[:add-triple [handle-attr-id "a"] id-attr-id [handle-attr-id "a"]]
                                             [:add-triple [handle-attr-id "a"] handle-attr-id "c"]]))))
          (testing "update"
            (is (perm-err?
                 (permissioned-tx/transact! (make-ctx)
                                            [[:add-triple [handle-attr-id "c"] handle-attr-id "b"]])))))))))

(deftest rejects-bad-lookups
  (with-zeneca-app
    (fn [{app-id :id :as _app} r]
      (let [make-ctx (fn [] {:db {:conn-pool (aurora/conn-pool :read)}
                             :app-id app-id
                             :attrs (attr-model/get-by-app-id app-id)
                             :datalog-query-fn d/query
                             :rules (rule-model/get-by-app-id (aurora/conn-pool :read) {:app-id app-id})
                             :current-user nil})
            lookup [(resolvers/->uuid r :users/email) "stopa@instantdb.com"]]
        (rule-model/put!
         (aurora/conn-pool :write)
         {:app-id app-id :code {}})
        (testing "Can't use a lookup attr from one namespace with attrs from another"
          (is (validation-err?
               (permissioned-tx/transact!
                (make-ctx)
                [[:add-triple lookup (resolvers/->uuid r :books/title) "Title"]]))))))))

(defn validation-err [input]
  (try
    (tx/validate! (tx/coerce! input))
    (catch clojure.lang.ExceptionInfo e
      (->> e ex-data ::ex/hint :errors first))))

(deftest validations
  (testing "not colls"
    (is (= '{:expected coll?, :in []}
           (validation-err 1)))
    (is (= '{:expected coll?, :in [0]}
           (validation-err [1]))))
  (testing "bad triples"
    (is (= '{:expected vector?, :in [0 1]}
           (validation-err
            [[:add-triple :eid-not-uuid (UUID/randomUUID) "value"]])))
    (is (= '{:expected :instant.db.model.triple/value, :in [0]}
           (validation-err
            [[:add-triple (UUID/randomUUID) (UUID/randomUUID)]]))))
  (testing "bad attrs"
    (is (= '{:expected instant.db.model.attr/value-type, :in [0 1]}
           (validation-err
            [[:add-attr]])))
    (is (= '{:expected uuid?, :in [0 1 :id]}
           (validation-err
            [[:add-attr
              {:id nil
               :forward-identity [(UUID/randomUUID) "users" "name"]
               :value-type :blob
               :cardinality :one
               :unique? false
               :index? false}]])))
    (is (= '{:expected :instant.db.model.attr/label, :in [0 1 :forward-identity]}
           (validation-err
            [[:add-attr
              {:id (UUID/randomUUID)
               :forward-identity [(UUID/randomUUID) "users"]
               :value-type :blob
               :cardinality :one
               :unique? false
               :index? false}]])))))

(deftest expected-errors
  (with-empty-app
    (fn [{app-id :id}]
      (let [stopa-eid (UUID/randomUUID)
            email-attr-id (UUID/randomUUID)
            email-fwd-ident (UUID/randomUUID)]
        (testing "add-attr twice triggers unicity constraints"
          (tx/transact!
           (aurora/conn-pool :write)
           (attr-model/get-by-app-id app-id)
           app-id
           [[:add-attr
             {:id email-attr-id
              :forward-identity [email-fwd-ident "users" "email"]
              :value-type :blob
              :cardinality :one
              :unique? true
              :index? true}]
            [:add-triple stopa-eid email-attr-id "test@instantdb.com"]])
          (is (= ::ex/record-not-unique
                 (::ex/type
                  (test-util/instant-ex-data
                   (tx/transact!
                    (aurora/conn-pool :write)
                    (attr-model/get-by-app-id app-id)
                    app-id
                    [[:add-attr
                      {:id email-attr-id
                       :forward-identity [(random-uuid) "users" "email"]
                       :value-type :blob
                       :cardinality :one
                       :unique? true
                       :index? true}]
                     [:add-triple stopa-eid email-attr-id "test@instantdb.com"]]))))))
        (testing "invalid foreign key for attrs triggers foreign key violation"
          (is (= ::ex/record-foreign-key-invalid
                 (->  (test-util/instant-ex-data
                       (tx/transact!
                        (aurora/conn-pool :write)
                        (attr-model/get-by-app-id app-id)
                        app-id
                        [[:add-triple stopa-eid (UUID/randomUUID) "Stopa"]]))
                      ::ex/type))))))))

(deftest good-error-for-invalid-ref-uuid
  (with-zeneca-app
    (fn [app r]
      (let [alex-eid (resolvers/->uuid r "eid-alex")
            bookshelf-aid (resolvers/->uuid r :users/bookshelves)
            ex (test-util/instant-ex-data
                 (tx/transact!
                  (aurora/conn-pool :write)
                  (attr-model/get-by-app-id (:id app))
                  (:id app)
                  [[:add-triple alex-eid bookshelf-aid ""]]))]
        (is ex)
        (is (= ::ex/validation-failed
               (::ex/type ex)))
        (is (= "" (-> ex
                      ::ex/hint
                      :value)))))))

(deftest rejects-invalid-data-for-checked-attrs
  (with-empty-app
    (fn [{app-id :id}]
      (let [email-attr-id (random-uuid)]
        (tx/transact!
         (aurora/conn-pool :write)
         (attr-model/get-by-app-id app-id)
         app-id
         [[:add-attr
           {:id email-attr-id
            :forward-identity [(random-uuid) "users" "email"]
            :value-type :blob
            :cardinality :one
            :unique? true
            :index? true
            :checked-data-type :string}]])
        (testing "allows good data"
          (tx/transact! (aurora/conn-pool :write)
                        (attr-model/get-by-app-id app-id)
                        app-id
                        [[:add-triple (random-uuid) email-attr-id "test@example.com"]])
          (is (= ["test@example.com"]
                 (map (fn [{:keys [triple]}]
                        (nth triple 2))
                      (triple-model/fetch
                       (aurora/conn-pool :read)
                       app-id
                       [[:= :attr-id email-attr-id]])))))
        ;; If this failed it might be because we added new columns to the triples
        ;; table, check instant.util.exception/extract-triple-from-constraint
        (testing "returns a friendly error message for bad data"
          (let [eid (random-uuid)]
            (is (= #:instant.util.exception{:type
                                            :instant.util.exception/validation-failed,
                                            :message "Invalid value type for users.email. Value must be a string but the provided value type is number.",
                                            :hint {:namespace "users",
                                                   :attribute "email",
                                                   :value 10,
                                                   :checked-data-type "string",
                                                   :attr-id (str email-attr-id)
                                                   :entity-id (str eid)}}
                   (dissoc (test-util/instant-ex-data
                             (tx/transact! (aurora/conn-pool :write)
                                           (attr-model/get-by-app-id app-id)
                                           app-id
                                           [[:add-triple eid email-attr-id 10]]))
                           ::ex/trace-id)))))))))

(deftest rejects-large-values-for-indexed-data
  (with-empty-app
    (fn [{app-id :id}]
      (let [email-attr-id (random-uuid)
            unique-attr-id (random-uuid)]
        (tx/transact!
         (aurora/conn-pool :write)
         (attr-model/get-by-app-id app-id)
         app-id
         [[:add-attr
           {:id email-attr-id
            :forward-identity [(random-uuid) "users" "email"]
            :value-type :blob
            :cardinality :one
            :unique? false
            :index? true
            :checked-data-type :string}]
          [:add-attr
           {:id unique-attr-id
            :forward-identity [(random-uuid) "users" "unique"]
            :value-type :blob
            :cardinality :one
            :unique? true
            :index? false
            :checked-data-type :string}]])

        ;; If this failed it might be because we added new columns to the triples
        ;; table, check instant.util.exception/extract-triple-from-constraint
        (testing "returns a friendly error message for indexed data"
          (let [eid (random-uuid)]
            (is (= #:instant.util.exception{:type
                                            :instant.util.exception/validation-failed,
                                            :message "Value is too large for an indexed attribute."
                                            :hint {:namespace "users",
                                                   :attribute "email",
                                                   :value
                                                   "\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa...",
                                                   :checked-data-type "string",
                                                   :attr-id (str email-attr-id)
                                                   :entity-id (str eid)
                                                   :value-too-large? true}}
                   (dissoc (test-util/instant-ex-data
                             (tx/transact! (aurora/conn-pool :write)
                                           (attr-model/get-by-app-id app-id)
                                           app-id
                                           [[:add-triple eid email-attr-id (apply str (repeat 1000000 "a"))]]))
                           ::ex/trace-id)))))
        (testing "returns a friendly error message for unique data"
          (let [eid (random-uuid)]
            (is (= #:instant.util.exception{:type
                                            :instant.util.exception/validation-failed,
                                            :message "Value is too large for a unique attribute.",
                                            :hint
                                            {:namespace "users",
                                             :attribute "unique",
                                             :value "\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa..."
                                             :checked-data-type "string",
                                             :attr-id (str unique-attr-id)
                                             :entity-id (str eid)
                                             :value-too-large? true}}
                   (dissoc
                    (test-util/instant-ex-data
                      (tx/transact! (aurora/conn-pool :write)
                                    (attr-model/get-by-app-id app-id)
                                    app-id
                                    [[:add-triple eid unique-attr-id (apply str (repeat 1000000 "a"))]]))
                    ::ex/trace-id)))))))))

(deftest deep-merge-existing-object
  (with-empty-app
    (fn [{app-id :id}]
      (let [info-attr-id (UUID/randomUUID)
            info-fwd-ident (UUID/randomUUID)
            target-eid (UUID/randomUUID)]
        (tx/transact!
         (aurora/conn-pool :write)
         (attr-model/get-by-app-id app-id)
         app-id
         [[:add-attr
           {:id info-attr-id
            :forward-identity [info-fwd-ident "users" "info"]
            :value-type :blob
            :cardinality :one
            :unique? false
            :index? false}]
          [:add-triple target-eid info-attr-id {:id "1"}]
          [:deep-merge-triple target-eid info-attr-id {:name "Patchy"}]])
        (testing "existing triple is patched"
          (is (= [{:triple
                   [target-eid
                    info-attr-id
                    {"id" "1" "name" "Patchy"}],
                   :md5 "ff768df223517b2d23d6e99d23148dd0",
                   :index #{:ea}}]
                 (triple-model/fetch
                  (aurora/conn-pool :read)
                  app-id
                  [[:= :attr-id info-attr-id]]))))))))

(deftest deep-merge-existing-scalar
  (with-empty-app
    (fn [{app-id :id}]
      (let [info-attr-id (UUID/randomUUID)
            info-fwd-ident (UUID/randomUUID)
            target-eid (UUID/randomUUID)]
        (tx/transact!
         (aurora/conn-pool :write)
         (attr-model/get-by-app-id app-id)
         app-id
         [[:add-attr
           {:id info-attr-id
            :forward-identity [info-fwd-ident "users" "info"]
            :value-type :blob
            :cardinality :one
            :unique? false
            :index? false}]
          [:add-triple target-eid info-attr-id "a"]
          [:deep-merge-triple target-eid info-attr-id {:name "Patchy"}]])
        (testing "when existing value is a scalar, deep-merge overwrites it with the given value"
          (is (= [{:triple
                   [target-eid
                    info-attr-id
                    {"name" "Patchy"}],
                   :md5 "e262b690a6c13d36e7972baa39215438",
                   :index #{:ea}}]
                 (triple-model/fetch
                  (aurora/conn-pool :read)
                  app-id
                  [[:= :attr-id info-attr-id]]))))))))

(deftest deep-merge-deep-object-with-scalar
  (with-empty-app
    (fn [{app-id :id}]
      (let [info-attr-id (UUID/randomUUID)
            info-fwd-ident (UUID/randomUUID)
            target-eid (UUID/randomUUID)]
        (tx/transact!
         (aurora/conn-pool :write)
         (attr-model/get-by-app-id app-id)
         app-id
         [[:add-attr
           {:id info-attr-id
            :forward-identity [info-fwd-ident "users" "info"]
            :value-type :blob
            :cardinality :one
            :unique? false
            :index? false}]
          [:add-triple target-eid info-attr-id {:a {}}]
          [:deep-merge-triple target-eid info-attr-id {:a "x"}]])
        (testing "deep-merge will overwrite deep objects with scalars"
          (is (= [{:triple
                   [target-eid
                    info-attr-id
                    {"a" "x"}],
                   :md5 "f5239c9772076e520bcbef45c51aae76",
                   :index #{:ea}}]
                 (triple-model/fetch
                  (aurora/conn-pool :read)
                  app-id
                  [[:= :attr-id info-attr-id]]))))))))

(deftest deep-merge-deep-scalar-with-object
  (with-empty-app
    (fn [{app-id :id}]
      (let [info-attr-id (UUID/randomUUID)
            info-fwd-ident (UUID/randomUUID)
            target-eid (UUID/randomUUID)]
        (tx/transact!
         (aurora/conn-pool :write)
         (attr-model/get-by-app-id app-id)
         app-id
         [[:add-attr
           {:id info-attr-id
            :forward-identity [info-fwd-ident "users" "info"]
            :value-type :blob
            :cardinality :one
            :unique? false
            :index? false}]
          [:add-triple target-eid info-attr-id {:a "x"}]
          [:deep-merge-triple target-eid info-attr-id {:a {}}]])
        (testing "deep-merge will overwrite deep scalars with objects"
          (is (= [{:triple
                   [target-eid
                    info-attr-id
                    {"a" {}}],
                   :md5 "b64d96a034f7bf16cc5658f10c8236b4",
                   :index #{:ea}}]
                 (triple-model/fetch
                  (aurora/conn-pool :read)
                  app-id
                  [[:= :attr-id info-attr-id]]))))))))

(deftest deep-merge-new
  (with-empty-app
    (fn [{app-id :id}]
      (let [info-attr-id (UUID/randomUUID)
            info-fwd-ident (UUID/randomUUID)
            target-eid (UUID/randomUUID)]
        (tx/transact!
         (aurora/conn-pool :write)
         (attr-model/get-by-app-id app-id)
         app-id
         [[:add-attr
           {:id info-attr-id
            :forward-identity [info-fwd-ident "users" "info"]
            :value-type :blob
            :cardinality :one
            :unique? false
            :index? false}]
          [:deep-merge-triple target-eid info-attr-id {:name "Patchy"}]])
        (testing "when no triple exists, deep-merge creates one with a the given value"
          (is (= [{:triple
                   [target-eid
                    info-attr-id
                    {"name" "Patchy"}],
                   :md5 "e262b690a6c13d36e7972baa39215438",
                   :index #{:ea}}]
                 (triple-model/fetch
                  (aurora/conn-pool :read)
                  app-id
                  [[:= :attr-id info-attr-id]]))))))))

(deftest deep-merge-many
  (with-empty-app
    (fn [{app-id :id}]
      (let [info-attr-id (UUID/randomUUID)
            info-fwd-ident (UUID/randomUUID)
            target-eid (UUID/randomUUID)]
        (tx/transact!
         (aurora/conn-pool :write)
         (attr-model/get-by-app-id app-id)
         app-id
         [[:add-attr
           {:id info-attr-id
            :forward-identity [info-fwd-ident "users" "info"]
            :value-type :blob
            :cardinality :one
            :unique? false
            :index? false}]
          [:deep-merge-triple target-eid info-attr-id {:name "Patchy"}]
          [:deep-merge-triple target-eid info-attr-id {:occupation "Programmer"}]])
        (testing "multiple patches are sequentially merged into a single triple"
          (is (= [{:triple
                   [target-eid
                    info-attr-id
                    {"name" "Patchy" "occupation" "Programmer"}],
                   :md5 "aed14e1ea3b55bd8fe81df9f3d51802d",
                   :index #{:ea}}]
                 (triple-model/fetch
                  (aurora/conn-pool :read)
                  app-id
                  [[:= :attr-id info-attr-id]]))))))))

(deftest deep-merge-deep
  (with-empty-app
    (fn [{app-id :id}]
      (let [info-attr-id (UUID/randomUUID)
            info-fwd-ident (UUID/randomUUID)
            target-eid (UUID/randomUUID)]
        (tx/transact!
         (aurora/conn-pool :write)
         (attr-model/get-by-app-id app-id)
         app-id
         [[:add-attr
           {:id info-attr-id
            :forward-identity [info-fwd-ident "users" "info"]
            :value-type :blob
            :cardinality :one
            :unique? false
            :index? false}]
          [:deep-merge-triple target-eid info-attr-id {:a {:b1 {:c1 0} :b2 2}}]
          [:deep-merge-triple target-eid info-attr-id {:a {:b1 {:c2 1} :b3 3}}]])
        (testing "multiple patches are deeply merged into a single triple"
          (is (= [{:triple
                   [target-eid
                    info-attr-id
                    {"a" {"b1" {"c1" 0, "c2" 1}, "b2" 2, "b3" 3}}],
                   :md5 "84fa8808f6849fe863794bf2206f288c",
                   :index #{:ea}}]
                 (triple-model/fetch
                  (aurora/conn-pool :read)
                  app-id
                  [[:= :attr-id info-attr-id]]))))))))

(deftest deep-merge-many-with-top-level-nullification
  (with-empty-app
    (fn [{app-id :id}]
      (let [info-attr-id (UUID/randomUUID)
            info-fwd-ident (UUID/randomUUID)
            target-eid (UUID/randomUUID)]
        (tx/transact!
         (aurora/conn-pool :write)
         (attr-model/get-by-app-id app-id)
         app-id
         [[:add-attr
           {:id info-attr-id
            :forward-identity [info-fwd-ident "users" "info"]
            :value-type :blob
            :cardinality :one
            :unique? false
            :index? false}]
          [:deep-merge-triple target-eid info-attr-id {:name "Patchy"}]
          [:deep-merge-triple target-eid info-attr-id nil]
          [:deep-merge-triple target-eid info-attr-id {:occupation "Programmer"}]])
        (testing "sequential merges with top-level nullification work as expected"
          (is (= [{:triple
                   [target-eid
                    info-attr-id
                    {"occupation" "Programmer"}],
                   :md5 "2d013ac4023532c1bd0f1c1a23d246b9",
                   :index #{:ea}}]
                 (triple-model/fetch
                  (aurora/conn-pool :read)
                  app-id
                  [[:= :attr-id info-attr-id]]))))))))

(deftest deep-delete
  (with-empty-app
    (fn [{app-id :id}]
      (let [info-attr-id (UUID/randomUUID)
            info-fwd-ident (UUID/randomUUID)
            target-eid (UUID/randomUUID)]
        (tx/transact!
         (aurora/conn-pool :write)
         (attr-model/get-by-app-id app-id)
         app-id
         [[:add-attr
           {:id info-attr-id
            :forward-identity [info-fwd-ident "users" "info"]
            :value-type :blob
            :cardinality :one
            :unique? false
            :index? false}]
          [:deep-merge-triple target-eid info-attr-id {:details {:name "Patchy" :occupation "Programmer"}}]
          [:deep-merge-triple target-eid info-attr-id {:details {:name nil}}]])
        (testing "null values in deep-merge delete the corresponding keys"
          (is (= [{:triple
                   [target-eid
                    info-attr-id
                    {"details" {"occupation" "Programmer"}}],
                   :md5 "f8fa6a9a7cd0824d718876d059931ba7",
                   :index #{:ea}}]
                 (triple-model/fetch
                  (aurora/conn-pool :read)
                  app-id
                  [[:= :attr-id info-attr-id]]))))))))

(deftest deep-merge-ref
  (with-empty-app
    (fn [{app-id :id}]
      (let [info-attr-id (UUID/randomUUID)
            buds-fwd-ident (UUID/randomUUID)
            target-eid (UUID/randomUUID)]
        (testing "throws when deep-merging into ref"
          (is
           (string/includes?
            (::ex/message (test-util/instant-ex-data (tx/transact!
                                                      (aurora/conn-pool :write)
                                                      (attr-model/get-by-app-id app-id)
                                                      app-id
                                                      [[:add-attr
                                                        {:id info-attr-id
                                                         :forward-identity [buds-fwd-ident "users" "buds"]
                                                         :value-type :ref
                                                         :cardinality :one
                                                         :unique? false
                                                         :index? false}]
                                                       [:deep-merge-triple target-eid info-attr-id {:name "Patchy"}]])))

            "merge operation is not supported for links")))))))

(deftest deep-merge-top-level-with-scalar
  (with-empty-app
    (fn [{app-id :id}]
      (let [info-attr-id (UUID/randomUUID)
            info-fwd-ident (UUID/randomUUID)
            target-eid (UUID/randomUUID)]
        (tx/transact!
         (aurora/conn-pool :write)
         (attr-model/get-by-app-id app-id)
         app-id
         [[:add-attr
           {:id info-attr-id
            :forward-identity [info-fwd-ident "users" "info"]
            :value-type :blob
            :cardinality :one
            :unique? false
            :index? false}]
          [:add-triple target-eid info-attr-id {:id "1"}]
          [:deep-merge-triple target-eid info-attr-id "123"]])
        (testing "deep-merge accepts top-level scalar values"
          (is (= [{:triple
                   [target-eid
                    info-attr-id
                    "123"],
                   :md5 "757d204b68e8e1c419288694ab908f55",
                   :index #{:ea}}]
                 (triple-model/fetch
                  (aurora/conn-pool :read)
                  app-id
                  [[:= :attr-id info-attr-id]]))))))))

(deftest inferred-types []
  (testing "inferred types update on triple save"
    (are [value inferred-types]
         (with-empty-app
           (fn [{app-id :id}]
             (let [attr-id (random-uuid)
                   target-eid (random-uuid)]
               (try (tx/transact!
                     (aurora/conn-pool :write)
                     (attr-model/get-by-app-id app-id)
                     app-id
                     [[:add-attr
                       {:id attr-id
                        :forward-identity [(random-uuid) "namespace" "field"]
                        :value-type :blob
                        :cardinality :one
                        :unique? false
                        :index? false}]
                      [:add-triple target-eid attr-id value]])
                    (catch Exception e
                      (is (not e))))
               (testing (format "(%s -> %s)" value inferred-types)
                 (attr-model/evict-app-id-from-cache app-id)
                 (is (= inferred-types
                        (->> (attr-model/get-by-app-id app-id)
                             (attr-model/seek-by-id attr-id)
                             :inferred-types)))))))
      1 #{:number}
      2.0 #{:number}
      "2" #{:string}
      "s" #{:string}
      true #{:boolean}
      false #{:boolean}
      (random-uuid) #{:string}
      {:hello "world"} #{:json}
      ["array of stuff", 2] #{:json}))

  (testing "inferred types accumulate"
    (with-empty-app
      (fn [{app-id :id}]
        (let [attr-id (random-uuid)]
          (tx/transact! (aurora/conn-pool :write)
                        (attr-model/get-by-app-id app-id)
                        app-id
                        [[:add-attr
                          {:id attr-id
                           :forward-identity [(random-uuid) "namespace" "field"]
                           :value-type :blob
                           :cardinality :one
                           :unique? false
                           :index? false}]
                         [:add-triple (random-uuid) attr-id "string"]
                         [:add-triple (random-uuid) attr-id 1]])
          (is (= #{:string :number}
                 (->> (attr-model/get-by-app-id app-id)
                      (attr-model/seek-by-id attr-id)
                      :inferred-types)))
          (tx/transact! (aurora/conn-pool :write)
                        (attr-model/get-by-app-id app-id)
                        app-id
                        [[:add-triple (random-uuid) attr-id false]])
          (attr-model/evict-app-id-from-cache app-id)
          (is (= #{:string :number :boolean}
                 (->> (attr-model/get-by-app-id app-id)
                      (attr-model/seek-by-id attr-id)
                      :inferred-types)))))))

  (testing "inferred types work with deep-merge"
    (with-empty-app
      (fn [{app-id :id}]
        (let [attr-id (random-uuid)
              eid (random-uuid)]
          (tx/transact! (aurora/conn-pool :write)
                        (attr-model/get-by-app-id app-id)
                        app-id
                        [[:add-attr
                          {:id attr-id
                           :forward-identity [(random-uuid) "namespace" "field"]
                           :value-type :blob
                           :cardinality :one
                           :unique? false
                           :index? false}]
                         [:add-triple eid attr-id "string"]
                         [:deep-merge-triple eid attr-id "another-string"]])
          (is (= #{:string}
                 (->> (attr-model/get-by-app-id app-id)
                      (attr-model/seek-by-id attr-id)
                      :inferred-types)))
          (tx/transact! (aurora/conn-pool :write)
                        (attr-model/get-by-app-id app-id)
                        app-id
                        [[:deep-merge-triple eid attr-id {:patch :values}]])
          (attr-model/evict-app-id-from-cache app-id)
          (is (= #{:string :json}
                 (->> (attr-model/get-by-app-id app-id)
                      (attr-model/seek-by-id attr-id)
                      :inferred-types))))))))

(deftest rejects-users-attrs
  (with-empty-app
    (fn [{app-id :id}]
      (is
       (validation-err?
        (tx/transact! (aurora/conn-pool :write)
                      (attr-model/get-by-app-id app-id)
                      app-id
                      [[:add-attr {:id (random-uuid)
                                   :forward-identity [(random-uuid) "$users" "id"]
                                   :value-type :blob
                                   :cardinality :one
                                   :unique? false
                                   :index? false}]]))))))

(deftest restricted-files-updates
  (with-empty-app
    (fn [{app-id :id}]
      (let [conn (aurora/conn-pool :write)
            app-attrs (attr-model/get-by-app-id app-id)
            path-attr-id (attr-model/resolve-attr-id app-attrs "$files" "path")
            id-attr-id (attr-model/resolve-attr-id app-attrs "$files" "id")
            {file-id :id} (app-file-model/create! conn
                                                  {:app-id app-id
                                                   :path "test.jpg"
                                                   :location-id "loc1"
                                                   :metadata {:size 100
                                                              :content-type "image/jpeg"
                                                              :content-disposition "inline"}})]

        (testing "Updates on path are allowed"
          (let [new-path "new-path.jpg"]
            (tx/transact! conn
                          app-attrs
                          app-id
                          [[:add-triple file-id path-attr-id new-path]])
            (is (= new-path
                   (:path (app-file-model/get-by-path {:app-id app-id :path new-path}))))))

        (testing "Updates on non-existing files should fail"
          (let [new-id (random-uuid)]
            (is (validation-err?
                 (tx/transact! conn
                               app-attrs
                               app-id
                               [[:add-triple new-id id-attr-id new-id]])))))
        (testing "Updates on non-existing lookups should fail"
          (let [new-id #uuid "3edbebab-c179-4ce7-94ab-b597377c7875"]
            (is (validation-err?
                 (tx/transact! conn
                               app-attrs
                               app-id
                               [[:add-triple [id-attr-id new-id] path-attr-id "random-path.jpg"]])))))

        (testing "Updating to an existing path should fail"
          (let [existing-path "existing-path.jpg"]
            (app-file-model/create! conn
                                    {:app-id app-id
                                     :path existing-path
                                     :location-id "loc2"
                                     :metadata {:size 100
                                                :content-type "image/jpeg"
                                                :content-disposition "inline"}})
            (let [ex-data  (test-util/instant-ex-data
                            (tx/transact!
                             conn
                             app-attrs
                             app-id
                             [[:add-triple file-id path-attr-id existing-path]]))]
              (is (= ::ex/record-not-unique
                     (::ex/type ex-data)))
              (is (= "`path` is a unique attribute on `$files` and an entity already exists with `$files.path` = \"existing-path.jpg\""
                     (::ex/message ex-data))))))

        (testing "Changing id should fail"
          (is (validation-err?
               (tx/transact! conn
                             app-attrs
                             app-id
                             [[:add-triple file-id id-attr-id (random-uuid)]]))))

        (testing "Updates other attrs should fail"
          (let [loc-attr-id  (attr-model/resolve-attr-id app-attrs "$files" "location-id")]
            (is (validation-err?
                 (tx/transact! conn
                               app-attrs
                               app-id
                               [[:add-triple file-id loc-attr-id "new-location"]])))))))))

(deftest perms-rejects-writes-to-users-table
  (with-empty-app
    (fn [{app-id :id}]
      (let [r (resolvers/make-movies-resolver app-id)
            id (random-uuid)
            make-ctx (fn [] {:db {:conn-pool (aurora/conn-pool :read)}
                             :app-id app-id
                             :attrs (attr-model/get-by-app-id app-id)
                             :datalog-query-fn d/query
                             :rules (rule-model/get-by-app-id (aurora/conn-pool :read) {:app-id app-id})
                             :current-user nil})]
        (is (validation-err?
             (permissioned-tx/transact! (make-ctx)
                                        [[:add-triple id (resolvers/->uuid r :$users/id) (str id)]])))
        (is (validation-err?
             (permissioned-tx/transact! (make-ctx)
                                        [[:retract-triple id (resolvers/->uuid r :$users/id) (str id)]])))

        (is (validation-err?
             (permissioned-tx/transact! (make-ctx)
                                        [[:deep-merge-triple id (resolvers/->uuid r :$users/id) {:hello :world}]])))

        (is (validation-err?
             (permissioned-tx/transact! (make-ctx)
                                        [[:delete-entity id "$users"]])))))))

(deftest perms-accepts-writes-to-reverse-links-to-users-table
  (with-empty-app
    (fn [{app-id :id}]
      (let [book-id-attr-id (random-uuid)
            book-creator-attr-id (random-uuid)
            book-id (random-uuid)
            user-id (random-uuid)
            make-ctx (fn [] {:db {:conn-pool (aurora/conn-pool :write)}
                             :app-id app-id
                             :attrs (attr-model/get-by-app-id app-id)
                             :datalog-query-fn d/query
                             :rules (rule-model/get-by-app-id (aurora/conn-pool :read) {:app-id app-id})
                             :current-user nil})
            tx-steps [[:add-attr {:id book-id-attr-id
                                  :forward-identity [(random-uuid) "books" "id"]
                                  :value-type :blob
                                  :cardinality :one
                                  :unique? true
                                  :index? false}]
                      [:add-attr {:id book-creator-attr-id
                                  :forward-identity [(random-uuid) "books" "creator"]
                                  :reverse-identity [(random-uuid) "$users" "books"]
                                  :value-type :ref
                                  :cardinality :one
                                  :unique? true
                                  :index? false}]
                      [:add-triple book-id book-id-attr-id book-id]
                      [:add-triple book-id book-creator-attr-id user-id]]]
        (app-user-model/create! (aurora/conn-pool :write) {:app-id app-id
                                                           :id user-id
                                                           :email "test@example.com"})
        (perm-err? (permissioned-tx/transact! (make-ctx) tx-steps))
        (is (permissioned-tx/transact! (assoc (make-ctx)
                                              :current-user {:id user-id}) tx-steps))))))

(deftest perms-accepts-writes-to-reverse-links-to-users-table-with-lookups
  (with-empty-app
    (fn [{app-id :id}]
      (let [r (resolvers/make-movies-resolver app-id)
            book-id-attr-id (random-uuid)
            book-creator-attr-id (random-uuid)
            book-isbn-attr-id (random-uuid)
            book-id (random-uuid)
            user-id (random-uuid)
            make-ctx (fn [] {:db {:conn-pool (aurora/conn-pool :write)}
                             :app-id app-id
                             :attrs (attr-model/get-by-app-id app-id)
                             :datalog-query-fn d/query
                             :rules (rule-model/get-by-app-id (aurora/conn-pool :read) {:app-id app-id})
                             :current-user nil})
            _ (tx/transact!
               (aurora/conn-pool :write)
               (attr-model/get-by-app-id app-id)
               app-id
               [[:add-attr {:id book-id-attr-id
                            :forward-identity [(random-uuid) "books" "id"]
                            :value-type :blob
                            :cardinality :one
                            :unique? true
                            :index? false}]
                [:add-attr {:id book-isbn-attr-id
                            :forward-identity [(random-uuid) "books" "isbn"]
                            :value-type :blob
                            :cardinality :one
                            :unique? true
                            :index? false}]
                [:add-attr {:id book-creator-attr-id
                            :forward-identity [(random-uuid) "books" "creator"]
                            :reverse-identity [(random-uuid) "$users" "books"]
                            :value-type :ref
                            :cardinality :one
                            :unique? true
                            :index? false}]
                [:add-triple book-id book-id-attr-id book-id]
                [:add-triple book-id book-isbn-attr-id "1234"]])
            _ (app-user-model/create! (aurora/conn-pool :write) {:app-id app-id
                                                                 :id user-id
                                                                 :email "test@example.com"})
            tx-steps [[:add-triple
                       [book-isbn-attr-id "1234"]
                       book-creator-attr-id
                       [(resolvers/->uuid r :$users/email) "test@example.com"]]]]

        (perm-err? (permissioned-tx/transact! (make-ctx) tx-steps))
        (permissioned-tx/transact! (assoc (make-ctx)
                                          :current-user {:id user-id}) tx-steps)
        (is (= (test-util/pretty-perm-q
                (assoc (make-ctx) :current-user {:id user-id})
                {:books {:$ {:where {:creator (str user-id)}}
                         :creator {}}})
               {:books [{:id (str book-id)
                         :isbn "1234"
                         :creator [{:id (str user-id)
                                    :email "test@example.com"}]}]}))))))

(deftest admins-can-write-to-users-table
  (with-empty-app
    (fn [{app-id :id}]
      (let [r (resolvers/make-movies-resolver app-id)
            id (random-uuid)
            make-ctx (fn [] {:db {:conn-pool (aurora/conn-pool :write)}
                             :app-id app-id
                             :admin? true
                             :attrs (attr-model/get-by-app-id app-id)
                             :datalog-query-fn d/query
                             :rules (rule-model/get-by-app-id (aurora/conn-pool :read) {:app-id app-id})
                             :current-user nil})]

        (permissioned-tx/transact! (make-ctx)
                                   [[:add-triple id (resolvers/->uuid r :$users/id) (str id)]
                                    [:add-triple id (resolvers/->uuid r :$users/email) "test@example.com"]])

        (is (app-user-model/get-by-email {:app-id app-id
                                          :email "test@example.com"}))

        (permissioned-tx/transact! (make-ctx)
                                   [[:delete-entity id "$users"]])

        (is (empty? (app-user-model/get-by-email {:app-id app-id
                                                  :email "test@example.com"})))))))

(deftest auth-refs-requires-users
  (with-empty-app
    (fn [_app]
      (testing "auth.ref requires $users namespace"
        (is (= []
               (rule-model/validation-errors
                {"bookshelves" {"allow" {"update" "auth.ref('$user.a.b')"}}})))

        (is (= [{:message "auth.ref arg must start with `$user.`",
                 :in ["bookshelves" :allow "update"]}]
               (rule-model/validation-errors
                {"bookshelves" {"allow" {"update" "auth.ref('a.b')"}}})))))))

(deftest users-write-perms
  (with-empty-app
    (fn [{app-id :id}]
      (let [book-id-attr-id (random-uuid)
            book-creator-attr-id (random-uuid)
            book-isbn-attr-id (random-uuid)
            book-title-attr-id (random-uuid)
            book-id (random-uuid)
            user-id (random-uuid)
            make-ctx (fn [] {:db {:conn-pool (aurora/conn-pool :write)}
                             :app-id app-id
                             :attrs (attr-model/get-by-app-id app-id)
                             :datalog-query-fn d/query
                             :rules (rule-model/get-by-app-id (aurora/conn-pool :read) {:app-id app-id})
                             :current-user nil})
            user (app-user-model/create! (aurora/conn-pool :write) {:app-id app-id
                                                                    :id user-id
                                                                    :email "test@example.com"})
            _ (tx/transact!
               (aurora/conn-pool :write)
               (attr-model/get-by-app-id app-id)
               app-id
               [[:add-attr {:id book-id-attr-id
                            :forward-identity [(random-uuid) "books" "id"]
                            :value-type :blob
                            :cardinality :one
                            :unique? true
                            :index? false}]
                [:add-attr {:id book-isbn-attr-id
                            :forward-identity [(random-uuid) "books" "isbn"]
                            :value-type :blob
                            :cardinality :one
                            :unique? true
                            :index? false}]
                [:add-attr {:id book-title-attr-id
                            :forward-identity [(random-uuid) "books" "Title"]
                            :value-type :blob
                            :cardinality :one
                            :unique? true
                            :index? false}]
                [:add-attr {:id book-creator-attr-id
                            :forward-identity [(random-uuid) "books" "creator"]
                            :reverse-identity [(random-uuid) "$users" "books"]
                            :value-type :ref
                            :cardinality :one
                            :unique? true
                            :index? false}]
                [:add-triple book-id book-id-attr-id book-id]
                [:add-triple book-id book-isbn-attr-id "1234"]
                [:add-triple book-id book-creator-attr-id user-id]])]
        (rule-model/put! (aurora/conn-pool :write)
                         {:app-id app-id
                          :code {:books {:allow {:update "'1234' in auth.ref('$user.books.isbn')"}}}})

        (let [tx-steps [[:add-triple book-id book-title-attr-id "Free Land"]]]
          (perm-err?
           (permissioned-tx/transact! (make-ctx)
                                      tx-steps))
          (perm-err?
           (permissioned-tx/transact! (assoc (make-ctx) :current-user {:id (random-uuid)})
                                      tx-steps))
          (permissioned-tx/transact! (assoc (make-ctx) :current-user user)
                                     tx-steps)

          (is (= [{:triple
                   [book-id
                    book-title-attr-id
                    "Free Land"],
                   :md5 "a17f4110df08cd978152ff459b1aefde",
                   :index #{:ea :av}}]
                 (triple-model/fetch
                  (aurora/conn-pool :read)
                  app-id
                  [[:= :entity-id book-id]
                   [:= :attr-id book-title-attr-id]]))))))))

(deftest on-delete-cascade
  (with-empty-app
    (fn [{app-id :id}]
      ;;; user <- book
      (let [attr->id   (test-util/make-attrs
                        app-id
                        [[:user/name :unique? :index?]
                         [:book/title :unique? :index?]
                         [[:book/author :user/books] :on-delete]])
            ids        #{(suid "a") (suid "b1") (suid "b2") (suid "b3")}
            attr-model (attr-model/get-by-app-id app-id)]

        (test-util/insert-entities
         app-id attr->id
         [{:db/id (suid "a")  :user/name "Leo Tolstoy"}
          {:db/id (suid "b1") :book/title "War and Peace" :book/author (suid "a")}
          {:db/id (suid "b2") :book/title "Anna Karenina" :book/author (suid "a")}
          {:db/id (suid "b3") :book/title "Death of Ivan Ilyich" :book/author (suid "a")}])
        (is (= #{(suid "a") (suid "b1") (suid "b2") (suid "b3")}
               (test-util/find-entids-by-ids app-id attr->id ids)))

        (testing "deleting book doesn’t delete user"
          (tx/transact! (aurora/conn-pool :write) attr-model app-id [[:delete-entity (suid "b1") "book"]])
          (is (= #{(suid "a") (suid "b2") (suid "b3")}
                 (test-util/find-entids-by-ids app-id attr->id ids))))

        (testing "deleting user deletes its books"
          (tx/transact! (aurora/conn-pool :write) attr-model app-id [[:delete-entity (suid "a") "user"]])
          (is (= #{}
                 (test-util/find-entids-by-ids app-id attr->id ids))))))))

(deftest on-delete-cascade-reverse
  (with-empty-app
    (fn [{app-id :id}]
      ;;; user -> book
      (let [attr->id   (test-util/make-attrs
                        app-id
                        [[:user/name :unique? :index?]
                         [:book/title :unique? :index?]
                         [[:user/books :book/author] :many :unique? :on-delete-reverse]])
            ids        #{(suid "a") (suid "b1") (suid "b2") (suid "b3")}
            attr-model (attr-model/get-by-app-id app-id)]

        (test-util/insert-entities
         app-id attr->id
         [{:db/id (suid "a")  :user/name "Leo Tolstoy" :user/books [(suid "b1") (suid "b2") (suid "b3")]}
          {:db/id (suid "b1") :book/title "War and Peace"}
          {:db/id (suid "b2") :book/title "Anna Karenina"}
          {:db/id (suid "b3") :book/title "Death of Ivan Ilyich"}])
        (is (= #{(suid "a") (suid "b1") (suid "b2") (suid "b3")}
               (test-util/find-entids-by-ids app-id attr->id ids)))

        (testing "deleting book doesn’t delete user"
          (tx/transact! (aurora/conn-pool :write) attr-model app-id [[:delete-entity (suid "b1") "book"]])
          (is (= #{(suid "a") (suid "b2") (suid "b3")}
                 (test-util/find-entids-by-ids app-id attr->id ids))))

        (testing "deleting user does delete book"
          (tx/transact! (aurora/conn-pool :write) attr-model app-id [[:delete-entity (suid "a") "user"]])
          (is (= #{}
                 (test-util/find-entids-by-ids app-id attr->id ids))))))))

(deftest on-delete-cascade-mixed
  (with-empty-app
    (fn [{app-id :id}]
      ;;; A <- B -> C <- D -> E <- F
      (let [attr->id (test-util/make-attrs
                      app-id
                      [[:A/id :unique? :index?]
                       [:B/id :unique? :index?]
                       [[:B/a :A/bs] :on-delete]
                       [[:B/c :C/bs] :many :unique? :on-delete-reverse]
                       [:C/id :unique? :index?]
                       [:D/id :unique? :index?]
                       [[:D/c :C/ds] :on-delete]
                       [[:D/e :E/ds] :many :unique? :on-delete-reverse]
                       [:E/id :unique? :index?]
                       [:F/id :unique? :index?]
                       [[:F/e :E/fs] :on-delete]])
            ids #{(suid "a") (suid "b") (suid "c") (suid "d") (suid "e") (suid "f")}
            attr-model (attr-model/get-by-app-id app-id)]

        (test-util/insert-entities
         app-id attr->id
         [{:db/id (suid "a") :A/id (suid "a")}
          {:db/id (suid "b") :B/id (suid "b") :B/a (suid "a") :B/c (suid "c")}
          {:db/id (suid "c") :C/id (suid "c")}
          {:db/id (suid "d") :D/id (suid "d") :D/c (suid "c") :D/e (suid "e")}
          {:db/id (suid "e") :E/id (suid "e")}
          {:db/id (suid "f") :F/id (suid "f") :F/e (suid "e")}])
        (is (= ids (test-util/find-entids-by-ids app-id attr->id ids)))

        (tx/transact! (aurora/conn-pool :write) attr-model app-id [[:delete-entity (suid "a") "A"]])
        (is (= #{} (test-util/find-entids-by-ids app-id attr->id ids)))))))

(deftest on-delete-cascade-cycle
  (with-empty-app
    (fn [{app-id :id}]
      (let [attr->id   (test-util/make-attrs
                        app-id
                        [[:users/name :unique? :index?]
                         [[:users/friend :users/friend-of] :unique? :on-delete]])
            ids        #{(suid "a") (suid "b")}
            attr-model (attr-model/get-by-app-id app-id)]

        (test-util/insert-entities
         app-id attr->id
         [{:db/id (suid "a") :users/name "Ivan" :users/friend (suid "b")}
          {:db/id (suid "b") :users/name "Oleg" :users/friend (suid "a")}])
        (is (= #{(suid "a") (suid "b")}
               (test-util/find-entids-by-ids app-id attr->id ids)))

        (tx/transact! (aurora/conn-pool :write) attr-model app-id [[:delete-entity (suid "a") "users"]])
        (is (= #{}
               (test-util/find-entids-by-ids app-id attr->id ids)))))))

(deftest on-delete-cascade-etypes
  (with-empty-app
    (fn [{app-id :id}]
      (let [attr->id   (test-util/make-attrs
                        app-id
                        [[:users/name :unique? :index?]
                         [[:users/comments :comments/author] :many :on-delete-reverse]
                         [:posts/id :unique? :index?]
                         [[:posts/author :users/posts] :unique? :on-delete]
                         [:comments/id :unique? :index?]
                         [:person/height]
                         [:car/model]
                         [:train/weight]])
            entities   [{:db/id          (suid "a")
                         :users/name     "Ivan"
                         :users/comments (suid "c")
                         :person/height  170}

                        {:db/id          (suid "b")
                         :posts/id       123
                         :posts/author   (suid "a")
                         :car/model      "BMW"}

                        {:db/id          (suid "c")
                         :comments/id    456
                         :train/weight   1000}]
            ids        (into #{} (map :db/id) entities)
            attr-model (attr-model/get-by-app-id app-id)]

        (test-util/insert-entities app-id attr->id entities)
        (is (= (set entities)
               (test-util/find-entities-by-ids app-id attr->id ids)))

        (tx/transact! (aurora/conn-pool :write) attr-model app-id [[:delete-entity (suid "a") "users"]])
        (is (= #{{:db/id          (suid "a")
                  :person/height  170}

                 {:db/id          (suid "b")
                  :car/model      "BMW"}

                 {:db/id          (suid "c")
                  :train/weight   1000}}
               (test-util/find-entities-by-ids app-id attr->id ids)))))))

(deftest on-delete-cascade-refs
  (with-empty-app
    (fn [{app-id :id}]
      (let [attr->id   (test-util/make-attrs
                        app-id
                        [[:users/email :unique? :index?]
                         [[:users/friend :users/friend-of] :unique? :on-delete]])
            ids        #{(suid "1") (suid "2")}
            ctx        (test-util/make-ctx app-id {:rw :write})]

        (test-util/insert-entities
         app-id attr->id
         [{:db/id (suid "1") :users/email "user1@example.com" :users/friend (suid "2")}
          {:db/id (suid "2") :users/email "user2@example.com" :users/friend (suid "1")}])
        (is (= #{(suid "1") (suid "2")}
               (test-util/find-entids-by-ids app-id attr->id ids)))

        (testing "you can try to delete a user that doesn't exist with a lookup ref"
          (let [res (permissioned-tx/transact! ctx [[:delete-entity [(attr->id :users/email) "user3@example.com"] "users"]])]
            (is (= 0 (count (:delete-entity (:results res)))))))))))

(deftest on-delete-cascade-perf
  (with-empty-app
    (fn [{app-id :id}]
      (let [user-id-attr-id     (random-uuid)
            user-parent-attr-id (random-uuid)
            _ (attr-model/insert-multi!
               (aurora/conn-pool :write)
               app-id
               [{:id user-id-attr-id
                 :forward-identity [(random-uuid) "users" "id"]
                 :value-type :blob
                 :cardinality :one
                 :unique? true
                 :index? true}
                {:id user-parent-attr-id
                 :forward-identity [(random-uuid) "users" "parent"]
                 :reverse-identity [(random-uuid) "users" "children"]
                 :value-type :ref
                 :cardinality :one
                 :unique? false
                 :index? false
                 :on-delete :cascade}]
               {})
            root-user-id (random-uuid)
            children     (atom 0)]

        ;; insert root user
        (tx/transact!
         (aurora/conn-pool :write)
         (attr-model/get-by-app-id app-id)
         app-id
         [[:add-triple root-user-id user-id-attr-id root-user-id]])

        ;; insert tree of children
        (loop [i 0
               q [root-user-id]]
          (when (< i 5)
            (let [tx (for [parent-id q
                           _         (range 4)
                           :let [id (random-uuid)]
                           op   [[:add-triple id user-id-attr-id id]
                                 [:add-triple id user-parent-attr-id parent-id]]]
                       op)]
              (tx/transact! (aurora/conn-pool :write) (attr-model/get-by-app-id app-id) app-id tx)
              (swap! children + (/ (count tx) 2))
              (recur (inc i) (into #{} (map second tx))))))

        (let [ctx      {:db               {:conn-pool (aurora/conn-pool :write)}
                        :app-id           app-id
                        :attrs            (attr-model/get-by-app-id app-id)
                        :datalog-query-fn d/query
                        :rules            (rule-model/get-by-app-id (aurora/conn-pool :read) {:app-id app-id})
                        :current-user     nil}
              tx-steps [[:delete-entity root-user-id "users"]]
              res      (permissioned-tx/transact! ctx tx-steps)
              deleted-triples (count (:delete-entity (:results res)))]
          (is (= (-> @children (* 2) (+ 1)) deleted-triples)))))))

(deftest too-many-params
  (with-zeneca-app
    (fn [app r]
      (let [txes (for [_i (range 100000)
                       :let [id (random-uuid)]]
                   [:add-triple id (resolvers/->uuid r :users/id) (str id)])

            instant-ex-data (test-util/instant-ex-data
                              (tx/transact!
                               (aurora/conn-pool :write)
                               (attr-model/get-by-app-id (:id app))
                               (:id app)
                               txes))]
        (is (= ::ex/parameter-limit-exceeded
               (::ex/type instant-ex-data)))))))

(comment
  (test/run-tests *ns*))
