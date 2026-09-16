(ns instant.db.a749-write-plan-test
  (:require [clojure.string :as string]
            [clojure.test :refer [deftest is testing]]
            [instant.db.model.attr :as attr-model]
            [instant.db.model.triple :as triple]
            [instant.db.scoped-write-plans-test :as fixtures]
            [instant.db.transaction :as tx]
            [instant.flags :as flags]
            [instant.fixtures :refer [with-user]]
            [instant.jdbc.aurora :as aurora]
            [instant.jdbc.sql :as sql]
            [instant.model.app :as app-model]
            [instant.util.exception :as ex]
            [instant.util.test :as test-util]))

(def builders
  {:old #'triple/insert-multi-old!
   :new #'triple/insert-multi-new!})

(defn- hinted? [query]
  (boolean (re-find #"IndexScan\(existing_triple triples_pkey\)" (first query))))

(defn- capture-query [builder app-id triples]
  (with-redefs [sql/do-execute! (fn [_ _ query] query)]
    (builder nil (attr-model/wrap-attrs fixtures/a749-attrs) app-id triples nil)))

(deftest only-the-target-null-probe-changes
  (doseq [[builder-name builder] builders]
    (testing (name builder-name)
      (let [triples (fixtures/a749-triples)
            capture #(capture-query builder % triples)
            baseline (binding [flags/*flag-overrides* {:scoped-write-plans {}}]
                       (capture fixtures/a749-app))]
        (is (not (hinted? baseline)))
        (binding [flags/*flag-overrides* {:scoped-write-plans
                                         {(str fixtures/a749-app) {"a749-message-batch" true}}}
                  flags/*toggle-overrides* {:disable-scoped-write-plans false
                                            :disable-pg-hints false}]
          (let [hinted (capture fixtures/a749-app)]
            (is (hinted? hinted))
            (is (= baseline
                   (update hinted 0 #(-> %
                                         (string/replace #"(?s)/\*\+.*?\*/\s*" "")
                                         (string/replace "triples AS existing_triple" "triples")
                                         (string/replace "existing_triple." "triples."))))))
          (let [other-app (random-uuid)
                disabled (binding [flags/*flag-overrides* {:scoped-write-plans {}}]
                           (capture other-app))]
            (with-redefs [flags/scoped-write-plan-enabled? (constantly true)]
              (is (= disabled (capture other-app))))))))))

(defn- stored-triples [app-id]
  (sql/select ::stored-triples (aurora/conn-pool :read)
              ["SELECT entity_id, attr_id, value, value_md5, ea, eav, av, ave, vae,
                       checked_data_type
                FROM triples WHERE app_id = ? ORDER BY entity_id, attr_id, value_md5"
               app-id]))

(defn- result-pairs [rows]
  (frequencies (map (juxt :entity_id :attr_id) rows)))

(defn- attr-id [etype label]
  (:id (some #(when (= [etype label] (subvec (:forward-identity %) 1)) %)
             fixtures/a749-attrs)))

(defn- to-steps [triples]
  (mapv #(into [:add-triple] (take 3 %)) triples))

(defn- run-transaction! [attrs steps]
  (let [writes (atom [])
        normalized (atom nil)
        execute-one! sql/execute-one!
        do-execute! sql/do-execute!
        insert-multi! triple/insert-multi!
        result (with-redefs [sql/execute-one!
                            (fn [op conn query & args]
                              (swap! writes conj [op query])
                              (apply execute-one! op conn query args))
                            sql/do-execute!
                            (fn [op conn query & args]
                              (swap! writes conj [op query])
                              (apply do-execute! op conn query args))
                            triple/insert-multi!
                            (fn [conn attrs app-id triples opts]
                              (reset! normalized {:triples (mapv vec triples) :opts opts})
                              (insert-multi! conn attrs app-id triples opts))]
                 (tx/transact! (aurora/conn-pool :write) attrs fixtures/a749-app steps))]
    (is (= :instant.db.model.transaction/create! (ffirst @writes)))
    {:pairs (result-pairs (get-in result [:results :add-triple]))
     :stored (stored-triples fixtures/a749-app)
     :input @normalized
     :query (some (fn [[op query]]
                    (when (= :instant.db.model.triple/insert-multi! op) query))
                  @writes)}))

(defn- clear-triples! []
  (sql/do-execute! ::clear-triples (aurora/conn-pool :write)
                   ["DELETE FROM triples WHERE app_id = ?" fixtures/a749-app]))

(defn- seed-required-values! [attrs triples]
  (let [ids (set (keep (fn [[entity aid]]
                         (when (#{(attr-id "conversations" "id")
                                  (attr-id "groups" "id")} aid)
                           [entity aid]))
                       triples))]
    (tx/transact! (aurora/conn-pool :write) attrs fixtures/a749-app
                  (mapcat (fn [[entity aid]]
                            [[:add-triple entity aid entity]
                             [:add-triple entity
                              (attr-id (if (= aid (attr-id "groups" "id"))
                                         "groups" "conversations") "name")
                              "Synthetic fixture"]])
                          ids))))

(defn- run-scenario [attrs builder triples enabled?]
  (binding [flags/*flag-overrides* {:scoped-write-plans
                                   {(str fixtures/a749-app) {"a749-message-batch" enabled?}}}]
    (clear-triples!)
    (let [pool (aurora/conn-pool :write)
          direct (builder pool attrs fixtures/a749-app triples nil)
          padded (stored-triples fixtures/a749-app)]
      ;; The low-level SQL still pads omitted indexed names. Transactions below
      ;; seed the required names, as the observed partial updates do.
      (is (= 3 (count (filter #(nil? (:value %)) padded))))
      (clear-triples!)
      (seed-required-values! attrs triples)
      (let [initial (run-transaction! attrs (to-steps triples))
            replay (run-transaction! attrs (to-steps triples))
            message-id (first (some #(when (= (attr-id "messages" "id") (second %)) %) triples))
            partial (run-transaction! attrs [[:add-triple message-id (attr-id "messages" "id") message-id]
                                            [:add-triple message-id (attr-id "messages" "text") "Changed fixture"]])
            null-update (run-transaction! attrs [[:add-triple message-id (attr-id "messages" "textIndexed") nil]])
            mixed (run-transaction! attrs (conj (to-steps triples)
                                                [:retract-triple message-id (attr-id "messages" "text") "Absent fixture"]))
            before-failure (stored-triples fixtures/a749-app)
            transaction-count #(-> (sql/select-one ::transaction-count pool
                                                   ["SELECT count(*) AS n FROM transactions WHERE app_id = ?"
                                                    fixtures/a749-app]) :n)
            count-before (transaction-count)
            conflicting-id (random-uuid)
            conflicting (mapv (fn [[entity aid value opts]]
                                [(if (= entity message-id) conflicting-id entity)
                                 aid (if (= aid (attr-id "messages" "id")) conflicting-id value) opts])
                              triples)
            failure-query (atom nil)
            do-execute! sql/do-execute!
            failure (test-util/instant-ex-data
                      (with-redefs [sql/do-execute!
                                    (fn [op conn query & args]
                                      (when (= :instant.db.model.triple/insert-multi! op)
                                        (reset! failure-query query))
                                      (apply do-execute! op conn query args))]
                        (tx/transact! pool attrs fixtures/a749-app (to-steps conflicting))))]
        (doseq [result [initial replay]]
          (is (= enabled? (hinted? (:query result))))
          (is (= 17 (count (get-in result [:input :triples]))))
          (is (every? #(and (= 4 (count %)) (nil? (nth % 3)))
                      (get-in result [:input :triples])))
          (is (nil? (get-in result [:input :opts]))))
        (doseq [result [partial null-update mixed]]
          (is (not (hinted? (:query result)))))
        (is (= {:disable-scoped-write-plan? true} (get-in mixed [:input :opts])))
        (is (= (if (flags/skip-noop-id-triple-updates?) #{} (set (map first triples)))
               (set (map first (keys (:pairs replay))))))
        (is (= "Changed fixture"
               (:value (some #(when (and (= message-id (:entity_id %))
                                        (= (attr-id "messages" "text") (:attr_id %))) %)
                             (:stored partial)))))
        (is (= 3 (count (filter #(= "Synthetic fixture" (:value %)) (:stored partial)))))
        (is (= (count (set (keep #(when (= (attr-id "conversations" "groups") (second %))
                                   (nth % 2)) triples)))
               (count (filter #(= (attr-id "conversations" "groups") (:attr_id %))
                              (:stored initial)))))
        (is (= ::ex/record-not-unique (::ex/type failure)))
        (is (= enabled? (hinted? @failure-query)))
        (is (= before-failure (stored-triples fixtures/a749-app)))
        (is (= count-before (transaction-count)))
        {:direct (result-pairs direct)
         :padded padded
         :operations (mapv #(select-keys % [:pairs :stored])
                           [initial replay partial null-update mixed])}))))

(deftest targeted-transactions-preserve-results-and-storage
  (with-user
    (fn [{user-id :id}]
      (app-model/create! {:id fixtures/a749-app :title "a749 synthetic regression"
                          :creator-id user-id :admin-token (random-uuid)})
      (try
        (attr-model/insert-multi! (aurora/conn-pool :write) fixtures/a749-app fixtures/a749-attrs)
        (let [attrs (attr-model/get-by-app-id fixtures/a749-app)
              triples (fixtures/a749-triples)
              group-ref (attr-id "conversations" "groups")
              first-group (nth (first (filter #(= group-ref (second %)) triples)) 2)
              duplicate-ref (mapv #(if (= group-ref (second %)) (assoc % 2 first-group) %) triples)]
          (doseq [[builder-name builder] builders
                  [batch-name batch] [[:distinct-refs triples] [:duplicate-ref duplicate-ref]]]
            (testing (str builder-name " " batch-name)
              (binding [flags/*toggle-overrides* {:disable-skip-noop-id-triple-updates (= builder-name :old)
                                                  :disable-scoped-write-plans false
                                                  :disable-pg-hints false}]
                (is (= (run-scenario attrs builder batch false)
                       (run-scenario attrs builder batch true)))))))
        (finally
          (app-model/delete-immediately-by-id! {:id fixtures/a749-app}))))))
