(ns instant.db.where-order-test
  (:require [clojure.test :refer [deftest is testing]]
            [instant.db.instaql :as iq]
            [instant.fixtures :refer [with-empty-app]]
            [instant.flags :as flags]
            [instant.util.instaql :as instaql-util]
            [instant.util.test :as test-util]))

(defn where-keys [o]
  (keys (get-in o [:prices :$ :where])))

(deftest listed-keys-move-to-the-front
  (let [o {:prices {:$ {:where {:pairId "BTCEUR" "source.id" "x" :timestamp 5} :limit 1}}
           :pairs {}}]
    (is (= [:timestamp :pairId "source.id"]
           (where-keys (iq/add-where-order o {"prices" ["timestamp"]}))))
    (is (= ["source.id" :timestamp :pairId]
           (where-keys (iq/add-where-order o {"prices" ["source.id" "timestamp" "missing"]}))))
    (testing "the rest of the query is untouched"
      (is (= o (iq/add-where-order o {"prices" ["timestamp"]})))
      (is (= (instaql-util/normalized-forms o)
             (instaql-util/normalized-forms (iq/add-where-order o {"prices" ["timestamp"]})))))
    (testing "queries without a matching where map are returned as is"
      (doseq [q [{:prices {}}
                 {:prices {:$ {:where {:or [{:pairId "a"} {:pairId "b"}]}}}}
                 {:pairs {:$ {:where {:timestamp 5}}}}]]
        (is (identical? q (iq/add-where-order q {"prices" ["nope"]})))))
    (is (= o (iq/add-where-order o nil)))))

(deftest reordered-queries-return-the-same-results
  (with-empty-app
    (fn [{app-id :id :keys [make-ctx]}]
      (let [attrs (test-util/make-attrs app-id [[:prices/id :unique?]
                                               [:prices/pairId :index? :string]
                                               [:prices/timestamp :index? :number]
                                               [:prices/value]])
            eid #(java.util.UUID. 42 %)
            _ (test-util/insert-entities
               app-id attrs
               (for [n (range 40)]
                 {:db/id (eid n) :prices/id (eid n) :prices/value n
                  :prices/pairId (if (even? n) "BTCEUR" "ETHEUR")
                  :prices/timestamp (quot n 4)}))
            ctx (make-ctx)
            run (fn [q]
                  (let [res (iq/query ctx q)]
                    (->> (get (instaql-util/instaql-nodes->object-tree ctx res) "prices")
                         (map #(get % "value"))
                         sort)))
            first-where-attr (fn [q]
                               (-> (iq/instaql-query->patterns
                                    ctx (iq/add-where-order q (flags/where-order app-id)))
                                   :patterns :children :pattern-groups first :patterns first
                                   (->> (tree-seq coll? seq) (filter uuid?) first)))]
        (doseq [q [{:prices {:$ {:where {:pairId "BTCEUR" :timestamp 3}}}}
                   {:prices {:$ {:where {:pairId "ETHEUR" :timestamp {:$gte 8}}}}}
                   {:prices {:$ {:where {:pairId "BTCEUR" :timestamp 3} :limit 1}}}]]
          (let [before (run q)
                before-attr (first-where-attr q)]
            (binding [flags/*flag-overrides* {:where-order {(str app-id) {"prices" ["timestamp"]}}}]
              (is (= before (run q)))
              (is (not= before-attr (first-where-attr q))))
            (testing "other apps keep their order"
              (binding [flags/*flag-overrides* {:where-order {(str (random-uuid)) {"prices" ["timestamp"]}}}]
                (is (= before-attr (first-where-attr q)))))))
        (is (= [12 14] (run {:prices {:$ {:where {:pairId "BTCEUR" :timestamp 3}}}})))))))
