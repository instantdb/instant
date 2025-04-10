(ns instant.admin.routes-test
  (:require [clojure.test :as test :refer [deftest is testing]]
            [instant.fixtures :refer [with-empty-app with-zeneca-app with-movies-app]]
            [instant.data.constants :as constants]
            [instant.data.resolvers :as resolvers]
            [instant.admin.routes :as admin-routes]
            [instant.model.app :as app-model]
            [instant.db.model.attr :as attr-model]
            [instant.jdbc.aurora :as aurora]
            [instant.util.exception :as ex]
            [instant.admin.model :as admin-model]
            [instant.util.http :as http-util]
            [instant.model.app-user-refresh-token :as app-user-refresh-token-model]
            [instant.model.app-user :as app-user-model]
            [instant.reactive.ephemeral :as eph])
  (:import [java.util UUID]))

(defn query-post [& args]
  (apply (http-util/wrap-errors admin-routes/query-post) args))

(defn transact-post [& args]
  (apply (http-util/wrap-errors admin-routes/transact-post) args))

(defn refresh-tokens-post [& args]
  (apply (http-util/wrap-errors admin-routes/refresh-tokens-post) args))

(defn app-users-get [& args]
  (apply (http-util/wrap-errors admin-routes/app-users-get) args))

(defn app-users-delete [& args]
  (apply (http-util/wrap-errors admin-routes/app-users-delete) args))

(defn sign-out-post [& args]
  (apply (http-util/wrap-errors admin-routes/sign-out-post) args))

(defn transact-ok? [transact-res]
  (= 200 (:status transact-res)))

(defn presence-get [& args]
  (apply (http-util/wrap-errors admin-routes/presence-get) args))

(deftest query-test
  (with-movies-app
    (fn [{movies-app-id :id} _r]
      (with-zeneca-app
        (fn [{app-id :id admin-token :admin-token :as _app} r]
          (testing "no app-id fails"
            (let [ret (query-post
                       {:body {:query {:users {}}}
                        :headers {"app-id" nil
                                  "authorization" (str "Bearer " admin-token)}})]
              (is (= 400 (:status ret)))
              (is (= :param-missing (-> ret :body :type)))))
          (testing "no token fails"
            (let [ret (query-post
                       {:body {:query {:users {}}}
                        :headers {"app-id" (str app-id)
                                  "authorization" nil}})]
              (is (= 400 (:status ret)))
              (is (= :param-missing (-> ret :body :type)))))
          (testing "wrong combo fails"
            (let [ret (query-post
                       {:body {:query {:users {}}}
                        :headers {"app-id" (str movies-app-id)
                                  "authorization" (str "Bearer " admin-token)}})]
              (is (= 400 (:status ret)))
              (is (= :record-not-found (-> ret :body :type)))))
          (testing "correct combo succeeds"
            (let [ret (query-post
                       {:body {:query {:users {}}}
                        :headers {"app-id" (str app-id)
                                  "authorization" (str "Bearer " admin-token)}})]
              (is (= 200 (:status ret)))
              (is
               #{"alex" "stopa" "joe" "nicolegf"}
               (set (map #(get % "handle")
                         (-> ret
                             :body
                             (get "users")))))))
          (testing "a tree is returned"
            (let [ret (query-post
                       {:body {:query {:users {:bookshelves {}}}}
                        :headers {"app-id" (str app-id)
                                  "authorization" (str "Bearer " admin-token)}})]
              (is (= 200 (:status ret)))
              (is (->> (-> ret
                           :body
                           (get "users"))
                       (map #(get % "bookshelves"))
                       (every? seq)))))
          (testing "invalid queries return an error"
            (let [ret (query-post
                       {:body {:query {:users {:bookshelves []}}}
                        :headers {"app-id" (str app-id)
                                  "authorization" (str "Bearer " admin-token)}})]
              (is (= 400 (:status ret)))
              (is (= :validation-failed (-> ret :body :type)))))
          (testing "fields"
            (let [ret (query-post
                       {:body {:query {:users {:$ {:fields ["handle"]}}}}
                        :headers {"app-id" (str app-id)
                                  "authorization" (str "Bearer " admin-token)}})]
              (is (= 200 (:status ret)))
              (is (= {"users" [{"id" (str (resolvers/->uuid r "eid-stepan-parunashvili"))
                                "handle" "stopa"}
                               {"id" (str (resolvers/->uuid r "eid-joe-averbukh"))
                                "handle" "joe"}
                               {"id" (str (resolvers/->uuid r "eid-alex"))
                                "handle" "alex"}
                               {"id" (str (resolvers/->uuid r "eid-nicole"))
                                "handle" "nicolegf"}]}
                     (:body ret))))))))))

(comment
  (def app-id #uuid "2f23dfa2-c921-4988-9243-adf602339bab")
  (def admin-token #uuid "af5c8213-a2c4-46fb-a092-f7adae37799a")
  (def app
    (app-model/create! {:title "test app"
                        :creator-id constants/test-user-id
                        :id app-id
                        :admin-token admin-token}))
  (app-model/delete-immediately-by-id! {:id app-id}))

(deftest transact-test
  (with-movies-app
    (fn [{movies-app-id :id} _r]
      (with-empty-app
        (fn [{app-id :id admin-token :admin-token :as _app}]
          (let [steps [["update" "goals"
                        "8aa64e4c-64f9-472e-8a61-3fa28870e6cb"
                        {"title" "moop"}]]]
            (testing "no app-id fails"
              (let [ret (transact-post
                         {:body {:steps steps}
                          :headers {"app-id" nil
                                    "authorization" (str "Bearer " admin-token)}})]
                (is (= 400 (:status ret)))
                (is (= :param-missing (-> ret :body :type)))))
            (testing "no token fails"
              (let [ret (transact-post
                         {:body {:steps steps}
                          :headers {"app-id" (str app-id)
                                    "authorization" nil}})]
                (is (= 400 (:status ret)))
                (is (= :param-missing (-> ret :body :type)))))
            (testing "wrong combo fails"
              (let [ret (transact-post
                         {:body {:steps steps}
                          :headers {"app-id" (str movies-app-id)
                                    "authorization" (str "Bearer " app-id)}})]
                (is (= 400 (:status ret)))
                (is (= :record-not-found (-> ret :body :type)))))
            (testing "correct combo succeeds"
              (let [ret (transact-post
                         {:body {:steps steps}
                          :headers {"app-id" (str app-id)
                                    "authorization" (str "Bearer " admin-token)}})]
                (is (= 200 (:status ret)))
                (is (number? (-> ret :body :tx-id)))))
            (with-zeneca-app
              (fn [{app-id :id admin-token :admin-token} _r]
                (testing "invalid transaction return an error"
                  (let [ret (transact-post
                             {:body {:steps (-> steps
                                                (assoc-in [0 0] "updatez"))}
                              :headers {"app-id" (str app-id)
                                        "authorization" (str "Bearer " admin-token)}})]
                    (is (= 400 (:status ret)))
                    (is (= :validation-failed (-> ret :body :type)))))))
            (testing "add-attr works"
              (let [ret (transact-post
                         {:body {:steps [["add-attr"
                                          {:id (UUID/randomUUID)
                                           :forward-identity [(UUID/randomUUID) "floopy" "flip"]
                                           :value-type "blob"
                                           :cardinality "one"
                                           :unique? false
                                           :index? false}]]}
                          :headers {"app-id" (str app-id)
                                    "authorization" (str "Bearer " admin-token)}})]
                (is (= 200 (:status ret)))
                (is (number? (-> ret :body :tx-id)))
                (is (seq (attr-model/seek-by-fwd-ident-name ["floopy" "flip"]
                                                            (attr-model/get-by-app-id
                                                             app-id))))))
            (testing "delete-attr works"
              (let [eid (UUID/randomUUID)
                    ret (transact-post
                         {:body {:steps [["add-attr"
                                          {:id eid
                                           :forward-identity [(UUID/randomUUID) "floopy" "flop"]
                                           :value-type "blob"
                                           :cardinality "one"
                                           :unique? false
                                           :index? false}]
                                         ["delete-attr" eid]]}
                          :headers {"app-id" (str app-id)
                                    "authorization" (str "Bearer " admin-token)}})]
                (is (= 200 (:status ret)))
                (is (number? (-> ret :body :tx-id)))
                (is (nil? (attr-model/seek-by-fwd-ident-name ["floopy" "flop"]
                                                             (attr-model/get-by-app-id
                                                              app-id))))))))))))

(deftest strong-init-and-inference
  (with-empty-app
    (fn [{app-id :id admin-token :admin-token :as _app}]
      (let [goal-id (str (UUID/randomUUID))
            user-id (str (UUID/randomUUID))
            goal-owner-attr-id (str (UUID/randomUUID))

            add-links [["add-attr"
                        {:id goal-owner-attr-id
                         :forward-identity [(UUID/randomUUID) "goals" "owner"]
                         :reverse-identity [(UUID/randomUUID) "users" "ownedGoals"]
                         :value-type "ref"
                         :cardinality "one"
                         :unique? false
                         :index? false}]]
            add-objects [["update" "goals"
                          goal-id
                          {"title" "get fit"}]
                         ["update" "users"
                          user-id
                          {"name" "stopa"}]
                         ["link" "goals"
                          goal-id
                          {"owner" user-id}]]
            _add-links-ret (transact-post
                            {:body {:steps add-links}
                             :headers {"app-id" (str app-id)
                                       "authorization" (str "Bearer " admin-token)}})
            _add-objects-ret (transact-post
                              {:body {:steps add-objects}
                               :headers {"app-id" (str app-id)
                                         "authorization" (str "Bearer " admin-token)}})]
        (let [q (query-post
                 {:body {:query {:goals {:owner {}}}}
                  :headers {"app-id" (str app-id)
                            "authorization" (str "Bearer " admin-token)}})
              goal (-> q :body (get "goals") first)
              owner-part (get goal "owner")]

          (is (= "get fit" (get goal "title")))
          (is (= 1 (count owner-part)))
          (is (= "stopa" (get (first owner-part) "name"))))

        (testing "cardinality inference works"
          (let [q (query-post
                   {:body {:query {:goals {:owner {}}}
                           :inference? true}
                    :headers {"app-id" (str app-id)
                              "authorization" (str "Bearer " admin-token)}})
                goal (-> q :body (get "goals") first)
                owner (get goal "owner")]
            (is (= "get fit" (get goal "title")))
            (is (= "stopa" (get owner "name")))))

        (testing "throw-missing-attrs works"
          (let [{:keys [status body]} (transact-post
                                       {:body {:steps [["update" "goals"
                                                        goal-id
                                                        {"myFavoriteColor" "purple"}]]
                                               :throw-on-missing-attrs? true}
                                        :headers {"app-id" (str app-id)
                                                  "authorization" (str "Bearer " admin-token)}})]

            (is (= 400 status))
            (is (= #{"goals.myFavoriteColor"}
                   (-> body
                       :hint
                       :errors
                       first
                       :hint
                       :attributes
                       set)))))))))

(deftest refresh-tokens-test
  (with-empty-app
    (let [email "stopa@instantdb.com"]
      (fn [{app-id :id admin-token :admin-token :as _app}]
        (testing "can create refresh token"
          (let [ret (refresh-tokens-post
                     {:body {:email email}
                      :headers {"app-id" app-id
                                "authorization" (str "Bearer " admin-token)}})]

            (is (= 200 (:status ret)))
            (is (= email (-> ret :body :user :email)))
            (is (some? (-> ret :body :user :refresh_token)))))))))

(deftest sign-out-test
  (with-empty-app
    (fn [{app-id :id admin-token :admin-token :as _app}]
      (let [user-id (random-uuid)
            email "stopa@instantdb.com"
            _ (app-user-model/create! {:id user-id
                                       :app-id app-id
                                       :email email})

            make-token #(-> (refresh-tokens-post
                             {:body {:email email}
                              :headers {"app-id" app-id
                                        "authorization" (str "Bearer " admin-token)}})
                            :body
                            :user
                            :refresh_token)

            get-token #(app-user-refresh-token-model/get-by-id {:id %
                                                                :app-id app-id})
            sign-out #(sign-out-post
                       {:body %
                        :headers {"app-id" app-id
                                  "authorization" (str "Bearer " admin-token)}})]
        (testing "sign out by email deletes all tokens"
          (let [tok1 (make-token)
                tok2 (make-token)
                _ (is (get-token tok1))
                _ (is (get-token tok2))
                ret (sign-out {:email email})]
            (is (= 200 (:status ret)))
            (is (nil? (get-token tok1)))
            (is (nil? (get-token tok2)))))
        (testing "sign out by user-id deletes all tokens"
          (let [tok1 (make-token)
                tok2 (make-token)
                _ (is (get-token tok1))
                _ (is (get-token tok2))
                ret (sign-out {:id user-id})]
            (is (= 200 (:status ret)))
            (is (nil? (get-token tok1)))
            (is (nil? (get-token tok2)))))
        (testing "sign out by refresh-tokens deletes one token"
          (let [tok1 (make-token)
                tok2 (make-token)
                _ (is (get-token tok1))
                _ (is (get-token tok2))
                ret (sign-out {:refresh_token tok2})]
            (def ret ret)
            (is (= 200 (:status ret)))
            (is (get-token tok1))
            (is (nil? (get-token tok2)))))))))

(deftest app-users-get-test
  (with-empty-app
    (let [email "stopa@instantdb.com"]
      (fn [{app-id :id admin-token :admin-token :as _app}]
        (testing "responds with nil if no user exists"
          (let [get-user-ret (app-users-get
                              {:params {:email email}
                               :headers {"app-id" app-id
                                         "authorization" (str "Bearer " admin-token)}})]

            ;; user is nil
            (is (= 200 (:status get-user-ret)))
            (is (nil? (-> get-user-ret :body :user)))))

        (testing "user can be retrieved by email"
          (let [refresh-ret (refresh-tokens-post
                             {:body {:email email}
                              :headers {"app-id" app-id
                                        "authorization" (str "Bearer " admin-token)}})
                user (-> refresh-ret :body :user)]

            ;; user is created
            (is (= 200 (:status refresh-ret)))
            (is (some? user))
            (is (= email (:email user)))

            ;; retrieve user by email
            (let [get-user-ret (app-users-get
                                {:params {:email email}
                                 :headers {"app-id" app-id
                                           "authorization" (str "Bearer " admin-token)}})]

              ;; user is found
              (is (= 200 (:status get-user-ret)))
              (is (= email (-> get-user-ret :body :user :email))))))

        (testing "user can be retrieved by id"
          (let [refresh-ret (refresh-tokens-post
                             {:body {:email email}
                              :headers {"app-id" app-id
                                        "authorization" (str "Bearer " admin-token)}})
                user (-> refresh-ret :body :user)
                user-id (:id user)]

            ;; user is created
            (is (= 200 (:status refresh-ret)))
            (is (some? user))
            (is (= email (:email user)))

            ;; retrieve user by id
            (let [get-user-ret (app-users-get
                                {:params {:id user-id}
                                 :headers {"app-id" app-id
                                           "authorization" (str "Bearer " admin-token)}})]

              ;; user is found
              (is (= 200 (:status get-user-ret)))
              (is (= user-id (-> get-user-ret :body :user :id))))))

        (testing "user can be retrieved by refresh token"
          (let [refresh-ret (refresh-tokens-post
                             {:body {:email email}
                              :headers {"app-id" app-id
                                        "authorization" (str "Bearer " admin-token)}})
                token (-> refresh-ret :body :user :refresh_token)]

            ;; user is created
            (is (= 200 (:status refresh-ret)))
            (is (some? token))

            ;; retrieve user by refresh token
            (let [get-user-ret (app-users-get
                                {:params {:refresh_token token}
                                 :headers {"app-id" app-id
                                           "authorization" (str "Bearer " admin-token)}})]

              ;; user is found
              (is (= 200 (:status get-user-ret)))
              (is (= email (-> get-user-ret :body :user :email))))))))))

(deftest app-users-delete-test
  (with-empty-app
    (let [email "stopa@instantdb.com"]
      (fn [{app-id :id admin-token :admin-token :as _app}]
        (testing "responds with nil if no user exists"
          (let [delete-user-ret (app-users-delete
                                 {:params {:email email}
                                  :headers {"app-id" app-id
                                            "authorization" (str "Bearer " admin-token)}})]

            ;; user is nil
            (is (= 200 (:status delete-user-ret)))
            (is (nil? (-> delete-user-ret :body :deleted)))))

        (testing "user can be deleted by email"
          (let [refresh-ret (refresh-tokens-post
                             {:body {:email email}
                              :headers {"app-id" app-id
                                        "authorization" (str "Bearer " admin-token)}})
                user (-> refresh-ret :body :user)]

            ;; user is created
            (is (= 200 (:status refresh-ret)))
            (is (some? user))
            (is (= email (:email user)))

            ;; delete user by email
            (let [delete-user-ret (app-users-delete
                                   {:params {:email email}
                                    :headers {"app-id" app-id
                                              "authorization" (str "Bearer " admin-token)}})]

              ;; user is deleted
              (is (= 200 (:status delete-user-ret)))
              (is (= email (-> delete-user-ret :body :deleted :email))))))

        (testing "user can be deleted by id"
          (let [refresh-ret (refresh-tokens-post
                             {:body {:email email}
                              :headers {"app-id" app-id
                                        "authorization" (str "Bearer " admin-token)}})
                user (-> refresh-ret :body :user)
                user-id (:id user)]

            ;; user is created
            (is (= 200 (:status refresh-ret)))
            (is (some? user))
            (is (= email (:email user)))

            ;; delete user by id
            (let [delete-user-ret (app-users-delete
                                   {:params {:id user-id}
                                    :headers {"app-id" app-id
                                              "authorization" (str "Bearer " admin-token)}})]

              ;; user is deleted
              (is (= 200 (:status delete-user-ret)))
              (is (= user-id (-> delete-user-ret :body :deleted :id))))))

        (testing "user can be deleted by refresh token"
          (let [refresh-ret (refresh-tokens-post
                             {:body {:email email}
                              :headers {"app-id" app-id
                                        "authorization" (str "Bearer " admin-token)}})
                token (-> refresh-ret :body :user :refresh_token)]

            ;; user is created
            (is (= 200 (:status refresh-ret)))
            (is (some? token))

;; delete user by refresh token
            (let [delete-user-ret (app-users-delete
                                   {:params {:refresh_token token}
                                    :headers {"app-id" app-id
                                              "authorization" (str "Bearer " admin-token)}})]

              ;; user is deleted
              (is (= 200 (:status delete-user-ret)))
              (is (= email (-> delete-user-ret :body :deleted :email))))))))))

(deftest ignore-id-in-transaction
  (with-empty-app
    (fn [{app-id :id admin-token :admin-token :as _app}]
      (let [expected-id (UUID/randomUUID)
            id-to-ignore (UUID/randomUUID)
            update-step ["update" "items" expected-id {"id" id-to-ignore "name" "book"}]
            update-tx (transact-post
                       {:body {:steps [update-step]}
                        :headers {"app-id" (str app-id)
                                  "authorization" (str "Bearer " admin-token)}})

            _ (is (= 200 (:status update-tx)))

            items-query (query-post
                         {:body {:query {:items {}}}
                          :headers {"app-id" (str app-id)
                                    "authorization" (str "Bearer " admin-token)}})
            actual-items (-> (items-query :body) (get "items"))]
        (is (= 1 (count actual-items)))
        (is (= expected-id (-> (first actual-items) (get "id") UUID/fromString)))))))

(deftest link-unlink-multi
  (with-empty-app
    (fn [{app-id :id admin-token :admin-token :as _app}]
      (let [bookshelf-id-1 (UUID/randomUUID)
            bookshelf-id-2 (UUID/randomUUID)
            user-id (UUID/randomUUID)
            bookshelf-id-3 (UUID/randomUUID)

            ;; create bobby + my books 1 and 2
            user-update-step ["update" "users" user-id {"handle" "bobby"}]
            link-step ["link" "users" user-id {"bookshelves" [bookshelf-id-1 bookshelf-id-2]}]
            bookshelf1-update-step ["update" "bookshelves" bookshelf-id-1 {"name" "my books 1"}]
            bookshelf2-update-step ["update" "bookshelves" bookshelf-id-2 {"name" "my books 2"}]
            first-tx (transact-post
                      {:body {:steps [user-update-step
                                      link-step
                                      bookshelf1-update-step
                                      bookshelf2-update-step]}
                       :headers {"app-id" (str app-id)
                                 "authorization" (str "Bearer " admin-token)}})

            _ (is (= 200 (:status first-tx)))

            ;; get bookshelves 
            first-query (query-post
                         {:body {:query {:users {:bookshelves {}}}}
                          :headers {"app-id" (str app-id)
                                    "authorization" (str "Bearer " admin-token)}})
            actual-bookshelves (->>  (-> first-query
                                         :body
                                         (get "users"))
                                     (mapcat #(get % "bookshelves"))
                                     (map #(get % "name"))
                                     set)
            _ (is (= #{"my books 1" "my books 2"} actual-bookshelves))

            ;; update bobby's bookshelves to my books 3
            bookshelf3-update-step ["update" "bookshelves" bookshelf-id-3 {"name" "my books 3"}]
            unlink-step ["unlink" "users" user-id {"bookshelves" [bookshelf-id-1 bookshelf-id-2]}]
            link-step-2 ["link" "users" user-id {"bookshelves" [bookshelf-id-3]}]
            second-tx (transact-post
                       {:body {:steps [bookshelf3-update-step
                                       unlink-step
                                       link-step-2]}
                        :headers {"app-id" (str app-id)
                                  "authorization" (str "Bearer " admin-token)}})

            _ (is (= 200 (:status second-tx)))
            ;; get bookshelves 
            second-query (query-post
                          {:body {:query {:users {:bookshelves {}}}}
                           :headers {"app-id" (str app-id)
                                     "authorization" (str "Bearer " admin-token)}})
            actual-bookshelves (->>  (-> second-query
                                         :body
                                         (get "users"))
                                     (mapcat #(get % "bookshelves"))
                                     (map #(get % "name"))
                                     set)
            _ (is (= #{"my books 3"} actual-bookshelves))]))))

(deftest lookups
  (with-zeneca-app
    (fn [{app-id :id admin-token :admin-token} _r]
      (testing "update"
        (transact-post
         {:body {:steps [["update" "users" ["handle" "stopa"] {"handle" "stopa2"}]]}
          :headers {"app-id" (str app-id)
                    "authorization" (str "Bearer " admin-token)}})
        (is (= "stopa2"
               (-> (query-post
                    {:body {:query {:users {:$ {:where {:handle "stopa2"}}}}}
                     :headers {"app-id" (str app-id)
                               "authorization" (str "Bearer " admin-token)}})
                   :body
                   (get "users")
                   first
                   (get "handle")))))
      (testing "delete"
        (is (= "joe"
               (-> (query-post
                    {:body {:query {:users {:$ {:where {:handle "joe"}}}}}
                     :headers {"app-id" (str app-id)
                               "authorization" (str "Bearer " admin-token)}})
                   :body
                   (get "users")
                   first
                   (get "handle"))))
        (transact-post
         {:body {:steps [["delete" "users" ["handle" "joe"]]]}
          :headers {"app-id" (str app-id)
                    "authorization" (str "Bearer " admin-token)}})
        (is (= nil
               (-> (query-post
                    {:body {:query {:users {:$ {:where {:handle "joe"}}}}}
                     :headers {"app-id" (str app-id)
                               "authorization" (str "Bearer " admin-token)}})
                   :body
                   (get "users")
                   first))))

      (testing "linking"
        (let [bookshelves-before (-> (query-post
                                      {:body {:query {:users {:$ {:where {:handle "alex"}}
                                                              :bookshelves {}}}}
                                       :headers {"app-id" (str app-id)
                                                 "authorization" (str "Bearer " admin-token)}})
                                     :body
                                     (get "users")
                                     first
                                     (get "bookshelves"))
              _unlink-transact (transact-post
                                {:body {:steps [["unlink"
                                                 "users"
                                                 ["handle" "alex"]
                                                 {"bookshelves" (-> bookshelves-before
                                                                    first
                                                                    (get "id"))}]]}
                                 :headers {"app-id" (str app-id)
                                           "authorization" (str "Bearer " admin-token)}})
              bookshelves-after (-> (query-post
                                     {:body {:query {:users {:$ {:where {:handle "alex"}}
                                                             :bookshelves {}}}}
                                      :headers {"app-id" (str app-id)
                                                "authorization" (str "Bearer " admin-token)}})
                                    :body
                                    (get "users")
                                    first
                                    (get "bookshelves"))

              _relink-transact (transact-post
                                {:body {:steps [["link"
                                                 "users"
                                                 ["handle" "alex"]
                                                 {"bookshelves" (-> bookshelves-before
                                                                    first
                                                                    (get "id"))}]]}
                                 :headers {"app-id" (str app-id)
                                           "authorization" (str "Bearer " admin-token)}})
              bookshelves-after-relink (-> (query-post
                                            {:body {:query {:users {:$ {:where {:handle "alex"}}
                                                                    :bookshelves {}}}}
                                             :headers {"app-id" (str app-id)
                                                       "authorization" (str "Bearer " admin-token)}})
                                           :body
                                           (get "users")
                                           first
                                           (get "bookshelves"))]
          (is (pos? (count bookshelves-before)))
          (is (= (dec (count bookshelves-before))
                 (count bookshelves-after)))
          (is (= (count bookshelves-before)
                 (count bookshelves-after-relink))))))))

(deftest lookups-in-links-create-entities
  (with-zeneca-app
    (fn [{app-id :id admin-token :admin-token} _r]
      (let [bookshelf-id (random-uuid)]
        (transact-post
         {:body {:steps [["update" "bookshelves" bookshelf-id {"name" "bobby's bookshelf"
                                                               "slug" "bobbys_bookshelf"}]]}
          :headers {"app-id" (str app-id)
                    "authorization" (str "Bearer " admin-token)}})

        (testing "link"
          (let [new-handle "bobby_newuser"]
            (transact-post
             {:body {:steps [["link" "users" ["handle" new-handle]
                              {"bookshelves" bookshelf-id}]]}
              :headers {"app-id" (str app-id)
                        "authorization" (str "Bearer " admin-token)}})
            (let [users (-> (query-post
                             {:body {:query {:users {}}}
                              :headers {"app-id" (str app-id)
                                        "authorization" (str "Bearer " admin-token)}})
                            :body
                            (get "users"))
                  handles (->> users
                               (map (fn [x] (get x "handle")))
                               set)]

              (is (contains? handles new-handle)))))
        (testing "unlink"
          (let [new-handle "tommy_newuser"]
            (transact-post
             {:body {:steps [["unlink" "users" ["handle" new-handle]
                              {"bookshelves" bookshelf-id}]]}
              :headers {"app-id" (str app-id)
                        "authorization" (str "Bearer " admin-token)}})
            (let [users (-> (query-post
                             {:body {:query {:users {}}}
                              :headers {"app-id" (str app-id)
                                        "authorization" (str "Bearer " admin-token)}})
                            :body
                            (get "users"))
                  handles (->> users
                               (map (fn [x] (get x "handle")))
                               set)]

              (is (contains? handles new-handle)))))))))

(deftest lookup-creates-attrs
  (with-empty-app
    (fn [{app-id :id admin-token :admin-token}]
      (testing "good error message for create + update with lookup"
        ;; We may be able to fix with merge in postgres 16
        ;; https://www.postgresql.org/docs/current/sql-merge.html
        (is (= "Updates with lookups can only update the lookup attribute if an entity with the unique attribute value already exists."
               (-> (transact-post
                    {:body {:steps [["update" "users" ["handle" "stopa"] {"handle" "stopa2"}]]}
                     :headers {"app-id" (str app-id)
                               "authorization" (str "Bearer " admin-token)}})
                   :body
                   :hint
                   :errors
                   first
                   :message))))
      (testing "update"
        (is (transact-ok?
             (transact-post
              {:body {:steps [["update" "users" ["handle" "stopa"] {"name" "Stepan"}]]}
               :headers {"app-id" (str app-id)
                         "authorization" (str "Bearer " admin-token)}})))
        (is (= "Stepan"
               (-> (query-post
                    {:body {:query {:users {:$ {:where {:handle "stopa"}}}}}
                     :headers {"app-id" (str app-id)
                               "authorization" (str "Bearer " admin-token)}})
                   :body
                   (get "users")
                   first
                   (get "name")))))
      (testing "create link attrs"
        (let [stopa-id (-> (query-post
                            {:body {:query {:users {:$ {:where {:handle "stopa"}}}}}
                             :headers {"app-id" (str app-id)
                                       "authorization" (str "Bearer " admin-token)}})
                           :body
                           (get "users")
                           first
                           (get "id"))]
          (is (transact-ok?
               (transact-post
                {:body {:steps [["update" "user_prefs" ["users.id" stopa-id] {"pref_b" "pref_b_value"}]]}
                 :headers {"app-id" (str app-id)
                           "authorization" (str "Bearer " admin-token)}}))))
        (is (= "pref_b_value"
               (-> (query-post
                    {:body {:query {:users {:$ {:where {:handle "stopa"}}
                                            :user_prefs {}}}}
                     :headers {"app-id" (str app-id)
                               "authorization" (str "Bearer " admin-token)}})
                   :body
                   (get "users")
                   first
                   (get "user_prefs")
                   first
                   (get "pref_b"))))))))

(deftest lookups-in-links-create-attrs
  (with-empty-app
    (fn [{app-id :id admin-token :admin-token}]
      (testing "update"
        (is (transact-ok?
             (transact-post
              {:body {:steps [["update" "users" ["handle" "stopa"] {"name" "Stepan"}]
                              ["update" "tasks" ["slug" "task-a"] {}]
                              ["link" "users" ["handle" "stopa"] {"tasks" {"slug" "task-a"}}]]}
               :headers {"app-id" (str app-id)
                         "authorization" (str "Bearer " admin-token)}})))
        (let [query-result (-> (query-post
                                {:body {:query {:users {:$ {:where {:handle "stopa"}}
                                                        :tasks {}}}}
                                 :headers {"app-id" (str app-id)
                                           "authorization" (str "Bearer " admin-token)}})
                               :body)
              user (-> query-result
                       (get "users")
                       first)
              tasks (-> user
                        (get "tasks"))]
          (is (= "Stepan" (get user "name")))
          (is (= #{"task-a"} (set (map #(get % "slug") tasks)))))))))

(deftest lookups-in-links-dont-override-attrs
  (with-empty-app
    (fn [{app-id :id admin-token :admin-token}]
      (attr-model/insert-multi! (aurora/conn-pool :write)
                                app-id
                                [{:id (random-uuid)
                                  :forward-identity [(random-uuid) "posts" "id"]
                                  :value-type "blob"
                                  :cardinality "one"
                                  :unique? true
                                  :index? false}
                                 {:id (random-uuid)
                                  :forward-identity [(random-uuid) "posts" "slug"]
                                  :value-type "blob"
                                  :cardinality "one"
                                  :unique? true
                                  :index? false}
                                 {:id (random-uuid)
                                  :forward-identity [(random-uuid) "posts" "parent"]
                                  :reverse-identity [(random-uuid) "posts" "child"]
                                  :value-type "blob"
                                  :cardinality "one"
                                  :unique? true
                                  :index? false}])
      (is (transact-ok?
           (transact-post
            {:body {:steps [["update" "posts" ["slug" "new-post"] {}]
                            ["link" "posts" ["slug" "new-post"] {"child" {"slug" "new-post"}}]]}
             :headers {"app-id" (str app-id)
                       "authorization" (str "Bearer " admin-token)}}))))))

(defn tx-validation-err [attrs steps]
  (try
    (admin-model/->tx-steps! {:attrs attrs} steps)
    (catch clojure.lang.ExceptionInfo e
      (-> e ex-data ::ex/hint :errors first))))

(deftest transact-validations
  (with-zeneca-app
    (fn [app _r]
      (let [attrs (attr-model/get-by-app-id (:id app))]
        (is (= '{:expected string?, :in [0 1]}
               (tx-validation-err
                attrs [["update" 1 (UUID/randomUUID) {"title" "moop"}]])))
        (is (= '{:expected map?, :in [0 3]}
               (tx-validation-err
                attrs [["update" "goals" (UUID/randomUUID) 2]])))
        (is (= '{:expected map?, :in [0 1]}
               (tx-validation-err
                attrs [["add-attr" "goals" (UUID/randomUUID) 2]])))
        (is (= {:message "title is not a unique attribute on books"}
               (tx-validation-err
                attrs [["update" "books" ["title" "test"] {"title" "test"}]])))
        (is (= {:message "test.isbn is not a valid lookup attribute."}
               (tx-validation-err
                attrs [["update" "books" ["test.isbn" "asdf"] {"title" "test"}]])))
        (is (= {:message "lookup value is invalid", :hint {:attribute "linkOn"
                                                           :value "undefined"}}
               (tx-validation-err
                attrs [["link"
                        "spans"
                        "6fd7b6eb-6fa2-4943-b5a3-2d73c8bd6904"
                        {:parentSpan "lookup__linkOn__undefined"}]])))
        (is (= {:message "test.isbn is not a unique attribute on books"}
               (tx-validation-err
                (conj attrs {:id (random-uuid)
                             :forward-identity [(random-uuid) "books" "test.isbn"]
                             :unique? false})
                [["update" "books" ["test.isbn" "asdf"] {"title" "test"}]])))))))

(deftest presence-get-test
  (with-empty-app
    (fn [{app-id :id admin-token :admin-token}]
      (let [room-id "room-1"
            louis-sess-id (random-uuid)
            anon-sess-id (random-uuid)
            {louis-id :id
             louis-email :email
             louis-created-at :created_at}
            (app-user-model/create! {:id (random-uuid) :app-id app-id :email "lous_reasoner@instantdb.com"})]
        (with-redefs
         [eph/get-room-data
          (fn [app-id room-id]
            (when (and (= app-id app-id) (= room-id "room-1"))
              {anon-sess-id {:data {:color "red"}
                             :peer-id anon-sess-id
                             :user nil}
               louis-sess-id {:data {:color "blue"}
                              :peer-id louis-sess-id :user {:id louis-id}}}))]
          (let [{:keys [status body]} (presence-get
                                       {:params {:room-type "_defaultRoomType" :room-id room-id}
                                        :headers {"app-id" app-id
                                                  "authorization" (str "Bearer " admin-token)}})]

            (is (= 200 status))
            (is (= {:sessions
                    {anon-sess-id
                     {:data {:color "red"},
                      :peer-id anon-sess-id
                      :user nil},
                     louis-sess-id
                     {:data {:color "blue"},
                      :peer-id louis-sess-id
                      :user
                      {:app_id app-id
                       :id louis-id
                       :created_at louis-created-at
                       :email louis-email}}}}
                   body))))))))

(comment
  (test/run-tests *ns*))
