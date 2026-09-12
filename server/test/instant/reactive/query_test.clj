(ns instant.reactive.query-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [datascript.core :as ds]
   [instant.db.instaql :as iq]
   [instant.db.model.attr :as attr-model]
   [instant.fixtures :refer [with-empty-app]]
   [instant.flags :as flags]
   [instant.model.app-user :as app-user-model]
   [instant.model.app-user-refresh-token :as refresh-token-model]
   [instant.reactive.query :as rq]
   [instant.reactive.store :as rs]
   [instant.util.instaql :as instaql-util]))

(defn- query-fixture []
  (let [eid (random-uuid)
        aid (random-uuid)]
    {:ctx {:app-id (random-uuid)
           :session-id (random-uuid)
           :attrs (attr-model/wrap-attrs
                   [{:id aid
                     :forward-identity [(random-uuid) "items" "id"]
                     :value-type :blob
                     :cardinality :one
                     :unique? true}])}
     :query {"items" {}}
     :nodes [{:data {:k "items"
                    :datalog-result {:join-rows #{}
                                     :page-info {:has-next-page? false}
                                     :aggregate {:count 1}}}
              :child-nodes [{:data {:datalog-result {:join-rows #{[[eid aid eid 0]]}}}
                             :child-nodes []}]}]}))

(deftest unchanged-results-are-only-skipped-when-requested
  (doseq [return-type [:tree :join-rows]
          inference? [true false]]
    (testing (str return-type ", inference " inference?)
      (let [{:keys [ctx query nodes]} (query-fixture)
            store (rs/init)
            query-calls (atom 0)
            skip-ctx (assoc ctx :skip-unchanged-result? true)]
        (with-redefs [flags/toggled? (constantly false)
                      iq/permissioned-query (fn [_ctx _query]
                                              (swap! query-calls inc)
                                              nodes)]
          (let [initial (rq/instaql-query-reactive! store skip-ctx query return-type inference?)
                unchanged (rq/instaql-query-reactive! store ctx query return-type inference?)]
            (is (true? (:result-changed? initial)))
            (is (false? (:result-changed? unchanged)))
            (is (some? (:instaql-result initial)))
            (is (= (dissoc initial :result-changed?)
                   (dissoc unchanged :result-changed?)))
            (let [unexpected (fn [& _] (throw (ex-info "Unexpected materialization" {})))]
              (with-redefs [rq/collect-instaql-results-for-client unexpected
                            instaql-util/instaql-nodes->object-tree unexpected
                            instaql-util/instaql-nodes->object-meta unexpected]
                (is (= {:instaql-result nil
                        :result-meta nil
                        :result-changed? false
                        :instaql-topic? false}
                       (rq/instaql-query-reactive! store skip-ctx query return-type inference?)))))
            (is (= 3 @query-calls) "Unchanged refreshes still evaluate permissions and the query")
            (is (= 3 (:instaql-query/version
                      (ds/entity @(rs/app-conn store (:app-id ctx))
                                 [:instaql-query/session-id+query [(:session-id ctx) query]]))))))))))

(deftest metadata-and-attribute-changes-are-materialized
  (doseq [return-type [:tree :join-rows]]
    (let [{:keys [ctx query nodes]} (query-fixture)
          ctx (assoc ctx :skip-unchanged-result? true)
          nodes (atom nodes)
          store (rs/init)]
      (with-redefs [flags/toggled? (constantly false)
                    iq/permissioned-query (fn [_ctx _query] @nodes)]
        (rq/instaql-query-reactive! store ctx query return-type true)
        (testing "Changes to page-info or aggregates cannot be dropped"
          (doseq [[k value] [[:page-info {:has-next-page? true}]
                            [:aggregate {:count 2}]]]
            (swap! nodes assoc-in [0 :data :datalog-result k] value)
            (let [result (rq/instaql-query-reactive! store ctx query return-type true)
                  metadata (if (= :tree return-type)
                             (:result-meta result)
                             (-> result :instaql-result first :data))]
              (is (true? (:result-changed? result)))
              (is (some? (:instaql-result result)))
              (is (= value (get-in metadata [k "items"]))))))
        (testing "Schema changes still change the result hash"
          (let [ctx (update ctx :attrs #(attr-model/wrap-attrs
                                         (mapv (fn [attr] (assoc attr :index? true)) %)))
                result (rq/instaql-query-reactive! store ctx query return-type true)]
            (is (true? (:result-changed? result)))
            (is (some? (:instaql-result result)))))))))

(deftest failed-refresh-still-removes-the-query
  (let [{:keys [ctx query nodes]} (query-fixture)
        ctx (assoc ctx :skip-unchanged-result? true)
        store (rs/init)]
    (with-redefs [flags/toggled? (constantly false)
                  iq/permissioned-query (fn [_ctx _query] nodes)]
      (rq/instaql-query-reactive! store ctx query :tree true))
    (with-redefs [flags/toggled? (constantly false)
                  iq/permissioned-query (fn [_ctx _query]
                                          (throw (ex-info "Permission check failed" {})))]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Permission check failed"
                           (rq/instaql-query-reactive! store ctx query :tree true)))
      (is (empty? (rs/session-instaql-queries store (:app-id ctx) (:session-id ctx)))))))

(deftest repeated-refresh-token-lookups-return-the-user
  (with-empty-app
    (fn [{app-id :id}]
      (let [user (app-user-model/create! {:app-id app-id :email "cached-user@example.com"})
            token (refresh-token-model/create! {:app-id app-id :user-id (:id user)})
            query-reactive rq/instaql-query-reactive!
            changes (atom [])]
        (with-redefs [rs/store (rs/init)
                      flags/use-reactive-cache-for-verify-token? (constantly true)
                      rq/instaql-query-reactive!
                      (fn [& args]
                        (let [result (apply query-reactive args)]
                          (swap! changes conj (:result-changed? result))
                          result))]
          (dotimes [_ 2]
            (is (= (str (:id user))
                   (get (app-user-model/get-by-refresh-token {:app-id app-id
                                                             :refresh-token (:id token)})
                        "id"))))
          (is (= [true false] @changes)))))))
