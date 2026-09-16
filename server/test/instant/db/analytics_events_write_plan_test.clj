(ns instant.db.analytics-events-write-plan-test
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
            [instant.util.exception :as ex]))

(def builders {:old #'triple/insert-multi-old! :new #'triple/insert-multi-new!})

(defn- hinted? [query]
  (boolean (re-find #"IndexScan\(existing_triple triples_pkey\)" (first query))))

(defn- capture-query [builder attrs app-id triples]
  (with-redefs [sql/do-execute! (fn [_ _ query] query)]
    (builder nil (attr-model/wrap-attrs attrs) app-id triples nil)))

(defn- shape-flags [enabled?]
  {:scoped-write-plans
   {(str fixtures/analytics-events-app) {"5ff-analytics-events" enabled?}
    (str fixtures/a749-app) {"a749-message-batch" true}}})

(deftest only-the-analytics-null-probe-changes
  (binding [flags/*toggle-overrides* {:disable-scoped-write-plans false :disable-pg-hints false}]
    (doseq [[builder-name builder] builders]
      (testing (name builder-name)
        (let [capture #(capture-query builder fixtures/analytics-events-attrs %
                                      (fixtures/analytics-events-triples))
              baseline (binding [flags/*flag-overrides* {:scoped-write-plans {}}]
                         (capture fixtures/analytics-events-app))
              enabled (binding [flags/*flag-overrides* (shape-flags true)]
                        (capture fixtures/analytics-events-app))]
          (is (not (hinted? baseline)))
          (is (hinted? enabled))
          (is (= baseline
                 (update enabled 0 #(-> %
                                       (string/replace #"(?s)/\*\+.*?\*/\s*" "")
                                       (string/replace "triples AS existing_triple" "triples")
                                       (string/replace "existing_triple." "triples.")))))
          (let [other-app (random-uuid)]
            (is (= (binding [flags/*flag-overrides* (shape-flags false)] (capture other-app))
                   (with-redefs [flags/scoped-write-plan-enabled? (constantly true)]
                     (capture other-app)))))
          (let [capture-a749 #(capture-query builder fixtures/a749-attrs fixtures/a749-app
                                            (fixtures/a749-triples))
                before (binding [flags/*flag-overrides* (shape-flags false)] (capture-a749))]
            (is (hinted? before))
            (is (= before (binding [flags/*flag-overrides* (shape-flags true)] (capture-a749))))))))))

(defn- attr-id [label]
  (:id (some #(when (= label (attr-model/fwd-label %)) %) fixtures/analytics-events-attrs)))

(defn- client-steps [triples]
  (mapv (fn [[entity aid value]]
          ["add-triple" (str entity) (str aid) (if (uuid? value) (str value) value)])
        triples))

(defn- stored-triples []
  (sql/select ::stored-triples (aurora/conn-pool :read)
              ["SELECT entity_id, attr_id, value, value_md5, ea, eav, av, ave, vae,
                       checked_data_type
                FROM triples WHERE app_id = ? ORDER BY entity_id, attr_id, value_md5"
               fixtures/analytics-events-app]))

(defn- run-transaction! [attrs steps]
  (let [query (atom nil)
        normalized (atom nil)
        writes (atom [])
        execute-one! sql/execute-one!
        do-execute! sql/do-execute!
        insert-multi! triple/insert-multi!
        result (try
                 (with-redefs [sql/execute-one!
                               (fn [op conn query & args]
                                 (swap! writes conj op)
                                 (apply execute-one! op conn query args))
                               sql/do-execute!
                               (fn [op conn q & args]
                                 (swap! writes conj op)
                                 (when (= :instant.db.model.triple/insert-multi! op)
                                   (reset! query q))
                                 (apply do-execute! op conn q args))
                               triple/insert-multi!
                               (fn [conn attrs app-id triples opts]
                                 (reset! normalized {:triples (mapv vec triples) :opts opts})
                                 (insert-multi! conn attrs app-id triples opts))]
                   (tx/transact! (aurora/conn-pool :write) attrs fixtures/analytics-events-app
                                 (tx/coerce! steps)))
                 (catch Exception e
                   (if-let [instant-ex (ex/find-instant-exception e)]
                     (ex-data instant-ex)
                     (throw e))))]
    (is (= :instant.db.model.transaction/create! (first @writes)))
    {:pairs (frequencies (map (juxt :entity_id :attr_id) (get-in result [:results :add-triple])))
     :succeeded? (contains? result :results)
     :error (::ex/type result)
     :stored (stored-triples)
     :input @normalized
     :query @query}))

(defn- with-value [triples label value]
  (mapv #(if (= (attr-id label) (second %)) (assoc % 2 value) %) triples))

(defn- run-scenario [attrs enabled?]
  (binding [flags/*flag-overrides* (shape-flags enabled?)]
    (sql/do-execute! ::clear (aurora/conn-pool :write)
                     ["DELETE FROM triples WHERE app_id = ?" fixtures/analytics-events-app])
    (let [triples (fixtures/analytics-events-triples)
          entity (ffirst triples)
          initial (run-transaction! attrs (client-steps triples))
          replay (run-transaction! attrs (client-steps triples))
          duplicate (run-transaction! attrs (client-steps (conj triples (first triples))))
          partial (run-transaction! attrs [["add-triple" (str entity) (str (attr-id "eventType")) "changed"]])
          null-update (run-transaction! attrs (client-steps (with-value triples "channelSlug" nil)))
          mixed (run-transaction! attrs (conj (client-steps triples)
                                              ["retract-triple" (str entity) (str (attr-id "path")) "absent"]))
          sparse-entity #uuid "00000000-0000-4000-8000-000000000099"
          sparse (run-transaction! attrs
                                    (client-steps (filterv #(#{(attr-id "id") (attr-id "createdAt")
                                                             (attr-id "eventType")} (second %))
                                                           (fixtures/analytics-events-triples sparse-entity))))
          before-failure (stored-triples)
          transaction-count #(-> (sql/select-one ::transaction-count (aurora/conn-pool :read)
                                                 ["SELECT count(*) AS n FROM transactions WHERE app_id = ?"
                                                  fixtures/analytics-events-app]) :n)
          count-before (transaction-count)
          invalid-date (run-transaction! attrs (client-steps (-> triples
                                                               (with-value "createdAt" "not-a-date")
                                                               (with-value "eventType" "must-rollback"))))]
      (doseq [result [initial replay]]
        (is (= enabled? (hinted? (:query result))))
        (is (= 8 (count (get-in result [:input :triples]))))
        (is (every? #(and (= 4 (count %)) (nil? (nth % 3))) (get-in result [:input :triples])))
        (is (nil? (get-in result [:input :opts]))))
      (doseq [result [initial replay duplicate partial null-update mixed sparse]]
        (is (:succeeded? result))
        (is (nil? (:error result))))
      (doseq [result [duplicate partial null-update mixed sparse]]
        (is (not (hinted? (:query result)))))
      (is (= {:disable-scoped-write-plan? true} (get-in mixed [:input :opts])))
      (is (= 8 (count (:stored initial)) (count (:stored duplicate))))
      (is (= (if (flags/skip-noop-id-triple-updates?) {} {[entity (attr-id "id")] 1}) (:pairs replay)))
      (let [values (into {} (map (juxt :attr_id :value)) (:stored initial))
            channel (nth (first (filter #(= (attr-id "channelId") (second %)) triples)) 2)
            date-row (some #(when (= (attr-id "createdAt") (:attr_id %)) %) (:stored initial))]
        (is (= (str entity) (get values (attr-id "id"))))
        (is (= (str channel) (get values (attr-id "channelId"))))
        (is (uuid? (nth (first (filter #(= (attr-id "channelId") (second %))
                                      (get-in initial [:input :triples]))) 2)))
        (is (= "2026-01-01T00:00:00.000Z" (:value date-row)))
        (is (= "date" (name (:checked_data_type date-row)))))
      (is (= "changed" (:value (some #(when (= (attr-id "eventType") (:attr_id %)) %) (:stored partial)))))
      (let [slug-row (some #(when (= (attr-id "channelSlug") (:attr_id %)) %) (:stored null-update))]
        (is (some? slug-row))
        (is (nil? (:value slug-row))))
      (is (= #{(attr-id "channelId") (attr-id "channelSlug")}
             (set (keep #(when (and (= sparse-entity (:entity_id %)) (nil? (:value %))) (:attr_id %)) (:stored sparse)))))
      (is (= enabled? (hinted? (:query invalid-date))))
      (is (false? (:succeeded? invalid-date)))
      (is (= ::ex/validation-failed (:error invalid-date)))
      (is (= before-failure (:stored invalid-date)))
      (is (= count-before (transaction-count)))
      (mapv #(select-keys % [:pairs :stored :error])
            [initial replay duplicate partial null-update mixed sparse invalid-date]))))

(deftest analytics-transactions-preserve-results-and-storage
  (with-user
    (fn [{user-id :id}]
      (app-model/create! {:id fixtures/analytics-events-app :title "analytics synthetic regression"
                          :creator-id user-id :admin-token (random-uuid)})
      (try
        (attr-model/insert-multi! (aurora/conn-pool :write) fixtures/analytics-events-app
                                  fixtures/analytics-events-attrs)
        (let [attrs (attr-model/get-by-app-id fixtures/analytics-events-app)]
          (doseq [builder-name (keys builders)]
            (testing (name builder-name)
              (binding [flags/*toggle-overrides* {:disable-skip-noop-id-triple-updates (= builder-name :old)
                                                  :disable-scoped-write-plans false :disable-pg-hints false}]
                (is (= (run-scenario attrs false) (run-scenario attrs true)))))))
        (finally
          (app-model/delete-immediately-by-id! {:id fixtures/analytics-events-app}))))))
