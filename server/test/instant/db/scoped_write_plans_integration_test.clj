(ns instant.db.scoped-write-plans-integration-test
  (:require [clojure.string :as string]
            [clojure.test :refer [deftest is testing]]
            [instant.db.model.attr :as attr-model]
            [instant.db.model.triple :as triple]
            [instant.db.scoped-write-plans :as plans]
            [instant.db.transaction :as tx]
            [instant.flags :as flags]
            [instant.fixtures :refer [with-empty-app]]
            [instant.jdbc.aurora :as aurora]
            [instant.jdbc.sql :as sql]
            [instant.util.exception :as ex]
            [instant.util.test :as test-util]
            [next.jdbc :as jdbc]))

(def builders
  {:old #'triple/insert-multi-old!
   :new #'triple/insert-multi-new!})

(defn- make-attrs [app-id]
  (test-util/make-attrs app-id [[:items/id :unique? :index?]
                               [:items/symbol :unique? :index?]
                               [:items/price :number :index?]
                               [:items/volume :number :index?]
                               [:other/id :unique? :index?]
                               [:other/value :index?]]))

(defn- result-pairs [rows]
  (set (map (juxt :entity_id :attr_id) rows)))

(defn- stored-triples [app-id eid]
  (sql/select ::stored-triples (aurora/conn-pool :read)
              ["SELECT attr_id, value, value_md5, ea, eav, av, ave, vae, checked_data_type
                FROM triples WHERE app_id = ? AND entity_id = ? ORDER BY attr_id"
               app-id eid]))

(defn- capture-sql [builder attrs app-id triples opts]
  (with-redefs [sql/do-execute! (fn [_op _conn query] query)]
    (builder nil attrs app-id triples opts)))

(deftest hint-changes-only-the-null-existence-probe
  (with-empty-app
    (fn [{app-id :id}]
      (let [{id-attr :items/id price-attr :items/price} (make-attrs app-id)
            attrs (attr-model/get-by-app-id app-id)
            eid (random-uuid)
            triples [[eid id-attr eid] [eid price-attr 42]]]
        (doseq [[name builder] builders]
          (testing (str name)
            (let [baseline (with-redefs [plans/null-padding-shape (constantly nil)]
                             (capture-sql builder attrs app-id triples {}))
                  hinted (with-redefs [plans/null-padding-shape (constantly :bitcoin-prices)]
                           (capture-sql builder attrs app-id triples {}))
                  normalized (update hinted 0
                                     #(-> %
                                          (string/replace #"(?s)/\*\+.*?\*/\s*" "")
                                          (string/replace "triples AS existing_triple" "triples")
                                          (string/replace "existing_triple." "triples.")))]
              (is (= baseline normalized))
              (is (= 1 (count (re-seq #"(?i)IndexScan\(existing_triple triples_pkey\)" (first hinted)))))
              (is (= 1 (count (re-seq #"triples AS existing_triple" (first hinted)))))
              (testing "an unrelated app retains the exact original SQL even when opted in"
                (with-redefs [flags/scoped-write-plan-enabled? (constantly true)]
                  (is (= baseline (capture-sql builder attrs app-id triples {}))))))))))))

(deftest hinted-writes-preserve-null-padding-and-update-markers
  (with-empty-app
    (fn [{app-id :id}]
      (let [{id-attr :items/id symbol-attr :items/symbol
             price-attr :items/price volume-attr :items/volume} (make-attrs app-id)
            attrs (attr-model/get-by-app-id app-id)
            pool (aurora/conn-pool :write)]
        (doseq [[name builder] builders
                shape [nil :bitcoin-prices]]
          (testing (str name " " shape)
            ;; Synthetic apps exercise the real SQL. Strict production schema
            ;; matching is covered independently in scoped-write-plans-test.
            (with-redefs [plans/null-padding-shape (constantly shape)]
              (let [eid (random-uuid)
                    symbol (str eid)
                    insert! #(builder pool attrs app-id % {})]
                (testing "creation adds nulls only for omitted indexed attributes in this namespace"
                  (is (= #{[eid id-attr] [eid symbol-attr] [eid price-attr] [eid volume-attr]}
                         (result-pairs (insert! [[eid id-attr eid]
                                                [eid symbol-attr symbol]
                                                [eid price-attr 42]]))))
                  (is (= {id-attr (str eid) symbol-attr symbol price-attr 42 volume-attr nil}
                         (into {} (map (juxt :attr_id :value) (stored-triples app-id eid))))))
                (testing "partial updates preserve omitted values and return the id update marker"
                  (let [before (into {} (map (juxt :attr_id identity) (stored-triples app-id eid)))]
                    (is (= #{[eid id-attr] [eid price-attr]}
                           (result-pairs (insert! [[eid id-attr eid] [eid price-attr 43]]))))
                    (let [after (into {} (map (juxt :attr_id identity) (stored-triples app-id eid)))]
                      (is (= (select-keys before [symbol-attr volume-attr])
                             (select-keys after [symbol-attr volume-attr])))
                      (is (= 43 (get-in after [price-attr :value]))))))
                (testing "explicit nulls retain the existing old and new no-op behavior"
                  (is (= #{[eid id-attr] [eid price-attr]}
                         (result-pairs (insert! [[eid id-attr eid] [eid price-attr nil]]))))
                  (let [before (stored-triples app-id eid)]
                    (is (= (if (= name :old) #{[eid id-attr]} #{})
                           (result-pairs (insert! [[eid id-attr eid] [eid price-attr nil]]))))
                    (is (= before (stored-triples app-id eid)))))
                (testing "uniqueness failures leave the existing entity intact and insert nothing"
                  (let [other-eid (random-uuid)
                        before (stored-triples app-id eid)
                        error (test-util/instant-ex-data
                                (insert! [[other-eid id-attr other-eid]
                                          [other-eid symbol-attr symbol]]))]
                    (is (= ::ex/record-not-unique (::ex/type error)))
                    (is (= before (stored-triples app-id eid)))
                    (is (empty? (stored-triples app-id other-eid)))))))))))))

(deftest concurrent-hinted-partial-updates-preserve-both-values
  (with-empty-app
    (fn [{app-id :id}]
      (let [{id-attr :items/id price-attr :items/price volume-attr :items/volume}
            (make-attrs app-id)
            attrs (attr-model/get-by-app-id app-id)
            pool (aurora/conn-pool :write)]
        (doseq [[name builder] builders]
          (testing (str name)
            (with-redefs [plans/null-padding-shape (constantly :bitcoin-prices)]
              (let [eid (random-uuid)
                    waiting (atom nil)
                    started (promise)]
                (builder pool attrs app-id
                         [[eid id-attr eid] [eid price-attr 0] [eid volume-attr 0]] {})
                (try
                  (jdbc/with-transaction [conn pool]
                    (is (= #{[eid id-attr] [eid price-attr]}
                           (result-pairs
                            (builder conn attrs app-id [[eid id-attr eid] [eid price-attr 1]] {}))))
                    (reset! waiting
                            (future
                              (jdbc/with-transaction [conn pool]
                                (jdbc/execute! conn ["SET LOCAL statement_timeout = '5s'"])
                                (deliver started true)
                                (builder conn attrs app-id
                                         [[eid id-attr eid] [eid volume-attr 2]] {}))))
                    (is (= true (deref started 5000 ::timeout)))
                    (is (= ::waiting (deref @waiting 100 ::waiting))))
                  (is (= #{[eid id-attr] [eid volume-attr]}
                         (result-pairs (deref @waiting 10000 []))))
                  (is (= {price-attr 1 volume-attr 2}
                         (-> (into {} (map (juxt :attr_id :value) (stored-triples app-id eid)))
                             (select-keys [price-attr volume-attr]))))
                  (finally
                    (when-let [task @waiting]
                      (future-cancel task))))))))))))

(deftest transaction-marker-precedes-hinted-write-and-mixed-operations-fall-back
  (with-empty-app
    (fn [{app-id :id}]
      (let [pool (aurora/conn-pool :write)
            schema (mapv (fn [[label unique? checked-data-type]]
                           (let [id (random-uuid)]
                             {:id id :forward-identity [id "Prices" label]
                              :value-type :blob :cardinality :one
                              :index? true :unique? unique? :required? false
                              :checked-data-type checked-data-type}))
                         [["id" true nil] ["price" false :number] ["volume" false :number]])
            _ (attr-model/insert-multi! pool app-id schema)
            attrs (attr-model/get-by-app-id app-id)
            {:strs [id price volume]} (into {} (map (juxt attr-model/fwd-label :id) schema))
            shape {:shape :bitcoin-prices :etype "Prices"
                   :attrs (into {} (map (fn [attr]
                                         [(:id attr) [(attr-model/fwd-label attr)
                                                      (:index? attr) (:unique? attr)
                                                      (:checked-data-type attr) (:required? attr)]])
                                       schema))}
            execute-one! sql/execute-one!
            do-execute! sql/do-execute!
            insert-multi! triple/insert-multi!]
        ;; Only register the generated app's expected schema. The production
        ;; matcher, flags, transaction normalization and SQL builders all run.
        (with-redefs-fn {#'plans/null-padding-shapes
                        (assoc @#'plans/null-padding-shapes app-id shape)}
          (fn []
            (doseq [new? [false true]
                    {:keys [label opts hint? mixed? map-form? seed? enabled? kill-switch]
                     :or {opts ::omitted enabled? true}}
                    [{:label :omitted-options :hint? true}
                     {:label :nil-options :opts nil :hint? true}
                     {:label :empty-options :opts {} :hint? true}
                     {:label :upsert-options :opts {:mode :upsert} :hint? true}
                     {:label :map-form :map-form? true :hint? true}
                     {:label :create-options :opts {:mode :create} :hint? false}
                     {:label :update-options :opts {:mode :update} :seed? true :hint? false}
                     {:label :unknown-options :opts {:unexpected true} :hint? false}
                     {:label :mixed-operations :mixed? true :hint? false}
                     {:label :disabled-shape :enabled? false :hint? false}
                     {:label :global-disable :kill-switch :disable-scoped-write-plans :hint? false}
                     {:label :hints-disable :kill-switch :disable-pg-hints :hint? false}]]
              (testing (str "new=" new? " " label)
                (binding [flags/*flag-overrides* {:scoped-write-plans
                                                 {(str app-id) {"bitcoin-prices" enabled?}}}
                          flags/*toggle-overrides* (cond-> {:disable-skip-noop-id-triple-updates (not new?)
                                                           :disable-scoped-write-plans false
                                                           :disable-pg-hints false}
                                                    kill-switch (assoc kill-switch true))]
                  (let [eid (random-uuid)
                        writes (atom [])
                        upsert-input (atom nil)
                        steps (if map-form?
                                [{:id eid :etype "Prices" :price 42}]
                                (cond-> (mapv #(cond-> %
                                                 (not= ::omitted opts) (conj opts))
                                               [[:add-triple eid id eid]
                                                [:add-triple eid price 42]])
                                  mixed? (conj [:retract-triple eid price 100])))
                        _ (when seed?
                            (tx/transact! pool attrs app-id
                                          [[:add-triple eid id eid] [:add-triple eid price 1]]))
                        result
                        (with-redefs [sql/execute-one!
                                      (fn [op conn query & args]
                                        (swap! writes conj [op (first query)])
                                        (apply execute-one! op conn query args))
                                      sql/do-execute!
                                      (fn [op conn query & args]
                                        (swap! writes conj [op (first query)])
                                        (apply do-execute! op conn query args))
                                      triple/insert-multi!
                                      (fn [conn attrs app-id triples opts]
                                        (reset! upsert-input (mapv vec triples))
                                        (insert-multi! conn attrs app-id triples opts))]
                          (tx/transact! pool attrs app-id steps))
                        upsert-sql (some (fn [[op query]]
                                           (when (= :instant.db.model.triple/insert-multi! op)
                                             query))
                                         @writes)]
                    (is (= :instant.db.model.transaction/create! (ffirst @writes)))
                    (is (string/includes? (second (first @writes)) "insert into transactions"))
                    (is (= 2 (count @upsert-input)))
                    (is (every? #(= 4 (count %)) @upsert-input))
                    (is (= (repeat 2 (when-not (= ::omitted opts) opts))
                           (map #(nth % 3) @upsert-input)))
                    (is (some? upsert-sql))
                    (is (= hint? (boolean (re-find #"(?i)IndexScan\(existing_triple triples_pkey\)"
                                                   upsert-sql))))
                    (is (every? (result-pairs (get-in result [:results :add-triple]))
                                #{[eid id] [eid price]}))
                    (is (= {id (str eid) price 42 volume nil}
                           (into {} (map (juxt :attr_id :value) (stored-triples app-id eid)))))))))))))))

(deftest listed-apps-get-the-hint-for-any-schema
  (with-empty-app
    (fn [{app-id :id}]
      (let [{id-attr :items/id price-attr :items/price} (make-attrs app-id)
            attrs (attr-model/get-by-app-id app-id)
            eid (random-uuid)
            triples [[eid id-attr eid] [eid price-attr 42]]]
        (doseq [[name builder] builders]
          (testing (str name)
            (let [baseline (capture-sql builder attrs app-id triples {})]
              (binding [flags/*flag-overrides* {:pkey-null-padding-apps #{app-id}}
                        flags/*toggle-overrides* {:disable-scoped-write-plans false
                                                  :disable-pg-hints false}]
                (let [hinted (capture-sql builder attrs app-id triples {})
                      normalized (update hinted 0
                                         #(-> %
                                              (string/replace #"(?s)/\*\+.*?\*/\s*" "")
                                              (string/replace "triples AS existing_triple" "triples")
                                              (string/replace "existing_triple." "triples.")))]
                  (is (= baseline normalized))
                  (is (= 1 (count (re-seq #"(?i)IndexScan\(existing_triple triples_pkey\)" (first hinted)))))
                  (testing "a partial update with options is hinted too"
                    (is (re-find #"triples AS existing_triple"
                                 (first (capture-sql builder attrs app-id
                                                     [[eid price-attr 43]] {:overwrite-t true}))))))
                (testing "other apps keep the original SQL"
                  (is (= (first baseline)
                         (first (capture-sql builder attrs (random-uuid) triples {})))))))))))))
