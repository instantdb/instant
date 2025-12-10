(ns instant.db.instaql-topic-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [instant.db.cel :as cel]
   [instant.db.instaql :as iq]
   [instant.db.model.attr :as attr-model]
   [instant.fixtures :refer [with-zeneca-app]]
   [instant.db.instaql-topic :as iqt]
   [instant.data.resolvers :as resolvers]
   [instant.db.transaction :as tx]
   [instant.jdbc.aurora :as aurora]))

;; ----
;; Tests

(deftest top-form-not-supported
  (with-zeneca-app
    (fn [app _r]
      (let [attrs (attr-model/get-by-app-id (:id app))]
        (is (= {:not-supported [:multi-part-path]}
               (iqt/instaql-topic
                {:attrs attrs}
                (iq/->forms! attrs {:users {:$ {:where {:bookshelves.title "2024"}}}}))))

        (is (= {:not-supported [:complex-value-type]}
               (iqt/instaql-topic
                {:attrs attrs}
                (iq/->forms! attrs {:users {:$ {:where {:handle {:$ilike "%moop%"}}}}}))))))))

(deftest composites
  (with-zeneca-app
    (fn [app r]
      (let [attrs (attr-model/get-by-app-id (:id app))
            {:keys [ast program]} (iqt/instaql-topic
                                   {:attrs attrs}
                                   (iq/->forms! attrs {:users {:$ {:where {:handle "stopa"
                                                                           :email "stopa@instantdb.com"}}}}))
            cel-str (cel/unparse ast)]

        ;; Check the CEL string representation
        (is (= (str "entity[\"etype\"] == \"users\" && "
                    "entity[\"attrs\"][\"" (resolvers/->uuid r :users/handle) "\"] == \"stopa\" && "
                    "entity[\"attrs\"][\"" (resolvers/->uuid r :users/email) "\"] == \"stopa@instantdb.com\"")
               cel-str))

        ;; Test program execution
        (is (true?
             (program {:etype "users"
                       :attrs {(str (resolvers/->uuid r :users/handle))
                               "stopa"
                               (str (resolvers/->uuid r :users/email))
                               "stopa@instantdb.com"}})))

        (is (false?
             (program {:etype "posts"
                       :attrs {(str (resolvers/->uuid r :users/handle))
                               "stopa"
                               (str (resolvers/->uuid r :users/email))
                               "stopa@instantdb.com"}})))
        (is (false?
             (program {:etype "users"
                       :attrs {(str (resolvers/->uuid r :users/handle))
                               "aio"
                               (str (resolvers/->uuid r :users/email))
                               "stopa@instantdb.com"}})))
        (is (false?
             (program {:etype "users"
                       :attrs {(str (resolvers/->uuid r :users/handle))
                               "stopa"
                               (str (resolvers/->uuid r :users/email))
                               "dww@instantdb.com"}})))))))

(deftest wacky-attr-values
  (with-zeneca-app
    (fn [app r]
      (let [attrs (attr-model/get-by-app-id (:id app))]

        (testing "values with special characters"
          (let [{:keys [program]} (iqt/instaql-topic
                                   {:attrs attrs}
                                   (iq/->forms! attrs {:users {:$ {:where {:handle "!@#$%^&*()"}}}}))]
            (is (true? (program {:etype "users"
                                 :attrs {(str (resolvers/->uuid r :users/handle)) "!@#$%^&*()"}})))
            (is (false? (program {:etype "users"
                                  :attrs {(str (resolvers/->uuid r :users/handle)) "other"}})))))

        (testing "values with quotes"
          (let [{:keys [program]} (iqt/instaql-topic
                                   {:attrs attrs}
                                   (iq/->forms! attrs {:users {:$ {:where {:handle "say \"hello\""}}}}))]
            (is (true? (program {:etype "users"
                                 :attrs {(str (resolvers/->uuid r :users/handle)) "say \"hello\""}})))))

        (testing "values with newlines and tabs"
          (let [{:keys [program]} (iqt/instaql-topic
                                   {:attrs attrs}
                                   (iq/->forms! attrs {:users {:$ {:where {:handle "line1\nline2\ttab"}}}}))]
            (is (true? (program {:etype "users"
                                 :attrs {(str (resolvers/->uuid r :users/handle)) "line1\nline2\ttab"}})))))

        (testing "values with backslashes"
          (let [{:keys [program]} (iqt/instaql-topic
                                   {:attrs attrs}
                                   (iq/->forms! attrs {:users {:$ {:where {:handle "C:\\Users\\test"}}}}))]
            (is (true? (program {:etype "users"
                                 :attrs {(str (resolvers/->uuid r :users/handle)) "C:\\Users\\test"}})))))

        (testing "unicode values"
          (let [{:keys [program]} (iqt/instaql-topic
                                   {:attrs attrs}
                                   (iq/->forms! attrs {:users {:$ {:where {:handle "日本語テスト"}}}}))]
            (is (true? (program {:etype "users"
                                 :attrs {(str (resolvers/->uuid r :users/handle)) "日本語テスト"}})))))

        (testing "emoji values"
          (let [{:keys [program]} (iqt/instaql-topic
                                   {:attrs attrs}
                                   (iq/->forms! attrs {:users {:$ {:where {:handle "🎉 Party time! 🚀"}}}}))]
            (is (true? (program {:etype "users"
                                 :attrs {(str (resolvers/->uuid r :users/handle)) "🎉 Party time! 🚀"}})))))

        (testing "CEL injection-like values"
          (let [{:keys [program]} (iqt/instaql-topic
                                   {:attrs attrs}
                                   (iq/->forms! attrs {:users {:$ {:where {:handle "\" && true || \""}}}}))]
            (is (true? (program {:etype "users"
                                 :attrs {(str (resolvers/->uuid r :users/handle)) "\" && true || \""}})))))))))

(deftest isNull-check
  (with-zeneca-app
    (fn [app r]
      (let [attrs (attr-model/get-by-app-id (:id app))]
        (testing "$isNull: true"
          (let [result (iqt/instaql-topic
                        {:attrs attrs}
                        (iq/->forms! attrs {:users {:$ {:where {:handle "stopa"
                                                                :fullName {:$isNull true}}}}}))
                {:keys [program]} result]
            (is (true?
                 (program {:etype "users"
                           :attrs {(str (resolvers/->uuid r :users/handle)) "stopa"}})))

            (is (true?
                 (program {:etype "users"
                           :attrs {(str (resolvers/->uuid r :users/handle)) "stopa"
                                   (str (resolvers/->uuid r :users/fullName)) nil}})))
            (is (false?
                 (program {:etype "users"
                           :attrs {(str (resolvers/->uuid r :users/handle)) "stopa"
                                   (str (resolvers/->uuid r :users/fullName)) "Stepan"}})))))

        (testing "$isNull: false"
          (let [result (iqt/instaql-topic
                        {:attrs attrs}
                        (iq/->forms! attrs {:users {:$ {:where {:handle "stopa"
                                                                :fullName {:$isNull false}}}}}))
                {:keys [program]} result]

            (is (false?
                 (program {:etype "users"
                           :attrs {(str (resolvers/->uuid r :users/handle)) "stopa"}})))

            (is (false?
                 (program {:etype "users"
                           :attrs {(str (resolvers/->uuid r :users/handle)) "stopa"
                                   (str (resolvers/->uuid r :users/fullName)) nil}})))
            (is (true?
                 (program {:etype "users"
                           :attrs {(str (resolvers/->uuid r :users/handle)) "stopa"
                                   (str (resolvers/->uuid r :users/fullName)) "Stepan"}})))))))))

(deftest isNull-refs
  (with-zeneca-app
    (fn [app _r]
      (let [favorite-book-attr-id (random-uuid)
            _ (tx/transact!
               (aurora/conn-pool :write)
               (attr-model/get-by-app-id (:id app))
               (:id app)
               [[:add-attr {:id favorite-book-attr-id
                            :forward-identity [(random-uuid) "users" "favoriteBook"]
                            :reverse-identity [(random-uuid) "books" "favoriteByUsers"]
                            :value-type :ref
                            :cardinality :one
                            :unique? false
                            :index? false}]])
            attrs (attr-model/get-by-app-id (:id app))]

        (is (= {:not-supported [:cardinality-many]}
               (iqt/instaql-topic
                {:attrs attrs}
                (iq/->forms! attrs {:users {:$ {:where {:bookshelves {:$isNull true}}}}}))))

        (is (= {:not-supported [:reverse-attribute]}
               (iqt/instaql-topic
                {:attrs attrs}
                (iq/->forms! attrs {:books {:$ {:where {:favoriteByUsers {:$isNull true}}}}}))))
        (let [result (iqt/instaql-topic
                      {:attrs attrs}
                      (iq/->forms! attrs {:users {:$ {:where {:favoriteBook {:$isNull true}}}}}))
              {:keys [program]} result]
          (is (true?
               (program {:etype "users"
                         :attrs {}})))
          (is (false?
               (program {:etype "users"
                         :attrs {(str favorite-book-attr-id) (str (random-uuid))}}))))))))

(deftest value-attr-validation
  (with-zeneca-app
    (fn [app _r]
      (let [favorite-book-attr-id (random-uuid)
            _ (tx/transact!
               (aurora/conn-pool :write)
               (attr-model/get-by-app-id (:id app))
               (:id app)
               [[:add-attr {:id favorite-book-attr-id
                            :forward-identity [(random-uuid) "users" "favoriteBook"]
                            :reverse-identity [(random-uuid) "books" "favoriteByUsers"]
                            :value-type :ref
                            :cardinality :one
                            :unique? false
                            :index? false}]])
            attrs (attr-model/get-by-app-id (:id app))]

        (is (= {:not-supported [:cardinality-many]}
               (iqt/instaql-topic
                {:attrs attrs}
                (iq/->forms! attrs {:users {:$ {:where {:bookshelves "some-value"}}}}))))

        (is (= {:not-supported [:reverse-attribute]}
               (iqt/instaql-topic
                {:attrs attrs}
                (iq/->forms! attrs {:books {:$ {:where {:favoriteByUsers "some-value"}}}}))))))))

(deftest child-form-not-supported
  (with-zeneca-app
    (fn [app _r]
      (let [attrs (attr-model/get-by-app-id (:id app))]
        (is (= {:not-supported [:multi-part-path]}
               (iqt/instaql-topic
                {:attrs attrs}
                (iq/->forms! attrs {:books {:bookshelves {:$ {:where {"users.handle" "stopa"}}}}}))))

        (is (= {:not-supported [:complex-value-type]}
               (iqt/instaql-topic
                {:attrs attrs}
                (iq/->forms! attrs {:users {:bookshelves {:$ {:where {:name {:$ilike "%sci%"}}}}}}))))))))

(deftest child-forms
  (with-zeneca-app
    (fn [app r]
      (let [_ (tx/transact!
               (aurora/conn-pool :write)
               (attr-model/get-by-app-id (:id app))
               (:id app)
               [[:add-attr {:id (random-uuid)
                            :forward-identity [(random-uuid) "users" "favoriteBook"]
                            :reverse-identity [(random-uuid) "books" "favoritedByUsers"]
                            :value-type :ref
                            :cardinality :one
                            :unique? false
                            :index? false}]])
            attrs (attr-model/get-by-app-id (:id app))
            {:keys [program]} (iqt/instaql-topic
                               {:attrs attrs}
                               (iq/->forms! attrs {:users {:$ {:where {:handle "stopa"}}
                                                           :favoriteBook {:$ {:where {:title "Erta"}}
                                                                          :bookshelves {:$ {:where {:name "sci-fi"}}}}}}))]
        (is (true? (program {:etype "users"
                             :attrs {(str (resolvers/->uuid r :users/handle)) "stopa"}})))
        (is (false? (program {:etype "users"
                              :attrs {(str (resolvers/->uuid r :users/handle)) "joe"}})))
        (is (true? (program {:etype "books" :attrs {}})))
        (is (true? (program {:etype "bookshelves" :attrs {}})))
        (is (false? (program {:etype "favoriteBook" :attrs {}})))
        (is (false? (program {:etype "posts" :attrs {}})))))))

