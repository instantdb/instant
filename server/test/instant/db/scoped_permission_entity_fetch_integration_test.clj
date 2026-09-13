(ns instant.db.scoped-permission-entity-fetch-integration-test
  (:require [clojure.test :refer [deftest is testing]]
            [instant.db.attr-sketch :as cms]
            [instant.db.datalog :as d]
            [instant.db.permissioned-transaction :as permissioned-tx]
            [instant.db.transaction :as tx]
            [instant.flags :as flags]
            [instant.fixtures :refer [with-empty-app]]
            [instant.jdbc.aurora :as aurora]
            [instant.util.io :as io]
            [instant.util.test :as test-util]
            [next.jdbc :as jdbc]))

(deftest entity-fetch-preserves-results-and-transaction-visibility
  (with-empty-app
    (fn [{app-id :id :keys [make-ctx]}]
      (let [{id-attr :items/id value-attr :items/value other-id-attr :other/id}
            (test-util/make-attrs app-id [[:items/id :unique?]
                                         [:items/value]
                                         [:other/id :unique?]])
            eid (random-uuid)
            other-eid (random-uuid)
            absent-eid (random-uuid)
            tx-steps [{:eid eid :etype "items"}
                      {:eid other-eid :etype "other"}
                      {:eid absent-eid :etype "items"}
                      {:eid eid :etype "items"}]
            lookup cms/lookup
            lookup-count (atom 0)]
        (with-redefs [d/permission-entity-fetch-app-ids #{app-id}
                      cms/lookup (fn [& args]
                                   (swap! lookup-count inc)
                                   (apply lookup args))]
          (jdbc/with-transaction [conn (aurora/conn-pool :write) {:rollback-only true}]
            (let [ctx (make-ctx {:db {:conn-pool conn}})
                  fetch (fn [enabled? steps]
                          (reset! lookup-count 0)
                          (binding [flags/*flag-overrides* {:scoped-permission-entity-fetch
                                                           {(str app-id) enabled?}}]
                            (let [result (io/expect-io (permissioned-tx/load-entities-map ctx steps))]
                              {:result result :lookups @lookup-count})))
                  compare-fetch (fn []
                                  (let [before (fetch false tx-steps)
                                        after (fetch true tx-steps)]
                                    (is (= (:result before) (:result after)))
                                    (is (= 1 (:lookups before)))
                                    (is (zero? (:lookups after)))
                                    (:result after)))
                  write! (fn [steps]
                           (io/expect-io
                             (tx/transact-without-tx-conn! conn (:attrs ctx) app-id steps {})))]
              (testing "missing entities retain their positions"
                (is (= #{{:eid eid :etype "items"}
                          {:eid other-eid :etype "other"}
                          {:eid absent-eid :etype "items"}}
                       (set (keys (compare-fetch))))))
              (write! [[:add-triple eid id-attr eid]
                       [:add-triple eid value-attr 1]
                       [:add-triple other-eid other-id-attr other-eid]])
              (testing "reads observe preceding writes in the same transaction"
                (is (= 1 (get-in (compare-fetch) [{:eid eid :etype "items"} "value"]))))
              (write! [[:add-triple eid value-attr 2]])
              (is (= 2 (get-in (compare-fetch) [{:eid eid :etype "items"} "value"])))
              (testing "mixed UUID and lookup-reference batches retain their original planner"
                (let [steps (conj tx-steps {:eid [id-attr eid] :etype "items"})
                      before (fetch false steps)
                      after (fetch true steps)]
                  (is (= before after))
                  (is (= 1 (:lookups after)))))
              (write! [[:delete-entity eid "items"]])
              (is (nil? (get (compare-fetch) {:eid eid :etype "items"}))))))))))
