(ns instant.db.permissioned-transaction-load-entities-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [instant.db.model.attr :as attr-model]
   [instant.db.permissioned-transaction :as pt]))

(deftest load-entities-map-fetches-each-entity-once
  (let [e1 (random-uuid)
        e2 (random-uuid)
        e3 (random-uuid)
        ;; One tx-step per attribute written, as an update produces.
        tx-steps (concat
                  (for [_ (range 18)] {:eid e1 :etype "concepts"})
                  (for [_ (range 18)] {:eid e2 :etype "concepts"})
                  [{:eid e1 :etype "concepts" :value e3 :rev-etype "maps"}
                   {:eid e2 :etype "concepts" :value e3 :rev-etype "maps"}])
        queries (atom [])
        ctx {:attrs (attr-model/wrap-attrs [])
             :datalog-query-fn (fn [_ctx query]
                                 (swap! queries conj query)
                                 {:data (for [_ (-> query :children :pattern-groups)]
                                          {:result {:join-rows []}})})}
        res (pt/load-entities-map ctx tx-steps)
        groups (-> @queries first :children :pattern-groups)]
    (testing "one query, one pattern group per distinct entity"
      (is (= 1 (count @queries)))
      (is (= 3 (count groups)))
      (is (= #{e1 e2 e3} (set (map #(-> % :patterns first second) groups)))))
    (testing "every entity is keyed in the result"
      (is (= #{{:eid e1 :etype "concepts"}
               {:eid e2 :etype "concepts"}
               {:eid e3 :etype "maps"}}
             (set (keys res)))))))
