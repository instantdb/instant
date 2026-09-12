(ns instant.db.scoped-write-plans
  (:require [instant.flags :as flags]
            [instant.util.uuid :as uuid-util]))

;; Attribute IDs and schema from the measured app snapshots. A schema change
;; falls back to the normal planner until the new write shape is measured.
(def ^:private null-padding-shapes
  {#uuid "1c436238-c543-44d0-9a6b-51f7e5b840e3"
   {:shape :bitcoin-prices
    :etype "Prices"
    ;; [label indexed? unique? checked-data-type required?]
    :attrs {#uuid "840266e1-23e7-4d7f-8cb1-5048e353e722" ["id" false true nil true]
            #uuid "a728b771-a969-48df-821e-512c23e580df" ["pairId" true false :string true]
            #uuid "385052de-5395-4775-8784-091930cfba3d" ["timestamp" true false :number true]
            #uuid "c90e8952-e422-4526-ba7d-83c6c30fd2c3" ["values" false false nil true]}}

   #uuid "6c3961ed-cf83-4f64-81a8-14b8c729b7a3"
   {:shape :citybikes-free-bikes
    :etype "gbfsFreeBikes"
    :attrs {#uuid "84e6cbfc-76bb-4bfc-9451-408c13ed897b" ["id" false true nil true]
            #uuid "7f09a8fe-f478-48fa-a883-d2fc51d38745" ["bikeId" true true :string true]
            #uuid "2910ade8-aa72-4c5f-bfe0-8112429d217d" ["currentFuelPercent" false false :number false]
            #uuid "1d116b99-f8c3-4e22-9e6a-eb0c3b90ae62" ["currentRangeMeters" false false :number false]
            #uuid "413711fa-a4ea-4f47-a045-2eb778e38c18" ["isDisabled" false false :boolean true]
            #uuid "24a02a92-55fa-4c67-a06e-7329f71d377f" ["isReserved" false false :boolean true]
            #uuid "44aa0d7d-82d0-47bd-b43b-b5289ad66760" ["lat" false false :number true]
            #uuid "19133dc1-9659-4f3f-be6a-c5229e8b24ff" ["lng" false false :number true]
            #uuid "8886e111-b137-46df-bb75-c79e8fcf238c" ["pricingPlanId" true false :string false]
            #uuid "b96e2675-ac29-4353-8626-3f7e17cf9959" ["rentalUris" false false nil false]
            #uuid "d7867073-5f01-467f-8d62-0ec6c71a4687" ["stationId" true false :string false]
            #uuid "edf54f43-15ee-4e9f-a108-f34056ae5cea" ["syncedAt" true false :number true]
            #uuid "fb6aef17-e123-4c8e-af20-7808c9da823c" ["vehicleTypeId" true false :string false]}}})

(defn- schema-matches? [attrs {:keys [etype] expected :attrs}]
  (let [namespace-attrs (filter #(or (= etype (get-in % [:forward-identity 1]))
                                    (= etype (get-in % [:reverse-identity 1])))
                              attrs)]
    (and (= (count expected) (count namespace-attrs))
         (= (set (keys expected)) (set (map :id namespace-attrs)))
         (every? (fn [{:keys [id forward-identity reverse-identity value-type cardinality
                             index? unique? checked-data-type required?
                             indexing? checking-data-type? setting-unique?
                             deletion-marked-at on-delete on-delete-reverse]}]
                   (let [[label :as fingerprint] (get expected id)]
                     (and (= fingerprint [label index? unique? checked-data-type required?])
                          (= [id etype label] forward-identity)
                          (= :blob value-type)
                          (= :one cardinality)
                          (nil? reverse-identity)
                          (not indexing?)
                          (not checking-data-type?)
                          (not setting-unique?)
                          (nil? deletion-marked-at)
                          (nil? on-delete)
                          (nil? on-delete-reverse))))
                 namespace-attrs))))

(defn- ordinary-triples? [triples expected]
  (and (sequential? triples)
       (seq triples)
       (every? (fn [triple]
                 (and (sequential? triple)
                      (= 3 (count triple))
                      (let [[entity-id attr-id value] triple
                            [label] (get expected attr-id)]
                        (and (uuid? entity-id)
                             label
                             ;; The SQL builder treats this vector as a lookup,
                             ;; even for some blob attributes.
                             (not (and (vector? value) (= 2 (count value))
                                       (uuid? (first value))))
                             (or (not= "id" label)
                                 (= entity-id (if (uuid? value)
                                                value
                                                (uuid-util/parse-uuid value))))))))
               triples)))

(defn null-padding-shape
  "Returns the explicitly enabled measured write shape, or nil for normal planning."
  [attrs app-id triples opts]
  (when-let [{:keys [shape] expected :attrs :as plan} (get null-padding-shapes app-id)]
    ;; Most apps exit before inspecting their attributes or transaction payload.
    (when (and (flags/scoped-write-plan-enabled? app-id shape)
               (or (nil? opts) (map? opts))
               (every? #{:overwrite-t} (keys opts))
               (contains? #{nil false} (:overwrite-t opts))
               (ordinary-triples? triples expected)
               (schema-matches? attrs plan))
      shape)))
