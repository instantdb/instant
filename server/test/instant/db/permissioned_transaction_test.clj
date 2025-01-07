(ns instant.db.permissioned-transaction-test
  (:require
   [clojure.test :as test :refer [deftest is testing]]
   [instant.data.resolvers :as resolvers]
   [instant.db.datalog :as d]
   [instant.db.instaql :as iq]
   [instant.db.model.attr :as attr-model]
   [instant.db.transaction :as tx]
   [instant.fixtures :refer [with-zeneca-app eph-zeneca-app!]]
   [instant.jdbc.aurora :as aurora]
   [instant.util.instaql :refer [instaql-nodes->object-tree]]
   [instant.db.model.triple :as triple-model]
   [instant.db.permissioned-transaction :as permissioned-tx]
   [instant.model.rule :as rule-model]))

(defn- fetch-triples
  ([app-id] (fetch-triples app-id []))
  ([app-id where-clause]
   (set (map :triple
             (triple-model/fetch
              (aurora/conn-pool)
              app-id
              where-clause)))))

(comment
  (def eph (eph-zeneca-app!))
  (def app (:app eph))
  (def r (:r eph))
  (def app-id (:id app)))

(comment
  (def attrs (attr-model/get-by-app-id app-id))
  (def ctx {:db {:conn-pool (aurora/conn-pool)}
            :app-id app-id
            :attrs attrs
            :datalog-query-fn d/query})

  (def handle-attr-id (resolvers/->uuid r :users/handle))

  (def user-id-aid (resolvers/->uuid r :users/id))

  (def fullname-attr-id (resolvers/->uuid r :users/fullName))

  (def user-bookshelves-aid (resolvers/->uuid r :users/bookshelves))

  (def bookshelves-name-aid (resolvers/->uuid r :bookshelves/name))

  (rule-model/put!
   (aurora/conn-pool)
   {:app-id app-id
    :code {:users {:allow {:create "'Worldview' in data.ref('bookshelves.name')"
                           :update "'Worldview' in data.ref('bookshelves.name')"
                           :delete "'Worldview' in data.ref('bookshelves.name')"}}}})

  (-> (permissioned-tx/transact!
       (assoc ctx
              :rules (rule-model/get-by-app-id {:app-id app-id})
              :admin-check? true
              :admin-dry-run? true)
       [[:add-triple
         [handle-attr-id "stopa"]
         handle-attr-id
         "moop"]])
      :preloaded-update-delete-refs)

  (->  (permissioned-tx/transact!
        (assoc ctx
               :rules (rule-model/get-by-app-id {:app-id app-id})
               :admin-check? true
               :admin-dry-run? true)
        [[:delete-entity
          [handle-attr-id "stopa"]]])
       :preloaded-update-delete-refs)

  (def bid (random-uuid))

  (-> (permissioned-tx/transact!
       (assoc ctx
              :rules (rule-model/get-by-app-id {:app-id app-id})
              :admin-check? true
              :admin-dry-run? true)
       [[:add-triple
         [handle-attr-id "nobody"]
         fullname-attr-id
         " No Bo Di"]
        [:add-triple
         [handle-attr-id "nobody"]
         user-id-aid
         [handle-attr-id "nobody"]]
        [:add-triple
         [handle-attr-id "nobody"]
         user-bookshelves-aid
         bid]
        [:add-triple
         bid
         bookshelves-name-aid
         "Moop"]])
      :preloaded-create-refs)

  (permissioned-tx/transact!
   (assoc ctx
          :rules (rule-model/get-by-app-id {:app-id app-id})
          :admin-check? true
          :admin-dry-run? true)
   [[:delete-entity
     [handle-attr-id "stopa"]]]))

(deftest lookup-refs
  (with-zeneca-app
    (fn [{app-id :id} r]
      (let [attrs (attr-model/get-by-app-id app-id)
            ctx {:db {:conn-pool (aurora/conn-pool)}
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
          (tx/transact! (aurora/conn-pool)
                        (attr-model/get-by-app-id app-id)
                        app-id
                        [[:add-triple [handle-attr-id "alex"] email-attr-id "a@example.com"]])
          (is (= #{[alex-eid
                    email-attr-id
                    "a@example.com"]}
                 (fetch-triples app-id [[:= :attr-id email-attr-id]
                                        [:= :entity-id alex-eid]]))))
        #_(testing "upserts if necessary"
            (tx/transact! (aurora/conn-pool)
                          (attr-model/get-by-app-id app-id)
                          app-id
                          [[:add-triple [handle-attr-id "nobody"] email-attr-id "nobody@example.com"]])
            (is (= {"users" [{"handle" "nobody", "email" "nobody@example.com"}]}
                   (instaql-nodes->object-tree
                    ctx
                    (iq/query ctx {:users {:$ {:where {:handle "nobody"}}}})))))

        #_(testing "setting ids works"
            (tx/transact! (aurora/conn-pool)
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
              (is (uuid? (get user "id")))))

        #_(testing "retractions work"
            (tx/transact! (aurora/conn-pool)
                          (attr-model/get-by-app-id app-id)
                          app-id
                          [[:retract-triple [handle-attr-id "alex"] email-attr-id "a@example.com"]])
            (is (= #{}
                   (fetch-triples app-id [[:= :attr-id email-attr-id]
                                          [:= :entity-id alex-eid]]))))

        #_(testing "delete entity works"
            (is (seq (fetch-triples app-id [[:= :entity-id stopa-eid]])))
            (tx/transact! (aurora/conn-pool)
                          (attr-model/get-by-app-id app-id)
                          app-id
                          [[:delete-entity [handle-attr-id "stopa"]]])
            (is (= #{}
                   (fetch-triples app-id [[:= :entity-id stopa-eid]]))))

        #_(testing "value lookup refs work"
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
              (tx/transact! (aurora/conn-pool)
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
              (tx/transact! (aurora/conn-pool)
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

        #_(testing "value lookup refs are ignored for regular attributes"
            (tx/transact! (aurora/conn-pool)
                          (attr-model/get-by-app-id app-id)
                          app-id
                          [[:add-triple alex-eid email-attr-id [email-attr-id "test"]]])
            (let [res (instaql-nodes->object-tree
                       ctx
                       (iq/query ctx {:users {:$ {:where {:handle "alex"}}}}))
                  user (-> res (get "users") first)]
              (is (= [(str email-attr-id) "test"] (get user "email")))))))))
