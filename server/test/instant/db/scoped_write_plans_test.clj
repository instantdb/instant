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


(def a749-app #uuid "a749930e-6737-4dcf-b039-60c7f5e4e2e6")

(def a749-attrs
  [{:id #uuid "8b4b8b0f-cb67-416a-a77a-b8ee7287c171"
    :forward-identity [#uuid "8b4b8b0f-cb67-416a-a77a-b8ee7287c171" "checkups" "excludeGroups"]
    :reverse-identity [#uuid "ae4e5ba7-17ff-4387-aa24-6dd0a5992cf2" "groups" "excludeCheckups"]
    :value-type :ref :cardinality :many
    :index? false :unique? false
    :checked-data-type nil :required? false}
   {:id #uuid "61a4082b-91ae-4da1-b267-5cec14ea393a"
    :forward-identity [#uuid "61a4082b-91ae-4da1-b267-5cec14ea393a" "checkups" "group"]
    :reverse-identity [#uuid "06b25089-ffa1-43a0-9700-ca8403269eef" "groups" "checkups"]
    :value-type :ref :cardinality :one
    :index? false :unique? false
    :checked-data-type nil :required? false}
   {:id #uuid "9dadedc4-f636-4068-a83a-6e39bb8a11f4"
    :forward-identity [#uuid "6804fde1-5c73-427a-b7ce-20626d4abea1" "conversations" "account"]
    :reverse-identity [#uuid "6c39c79e-a9c2-49b6-b73a-b9bc72f6fdae" "accounts" "conversations"]
    :value-type :ref :cardinality :one
    :index? false :unique? false
    :checked-data-type nil :required? false}
   {:id #uuid "a15d4213-a976-493a-b88b-b88bd6f2f324"
    :forward-identity [#uuid "f6dae905-b367-43df-918d-fb395af54fe5" "conversations" "groups"]
    :reverse-identity [#uuid "92985523-36ec-4180-a64e-408719445beb" "groups" "conversations"]
    :value-type :ref :cardinality :many
    :index? false :unique? false
    :checked-data-type nil :required? false}
   {:id #uuid "e2992693-6d30-4973-9712-4b4c700421ae"
    :forward-identity [#uuid "faa31f3c-afca-4c59-998a-2dd781e0b622" "conversations" "id"]
    :reverse-identity nil
    :value-type :blob :cardinality :one
    :index? false :unique? true
    :checked-data-type nil :required? false}
   {:id #uuid "e040f6e3-3d52-4955-908a-24a9264398db"
    :forward-identity [#uuid "e040f6e3-3d52-4955-908a-24a9264398db" "conversations" "lastMessageTime"]
    :reverse-identity nil
    :value-type :blob :cardinality :one
    :index? true :unique? false
    :checked-data-type :number :required? false}
   {:id #uuid "9dac5562-8a22-41e2-8997-57187662a325"
    :forward-identity [#uuid "5af9547b-5ed3-46f1-a709-acaef7617426" "conversations" "name"]
    :reverse-identity nil
    :value-type :blob :cardinality :one
    :index? true :unique? false
    :checked-data-type :string :required? true}
   {:id #uuid "c4804a8e-db5b-43a9-a651-9ae13856e509"
    :forward-identity [#uuid "c4804a8e-db5b-43a9-a651-9ae13856e509" "conversations" "participants"]
    :reverse-identity nil
    :value-type :blob :cardinality :one
    :index? false :unique? false
    :checked-data-type nil :required? false}
   {:id #uuid "aa0dc0e5-c0d6-42fc-acaa-806cd7afab7d"
    :forward-identity [#uuid "aa0dc0e5-c0d6-42fc-acaa-806cd7afab7d" "conversations" "participantsText"]
    :reverse-identity nil
    :value-type :blob :cardinality :one
    :index? true :unique? false
    :checked-data-type :string :required? false}
   {:id #uuid "c9c41177-4701-4924-9282-846b588bb248"
    :forward-identity [#uuid "9928e933-7659-49fa-9027-5b5336a1cf92" "groups" "account"]
    :reverse-identity [#uuid "a03b33cc-1988-44e9-a1d8-d1c0bed9c921" "accounts" "groups"]
    :value-type :ref :cardinality :one
    :index? false :unique? false
    :checked-data-type nil :required? false}
   {:id #uuid "02ed8782-f835-44d7-b556-057a9eaf461c"
    :forward-identity [#uuid "fd93350d-d48c-4d96-93c0-fd0c93343515" "groups" "id"]
    :reverse-identity nil
    :value-type :blob :cardinality :one
    :index? false :unique? true
    :checked-data-type nil :required? false}
   {:id #uuid "d0d4d481-c271-4948-9e4c-cfec182b06aa"
    :forward-identity [#uuid "d0d4d481-c271-4948-9e4c-cfec182b06aa" "groups" "lastActivityAt"]
    :reverse-identity nil
    :value-type :blob :cardinality :one
    :index? true :unique? false
    :checked-data-type :number :required? false}
   {:id #uuid "561e46a5-66c9-4c25-b3e4-f3430bfc0a5a"
    :forward-identity [#uuid "8282c58c-5701-4c6f-973e-512ee09a121c" "groups" "name"]
    :reverse-identity nil
    :value-type :blob :cardinality :one
    :index? true :unique? false
    :checked-data-type :string :required? true}
   {:id #uuid "5ae7b79f-34f4-428c-a35e-bc30fdbc2c73"
    :forward-identity [#uuid "2d9f2b1b-cfe3-4460-a0db-b54d01948afc" "messages" "conversation"]
    :reverse-identity [#uuid "03b06b9f-888d-47f6-83f6-0bf0a5428667" "conversations" "messages"]
    :value-type :ref :cardinality :one
    :index? false :unique? false
    :checked-data-type nil :required? false}
   {:id #uuid "f3b02095-907b-47d7-8eb7-259afe81e91e"
    :forward-identity [#uuid "f3b02095-907b-47d7-8eb7-259afe81e91e" "messages" "foreignId"]
    :reverse-identity nil
    :value-type :blob :cardinality :one
    :index? true :unique? true
    :checked-data-type :string :required? false}
   {:id #uuid "08c5756a-103a-4631-b3b3-1d9b7310b4fa"
    :forward-identity [#uuid "b22ed4a4-0226-41b2-8865-67afbe3fb0cc" "messages" "from"]
    :reverse-identity nil
    :value-type :blob :cardinality :one
    :index? true :unique? false
    :checked-data-type :string :required? true}
   {:id #uuid "f2749bd0-ead7-4daa-8a98-c0c7104452a2"
    :forward-identity [#uuid "a3c72196-5b40-49d3-96da-0ca128064110" "messages" "id"]
    :reverse-identity nil
    :value-type :blob :cardinality :one
    :index? false :unique? true
    :checked-data-type nil :required? false}
   {:id #uuid "e09e4de3-b305-45b9-b4c3-ab0b918e4c3d"
    :forward-identity [#uuid "8588c5f4-f6a7-458c-b0f4-c7aa91d456b2" "messages" "text"]
    :reverse-identity nil
    :value-type :blob :cardinality :one
    :index? false :unique? false
    :checked-data-type :string :required? true}
   {:id #uuid "e9523b1d-e0c7-4c81-80cf-ba17acc98157"
    :forward-identity [#uuid "6f449abb-2091-4708-a3ee-f13a066a927c" "messages" "textIndexed"]
    :reverse-identity nil
    :value-type :blob :cardinality :one
    :index? true :unique? false
    :checked-data-type :string :required? false}
   {:id #uuid "162c4ef5-7ad6-4219-87f7-2279f9142cfb"
    :forward-identity [#uuid "79d1570c-3d94-409a-a8f2-7d3a4144820a" "messages" "time"]
    :reverse-identity nil
    :value-type :blob :cardinality :one
    :index? true :unique? false
    :checked-data-type :number :required? true}
   {:id #uuid "5d6f52ea-abd0-4cce-b23c-233d394b94dd"
    :forward-identity [#uuid "5d6f52ea-abd0-4cce-b23c-233d394b94dd" "tokens" "groups"]
    :reverse-identity [#uuid "8685ff2f-e8b2-469b-8950-e9ef4a72020c" "groups" "tokens"]
    :value-type :ref :cardinality :many
    :index? false :unique? false
    :checked-data-type nil :required? false}
   {:id #uuid "5605c00b-e7af-41bd-8525-362ae603851c"
    :forward-identity [#uuid "ad6bdf3e-ce2d-433b-9c2a-ad849e841187" "users" "groups"]
    :reverse-identity [#uuid "c1078894-e395-41c5-8de6-cceeefd62f16" "groups" "users"]
    :value-type :ref :cardinality :many
    :index? false :unique? false
    :checked-data-type nil :required? false}])

(defn a749-triples []
  (let [group-a #uuid "00000000-0000-4000-8000-000000000001"
        group-b #uuid "00000000-0000-4000-8000-000000000002"
        message #uuid "00000000-0000-4000-8000-000000000003"
        conversation #uuid "00000000-0000-4000-8000-000000000004"]
    [[group-a #uuid "02ed8782-f835-44d7-b556-057a9eaf461c" group-a nil]
     [group-a #uuid "d0d4d481-c271-4948-9e4c-cfec182b06aa" 100 nil]
     [group-b #uuid "02ed8782-f835-44d7-b556-057a9eaf461c" group-b nil]
     [group-b #uuid "d0d4d481-c271-4948-9e4c-cfec182b06aa" 100 nil]
     [message #uuid "08c5756a-103a-4631-b3b3-1d9b7310b4fa" "fixture-from" nil]
     [message #uuid "162c4ef5-7ad6-4219-87f7-2279f9142cfb" 100 nil]
     [message #uuid "5ae7b79f-34f4-428c-a35e-bc30fdbc2c73" conversation nil]
     [message #uuid "e09e4de3-b305-45b9-b4c3-ab0b918e4c3d" "fixture-text" nil]
     [message #uuid "e9523b1d-e0c7-4c81-80cf-ba17acc98157" "fixture-textIndexed" nil]
     [message #uuid "f2749bd0-ead7-4daa-8a98-c0c7104452a2" message nil]
     [message #uuid "f3b02095-907b-47d7-8eb7-259afe81e91e" #uuid "00000000-0000-4000-8000-000000000005" nil]
     [conversation #uuid "a15d4213-a976-493a-b88b-b88bd6f2f324" group-a nil]
     [conversation #uuid "a15d4213-a976-493a-b88b-b88bd6f2f324" group-b nil]
     [conversation #uuid "aa0dc0e5-c0d6-42fc-acaa-806cd7afab7d" "fixture-participantsText" nil]
     [conversation #uuid "c4804a8e-db5b-43a9-a651-9ae13856e509" ["participant-a" "participant-b"] nil]
     [conversation #uuid "e040f6e3-3d52-4955-908a-24a9264398db" 100 nil]
     [conversation #uuid "e2992693-6d30-4973-9712-4b4c700421ae" conversation nil]]))

(deftest a749-exact-measured-message-batch
  (with-redefs [flags/scoped-write-plan-enabled? (constantly true)]
    (let [triples (a749-triples)]
      (is (= :a749-message-batch (plans/null-padding-shape a749-attrs a749-app triples nil)))
      (is (= :a749-message-batch (plans/null-padding-shape
                                 (attr-model/wrap-attrs a749-attrs) a749-app triples nil)))
      (testing "Entity and tuple order are not part of the measured contract"
        (is (= :a749-message-batch
               (plans/null-padding-shape (reverse a749-attrs) a749-app (reverse triples) nil))))
      (testing "Unrelated namespaces and incidental metadata do not change the schema"
        (is (= :a749-message-batch
               (plans/null-padding-shape (concat a749-attrs bitcoin-attrs) a749-app triples nil)))
        (is (= :a749-message-batch
               (plans/null-padding-shape
                (mapv #(assoc % :metadata {:note "fixture"} :inferred-types #{:json}) a749-attrs)
                a749-app triples nil))))
      (testing "Opaque vector contents are not realized or hashed by the gate"
        (let [unreadable (lazy-seq (throw (ex-info "Do not inspect payload" {})))
              i (first (keep-indexed #(when (= #uuid "c4804a8e-db5b-43a9-a651-9ae13856e509"
                                              (second %2)) %1) triples))]
          (is (= :a749-message-batch
                 (plans/null-padding-shape a749-attrs a749-app
                                          (assoc-in triples [i 2] [unreadable]) nil))))))))

(deftest a749-normalized-model-and-transaction-inputs
  (with-redefs [flags/scoped-write-plan-enabled? (constantly true)]
    (let [rows (mapv (fn [{:keys [id forward-identity reverse-identity value-type cardinality
                                  index? unique? required? checked-data-type]}]
                       {:id id :app_id a749-app :value_type (name value-type)
                        :cardinality (name cardinality) :is_indexed index? :is_unique unique?
                        :is_required required? :checked_data_type (some-> checked-data-type name)
                        :forward_ident (first forward-identity) :etype (second forward-identity)
                        :label (last forward-identity) :reverse_ident (first reverse-identity)
                        :reverse_etype (second reverse-identity) :reverse_label (last reverse-identity)
                        :indexing false :checking_data_type false :setting_unique false})
                     a749-attrs)
          attrs (attr-model/wrap-attrs (mapv #'attr-model/row->attr rows))
          steps (map #(into [:add-triple] %) (a749-triples))
          triples (map (comp next tx/vectorize-tx-step) (tx/mapify-tx-steps attrs steps))]
      (is (= 17 (count triples)))
      (is (every? #(and (= 4 (count %)) (nil? (nth % 3))) triples))
      (is (= :a749-message-batch (plans/null-padding-shape attrs a749-app triples nil))))))

(deftest a749-opt-in-precedes-input-inspection
  (let [unreadable (lazy-seq (throw (ex-info "Must not inspect disabled writes" {})))]
    (with-redefs [flags/scoped-write-plan-enabled? (constantly false)]
      (is (nil? (plans/null-padding-shape unreadable a749-app unreadable nil))))
    (let [calls (atom [])]
      (with-redefs [flags/scoped-write-plan-enabled? (fn [app shape] (swap! calls conj [app shape]) true)]
        (is (= :a749-message-batch
               (plans/null-padding-shape a749-attrs a749-app (a749-triples) nil)))
        (is (= [[a749-app :a749-message-batch]] @calls)))))
  (binding [flags/*flag-overrides* {:scoped-write-plans {(str a749-app) {"a749-message-batch" true}}}
            flags/*toggle-overrides* {:disable-scoped-write-plans false :disable-pg-hints false}]
    (is (= :a749-message-batch
           (plans/null-padding-shape a749-attrs a749-app (a749-triples) nil))))
  (doseq [toggles [{:disable-scoped-write-plans true} {:disable-pg-hints true}]]
    (binding [flags/*flag-overrides* {:scoped-write-plans {(str a749-app) {"a749-message-batch" true}}}
              flags/*toggle-overrides* toggles]
      (is (nil? (plans/null-padding-shape a749-attrs a749-app (a749-triples) nil))))))

(deftest a749-other-options-and-batch-shapes-fall-back
  (with-redefs [flags/scoped-write-plan-enabled? (constantly true)]
    (let [triples (a749-triples)]
      (doseq [opts [{} {:overwrite-t false} {:overwrite-t true} {:disable-scoped-write-plan? true} []]]
        (is (nil? (plans/null-padding-shape a749-attrs a749-app triples opts))))
      (doseq [step-options [{} {:mode :upsert} {:mode :create} {:mode :update} false]]
        (is (nil? (plans/null-padding-shape a749-attrs a749-app
                                           (assoc-in triples [0 3] step-options) nil))))
      (doseq [bad [nil [] {} (pop triples) (conj triples (first triples))
                   (repeat (first triples))
                   (assoc triples 0 (repeat :invalid))
                   (assoc triples 0 (pop (first triples)))
                   (assoc triples 0 (conj (first triples) nil))
                   (assoc-in triples [0 0] (str (ffirst triples)))
                   (assoc-in triples [0 0] [(second (first triples)) "lookup"])
                   (assoc-in triples [0 1] (random-uuid))
                   (assoc-in triples [0 1] [])
                   (assoc-in triples [0 2] (random-uuid))
                   (assoc-in triples [1 0] (first (nth triples 2)))]]
        (is (nil? (plans/null-padding-shape a749-attrs a749-app bad nil))))
      (testing "The same counts attached to different entities are a different write shape"
        (let [moved (-> triples
                        (assoc-in [1 0] (first (nth triples 4)))
                        (assoc-in [4 0] (ffirst triples)))]
          (is (= (frequencies (map second triples)) (frequencies (map second moved))))
          (is (nil? (plans/null-padding-shape a749-attrs a749-app moved nil)))))
      (doseq [i (range 17)]
        (is (nil? (plans/null-padding-shape a749-attrs a749-app (assoc-in triples [i 2] nil) nil))))
      (doseq [[attr bad-value] [[#uuid "c4804a8e-db5b-43a9-a651-9ae13856e509" [entity-id "lookup"]]
                                [#uuid "f3b02095-907b-47d7-8eb7-259afe81e91e" (str entity-id)]
                                [#uuid "08c5756a-103a-4631-b3b3-1d9b7310b4fa" (str entity-id)]]]
        (let [i (first (keep-indexed #(when (= attr (second %2)) %1) triples))]
          (is (nil? (plans/null-padding-shape a749-attrs a749-app
                                             (assoc-in triples [i 2] bad-value) nil)))))
      (is (nil? (plans/null-padding-shape a749-attrs bitcoin-app triples nil)))
      (is (nil? (plans/null-padding-shape bitcoin-attrs a749-app triples nil))))))

(deftest a749-complete-affected-schema-must-match
  (with-redefs [flags/scoped-write-plan-enabled? (constantly true)]
    (let [triples (a749-triples)]
      (doseq [i (range (count a749-attrs))
              mutate [#(assoc % :id (random-uuid))
                      #(assoc-in % [:forward-identity 0] (random-uuid))
                      #(assoc-in % [:forward-identity 1] "renamed")
                      #(assoc-in % [:forward-identity 2] "renamed")
                      #(assoc % :reverse-identity [(random-uuid) "groups" "new-reverse"])
                      #(update % :value-type {:blob :ref :ref :blob})
                      #(update % :cardinality {:one :many :many :one})
                      #(update % :index? not) #(update % :unique? not) #(update % :required? not)
                      #(assoc % :checked-data-type :date)
                      #(assoc % :indexing? true) #(assoc % :checking-data-type? true)
                      #(assoc % :setting-unique? true)
                      #(assoc % :deletion-marked-at (java.time.Instant/now))
                      #(assoc % :on-delete :cascade) #(assoc % :on-delete-reverse :cascade)]]
        (is (nil? (plans/null-padding-shape (update a749-attrs i mutate) a749-app triples nil))
            (str "relevant attribute " i)))
      (doseq [changed [(subvec a749-attrs 1)
                       (conj a749-attrs (first a749-attrs))
                       (conj a749-attrs {:id (random-uuid) :value-type :blob
                                        :forward-identity [(random-uuid) "messages" "new-field"]})
                       (conj a749-attrs {:id (random-uuid) :value-type :ref
                                        :forward-identity [(random-uuid) "other" "new-ref"]
                                        :reverse-identity [(random-uuid) "groups" "incoming"]})]]
        (is (nil? (plans/null-padding-shape changed a749-app triples nil))))
      (testing "Replacing legacy ident IDs with attribute IDs must not accidentally match"
        (is (nil? (plans/null-padding-shape
                   (mapv #(assoc-in % [:forward-identity 0] (:id %)) a749-attrs)
                   a749-app triples nil)))))))
