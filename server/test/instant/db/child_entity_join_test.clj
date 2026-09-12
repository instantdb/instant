(ns instant.db.child-entity-join-test
  (:require [clojure.test :refer [deftest is testing]]
            [honey.sql :as hsql]
            [instant.data.resolvers :as resolvers]
            [instant.db.attr-sketch :as cms]
            [instant.db.datalog :as d]
            [instant.db.instaql :as iq]
            [instant.db.model.attr :as attr-model]
            [instant.db.scoped-query-plans :as plans]
            [instant.flags :as flags]
            [instant.fixtures :refer [with-zeneca-checked-data-app]]
            [instant.jdbc.aurora :as aurora]
            [instant.jdbc.sql :as sql]
            [instant.util.instaql :as instaql-util]
            [instant.util.tracer :as tracer]))

(def measured-app #uuid "ff386052-f839-4d6e-8a62-4c1a6c7a6a01")
(def measured-normalized {:plays {:$ {:where {:themes :string, :finished :boolean}}}})

(def measured-query {:plays {:$ {:where {:themes "00000000-0000-0000-0000-000000000099" :finished true}}}})
(def measured-attrs
  (attr-model/wrap-attrs
   [{:id (java.util.UUID. 0 1)
     :forward-identity [(java.util.UUID. 1 1) "plays" "id"]
     :value-type :blob :cardinality :one :unique? true :index? false}
    {:id (java.util.UUID. 0 2)
     :forward-identity [(java.util.UUID. 1 2) "plays" "themes"]
     :reverse-identity [(java.util.UUID. 2 2) "themes" "plays"]
     :value-type :ref :cardinality :one :unique? false :index? false}
    {:id (java.util.UUID. 0 3)
     :forward-identity [(java.util.UUID. 1 3) "plays" "finished"]
     :value-type :blob :cardinality :one :unique? false :index? false}]))

(defn- compile-query [app-id q]
  (let [ctx {:app-id app-id :attrs measured-attrs
             :query-normalized (instaql-util/normalized-forms q)
             :sketches (into {} (map (fn [a]
                                      [{:app-id app-id :attr-id (:id a)}
                                       {:sketch (assoc (cms/make-sketch) :total 2000)}])
                                    measured-attrs))}
        patterns (:patterns (iq/instaql-query->patterns ctx q))
        named (d/annotate-with-hints-impl ctx {} (d/nested->named-patterns patterns))]
    (:query (d/nested-match-query ctx :m- app-id named))))

(defn- baseline [app-id q]
  (with-redefs [plans/reuse-bound-child-entities? (constantly false)]
    (compile-query app-id q)))

(deftest child-ids-require-the-measured-app-and-full-query
  (binding [d/*enable-pg-hints* true]
    (let [before (baseline measured-app measured-query)
          after (compile-query measured-app measured-query)]
      (is (= measured-normalized (instaql-util/normalized-forms measured-query)))
      (is (not= before after))
      (is (= [:triples :m-1] (get-in (vec (:with before)) [2 1 :from])))
      (is (= {:select [[[:distinct :m-0-entity-id] :m-2-entity-id]]
              :from :m-1 :where '(:and [:= :m-0-entity-id :m-1-entity-id])}
             (get-in (vec (:with after)) [2 1])))
      (is (= (assoc-in (update before :with vec) [:with 2 1]
                       (get-in (vec (:with after)) [2 1]))
             after)))
    (doseq [[label app-id q]
            [[:other-app (random-uuid) measured-query]
             [:missing-filter measured-app {:plays {:$ {:where {:themes "00000000-0000-0000-0000-000000000099"}}}}]
             [:null-filter measured-app (assoc-in measured-query [:plays :$ :where :finished] {:$isNull true})]
             [:limit measured-app (assoc-in measured-query [:plays :$ :limit] 10)]
             [:order measured-app (assoc-in measured-query [:plays :$ :order] {:serverCreatedAt "asc"})]
             [:fields measured-app (assoc-in measured-query [:plays :$ :fields] ["id"])]
             [:operator measured-app (assoc-in measured-query [:plays :$ :where :themes] {:$in ["00000000-0000-0000-0000-000000000099"]})]]]
      (testing (name label)
        (is (= (baseline app-id q) (compile-query app-id q)))))
    (is (false? (plans/reuse-bound-child-entities? measured-app nil)))))

(deftest child-ids-respect-existing-hint-switches
  (binding [d/*enable-pg-hints* false]
    (is (= (baseline measured-app measured-query) (compile-query measured-app measured-query))))
  (binding [d/*enable-pg-hints* true]
    (with-redefs [flags/toggled? (fn [flag & [default]]
                                  (if (= flag :disable-pg-hints) true default))]
      (is (= (baseline measured-app measured-query) (compile-query measured-app measured-query)))))
  (with-redefs [flags/flag (fn [flag & [default]]
                            (if (= flag :disable-hint-query-hashes) #{23346855} default))
                flags/toggled? (fn [_ & [default]] default)
                tracer/add-data! (fn [& _])
                d/send-query-nested (fn [& _] (compile-query measured-app measured-query))]
    (is (= (baseline measured-app measured-query)
           (d/query-nested {:app-id measured-app :query-hash 23346855}
                           '{:children {:pattern-groups
                                        [{:patterns [[:ea ?e #uuid "00000000-0000-0000-0000-000000000001" _]]}]}})))))

(defn- path [idx ctype]
  (cond-> {:pattern-idx idx :triple-idx ({:e 0 :a 1 :v 2} ctype) :ctype ctype}
    (= :v ctype) (assoc :ref? true)))

(deftest child-ids-reuse-multiple-entity-bindings
  (let [app-id measured-app
        attr-ids (repeatedly 3 random-uuid)
        named (d/nested->named-patterns
               {:children
                {:pattern-groups
                 [{:patterns (mapv #(vector :ea '?e % '_) attr-ids)
                   :children {:join-sym '?e
                              :pattern-groups [{:patterns [[:ea '?e (set attr-ids) '_]]}]}}]}})
        {:keys [query]} (binding [d/*enable-pg-hints* true]
                         (d/nested-match-query {:app-id app-id :query-normalized measured-normalized}
                                               :m- app-id named))
        [_ join-query materialization] (nth (:with query) 3)]
    (is (= [:triples :m-2]
           (get-in (vec (:ctes (d/accumulate-nested-match-query :m- app-id named))) [3 1 :from])))
    (is (= :materialized materialization))
    (is (= {:select [[[:distinct :m-0-entity-id] :m-3-entity-id]]
            :from :m-2
            :where '(:and [:= :m-0-entity-id :m-1-entity-id]
                          [:= :m-0-entity-id :m-2-entity-id])}
           join-query))
    (is (= :m-4 (first (last (:with query)))))))

(deftest child-ids-preserve-other-binding-paths
  (let [app-id (random-uuid)
        compile-join (fn [paths]
                       (#'d/child-join-query :m- app-id 3 {'?e paths} '?e true))]
    (doseq [[label paths]
            [[:or [#{[(path 0 :e)] [(path 1 :e)]} (path 2 :e)]]
             [:entity-and-ref [(path 0 :e) (path 1 :v)]]
             [:entity-and-attribute [(path 0 :e) (path 1 :a)]]
             [:refs [(path 0 :v) (path 1 :v)]]
             [:empty []]]]
      (testing (name label)
        (is (= [:triples :m-2] (:from (compile-join paths))))))
    (testing "The existing single ref binding still projects directly"
      (is (= {:select [[[:distinct [:json_uuid_to_uuid :m-0-value]] :m-3-entity-id]]
              :from :m-2}
             (compile-join [(path 0 :v)]))))))

(defn- fallback-child-join [prefix app-id next-idx symbol-map join-sym _reuse?]
  {:select [[[:distinct :entity-id] (keyword (str (name prefix) next-idx "-entity-id"))]]
   :from [:triples (keyword (str (name prefix) (dec next-idx)))]
   :where (list* :and [:= :app-id app-id]
                 (d/join-conds prefix (dec next-idx) symbol-map {:e [:variable join-sym]}))})

(deftest child-ids-preserve-null-and-duplicate-semantics
  (with-zeneca-checked-data-app
    (fn [app r]
      (let [alex (resolvers/->uuid r "eid-alex")
            nicole (resolvers/->uuid r "eid-nicole")
            rows [[alex alex] [alex alex] [alex nil] [nil alex]
                  [nil nil] [alex nicole] [nicole nicole]]
            symbol-map {'?e [(path 0 :e) (path 1 :e)]}
            run (fn [compile-join]
                  (sql/select
                   (aurora/conn-pool :read)
                   (hsql/format
                    (assoc (compile-join :m- (:id app) 2 symbol-map '?e true)
                           :with [[[:m-1 {:columns [:m-0-entity-id :m-1-entity-id]}]
                                   {:values (mapv (fn [row]
                                                    (mapv #(vector :cast % :uuid) row))
                                                  rows)}]]))))
            before (run fallback-child-join)
            after (run #'d/child-join-query)]
        (is (= (set before) (set after)))
        (is (= 2 (count after)))
        (is (= #{alex nicole} (set (map :m_2_entity_id after))))))))

(deftest child-ids-preserve-nested-results-and-topics
  (with-zeneca-checked-data-app
    (fn [app _]
      (let [ctx {:db {:conn-pool (aurora/conn-pool :read)}
                 :app-id (:id app)
                 :attrs (attr-model/get-by-app-id (:id app))}
            shapes [{:users {:$ {:where {:handle "alex" :email "alex@instantdb.com"}}
                              :bookshelves {:$ {:where {:name "Nonfiction" :order 1}}
                                            :books {:$ {:where {:title {:$like "%"}}}
                                                    :bookshelves {}}}}}
                    {:users {:$ {:where {:bookshelves.books.title {:$like "%"}
                                           :handle "alex"}}
                              :bookshelves {:books {}}}}
                    {:users {:$ {:where {:handle "alex" :email "missing@example.com"}}
                              :bookshelves {:books {}}}}
                    {:users {:$ {:where {:or [{:handle "alex"} {:handle "stopa"}]}}
                              :bookshelves {:$ {:where {:name "Nonfiction" :order {:$gte 0}}
                                                :order {:order "asc"}
                                                :limit 2}
                                            :books {}}}}]
            run-query (fn [q]
                        ;; Exercise the guarded rewrite across semantic edge cases;
                        ;; production cohort checks are tested separately.
                        (with-redefs [plans/reuse-bound-child-entities?
                                      (fn [app-id _] (= app-id (:id app)))]
                          (iq/query ctx q)))]
        (doseq [[i q] (map-indexed vector shapes)]
          (testing (str "shape " i)
            (let [before (with-redefs-fn {#'d/child-join-query fallback-child-join}
                           #(run-query q))
                  after (run-query q)
                  before-tree (instaql-util/instaql-nodes->object-tree ctx before)
                  after-tree (instaql-util/instaql-nodes->object-tree ctx after)
                  topics (fn [nodes]
                           (mapv :topics (mapcat #(map :datalog-result (iq/data-seq %)) nodes)))]
              (is (= before-tree after-tree))
              (is (= (topics before) (topics after)))
              (if (= i 2)
                (is (empty? (get after-tree "users")))
                (is (seq (get after-tree "users")))))))))))
