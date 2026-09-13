(ns instant.db.scoped-write-plans-test
  (:require [clojure.test :refer [deftest is testing]]
            [instant.db.model.attr :as attr-model]
            [instant.db.scoped-write-plans :as plans]
            [instant.db.transaction :as tx]
            [instant.flags :as flags]))

(def bitcoin-app #uuid "1c436238-c543-44d0-9a6b-51f7e5b840e3")
(def citybikes-app #uuid "6c3961ed-cf83-4f64-81a8-14b8c729b7a3")
(def entity-id #uuid "e2f22b6a-62b0-4ea5-a310-852d62033e1f")

(defn fixture-attrs [etype rows]
  (mapv (fn [[id label index? unique? checked-data-type required?]]
          {:id id :forward-identity [id etype label]
           :value-type :blob :cardinality :one
           :index? index? :unique? unique?
           :checked-data-type checked-data-type :required? required?})
        rows))

(def bitcoin-attrs
  (fixture-attrs
   "Prices"
   [[#uuid "840266e1-23e7-4d7f-8cb1-5048e353e722" "id" false true nil true]
    [#uuid "a728b771-a969-48df-821e-512c23e580df" "pairId" true false :string true]
    [#uuid "385052de-5395-4775-8784-091930cfba3d" "timestamp" true false :number true]
    [#uuid "c90e8952-e422-4526-ba7d-83c6c30fd2c3" "values" false false nil true]]))

(def citybikes-attrs
  (fixture-attrs
   "gbfsFreeBikes"
   [[#uuid "84e6cbfc-76bb-4bfc-9451-408c13ed897b" "id" false true nil true]
    [#uuid "7f09a8fe-f478-48fa-a883-d2fc51d38745" "bikeId" true true :string true]
    [#uuid "2910ade8-aa72-4c5f-bfe0-8112429d217d" "currentFuelPercent" false false :number false]
    [#uuid "1d116b99-f8c3-4e22-9e6a-eb0c3b90ae62" "currentRangeMeters" false false :number false]
    [#uuid "413711fa-a4ea-4f47-a045-2eb778e38c18" "isDisabled" false false :boolean true]
    [#uuid "24a02a92-55fa-4c67-a06e-7329f71d377f" "isReserved" false false :boolean true]
    [#uuid "44aa0d7d-82d0-47bd-b43b-b5289ad66760" "lat" false false :number true]
    [#uuid "19133dc1-9659-4f3f-be6a-c5229e8b24ff" "lng" false false :number true]
    [#uuid "8886e111-b137-46df-bb75-c79e8fcf238c" "pricingPlanId" true false :string false]
    [#uuid "b96e2675-ac29-4353-8626-3f7e17cf9959" "rentalUris" false false nil false]
    [#uuid "d7867073-5f01-467f-8d62-0ec6c71a4687" "stationId" true false :string false]
    [#uuid "edf54f43-15ee-4e9f-a108-f34056ae5cea" "syncedAt" true false :number true]
    [#uuid "fb6aef17-e123-4c8e-af20-7808c9da823c" "vehicleTypeId" true false :string false]]))

(def cases
  [{:app-id bitcoin-app :shape :bitcoin-prices :attrs bitcoin-attrs}
   {:app-id citybikes-app :shape :citybikes-free-bikes :attrs citybikes-attrs}])

(defn fixture-triples [attrs entity-id]
  (mapv (fn [{:keys [id checked-data-type forward-identity]}]
          [entity-id id
           (if (= "id" (last forward-identity))
             (str entity-id)
             (case checked-data-type
               :string "fixture-value"
               :number 100
               :boolean false
               {"fixture" [1 2 3]}))])
        attrs))

(deftest measured-writes-and-partial-updates
  (with-redefs [flags/scoped-write-plan-enabled? (constantly true)]
    (doseq [{:keys [app-id shape attrs]} cases]
      (let [triples (fixture-triples attrs entity-id)]
        (doseq [opts [nil {} {:overwrite-t nil} {:overwrite-t false}]]
          (is (= shape (plans/null-padding-shape attrs app-id triples opts))))
        (testing "Omitted indexed attributes and partial updates retain null-padding"
          (doseq [triple triples]
            (is (= shape (plans/null-padding-shape attrs app-id [triple] {})))))
        (testing "UUID id values and batches of direct entities are eligible"
          (is (= shape (plans/null-padding-shape
                        attrs app-id (assoc-in triples [0 2] entity-id) {}))))
        (is (= shape (plans/null-padding-shape
                      attrs app-id
                      (concat triples (fixture-triples attrs (random-uuid))) {})))
        (testing "Incidental metadata and unrelated namespaces do not change the fingerprint"
          (is (= shape (plans/null-padding-shape
                        (mapv #(assoc % :inferred-types #{:number :json}
                                        :metadata {:note "unrelated"}) attrs)
                        app-id triples {})))
          (is (= shape (plans/null-padding-shape
                        (concat attrs (if (= app-id bitcoin-app) citybikes-attrs bitcoin-attrs))
                        app-id triples {}))))))))

(deftest normalized-transaction-steps-retain-ordinary-upsert-options
  (doseq [{:keys [app-id shape attrs]} cases]
    (binding [flags/*flag-overrides* {:scoped-write-plans {(str app-id) {(name shape) true}}}
              flags/*toggle-overrides* {:disable-scoped-write-plans false
                                        :disable-pg-hints false}]
      (doseq [step-opts [::omitted nil {} {:mode :upsert}]]
        (let [steps (map (fn [triple]
                           (cond-> (into [:add-triple] triple)
                             (not= ::omitted step-opts) (conj step-opts)))
                         (fixture-triples attrs entity-id))
              triples (map (comp next tx/vectorize-tx-step)
                           (tx/mapify-tx-steps (attr-model/wrap-attrs attrs) steps))]
          (is (every? #(= 4 (count %)) triples))
          (is (every? #(= (when-not (= ::omitted step-opts) step-opts) (nth % 3)) triples))
          (is (= shape (plans/null-padding-shape attrs app-id triples {})))
          (testing "A normalized partial update can omit indexed fields"
            (is (= shape (plans/null-padding-shape attrs app-id (take 1 triples) {}))))))
      (doseq [step-opts [{:mode :create} {:mode :update} {:mode nil}
                        {:mode :unexpected} {:unexpected true}
                        {:mode :upsert :unexpected true}]]
        (let [steps (map #(conj (into [:add-triple] %) step-opts)
                         (fixture-triples attrs entity-id))
              triples (map (comp next tx/vectorize-tx-step)
                           (tx/mapify-tx-steps (attr-model/wrap-attrs attrs) steps))]
          (is (nil? (plans/null-padding-shape attrs app-id triples {})) (str step-opts)))))))

(deftest app-and-shape-opt-in-before-inspection
  (let [unreadable (lazy-seq (throw (ex-info "Must not inspect disabled writes" {})))]
    (with-redefs [flags/scoped-write-plan-enabled? (fn [& _] (throw (ex-info "Unknown app" {})))]
      (is (nil? (plans/null-padding-shape unreadable (random-uuid) unreadable {}))))
    (with-redefs [flags/scoped-write-plan-enabled? (constantly false)]
      (doseq [{:keys [app-id]} cases]
        (is (nil? (plans/null-padding-shape unreadable app-id unreadable {}))))))
  (doseq [{:keys [app-id shape attrs]} cases]
    (let [calls (atom [])]
      (with-redefs [flags/scoped-write-plan-enabled? (fn [a s] (swap! calls conj [a s]) true)]
        (is (= shape (plans/null-padding-shape attrs app-id (fixture-triples attrs entity-id) {})))
        (is (= [[app-id shape]] @calls))))))

(deftest unsupported-write-shapes-fall-back
  (with-redefs [flags/scoped-write-plan-enabled? (constantly true)]
    (doseq [{:keys [app-id attrs]} cases]
      (let [triples (fixture-triples attrs entity-id)
            id-attr (:id (first attrs))]
        (doseq [opts [{:overwrite-t true} {:overwrite-t 1} {:overwrite-t "false"}
                     {:unknown-option nil} {:disable-scoped-write-plan? true} []]]
          (is (nil? (plans/null-padding-shape attrs app-id triples opts)) (str opts)))
        (doseq [bad-triples [nil [] {}
                             [(str entity-id) id-attr (str entity-id)]
                             [[entity-id id-attr]]
                             [[entity-id id-attr (str entity-id) :unexpected]]
                             [[entity-id id-attr (str entity-id) nil :unexpected]]
                             [[entity-id id-attr (str entity-id) {} nil]]
                             [[entity-id id-attr (str entity-id) []]]
                             [[entity-id id-attr (str entity-id) false]]
                             [[entity-id id-attr (str entity-id) {:mode "upsert"}]]
                             (assoc-in triples [0 0] (str entity-id))
                             (assoc-in triples [0 0] [id-attr "lookup"])
                             (assoc-in triples [0 1] (random-uuid))
                             (assoc-in triples [1 2] [id-attr "lookup"])
                             (conj triples [entity-id (random-uuid) "other-namespace"])] ]
          (is (nil? (plans/null-padding-shape attrs app-id bad-triples {})) (str bad-triples)))
        (doseq [bad-id [nil "not-a-uuid" (random-uuid) (str (random-uuid)) 100]]
          (is (nil? (plans/null-padding-shape attrs app-id (assoc-in triples [0 2] bad-id) {}))))))
    (testing "The other measured app, namespace, and station-history writes remain separate"
      (is (nil? (plans/null-padding-shape bitcoin-attrs citybikes-app
                                           (fixture-triples bitcoin-attrs entity-id) {})))
      (is (nil? (plans/null-padding-shape citybikes-attrs bitcoin-app
                                           (fixture-triples citybikes-attrs entity-id) {})))
      (let [attrs (mapv #(assoc-in % [:forward-identity 1] "gbfsStationHourlyStats") citybikes-attrs)]
        (is (nil? (plans/null-padding-shape attrs citybikes-app (fixture-triples attrs entity-id) {})))))))

(deftest any-relevant-schema-drift-falls-back
  (with-redefs [flags/scoped-write-plan-enabled? (constantly true)]
    (doseq [{:keys [app-id attrs]} cases]
      (let [triples (fixture-triples attrs entity-id)]
        (doseq [i (range (count attrs))
                mutate [#(assoc % :id (random-uuid))
                        #(assoc-in % [:forward-identity 0] (random-uuid))
                        #(assoc-in % [:forward-identity 1] "renamed")
                        #(assoc-in % [:forward-identity 2] "renamed")
                        #(assoc % :value-type :ref)
                        #(assoc % :cardinality :many)
                        #(update % :index? not)
                        #(update % :unique? not)
                        #(update % :required? not)
                        #(assoc % :checked-data-type :date)
                        #(assoc % :reverse-identity [(random-uuid) "other" "link"])
                        #(assoc % :indexing? true)
                        #(assoc % :checking-data-type? true)
                        #(assoc % :setting-unique? true)
                        #(assoc % :deletion-marked-at (java.time.Instant/now))
                        #(assoc % :on-delete :cascade)
                        #(assoc % :on-delete-reverse :cascade)]]
          (is (nil? (plans/null-padding-shape (update attrs i mutate) app-id triples {}))
              (str "attribute " i)))
        (doseq [changed [(subvec attrs 1)
                         (conj attrs (first attrs))
                         (conj attrs (-> (first attrs)
                                         (assoc :id (random-uuid))
                                         (assoc-in [:forward-identity 2] "newIndexedField")))
                         (conj attrs {:id (random-uuid) :value-type :ref
                                      :forward-identity [(random-uuid) "other" "outgoing"]
                                      :reverse-identity [(random-uuid) (get-in attrs [0 :forward-identity 1]) "incoming"]})]]
          (is (nil? (plans/null-padding-shape changed app-id triples {}))))))))
