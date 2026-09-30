(ns instant.db.permissioned-transaction-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [instant.db.datalog :as d]
   [instant.db.permissioned-transaction :as permissioned-tx]
   [instant.fixtures :refer [with-empty-app]]
   [instant.util.test :as test-util]))

(deftest load-entities-map-deduplicates-reads
  (with-empty-app
    (fn [{app-id :id :keys [make-ctx]}]
      (let [attrs (test-util/make-attrs app-id [[:users/id :unique?]
                                               [:users/email :unique?]
                                               [:users/name]
                                               [:profiles/id :unique?]
                                               [:profiles/name]])
            user-id (random-uuid)
            other-id (random-uuid)
            missing-id (random-uuid)
            user-lookup [(:users/email attrs) "user@example.com"]
            missing-lookup [(:users/email attrs) "missing@example.com"]
            queries (atom [])
            ctx (assoc (make-ctx)
                       :datalog-query-fn
                       (fn [ctx query]
                         (swap! queries conj query)
                         (d/query ctx query)))
            load! #(permissioned-tx/load-entities-map ctx %)
            user-key {:eid user-id :etype "users"}
            other-key {:eid other-id :etype "users"}
            profile-key {:eid user-id :etype "profiles"}
            lookup-key {:eid user-lookup :etype "users"}
            missing-key {:eid missing-id :etype "users"}
            missing-lookup-key {:eid missing-lookup :etype "users"}]
        (test-util/insert-entities
         app-id attrs
         [{:db/id user-id
           :users/id user-id
           :users/email "user@example.com"
           :users/name nil
           :profiles/id user-id
           :profiles/name "Profile"}
          {:db/id other-id
           :users/id other-id
           :users/name "Other"}])
        (let [user {"id" user-id "email" "user@example.com" "name" nil}
              other {"id" other-id "name" "Other"}
              profile {"id" user-id "name" "Profile"}]
          (testing "repeated fields and shared ref endpoints load each pair once"
            (let [steps (concat (repeat 20 user-key)
                                [(assoc other-key :rev-etype "users" :value user-id)
                                 (assoc other-key :rev-etype "users" :value user-lookup)
                                 lookup-key
                                 profile-key
                                 missing-key
                                 missing-lookup-key
                                 {:op :add-attr}])]
              (is (= {user-key user
                      other-key other
                      lookup-key user
                      profile-key profile
                      missing-key nil
                      missing-lookup-key nil}
                     (load! steps)))
              (is (= [user-id other-id user-lookup user-id missing-id missing-lookup]
                     (mapv #(get-in % [:patterns 0 1])
                           (get-in (last @queries) [:children :pattern-groups]))))))
          (testing "unique groups preserve their original results"
            (is (= {other-key other profile-key profile}
                   (load! [other-key profile-key]))))
          (testing "empty input does not query"
            (reset! queries [])
            (is (nil? (load! [])))
            (is (nil? (load! [{:op :add-attr}])))
            (is (empty? @queries))))))))
