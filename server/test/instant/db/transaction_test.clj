(ns instant.db.transaction-test
  (:require [clojure.test :as test :refer [deftest is are testing]]
            [instant.db.model.attr :as attr-model]
            [instant.db.transaction :as tx]
            [instant.jdbc.aurora :as aurora]
            [instant.fixtures :refer [with-empty-app with-zeneca-app]]
            [instant.db.model.triple :as triple-model]
            [instant.model.app :as app-model]
            [instant.data.bootstrap :as bootstrap]
            [instant.data.constants :refer [test-user-id]]
            [instant.db.permissioned-transaction :as permissioned-tx]
            [instant.model.rule :as rule-model]
            [instant.data.resolvers :as resolvers]
            [instant.admin.routes :as admin-routes]
            [instant.util.test :refer [instant-ex-data pretty-perm-q]]
            [instant.db.instaql :as iq]
            [instant.db.datalog :as d]
            [instant.util.exception :as ex]
            [clojure.string :as string])
  (:import [java.util UUID]))

(defn- fetch-triples
  ([app-id] (fetch-triples app-id []))
  ([app-id where-clause]
   (set (map :triple
             (triple-model/fetch
              aurora/conn-pool
              app-id
              where-clause)))))

(deftest attrs-create-delete
  (with-empty-app
    (fn [{app-id :id}]
      (let [name-attr-id #uuid "75cad5c3-1e6b-4490-a8f7-17342618c260"
            name-fwd-ident #uuid "2ad158d4-2df7-42e3-91fd-630e814ed066"
            color-attr-id #uuid "dc990f2a-9351-41ba-9e68-0642b0f5b094"
            color-fwd-ident #uuid "e7221e56-ad5e-4c69-87cf-73fb17a1f407"
            stopa-eid #uuid "168b1f73-1b3d-4e14-884d-543142b9e597"]
        (tx/transact!
         aurora/conn-pool
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
                 (->> (attr-model/get-by-app-id aurora/conn-pool app-id)
                      (map :forward-identity)
                      (map last)
                      set))))
        (testing "triples are created"
          (is (= #{"Stopa" "Blue"}
                 (->> (triple-model/fetch aurora/conn-pool app-id)
                      (map :triple)
                      (map last)
                      set))))
        (tx/transact!
         aurora/conn-pool
         app-id
         [[:delete-attr color-attr-id]])
        (testing "attr is deleted"
          (is (= #{"name"}
                 (->> (attr-model/get-by-app-id aurora/conn-pool app-id)
                      (map :forward-identity)
                      (map last)
                      set))))
        (testing "associated triples are deleted"
          (is (= #{"Stopa"}
                 (->> (triple-model/fetch aurora/conn-pool app-id)
                      (map :triple)
                      (map last)
                      set))))))))

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
         aurora/conn-pool
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
                 (->> (attr-model/get-by-app-id aurora/conn-pool app-id)
                      (map :forward-identity)
                      (map last)
                      set))))
        (testing "changing forward-identity works"
          (tx/transact!
           aurora/conn-pool
           app-id
           [[:update-attr
             {:id tag-attr-id
              :forward-identity [tag-fwd-ident "users" "tagz"]}]])
          (is (= #{"tagz" "name"}
                 (->> (attr-model/get-by-app-id aurora/conn-pool app-id)
                      (map :forward-identity)
                      (map last)
                      set))))
        (testing "changing reverse-identity works"
          (tx/transact!
           aurora/conn-pool
           app-id
           [[:update-attr
             {:id tag-attr-id
              :reverse-identity [tag-rev-ident "tags" "taggerz"]}]])
          (is (= #{"taggerz"}
                 (->> (attr-model/get-by-app-id aurora/conn-pool app-id)
                      (keep :reverse-identity)
                      (map last)
                      set))))
        (testing "indexes are what we expect"
          (is  (= [#{:eav :vae}]
                  (->> (triple-model/fetch aurora/conn-pool app-id
                                           [[:= :attr-id tag-attr-id]])
                       (map :index))))
          (is  (= [#{:ea}]
                  (->> (triple-model/fetch aurora/conn-pool app-id
                                           [[:= :attr-id name-attr-id]])
                       (map :index)))))
        (testing "changing a column that affects an index works"
          (tx/transact!
           aurora/conn-pool
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
                  :inferred-types #{:string}}
                 (attr-model/seek-by-id
                  tag-attr-id
                  (attr-model/get-by-app-id aurora/conn-pool app-id))))
          (is (= [#{:eav :vae :ea}]
                 (->> (triple-model/fetch aurora/conn-pool app-id
                                          [[:= :attr-id tag-attr-id]])
                      (map :index))))
          (is (= [#{:ea}]
                 (->> (triple-model/fetch aurora/conn-pool app-id
                                          [[:= :attr-id name-attr-id]])
                      (map :index)))))
        (testing "changing multiple columns at once works"
          (tx/transact!
           aurora/conn-pool
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
                  :inferred-types #{:string}}
                 (attr-model/seek-by-id
                  name-attr-id
                  (attr-model/get-by-app-id aurora/conn-pool app-id))))
          (is (= [#{:eav :vae :ea}]
                 (->> (triple-model/fetch aurora/conn-pool app-id
                                          [[:= :attr-id tag-attr-id]])
                      (map :index))))
          (is (= [#{:av :ea}]
                 (->> (triple-model/fetch aurora/conn-pool app-id
                                          [[:= :attr-id name-attr-id]])
                      (map :index)))))))))

(deftest obj-normal
  (with-empty-app
    (fn [{app-id :id}]
      (let [name-attr-id #uuid "5f410bcd-0fea-4592-b391-5c8a0dba4d3d"
            name-fwd-ident #uuid "8935944f-1371-4600-b66b-153feeb19124"
            stopa-eid #uuid "476c9d7f-14db-4ee3-8639-0fe2a135f438"]
        (tx/transact!
         aurora/conn-pool
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
                  :inferred-types #{:string}}
                 (attr-model/seek-by-id
                  name-attr-id
                  (attr-model/get-by-app-id aurora/conn-pool app-id)))))
        (testing "triple is created with ea index"
          (is (= [{:triple
                   [stopa-eid
                    name-attr-id
                    "Stopa"],
                   :md5 "d9beab677fefb1bb874e6894f92ff8ef",
                   :index #{:ea}}]
                 (triple-model/fetch
                  aurora/conn-pool
                  app-id
                  [[:= :attr-id name-attr-id]]))))
        (testing "implicit retract works"
          (tx/transact!
           aurora/conn-pool
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
                aurora/conn-pool
                app-id
                [[:= :attr-id name-attr-id]]))))))))

(deftest obj-indexed
  (with-empty-app
    (fn [{app-id :id}]
      (let [zip-attr-id #uuid "06b87294-81df-4316-bb09-4d63b17fb768"
            zip-fwd-ident #uuid "0d5e1430-1f97-4fa3-ab8d-486c3ddcc4fe"
            stopa-eid #uuid "72aa9c7b-a288-4579-b308-d314219a1e1f"]
        (tx/transact!
         aurora/conn-pool
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
                  :inferred-types #{:string}}
                 (attr-model/seek-by-id
                  zip-attr-id
                  (attr-model/get-by-app-id aurora/conn-pool app-id)))))
        (testing "triple is created with ea and ave index"
          (is (= [{:triple
                   [stopa-eid
                    zip-attr-id
                    "11206"],
                   :md5 "70ce574f8884b16169e3e5a8e691c028",
                   :index #{:ave :ea}}]
                 (triple-model/fetch
                  aurora/conn-pool
                  app-id
                  [[:= :attr-id zip-attr-id]]))))
        (testing "implicit retract still works"
          (tx/transact!
           aurora/conn-pool
           app-id
           [[:add-triple stopa-eid zip-attr-id "11207"]])
          (is (= [{:triple
                   [stopa-eid
                    zip-attr-id
                    "11207"],
                   :md5 "ed5e18951da7c0bb257840c7c98706cb"
                   :index #{:ave :ea}}]
                 (triple-model/fetch
                  aurora/conn-pool
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
         aurora/conn-pool
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
                  :index? true
                  :inferred-types #{:string}}
                 (attr-model/seek-by-id
                  email-attr-id
                  (attr-model/get-by-app-id aurora/conn-pool app-id)))))
        (testing "triple is created with ea ave av index"
          (is (= [{:triple
                   [stopa-eid
                    email-attr-id
                    "test@instantdb.com"]
                   :md5 "66c461730d99ab77911770a07fcce6bf"
                   :index #{:ave :ea :av}}]
                 (triple-model/fetch
                  aurora/conn-pool
                  app-id
                  [[:= :attr-id email-attr-id]]))))

        (testing "implicit retract still works"
          (tx/transact!
           aurora/conn-pool
           app-id
           [[:add-triple stopa-eid email-attr-id "test2@instantdb.com"]])
          (is (= [{:triple
                   [stopa-eid email-attr-id "test2@instantdb.com"]
                   :md5 "3f073721c34987c8f438e1bad08f48cc"
                   :index #{:ave :ea :av}}]
                 (triple-model/fetch
                  aurora/conn-pool
                  app-id
                  [[:= :attr-id email-attr-id]]))))
        (testing "unicity throws"
          (is
           (= ::ex/record-not-unique
              (::ex/type (instant-ex-data
                          (tx/transact!
                           aurora/conn-pool
                           app-id
                           [[:add-triple joe-eid email-attr-id "test2@instantdb.com"]]))))))))))

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
         aurora/conn-pool
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
                  :inferred-types #{:string}}
                 (attr-model/seek-by-id
                  tag-attr-id
                  (attr-model/get-by-app-id aurora/conn-pool app-id)))))
        (testing "triple is created with eav, vae indexes"
          (is (= [{:triple
                   [stopa-eid tag-attr-id tag-one-eid]
                   :md5 "d0a560693570bacd7b02574480981f33"
                   :index #{:eav :vae}}]
                 (triple-model/fetch
                  aurora/conn-pool
                  app-id
                  [[:= :attr-id tag-attr-id]]))))
        (testing "cardinality many works"
          (tx/transact!
           aurora/conn-pool
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
                       aurora/conn-pool
                       app-id
                       [[:= :attr-id tag-attr-id]])))))
        (testing "invalid uuids are rejected"
          (is
           (= :invalid-text-representation
              (->  (instant-ex-data
                    (tx/transact!
                     aurora/conn-pool
                     app-id
                     [[:add-triple stopa-eid tag-attr-id "Foo"]]))
                   ::ex/hint
                   :condition)))
          (is
           (= :check-violation
              (->  (instant-ex-data
                    (tx/transact!
                     aurora/conn-pool
                     app-id
                     [[:add-triple stopa-eid tag-attr-id {:foo "bar"}]]))
                   ::ex/hint
                   :condition))))))))

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
         aurora/conn-pool
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
                  :inferred-types #{:string}}
                 (attr-model/seek-by-id
                  owner-attr-id
                  (attr-model/get-by-app-id aurora/conn-pool app-id)))))
        (testing "triple is created with eav vae ea"
          (is (= [{:triple [post-eid owner-attr-id stopa-eid]
                   :md5 "cf4a51ae88088110a27c1742ad1dedae"
                   :index #{:eav :vae :ea}}]
                 (triple-model/fetch
                  aurora/conn-pool
                  app-id
                  [[:= :attr-id owner-attr-id]]))))
        (testing "implicit retract works"
          (tx/transact!
           aurora/conn-pool
           app-id
           [[:add-triple post-eid owner-attr-id joe-eid]])
          (is (= [{:triple [post-eid owner-attr-id joe-eid]
                   :md5 "460869771b15d18ffcbeda1f64b80d97"
                   :index #{:eav :vae :ea}}]
                 (triple-model/fetch
                  aurora/conn-pool
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
         aurora/conn-pool
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
                  :index? false
                  :inferred-types #{:string}}
                 (attr-model/seek-by-id
                  config-attr-id
                  (attr-model/get-by-app-id aurora/conn-pool app-id)))))
        (testing "triple is created with eav, vae, ea, av indexes"
          (is (= [{:triple [stopa-eid config-attr-id config-eid]
                   :md5 "c0071c9a4cc18dc66115d788b76c12b5"
                   :index #{:eav :vae :ea :av}}]
                 (triple-model/fetch
                  aurora/conn-pool
                  app-id
                  [[:= :attr-id config-attr-id]]))))
        (testing "implicit retract works"
          (tx/transact!
           aurora/conn-pool
           app-id
           [[:add-triple stopa-eid config-attr-id second-config-eid]])
          (is (= [{:triple [stopa-eid config-attr-id second-config-eid]
                   :md5 "6635175fed8c0da3dd51bdeda050eee4"
                   :index #{:eav :vae :ea :av}}]
                 (triple-model/fetch
                  aurora/conn-pool
                  app-id
                  [[:= :attr-id config-attr-id]]))))

        (is
         (= ::ex/record-not-unique
            (::ex/type (instant-ex-data
                        #"Record not unique"
                        (tx/transact!
                         aurora/conn-pool
                         app-id
                         [[:add-triple joe-eid config-attr-id second-config-eid]])))))))))

(deftest lookup-refs
  (with-zeneca-app
    (fn [{app-id :id} r]
      (let [attrs (attr-model/get-by-app-id aurora/conn-pool app-id)
            ctx {:db {:conn-pool aurora/conn-pool}
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
          (tx/transact! aurora/conn-pool
                        app-id
                        [[:add-triple [handle-attr-id "alex"] email-attr-id "a@example.com"]])
          (is (= #{[alex-eid
                    email-attr-id
                    "a@example.com"]}
                 (fetch-triples app-id [[:= :attr-id email-attr-id]
                                        [:= :entity-id alex-eid]]))))
        (testing "upserts if necessary"
          (tx/transact! aurora/conn-pool
                        app-id
                        [[:add-triple [handle-attr-id "nobody"] email-attr-id "nobody@example.com"]])
          (is (= {"users" [{"handle" "nobody", "email" "nobody@example.com"}]}
                 (admin-routes/instaql-nodes->object-tree
                  attrs
                  (iq/query ctx {:users {:$ {:where {:handle "nobody"}}}})))))

        (testing "setting ids works"
          (tx/transact! aurora/conn-pool
                        app-id
                        [[:add-triple [handle-attr-id "id-test"] email-attr-id "id-test@example.com"]
                         [:add-triple [handle-attr-id "id-test"] id-attr-id [handle-attr-id "id-test"]]])
          (let [res (admin-routes/instaql-nodes->object-tree
                     attrs
                     (iq/query ctx {:users {:$ {:where {:handle "id-test"}}}}))
                user (-> res (get "users") first)]
            (is (= {"handle" "id-test", "email" "id-test@example.com"}
                   (select-keys user ["handle" "email"])))
            (is (uuid? (get user "id")))))

        (testing "retractions work"
          (tx/transact! aurora/conn-pool
                        app-id
                        [[:retract-triple [handle-attr-id "alex"] email-attr-id "a@example.com"]])
          (is (= #{}
                 (fetch-triples app-id [[:= :attr-id email-attr-id]
                                        [:= :entity-id alex-eid]]))))

        (testing "delete entity works"
          (is (seq (fetch-triples app-id [[:= :entity-id stopa-eid]])))
          (tx/transact! aurora/conn-pool
                        app-id
                        [[:delete-entity [handle-attr-id "stopa"]]])
          (is (= #{}
                 (fetch-triples app-id [[:= :entity-id stopa-eid]]))))

        (testing "value lookup refs work"
          (let [feynman-isbn "9780393079814"]
            ;; Check the setup
            (is (= feynman-isbn (as-> (admin-routes/instaql-nodes->object-tree
                                       attrs
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
            (tx/transact! aurora/conn-pool
                          app-id
                          [[:retract-triple eid-nonfiction bookshelf-attr-id [isbn-attr-eid feynman-isbn]]])

            (is (empty? (as-> (admin-routes/instaql-nodes->object-tree
                               attrs
                               (iq/query ctx {:bookshelves {:$ {:where {:name "Nonfiction"}}
                                                            :books {:$ {:where {:isbn13 feynman-isbn}}}}}))
                            %
                            (get % "bookshelves")
                            (first %)
                            (get % "books"))))

            ;; check adding back
            (tx/transact! aurora/conn-pool
                          app-id
                          [[:add-triple eid-nonfiction bookshelf-attr-id [isbn-attr-eid feynman-isbn]]])

            (is (= feynman-isbn (as-> (admin-routes/instaql-nodes->object-tree
                                       attrs
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
          (tx/transact! aurora/conn-pool
                        app-id
                        [[:add-triple alex-eid email-attr-id [email-attr-id "test"]]])
          (let [res (admin-routes/instaql-nodes->object-tree
                     attrs
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
         aurora/conn-pool
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
           aurora/conn-pool
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
         aurora/conn-pool
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
           aurora/conn-pool
           app-id
           [[:add-triple stopa-eid fav-nickname-attr-id "Stoopa"]
            [:add-triple joe-eid  fav-nickname-attr-id "Joski"]
            [:add-triple stopa-eid fav-nickname-attr-id "Stopachka"]])
          (is (= #{[stopa-eid fav-nickname-attr-id "Stopachka"]
                   [joe-eid fav-nickname-attr-id "Joski"]}
                 (fetch-triples app-id [[:= :attr-id fav-nickname-attr-id]]))))
        (testing "double-inserting on eav works"
          (tx/transact!
           aurora/conn-pool
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
         aurora/conn-pool
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
         aurora/conn-pool
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
         aurora/conn-pool
         app-id
         [[:delete-entity billy-eid]])

        (is (= #{[stopa-eid fav-nickname-attr-id "Stopa"]
                 [joe-eid fav-nickname-attr-id "Joski"]
                 [stopa-eid likes-attr-id joe-eid]}
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
  (app-model/delete-by-id! {:id app-id}))

(defmacro perm-err? [& body]
  `(is (= ::ex/permission-denied (::ex/type (instant-ex-data ~@body)))))

(deftest write-perms-merged
  (with-zeneca-app
    (fn [{app-id :id :as _app} r]
      (let [make-ctx (fn [] {:db {:conn-pool aurora/conn-pool}
                             :app-id app-id
                             :attrs (attr-model/get-by-app-id aurora/conn-pool app-id)
                             :datalog-query-fn d/query
                             :rules (rule-model/get-by-app-id aurora/conn-pool {:app-id app-id})
                             :current-user nil})]
        (testing "updates are sequentially merged"
          (rule-model/put!
           aurora/conn-pool
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
              (->>  (pretty-perm-q
                     {:app-id app-id :current-user nil}
                     {:users {}})
                    :users
                    (map :handle)
                    set))))))))


(deftest write-perms
  (doseq [[title get-lookup] [[" with eid" (fn [r] (resolvers/->uuid r "eid-stepan-parunashvili"))]
                              [" with lookup ref" (fn [r] [(resolvers/->uuid r :users/email) "stopa@instantdb.com"])]]]
    (with-zeneca-app
      (fn [{app-id :id :as _app} r]
        (let [make-ctx (fn [] {:db {:conn-pool aurora/conn-pool}
                               :app-id app-id
                               :attrs (attr-model/get-by-app-id aurora/conn-pool app-id)
                               :datalog-query-fn d/query
                               :rules (rule-model/get-by-app-id aurora/conn-pool {:app-id app-id})
                               :current-user nil})
              lookup (get-lookup r)]
          (testing (str "no perms accepts" title)
            (rule-model/put!
             aurora/conn-pool
             {:app-id app-id :code {}})
            (permissioned-tx/transact!
             (make-ctx)
             [[:add-triple lookup (resolvers/->uuid r :users/handle) "stopa2"]])
            (is
             (= #{"alex" "joe" "nicolegf" "stopa2"}
                (->>  (pretty-perm-q
                       {:app-id app-id :current-user nil}
                       {:users {}})
                      :users
                      (map :handle)
                      set))))
          (testing (str "false blocks updates" title)
            (rule-model/put!
             aurora/conn-pool
             {:app-id app-id :code {:users {:allow {:update "false"}}}})
            (is
             (perm-err?
               (permissioned-tx/transact!
                (make-ctx)
                [[:add-triple lookup (resolvers/->uuid r :users/handle) "stopa3"]]))))
          (testing (str "right value successfully updates" title)
            (rule-model/put!
             aurora/conn-pool
             {:app-id app-id :code {:users {:allow {:update "newData.handle == 'stopado'"}}}})
            (permissioned-tx/transact!
             (make-ctx)
             [[:add-triple lookup (resolvers/->uuid r :users/handle) "stopado"]])
            (is
             (= #{"alex" "joe" "nicolegf" "stopado"}
                (->>  (pretty-perm-q
                       {:app-id app-id :current-user nil}
                       {:users {}})
                      :users
                      (map :handle)
                      set))))
          (testing (str "wrong value blocks update" title)
            (rule-model/put!
             aurora/conn-pool
             {:app-id app-id :code {:users {:allow {:update "newData.handle == 'stopado'"}}}})
            (is
             (perm-err?
               (permissioned-tx/transact!
                (make-ctx)
                [[:add-triple lookup (resolvers/->uuid r :users/handle) "stopa"]]))))
          (testing (str "bind works" title)
            (rule-model/put!
             aurora/conn-pool
             {:app-id app-id :code {:users {:allow {:update "newData.handle == handle"}
                                            :bind ["handle" "'strooper'"]}}})
            (permissioned-tx/transact!
             (make-ctx)
             [[:add-triple lookup (resolvers/->uuid r :users/handle) "strooper"]])
            (is
             (= #{"alex" "joe" "nicolegf" "strooper"}
                (->>  (pretty-perm-q
                       {:app-id app-id :current-user nil}
                       {:users {}})
                      :users
                      (map :handle)
                      set))))

          (testing (str "ref works" title)
            (rule-model/put!
             aurora/conn-pool
             {:app-id app-id :code {:bookshelves {:allow {:update "handle in data.ref('users.handle')"}
                                                  :bind ["handle" "'alex'"]}}})
            (permissioned-tx/transact!
             (make-ctx)
             [[:add-triple (resolvers/->uuid r "eid-short-stories") (resolvers/->uuid r :bookshelves/name) "Long Stories"]])
            (is
             (= #{"Long Stories" "Nonfiction"}
                (->>  (pretty-perm-q
                       {:app-id app-id :current-user nil}
                       {:bookshelves {:$ {:where {:users.handle "alex"}}}})
                      :bookshelves
                      (map :name)
                      set))))
          (testing (str "invalid ref blocks" title)
            (rule-model/put!
             aurora/conn-pool
             {:app-id app-id :code {:bookshelves {:allow {:update "handle in data.ref('users.handle')"}
                                                  :bind ["handle" "'alex'"]}}})
            (is
             (perm-err?
               (permissioned-tx/transact!
                (make-ctx)
                [[:add-triple (resolvers/->uuid r "eid-2022") (resolvers/->uuid r :bookshelves/name) "2022!"]]))))

          (testing (str "correct auth works" title)
            (rule-model/put!
             aurora/conn-pool
             {:app-id app-id :code {:bookshelves {:allow {:update "handle in data.ref('users.handle')"}
                                                  :bind ["handle" "auth.handle"]}}})
            (permissioned-tx/transact!
             (assoc (make-ctx)
                    :current-user {:handle "alex"})
             [[:add-triple (resolvers/->uuid r "eid-short-stories") (resolvers/->uuid r :bookshelves/name) "Longer Stories"]])
            (is
             (= #{"Longer Stories" "Nonfiction"}
                (->>  (pretty-perm-q
                       {:app-id app-id :current-user nil}
                       {:bookshelves {:$ {:where {:users.handle "alex"}}}})
                      :bookshelves
                      (map :name)
                      set))))

          (testing (str "incorrect auth fails" title)
            (rule-model/put!
             aurora/conn-pool
             {:app-id app-id :code {:bookshelves {:allow {:update "handle in data.ref('users.handle')"}
                                                  :bind ["handle" "auth.handle"]}}})
            (is
             (perm-err?
               (permissioned-tx/transact!
                (assoc (make-ctx)
                       :current-user {:handle "joe"})
                [[:add-triple (resolvers/->uuid r "eid-short-stories") (resolvers/->uuid r :bookshelves/name) "Longer Stories"]]))))
          (testing (str "admin can do anything" title)
            (rule-model/put!
             aurora/conn-pool
             {:app-id app-id :code {:users {:allow {:update "false"}}}})
            (permissioned-tx/transact!
             (assoc (make-ctx) :admin? true)
             [[:add-triple lookup (resolvers/->uuid r :users/handle) "stopa-admin"]])
            (is
             (= #{"alex" "joe" "nicolegf" "stopa-admin"}
                (->>  (pretty-perm-q
                       {:app-id app-id :current-user nil}
                       {:users {}})
                      :users
                      (map :handle)
                      set))))

          (testing (str "create can block" title)
            (rule-model/put!
             aurora/conn-pool
             {:app-id app-id :code {:users {:allow {:create "false"}}}})
            (let [boop-id (UUID/randomUUID)]
              (is
               (perm-err?
                 (permissioned-tx/transact!
                  (make-ctx)
                  [[:add-triple boop-id (resolvers/->uuid r :users/id) boop-id]
                   [:add-triple boop-id (resolvers/->uuid r :users/handle) "boop"]])))))

          (testing (str "ref in create allows" title)
            (rule-model/put!
             aurora/conn-pool
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
                  (->>  (pretty-perm-q
                         {:app-id app-id :current-user nil}
                         {:bookshelves {:$ {:where {:users.handle "alex"}}}})
                        :bookshelves
                        (map :name)
                        set)))))
          (testing (str "ref in create blocks" title)
            (rule-model/put!
             aurora/conn-pool
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

          (testing (str "delete can block" title)
            (rule-model/put!
             aurora/conn-pool
             {:app-id app-id :code {:users {:allow {:delete "false"}}}})
            (is
             (perm-err?
               (permissioned-tx/transact!
                (make-ctx)
                [[:delete-entity lookup]]))))
          (testing (str "attr can block" title)
            (rule-model/put!
             aurora/conn-pool
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
          (testing (str "attr update/delete blocks unless admin" title)
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
          (testing (str "attr update/delete succeed when admin" title)
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
                         (attr-model/get-by-app-id aurora/conn-pool app-id)))))

              (permissioned-tx/transact!
               (assoc (make-ctx) :admin? true)
               [[:update-attr
                 {:id bloop-attr-id
                  :index? true}]])
              (is (= true
                     (:index?
                      (attr-model/seek-by-id
                       bloop-attr-id
                       (attr-model/get-by-app-id aurora/conn-pool app-id)))))
              (permissioned-tx/transact!
               (assoc (make-ctx) :admin? true)
               [[:delete-attr bloop-attr-id]])
              (is (nil?
                   (attr-model/seek-by-id
                    bloop-attr-id
                    (attr-model/get-by-app-id aurora/conn-pool app-id)))))))))))

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
           aurora/conn-pool
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
                  (instant-ex-data
                   (tx/transact!
                    aurora/conn-pool
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
                 (->  (instant-ex-data
                       (tx/transact!
                        aurora/conn-pool
                        app-id
                        [[:add-triple stopa-eid (UUID/randomUUID) "Stopa"]]))
                      ::ex/type))))))))

(deftest deep-merge-existing-object
  (with-empty-app
    (fn [{app-id :id}]
      (let [info-attr-id (UUID/randomUUID)
            info-fwd-ident (UUID/randomUUID)
            target-eid (UUID/randomUUID)]
        (tx/transact!
         aurora/conn-pool
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
                  aurora/conn-pool
                  app-id
                  [[:= :attr-id info-attr-id]]))))))))

(deftest deep-merge-existing-scalar
  (with-empty-app
    (fn [{app-id :id}]
      (let [info-attr-id (UUID/randomUUID)
            info-fwd-ident (UUID/randomUUID)
            target-eid (UUID/randomUUID)]
        (tx/transact!
         aurora/conn-pool
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
                  aurora/conn-pool
                  app-id
                  [[:= :attr-id info-attr-id]]))))))))

(deftest deep-merge-deep-object-with-scalar
  (with-empty-app
    (fn [{app-id :id}]
      (let [info-attr-id (UUID/randomUUID)
            info-fwd-ident (UUID/randomUUID)
            target-eid (UUID/randomUUID)]
        (tx/transact!
         aurora/conn-pool
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
                  aurora/conn-pool
                  app-id
                  [[:= :attr-id info-attr-id]]))))))))

(deftest deep-merge-deep-scalar-with-object
  (with-empty-app
    (fn [{app-id :id}]
      (let [info-attr-id (UUID/randomUUID)
            info-fwd-ident (UUID/randomUUID)
            target-eid (UUID/randomUUID)]
        (tx/transact!
         aurora/conn-pool
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
                  aurora/conn-pool
                  app-id
                  [[:= :attr-id info-attr-id]]))))))))

(deftest deep-merge-new
  (with-empty-app
    (fn [{app-id :id}]
      (let [info-attr-id (UUID/randomUUID)
            info-fwd-ident (UUID/randomUUID)
            target-eid (UUID/randomUUID)]
        (tx/transact!
         aurora/conn-pool
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
                  aurora/conn-pool
                  app-id
                  [[:= :attr-id info-attr-id]]))))))))

(deftest deep-merge-many
  (with-empty-app
    (fn [{app-id :id}]
      (let [info-attr-id (UUID/randomUUID)
            info-fwd-ident (UUID/randomUUID)
            target-eid (UUID/randomUUID)]
        (tx/transact!
         aurora/conn-pool
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
                  aurora/conn-pool
                  app-id
                  [[:= :attr-id info-attr-id]]))))))))

(deftest deep-merge-deep
  (with-empty-app
    (fn [{app-id :id}]
      (let [info-attr-id (UUID/randomUUID)
            info-fwd-ident (UUID/randomUUID)
            target-eid (UUID/randomUUID)]
        (tx/transact!
         aurora/conn-pool
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
                  aurora/conn-pool
                  app-id
                  [[:= :attr-id info-attr-id]]))))))))

(deftest deep-merge-many-with-top-level-nullification
  (with-empty-app
    (fn [{app-id :id}]
      (let [info-attr-id (UUID/randomUUID)
            info-fwd-ident (UUID/randomUUID)
            target-eid (UUID/randomUUID)]
        (tx/transact!
         aurora/conn-pool
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
                  aurora/conn-pool
                  app-id
                  [[:= :attr-id info-attr-id]]))))))))

(deftest deep-delete
  (with-empty-app
    (fn [{app-id :id}]
      (let [info-attr-id (UUID/randomUUID)
            info-fwd-ident (UUID/randomUUID)
            target-eid (UUID/randomUUID)]
        (tx/transact!
         aurora/conn-pool
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
                  aurora/conn-pool
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
            (::ex/message (instant-ex-data (tx/transact!
                                            aurora/conn-pool
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
         aurora/conn-pool
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
                  aurora/conn-pool
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
                    aurora/conn-pool
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
                (is (= inferred-types
                       (->> (attr-model/get-by-app-id aurora/conn-pool app-id)
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
          (tx/transact! aurora/conn-pool
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
                 (->> (attr-model/get-by-app-id aurora/conn-pool app-id)
                      (attr-model/seek-by-id attr-id)
                      :inferred-types)))
          (tx/transact! aurora/conn-pool
                        app-id
                        [[:add-triple (random-uuid) attr-id false]])
          (is (= #{:string :number :boolean}
                 (->> (attr-model/get-by-app-id aurora/conn-pool app-id)
                      (attr-model/seek-by-id attr-id)
                      :inferred-types)))))))

  (testing "inferred types work with deep-merge"
    (with-empty-app
      (fn [{app-id :id}]
        (let [attr-id (random-uuid)
              eid (random-uuid)]
          (tx/transact! aurora/conn-pool
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
                 (->> (attr-model/get-by-app-id aurora/conn-pool app-id)
                      (attr-model/seek-by-id attr-id)
                      :inferred-types)))
          (tx/transact! aurora/conn-pool
                        app-id
                        [[:deep-merge-triple eid attr-id {:patch :values}]])
          (is (= #{:string :json}
                 (->> (attr-model/get-by-app-id aurora/conn-pool app-id)
                      (attr-model/seek-by-id attr-id)
                      :inferred-types))))))))

(comment
  (test/run-tests *ns*))
