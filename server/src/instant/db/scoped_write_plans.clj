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

(def ^:private analytics-events-plan
  {:shape :5ff-analytics-events
   :etype "analytics_events"
   :attrs {#uuid "90a45a9d-af9d-413e-ac7d-75f5914b7ed6" ["channelId" true false :string false]
           #uuid "79553585-e5ae-4f88-b5f3-0b5a114b0217" ["channelSlug" true false :string false]
           #uuid "a42e7ed1-34f3-4b4e-98e4-23336fea4bc7" ["createdAt" true false :date true]
           #uuid "b75f7a10-7f8b-435c-ac38-128799dcd920" ["eventType" true false :string true]
           #uuid "1397ed3e-7c74-4d08-b82d-a5f677857fed" ["id" false true nil true]
           #uuid "e73bd0ae-128e-41b3-9b57-affd102469c4" ["locale" false false :string false]
           #uuid "f4a3f3db-0761-447d-87ae-7f0c35caf879" ["path" false false :string false]
           #uuid "47be2bf8-9bb7-4110-98eb-53bcf5856f0f" ["userAgent" false false :string false]}})

;; The measured message batch crosses namespaces and includes legacy ident IDs.
;; [forward identity reverse identity value-type cardinality indexed? unique?
;;  checked-data-type required?]
(def ^:private a749-message-schema
  {#uuid "8b4b8b0f-cb67-416a-a77a-b8ee7287c171"
   [[#uuid "8b4b8b0f-cb67-416a-a77a-b8ee7287c171" "checkups" "excludeGroups"]
    [#uuid "ae4e5ba7-17ff-4387-aa24-6dd0a5992cf2" "groups" "excludeCheckups"] :ref :many
    false false nil false]
   #uuid "61a4082b-91ae-4da1-b267-5cec14ea393a"
   [[#uuid "61a4082b-91ae-4da1-b267-5cec14ea393a" "checkups" "group"]
    [#uuid "06b25089-ffa1-43a0-9700-ca8403269eef" "groups" "checkups"] :ref :one
    false false nil false]
   #uuid "9dadedc4-f636-4068-a83a-6e39bb8a11f4"
   [[#uuid "6804fde1-5c73-427a-b7ce-20626d4abea1" "conversations" "account"]
    [#uuid "6c39c79e-a9c2-49b6-b73a-b9bc72f6fdae" "accounts" "conversations"] :ref :one
    false false nil false]
   #uuid "a15d4213-a976-493a-b88b-b88bd6f2f324"
   [[#uuid "f6dae905-b367-43df-918d-fb395af54fe5" "conversations" "groups"]
    [#uuid "92985523-36ec-4180-a64e-408719445beb" "groups" "conversations"] :ref :many
    false false nil false]
   #uuid "e2992693-6d30-4973-9712-4b4c700421ae"
   [[#uuid "faa31f3c-afca-4c59-998a-2dd781e0b622" "conversations" "id"]
    nil :blob :one
    false true nil false]
   #uuid "e040f6e3-3d52-4955-908a-24a9264398db"
   [[#uuid "e040f6e3-3d52-4955-908a-24a9264398db" "conversations" "lastMessageTime"]
    nil :blob :one
    true false :number false]
   #uuid "9dac5562-8a22-41e2-8997-57187662a325"
   [[#uuid "5af9547b-5ed3-46f1-a709-acaef7617426" "conversations" "name"]
    nil :blob :one
    true false :string true]
   #uuid "c4804a8e-db5b-43a9-a651-9ae13856e509"
   [[#uuid "c4804a8e-db5b-43a9-a651-9ae13856e509" "conversations" "participants"]
    nil :blob :one
    false false nil false]
   #uuid "aa0dc0e5-c0d6-42fc-acaa-806cd7afab7d"
   [[#uuid "aa0dc0e5-c0d6-42fc-acaa-806cd7afab7d" "conversations" "participantsText"]
    nil :blob :one
    true false :string false]
   #uuid "c9c41177-4701-4924-9282-846b588bb248"
   [[#uuid "9928e933-7659-49fa-9027-5b5336a1cf92" "groups" "account"]
    [#uuid "a03b33cc-1988-44e9-a1d8-d1c0bed9c921" "accounts" "groups"] :ref :one
    false false nil false]
   #uuid "02ed8782-f835-44d7-b556-057a9eaf461c"
   [[#uuid "fd93350d-d48c-4d96-93c0-fd0c93343515" "groups" "id"]
    nil :blob :one
    false true nil false]
   #uuid "d0d4d481-c271-4948-9e4c-cfec182b06aa"
   [[#uuid "d0d4d481-c271-4948-9e4c-cfec182b06aa" "groups" "lastActivityAt"]
    nil :blob :one
    true false :number false]
   #uuid "561e46a5-66c9-4c25-b3e4-f3430bfc0a5a"
   [[#uuid "8282c58c-5701-4c6f-973e-512ee09a121c" "groups" "name"]
    nil :blob :one
    true false :string true]
   #uuid "5ae7b79f-34f4-428c-a35e-bc30fdbc2c73"
   [[#uuid "2d9f2b1b-cfe3-4460-a0db-b54d01948afc" "messages" "conversation"]
    [#uuid "03b06b9f-888d-47f6-83f6-0bf0a5428667" "conversations" "messages"] :ref :one
    false false nil false]
   #uuid "f3b02095-907b-47d7-8eb7-259afe81e91e"
   [[#uuid "f3b02095-907b-47d7-8eb7-259afe81e91e" "messages" "foreignId"]
    nil :blob :one
    true true :string false]
   #uuid "08c5756a-103a-4631-b3b3-1d9b7310b4fa"
   [[#uuid "b22ed4a4-0226-41b2-8865-67afbe3fb0cc" "messages" "from"]
    nil :blob :one
    true false :string true]
   #uuid "f2749bd0-ead7-4daa-8a98-c0c7104452a2"
   [[#uuid "a3c72196-5b40-49d3-96da-0ca128064110" "messages" "id"]
    nil :blob :one
    false true nil false]
   #uuid "e09e4de3-b305-45b9-b4c3-ab0b918e4c3d"
   [[#uuid "8588c5f4-f6a7-458c-b0f4-c7aa91d456b2" "messages" "text"]
    nil :blob :one
    false false :string true]
   #uuid "e9523b1d-e0c7-4c81-80cf-ba17acc98157"
   [[#uuid "6f449abb-2091-4708-a3ee-f13a066a927c" "messages" "textIndexed"]
    nil :blob :one
    true false :string false]
   #uuid "162c4ef5-7ad6-4219-87f7-2279f9142cfb"
   [[#uuid "79d1570c-3d94-409a-a8f2-7d3a4144820a" "messages" "time"]
    nil :blob :one
    true false :number true]
   #uuid "5d6f52ea-abd0-4cce-b23c-233d394b94dd"
   [[#uuid "5d6f52ea-abd0-4cce-b23c-233d394b94dd" "tokens" "groups"]
    [#uuid "8685ff2f-e8b2-469b-8950-e9ef4a72020c" "groups" "tokens"] :ref :many
    false false nil false]
   #uuid "5605c00b-e7af-41bd-8525-362ae603851c"
   [[#uuid "ad6bdf3e-ce2d-433b-9c2a-ad849e841187" "users" "groups"]
    [#uuid "c1078894-e395-41c5-8de6-cceeefd62f16" "groups" "users"] :ref :many
    false false nil false]})

(def ^:private a749-message-value-kinds
  {#uuid "02ed8782-f835-44d7-b556-057a9eaf461c" :uuid
   #uuid "08c5756a-103a-4631-b3b3-1d9b7310b4fa" :string
   #uuid "162c4ef5-7ad6-4219-87f7-2279f9142cfb" :number
   #uuid "5ae7b79f-34f4-428c-a35e-bc30fdbc2c73" :uuid
   #uuid "a15d4213-a976-493a-b88b-b88bd6f2f324" :uuid
   #uuid "aa0dc0e5-c0d6-42fc-acaa-806cd7afab7d" :string
   #uuid "c4804a8e-db5b-43a9-a651-9ae13856e509" :vector
   #uuid "d0d4d481-c271-4948-9e4c-cfec182b06aa" :number
   #uuid "e040f6e3-3d52-4955-908a-24a9264398db" :number
   #uuid "e09e4de3-b305-45b9-b4c3-ab0b918e4c3d" :string
   #uuid "e2992693-6d30-4973-9712-4b4c700421ae" :uuid
   #uuid "e9523b1d-e0c7-4c81-80cf-ba17acc98157" :string
   #uuid "f2749bd0-ead7-4daa-8a98-c0c7104452a2" :uuid
   #uuid "f3b02095-907b-47d7-8eb7-259afe81e91e" :uuid})

(def ^:private a749-message-entity-shapes
  {{#uuid "02ed8782-f835-44d7-b556-057a9eaf461c" 1
    #uuid "d0d4d481-c271-4948-9e4c-cfec182b06aa" 1} 2
   {#uuid "08c5756a-103a-4631-b3b3-1d9b7310b4fa" 1
    #uuid "162c4ef5-7ad6-4219-87f7-2279f9142cfb" 1
    #uuid "5ae7b79f-34f4-428c-a35e-bc30fdbc2c73" 1
    #uuid "e09e4de3-b305-45b9-b4c3-ab0b918e4c3d" 1
    #uuid "e9523b1d-e0c7-4c81-80cf-ba17acc98157" 1
    #uuid "f2749bd0-ead7-4daa-8a98-c0c7104452a2" 1
    #uuid "f3b02095-907b-47d7-8eb7-259afe81e91e" 1} 1
   {#uuid "a15d4213-a976-493a-b88b-b88bd6f2f324" 2
    #uuid "aa0dc0e5-c0d6-42fc-acaa-806cd7afab7d" 1
    #uuid "c4804a8e-db5b-43a9-a651-9ae13856e509" 1
    #uuid "e040f6e3-3d52-4955-908a-24a9264398db" 1
    #uuid "e2992693-6d30-4973-9712-4b4c700421ae" 1} 1})

(defn- a749-message-schema-matches? [attrs]
  (let [etypes #{"conversations" "groups" "messages"}
        relevant (filter #(or (etypes (get-in % [:forward-identity 1]))
                              (etypes (get-in % [:reverse-identity 1])))
                         attrs)]
    (and (= (count a749-message-schema) (count relevant))
         (= (set (keys a749-message-schema)) (set (map :id relevant)))
         (every? (fn [{:keys [id forward-identity reverse-identity value-type cardinality
                             index? unique? checked-data-type required?
                             indexing? checking-data-type? setting-unique?
                             deletion-marked-at on-delete on-delete-reverse]}]
                   (and (= (get a749-message-schema id)
                           [forward-identity reverse-identity value-type cardinality
                            index? unique? checked-data-type required?])
                        (not indexing?) (not checking-data-type?) (not setting-unique?)
                        (nil? deletion-marked-at) (nil? on-delete) (nil? on-delete-reverse)))
                 relevant))))

(defn- a749-message-value-matches? [attr-id value]
  (case (get a749-message-value-kinds attr-id)
    :uuid (uuid? value)
    :number (number? value)
    :string (and (string? value)
                 (not (and (= 36 (count value)) (uuid-util/parse-uuid value))))
    :vector (and (vector? value)
                 (not (and (= 2 (count value)) (uuid? (first value)))))
    false))

(defn- a749-message-triples? [triples]
  (and (sequential? triples)
       (= 17 (bounded-count 18 triples))
       (every? (fn [triple]
                 (and (sequential? triple)
                      (= 4 (bounded-count 5 triple))
                      (let [[entity attr value step-opts] triple]
                        (and (uuid? entity)
                             (uuid? attr)
                             (nil? step-opts)
                             (a749-message-value-matches? attr value)
                             ;; Only ordinary id triples are eligible.
                             (or (not= "id" (get-in a749-message-schema [attr 0 2]))
                                 (= entity value))))))
               triples)
       (= a749-message-entity-shapes
          (->> triples
               (group-by first)
               vals
               (map #(frequencies (map second %)))
               frequencies))))

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
                      (contains? #{3 4} (count triple))
                      (let [[entity-id attr-id value step-opts] triple
                            [label] (get expected attr-id)]
                        (and (uuid? entity-id)
                             label
                             ;; Transaction normalization includes an options
                             ;; slot even when the caller omitted options.
                             (contains? #{nil {} {:mode :upsert}} step-opts)
                             ;; The SQL builder treats this vector as a lookup,
                             ;; even for some blob attributes.
                             (not (and (vector? value) (= 2 (count value))
                                       (uuid? (first value))))
                             (or (not= "id" label)
                                 (= entity-id (if (uuid? value)
                                                value
                                                (uuid-util/parse-uuid value))))))))
               triples)))

(defn- analytics-events-triples? [triples]
  (and (sequential? triples)
       (= 8 (bounded-count 9 triples))
       (every? (fn [triple]
                 (and (sequential? triple)
                      (= 4 (bounded-count 5 triple))
                      (let [[entity attr value step-opts] triple]
                        (and (uuid? entity)
                             (uuid? attr)
                             (contains? (:attrs analytics-events-plan) attr)
                             (nil? step-opts)
                             (cond
                               (= attr #uuid "1397ed3e-7c74-4d08-b82d-a5f677857fed")
                               (= entity value)

                               (= attr #uuid "90a45a9d-af9d-413e-ac7d-75f5914b7ed6")
                               (uuid? value)

                               :else
                               (and (string? value)
                                    (not (and (= 36 (count value)) (uuid-util/parse-uuid value)))))))))
               triples)
       (= 1 (count (set (map first triples))))
       (= (set (keys (:attrs analytics-events-plan))) (set (map second triples)))))

(defn null-padding-shape
  "Returns the explicitly enabled write shape, or nil for normal planning."
  [attrs app-id triples opts]
  (cond
    ;; Every write shape for an opted-in app uses the primary key for the
    ;; null-padding existence probe. The probe is the same SQL for every
    ;; write, so nothing about the payload or schema needs to match.
    (flags/pkey-null-padding-app? app-id)
    :pkey-null-padding

    (= app-id #uuid "5ff3d22e-183a-4657-bd8f-e86316f983cb")
    (when (and (flags/scoped-write-plan-enabled? app-id (:shape analytics-events-plan))
               (nil? opts)
               (analytics-events-triples? triples)
               (schema-matches? attrs analytics-events-plan))
      (:shape analytics-events-plan))

    (= app-id #uuid "a749930e-6737-4dcf-b039-60c7f5e4e2e6")
    (when (and (flags/scoped-write-plan-enabled? app-id :a749-message-batch)
               (nil? opts)
               (a749-message-triples? triples)
               (a749-message-schema-matches? attrs))
      :a749-message-batch)

    :else
    (when-let [{:keys [shape] expected :attrs :as plan} (get null-padding-shapes app-id)]
      ;; Most apps exit before inspecting their attributes or transaction payload.
      (when (and (flags/scoped-write-plan-enabled? app-id shape)
                 (or (nil? opts) (map? opts))
                 (every? #{:overwrite-t} (keys opts))
                 (contains? #{nil false} (:overwrite-t opts))
                 (ordinary-triples? triples expected)
                 (schema-matches? attrs plan))
        shape))))
