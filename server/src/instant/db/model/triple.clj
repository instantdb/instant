(ns instant.db.model.triple
  (:require
   [clojure.spec.alpha :as s]
   [clojure.string :as str]
   [honey.sql :as hsql]
   [instant.db.model.attr :as attr-model]
   [instant.db.model.triple-cols :as triple-cols-ns]
   [instant.flags :as flags]
   [instant.jdbc.sql :as sql]
   [instant.system-catalog :refer [system-catalog-app-id]]
   [instant.util.crypt :refer [json-null-md5]]
   [instant.util.exception :as ex]
   [instant.util.hsql :as uhsql]
   [instant.util.json :refer [->json <-json]]
   [instant.util.pg-hint-plan :as hints]
   [instant.util.pgtime :as pgtime]
   [instant.util.spec :as uspec]
   [instant.util.string :refer [multiline->single-line]]
   [instant.util.tracer :as tracer]
   [instant.util.uuid :as uuid-util])
  (:import
   (java.time Duration Instant LocalDate LocalDateTime ZoneOffset ZonedDateTime)
   (java.time.format DateTimeFormatter DateTimeFormatterBuilder SignStyle)
   (java.time.temporal ChronoField ChronoUnit)
   (java.util UUID)))

;; (XXX): Currently we allow value to be nil
;; In the future, we may want to _retract_ the triple if the value is nil
(defn value? [x]
  (or (string? x) (uuid? x) (number? x) (nil? x) (boolean? x)
      (sequential? x) (associative? x)
      (instance? java.time.Instant x)))

(s/def ::attr-id uuid?)
(s/def ::entity-id uuid?)

(s/def ::lookup-ref (s/tuple ::attr-id value?))
(s/def ::lookup (s/or :entity-id ::entity-id
                      :lookup-ref ::lookup-ref))

(s/def ::value
  (s/with-gen
    value?
    #(s/gen #{"foo" (UUID/randomUUID)  25 nil true})))

(s/def ::triple (s/cat :e ::lookup :a ::attr-id :v ::value))
(s/def ::index #{:ea :eav :av :ave :vae})
(s/def ::md5 ::uspec/non-blank-string)

(s/def ::enhanced-triple
  (s/keys :req-un [::triple ::index ::md5]))

(defn fetch-lookups->eid [conn app-id lookups]
  (if-not (seq lookups)
    {}
    (let [lookups-set (set lookups)
          triples (sql/execute!
                   ::fetch-lookups->eid
                   conn
                   (hsql/format
                    {:select :*
                     :from :triples
                     :where [:and
                             [:= :app-id app-id]
                             :av
                             (list* :or
                                    (map
                                     (fn [[a v]]
                                       [:and [:= :attr-id a] [:= [:json_null_to_null :value] [:cast (->json v) :jsonb]]])
                                     lookups-set))]}))

          lookups->eid (persistent!
                        (reduce
                         (fn [acc {:keys [entity_id attr_id value]}]
                           (let [uuid-value (uuid-util/parse-uuid value)]
                             (cond-> acc
                               true (assoc! [attr_id value] entity_id)
                               ;; If the value happens to parse as a UUID, then we
                               ;; need to add the uuid version to the map also because
                               ;; transaction/coerce is a little too eager to convert
                               ;; uuids. If we fix that, then we won't need this any more.
                               uuid-value (assoc! [attr_id uuid-value] entity_id))))
                         (transient {})
                         triples))]
      lookups->eid)))

;; ---
;; insert-multi!

(def triple-cols triple-cols-ns/triple-cols)

(defn eid-lookup-ref?
  "Takes the eid part of a triple and returns true if it is a lookup ref ([a v])."
  [e]
  (sequential? e))

(defn value-lookup-ref?
  "Takes the value part of a triple and returns true if it is a lookup ref ([a v])."
  [v]
  (and (vector? v)
       (= (count v) 2)
       (uuid? (first v))))

(defn value-lookupable-sql
  "Returns sql that determines if an attribute supports a lookup-ref in the
   value part of the triple."
  [app-id a]
  [:exists {:select :*
            :from :attrs
            :where [:and
                    [:or
                     [:= :app-id app-id]
                     [:= :app-id system-catalog-app-id]]
                    [:= :id a]
                    [:= :deletion-marked-at nil]
                    [:or
                     [:= :value-type [:inline "ref"]]
                     [:= :label [:inline "id"]]]]}])

(defn insert-attr-inferred-types-cte [app-id attrs triples]
  (let [values (->> (reduce (fn [acc [_e a v]]
                              (if (nil? v)
                                acc
                                (let [attr (attr-model/seek-by-id a attrs)
                                      typ (attr-model/inferred-value-type v)]
                                  (if (contains? (:inferred-types attr) typ)
                                    acc
                                    (update acc
                                            a
                                            (fnil bit-or 0)
                                            (attr-model/type->binary typ))))))
                            {}
                            triples)
                    (map (fn [[id typ]]
                           [id [:cast typ [:bit :32]]])))]
    (when (seq values)
      {:update :attrs
       :set {:inferred-types [:|
                              [:coalesce
                               :attrs.inferred_types
                               [:cast :0 [:bit :32]]]
                              :updates.typ]}
       :from [[{:values values}
               [:updates {:columns [:id :typ]}]]]
       :where [:and
               [:= :attrs.id :updates.id]
               ;; We don't modify the inferred type
               ;; for the system-catalog-app-id because
               ;; we don't want people putting garbage in there
               [:= :attrs.app_id app-id]
               [[:raw "inferred_types is distinct from (
                                              coalesce(inferred_types, cast(0 AS bit(32))) | updates.typ
                                            )"]]]})))

(defn make-required-p [with-hint?]
  (uhsql/preformat
   {:with [[:eid-etypes-cte {:select [[[:unnest :?eids] :entity-id]
                                      [[:unnest :?etypes] :etype]]}]
           ;; populate entities with attrs
           [:eid-attrs {:select-distinct [:entity-id
                                          [:attrs.id :attr-id]
                                          :attrs.etype
                                          :attrs.label
                                          :attrs.is-required]
                        :from :eid-etypes-cte
                        :join [[:attrs] [:and
                                         [:or
                                          [:= :attrs.app-id :?app-id]
                                          [:= :attrs.app-id :?system-catalog-app-id]]
                                         [:= :attrs.etype :eid-etypes-cte.etype]]]}]
           ;; select all triples related to our eids
           [:triples-cte {:select-distinct [:t.entity-id
                                            :t.attr-id
                                            :a.etype]
                          :from [[:triples :t]]
                          :join [[:eid-attrs :a] [:and
                                                  [:= :t.entity-id :a.entity-id]
                                                  [:= :t.attr-id :a.attr-id]]]
                          :where [:and
                                  [:= :app-id :?app-id]
                                  [:not= :value [:cast [:inline "null"] :jsonb]]]}]]
    :select :*
    :from :eid-attrs
    :where [:and
            ;; limit to required attrs
            [:or :eid-attrs.is-required [:= :eid-attrs.label [:inline "id"]]]
            [:in [:composite :entity-id :etype] {:select [:entity-id :etype]
                                                 :from :triples_cte}]
            [:not-in [:composite :entity-id :attr-id] {:select [:entity-id :attr-id]
                                                       :from :triples-cte}]]
    :pg-hints (if with-hint?
                [(hints/index-scan :t :triples_pkey)]
                [])}))

(def required-p-with-hint (make-required-p true))
(def required-p-without-hint (make-required-p false))


(defn validate-required!
  "Given [{:entity_id ..., :attr_id ...} ...] of entity attributes that were
   added or removed during this tx, checks that all affected entities that are still
   alive have all required attributes set"
  [conn attrs app-id eid+attr-ids]
  (let [attrs                (into {} (map #(vector (:id %) %)) attrs)
        etypes-with-required (set
                              (for [[_ attr] attrs
                                    :when (:required? attr)]
                                (-> attr :forward-identity second)))
        eid+etypes           (distinct
                              (for [{:keys [entity_id attr_id]} eid+attr-ids
                                    :let [etype (-> attrs (get attr_id) :forward-identity second)]
                                    :when (etypes-with-required etype)]
                                [entity_id etype]))]
    (when (seq eid+etypes)
      (let [params {:app-id app-id
                    :system-catalog-app-id system-catalog-app-id
                    :eids (with-meta (map first eid+etypes) {:pgtype "uuid[]"})
                    :etypes (with-meta (map second eid+etypes) {:pgtype "text[]"})}
            query (uhsql/formatp (if (flags/toggled? :no-hint-for-validate-required)
                                   required-p-without-hint
                                   required-p-with-hint)
                                 params)
            res (sql/execute! ::validate-required! conn query)]
        (when (seq res)
          (ex/throw+
           {::ex/type    ::ex/validation-failed
            ::ex/message (str/join ". "
                                   (for [[[etype label] records] (group-by (juxt :etype :label) res)]
                                     (if (= 1 (count records))
                                       (str "Missing required attribute `" etype "/" label "`: " (:entity_id (first records)))
                                       (str "Missing required attributes `" etype "/" label "`: "
                                            (str/join ", " (map :entity_id records))))))

            ::ex/hint    {:records res}}))))))

(defn- hsql-attr-id-or-raise [input-id attr-id]
  [:case [:not= nil attr-id]
   attr-id
   :else
   [:cast
    [:cast
     [:raise_exception_message
      [:||
       [:inline "We could not find an attribute with id = '"]
       input-id
       [:inline "'"]]]
     :text]
    :uuid]])

(defn deep-merge-multi! [conn attrs app-id triples]
  (let [input-triples-values
        (->> triples
             (group-by (juxt first second))
             (map-indexed
              (fn [idx [[entity-id attr-id] patches]]
                [idx
                 app-id
                 (if-not (eid-lookup-ref? entity-id)
                   entity-id
                   {:select :entity-id
                    :from :lookup-ref-lookups
                    :where [:and
                            [:= :app-id app-id]
                            [:= :attr-id (first entity-id)]
                            [:= :value [:cast (->json (second entity-id)) :jsonb]]]
                    :limit 1})
                 attr-id
                 (->json (mapv (fn [a] (nth a 2)) patches))])))

        lookup-refs (distinct
                     (keep
                      (fn [[e]]
                        (when (eid-lookup-ref? e)
                          e))
                      triples))

        input-lookup-refs
        (map (fn [[a v]]
               [app-id a (->json v)])
             lookup-refs)

        ;; create data for lookup refs
        enhanced-lookup-refs
        {:select
         [[[:cast :ilr.app_id :uuid] :app-id]
          [[:case [:= [:inline "id"] :a.label]
            [:triples_extract_uuid_value [:cast :ilr.value :jsonb]]
            :else [:gen_random_uuid]]
           :entity-id]
          [(hsql-attr-id-or-raise :ilr.attr-id :a.id)
           :attr-id]
          [[:cast :ilr.value :jsonb] :value]
          [[:md5 :ilr.value] :value-md5]
          [[:case [:= :a.cardinality [:inline "one"]] true :else false]
           :ea]
          [[:case [:= :a.value-type [:inline "ref"]] true :else false]
           :eav]
          [[:case :a.is-unique true :else [[:raise_exception_message [:inline "attribute is not unique"]]]] :av]
          [[:case :a.is-indexed true :else false] :ave]
          [[:case [:= :a.value-type [:inline "ref"]] true :else false]
           :vae]
          [:a.checked_data_type :checked-data-type]]
         :from [[:input-lookup-refs :ilr]]
         :left-join [[:attrs :a] [:and
                                  :a.is-unique
                                  [:or
                                   [:= :a.app-id [:cast :ilr.app-id :uuid]]
                                   [:= :a.app-id system-catalog-app-id]]
                                  [:= :a.id [:cast :ilr.attr-id :uuid]]
                                  [:= nil :a.deletion-marked-at]]]}

        ;; insert lookup refs
        lookup-ref-inserts
        {:insert-into [[:triples triple-cols]
                       {:select triple-cols
                        :from :enhanced-lookup-refs
                        :order-by [:app-id :entity-id :attr-id :value-md5]}]
         :on-conflict [:app-id :attr-id [:json_null_to_null :value] {:where :av}]
         :do-nothing true
         :returning :*}

        lookup-ref-lookups
        {:union-all [{:select :*
                      :from :lookup-ref-inserts}
                     {:select :*
                      :from :triples
                      :where [:and
                              [:= :app-id app-id]
                              (list* :or (for [[a v] lookup-refs]
                                           [:and
                                            :av
                                            [:= :attr-id a]
                                            [:= [:json_null_to_null :value] [:cast (->json v) :jsonb]]]))]}]}

        applied-triples
        {:select [:it.idx :it.app-id :it.entity-id :it.attr-id
                  [[:jsonb_deep_merge_many [:cast :t.value :jsonb] [:cast :it.value :jsonb]] :value]]
         :from [[:input-triples :it]]
         :left-join [[:triples :t]
                     [:and
                      [:= :t.app-id :it.app-id]
                      [:= :t.entity-id :it.entity-id]
                      [:= :t.attr-id :it.attr-id]]]}

        enhanced-triples
        {:select
         [[:at.idx :idx]
          [:at.app_id :app-id]
          [:at.entity-id :entity-id]
          [(hsql-attr-id-or-raise :at.attr-id :a.id)
           :attr-id]
          [[:cast :at.value :jsonb] :value]
          [[:md5 [:cast :at.value :text]] :value-md5]
          [[:case [:= :a.cardinality [:inline "one"]] true :else false]
           :ea]
          [[:case [:= :a.value-type [:inline "ref"]]
            [:raise_exception_message "merge operation is not supported for links"]
            :else false]
           :eav]
          [[:case :a.is-unique true :else false] :av]
          [[:case :a.is-indexed true :else false] :ave]
          [[:case [:= :a.value-type [:inline "ref"]] true :else false]
           :vae]
          [:a.checked_data_type :checked-data-type]]
         :from [[:applied-triples :at]]
         :left-join [[:attrs :a] [:and
                                  [:or
                                   [:= :a.app-id :at.app-id]
                                   [:= :a.app-id system-catalog-app-id]]
                                  [:= :a.id :at.attr-id]
                                  [:= :a.deletion-marked-at nil]]]}

        ea-index-inserts
        {:insert-into [[[:triples :t] triple-cols]
                       {:select triple-cols
                        :from :enhanced-triples
                        :order-by [:app-id :entity-id :attr-id :value-md5]}]
         :on-conflict [:app-id :entity-id :attr-id {:where [:= :ea true]}]
         :do-update-set {:value :excluded.value
                         :value-md5 :excluded.value-md5}
         :returning [:entity-id :attr-id]}

        q {:with (concat
                  (when (seq lookup-refs)
                    [[['input-lookup-refs {:columns ['app-id 'attr-id 'value]}]
                      {:values input-lookup-refs}]
                     ['enhanced-lookup-refs enhanced-lookup-refs]
                     ['lookup-ref-inserts lookup-ref-inserts]
                     ['lookup-ref-lookups lookup-ref-lookups]])
                  [[['input-triples {:columns ['idx 'app-id 'entity-id 'attr-id 'value]}]
                    {:values input-triples-values}
                    :materialized]
                   ['applied-triples applied-triples]
                   [:enhanced-triples enhanced-triples]
                   [:ea-index-inserts ea-index-inserts]]
                  (when-let [attr-inferred-types (insert-attr-inferred-types-cte app-id attrs triples)]
                    [[:attr-inferred-types attr-inferred-types]]))
           :select ['entity-id 'attr-id]
           :from :ea-index-inserts}]
    (sql/execute! ::deep-merge-mult! conn (hsql/format q))))

(def value-lookup-error-prefix "missing-lookup-value")

(defn insert-multi!
  "Given a set of raw triples, we enhance each triple with metadata based on
   the triple's underlying attr and then insert these enhanced triples into
   postgres.

   We use :ea index to distinguish between object triples and reference triples.
   We do this because we have separate logic for detecting conflicts.

   Object triples should only have one row per entity attribute pair. We
   consider it a conflict when trying to insert a new row for an existing
   entity attribute pair. In this case we overwrite the previous triple
   with the new data. So if [1 user/favoriteColor \"red\"] already exists,
   inserting [1 user/favoriteColor \"blue\"] will result in an update.

   Reference triples can have multiple rows for entity attribute pairs. So
   there is no conflict when trying to add new rows for an existing pair.
   However, we don't want duplicate references so we consider it a conflict
   if the value is the same. In this case we simply do nothing and ignore the
   write. So if [1 user/pet 2] already exists, inserting [1 user/pet 3] will
   not trigger a conflict, but trying to insert [1 user/pet 2] will no-op"
  [conn attrs app-id triples]
  (let [lookup-refs
        (distinct
         (keep (fn [[e]]
                 (when (eid-lookup-ref? e)
                   e))
               triples))

        input-lookup-refs
        (map (fn [[a v]]
               [app-id a (->json v)])
             lookup-refs)

        ;; create data for lookup refs
        enhanced-lookup-refs
        {:select
         [[[:cast :ilr.app_id :uuid] :app-id]
          [[:case [:= [:inline "id"] :a.label]
            [:triples_extract_uuid_value [:cast :ilr.value :jsonb]]
            :else [:gen_random_uuid]]
           :entity-id]
          [(hsql-attr-id-or-raise :ilr.attr-id :a.id)
           :attr-id]
          [[:cast :ilr.value :jsonb] :value]
          [[:md5 :ilr.value] :value-md5]
          [[:case [:= :a.cardinality [:inline "one"]] true :else false] :ea]
          [[:case [:= :a.value-type [:inline "ref"]] true :else false] :eav]
          [[:case :a.is-unique true :else [[:raise_exception_message [:inline "attribute is not unique"]]]] :av]
          [[:case :a.is-indexed true :else false] :ave]
          [[:case [:= :a.value-type [:inline "ref"]] true :else false] :vae]
          [:a.checked_data_type :checked-data-type]]
         :from [[:input-lookup-refs :ilr]]
         :left-join [[:attrs :a] [:and
                                  :a.is-unique
                                  [:or
                                   [:= :a.app-id [:cast :ilr.app-id :uuid]]
                                   [:= :a.app-id system-catalog-app-id]]
                                  [:= :a.id [:cast :ilr.attr-id :uuid]]
                                  [:= nil :a.deletion-marked-at]]]}

        ;; insert lookup refs
        lookup-ref-inserts
        {:insert-into [[:triples triple-cols]
                       {:select triple-cols
                        :from :enhanced-lookup-refs
                        ;; Filter out the lookups that we know already exist
                        ;; so we can avoid unnecessary writes
                        :where [:not [:exists {:select 1
                                               :from [[:triples :t]]
                                               :where [:and
                                                       [:= :t.app_id :enhanced-lookup-refs.app_id]
                                                       [:= :t.attr_id :enhanced-lookup-refs.attr_id]
                                                       :t.av
                                                       [:= [:json_null_to_null :t.value] :enhanced-lookup-refs.value]]}]]
                        :order-by [:app-id :entity-id :attr-id :value-md5]}]
         :on-conflict [:app-id :attr-id [:json_null_to_null :value] {:where :av}]
         ;; Do a dummy write so that this triple becomes visible to the transaction
         ;; If multiple txes were executing simultaneously, we might not see it
         :do-update-set {:app-id :excluded.app-id}
         :returning :*}

        ;; collect lookup ref entities
        ;; if we do this inline instead of creating a CTE, the lookup
        ;; ref entity might get created anew when it's updated (e.g.
        ;; users[lookup({handle: 'me'})].update({handle: 'mee'}) will
        ;; generate a new triple with value = 'me'
        lookup-ref-lookups
        {:union-all [{:select :*
                      :from :lookup-ref-inserts}
                     {:select :*
                      :from :triples
                      :where [:and
                              [:= :app-id app-id]
                              (list* :or (for [[a v] lookup-refs]
                                           [:and
                                            :av
                                            [:= :attr-id a]
                                            [:=
                                             ;; Make sure it can lookup just from the av_index
                                             [:json_null_to_null :value]
                                             [:cast (->json v) :jsonb]]]))]}]}

        input-triples
        (for [[idx [e a v]] (map vector (range) triples)
              :let [eid (if-not (eid-lookup-ref? e)
                          e
                          {:select :entity-id
                           :from :lookup-ref-lookups
                           :where [:and
                                   [:= :app-id app-id]
                                   [:= :attr-id (first e)]
                                   [:= :value [:cast (->json (second e)) :jsonb]]]
                           :limit 1})
                    value (if-not (value-lookup-ref? v)
                            (->json v)
                            [[[:case (value-lookupable-sql app-id a)
                               [:coalesce
                                {:select [[[:cast [:to_jsonb :entity-id] :text]]]
                                 :from (if (seq lookup-refs)
                                         [[{:union-all [{:select :entity-id
                                                         :from :lookup-ref-lookups
                                                         :where [:and
                                                                 [:= :app-id app-id]
                                                                 [:= :attr-id (first v)]
                                                                 [:= :value [:cast (->json (second v)) :jsonb]]]}
                                                        {:select :entity-id
                                                         :from :triples
                                                         :where [:and
                                                                 :av
                                                                 [:= :app-id app-id]
                                                                 [:= :attr-id (first v)]
                                                                 [:=
                                                                  ;; Make sure it can lookup just from the av_index
                                                                  [:json_null_to_null :value]
                                                                  [:cast (->json (second v)) :jsonb]]]}]}
                                           :lookups]]
                                         [[{:select :entity-id
                                            :from :triples
                                            :where [:and
                                                    :av
                                                    [:= :app-id app-id]
                                                    [:= :attr-id (first v)]
                                                    [:=
                                                     ;; Make sure it can lookup just from the av_index
                                                     [:json_null_to_null :value]
                                                     [:cast (->json (second v)) :jsonb]]]}
                                           :lookups]])
                                 :limit 1}
                                [:cast [:raise_exception_message [:|| [:inline value-lookup-error-prefix] (->json v)]] :text]]
                               :else (->json v)]]])]]
          [idx app-id eid a value])

        enhanced-triples
        {:select
         [[:it.idx :idx]
          [[:cast :it.app_id :uuid] :app-id]
          [[:cast :it.entity-id :uuid] :entity-id]
          [(hsql-attr-id-or-raise :it.attr-id :a.id)
           :attr-id]
          [[:cast :it.value :jsonb] :value]
          [[:md5 :it.value] :value-md5]
          [[:case [:= :a.cardinality [:inline "one"]] true :else false] :ea]
          [[:case [:= :a.value-type [:inline "ref"]] true :else false] :eav]
          [[:case :a.is-unique true :else false] :av]
          [[:case :a.is-indexed true :else false] :ave]
          [[:case [:= :a.value-type [:inline "ref"]] true :else false] :vae]
          [:a.checked_data_type :checked-data-type]]
         :from [[:input-triples :it]]
         :left-join [[:attrs :a] [:and
                                  [:or
                                   [:= :a.app-id [:cast :it.app-id :uuid]]
                                   [:= :a.app-id system-catalog-app-id]]
                                  [:= :a.id [:cast :it.attr-id :uuid]]
                                  [:= nil :a.deletion-marked-at]]]}

        ea-triples-distinct
        {:select-distinct-on [[:entity-id :attr-id] :*]
         :from :enhanced-triples
         :where [:= :ea true]
         :order-by [[:entity-id :desc] [:attr-id :desc] [:idx :desc]]}

        remaining-triples
        {:select :* :from :enhanced-triples :where [:not :ea]}

        ea-index-inserts
        {:insert-into [[:triples triple-cols]
                       {:select triple-cols
                        :from :ea-triples-distinct
                        :order-by [:app-id :entity-id :attr-id :value-md5]}]
         :on-conflict [:app-id :entity-id :attr-id {:where [:= :ea true]}]
         :do-update-set {:value :excluded.value
                         :value-md5 :excluded.value-md5}
         :returning :*}

        remaining-inserts
        {:insert-into [[:triples triple-cols]
                       {:select triple-cols
                        :from :remaining-triples
                        :order-by [:app-id :entity-id :attr-id :value-md5]}]
         :on-conflict [:app-id :entity-id :attr-id :value-md5]
         :do-nothing true
         :returning :*}

        indexed-null-triples
        {:select [[:needs-null-attr.app-id :app-id]
                  [:new-entities.entity-id :entity-id]
                  [:needs-null-attr.id :attr-id]
                  [[:cast "null" :jsonb] :value]
                  [[:inline json-null-md5] :value-md5]
                  [[:= :needs-null-attr.cardinality [:inline "one"]] :ea]
                  [[:= :needs-null-attr.value_type [:inline "ref"]] :eav]
                  [:needs-null-attr.is_unique :av]
                  [:needs-null-attr.is_indexed :ave]
                  [[:= :needs-null-attr.value_type [:inline "ref"]] :vae]
                  [:needs-null-attr.checked-data-type :checked-data-type]]
         :from [[{:union (into [{:select [:entity-id :attr_id]
                                 :from :ea-index-inserts}
                                {:select [:entity-id :attr_id]
                                 :from :remaining-inserts}]
                               (when (seq lookup-refs)
                                 [{:select [:entity-id :attr_id]
                                   :from :lookup-ref-inserts}]))}
                 :new-entities]]
         :join [[:attrs :updated-attr]
                [:= :updated-attr.id :new-entities.attr-id]

                ;; We want to run this when we create new entities.
                ;; If a new entity is created, then an id is
                ;; created, so we can filter to just the id attrs
                [:idents :id-ident]
                [:and
                 [:= :id-ident.id :updated-attr.forward-ident]
                 [:= :id-ident.label "id"]]

                [:attrs :needs-null-attr]
                [:and
                 :needs-null-attr.is_indexed
                 [:= :needs-null-attr.value_type [:inline "blob"]]
                 [:= :needs-null-attr.app_id app-id]
                 [:= :id-ident.etype {:select :etype
                                      :from :idents
                                      :where [:= :idents.id :needs-null-attr.forward-ident]}]
                 ;; No existing triple for this attr
                 [:not [:exists {:select :1
                                 :from :triples
                                 :where [:and
                                         :triples.ave
                                         [:= :triples.app-id app-id]
                                         [:= :triples.attr-id :needs-null-attr.id]
                                         [:= :triples.entity-id :new-entities.entity-id]]}]]]]
         ;; Make sure we didn't insert a null value
         ;; for the attr if this transaction is
         ;; inserting a value for the attr
         :where (list*
                 :and
                 [:not
                  [:exists
                   {:select :*
                    :from :ea-index-inserts
                    :where [:and
                            [:= :ea-index-inserts.entity-id :new-entities.entity-id]
                            [:= :ea-index-inserts.attr-id :needs-null-attr.id]]}]]
                 [:not
                  [:exists
                   {:select :*
                    :from :remaining-inserts
                    :where [:and
                            [:= :remaining-inserts.entity-id :new-entities.entity-id]
                            [:= :remaining-inserts.attr-id :needs-null-attr.id]]}]]
                 (when (seq lookup-refs)
                   [[:not
                     [:exists
                      {:select :*
                       :from :lookup-ref-inserts
                       :where [:and
                               [:= :lookup-ref-inserts.entity-id :new-entities.entity-id]
                               [:= :lookup-ref-inserts.attr-id :needs-null-attr.id]]}]]]))}

        indexed-null-inserts
        {:insert-into [[:triples triple-cols]
                       {:select triple-cols
                        :from :indexed-null-triples
                        :order-by [:app-id :entity-id :attr-id :value-md5]}]
         :on-conflict [:app-id :entity-id :attr-id :value-md5]
         :do-nothing true
         :returning [:entity-id :attr-id]}

        all-inserts
        {:union-all
         [{:select [:entity-id :attr-id] :from :ea-index-inserts}
          {:select [:entity-id :attr-id] :from :remaining-inserts}
          {:select [:entity-id :attr-id] :from :indexed-null-inserts}]}

        query {:with (concat
                      (when (seq lookup-refs)
                        [[['input-lookup-refs {:columns ['app-id 'attr-id 'value]}] {:values input-lookup-refs}]
                         ['enhanced-lookup-refs enhanced-lookup-refs]
                         ['lookup-ref-inserts   lookup-ref-inserts]
                         ['lookup-ref-lookups   lookup-ref-lookups]])
                      [[['input-triples {:columns ['idx 'app-id 'entity-id 'attr-id 'value]}] {:values input-triples}]
                       ['enhanced-triples     enhanced-triples]
                       ['ea-triples-distinct  ea-triples-distinct]
                       ['remaining-triples    remaining-triples]
                       ['ea-index-inserts     ea-index-inserts]
                       ['remaining-inserts    remaining-inserts]
                       ['indexed-null-triples indexed-null-triples]
                       ['indexed-null-inserts indexed-null-inserts]]
                      (when-some [attr-inferred-types (insert-attr-inferred-types-cte app-id attrs triples)]
                        [['attr-inferred-types attr-inferred-types]])
                      [['all-inserts all-inserts]])

               :from 'all-inserts
               :select ['entity-id 'attr-id]}]

    (try
      (sql/do-execute! ::insert-multi! conn (hsql/format query))
      (catch Exception e
        (let [pg-server-message (-> e
                                    ex-data
                                    ::ex/pg-error-data
                                    :server-message)]
          (cond
            (and (seq lookup-refs)
                 (= pg-server-message "ON CONFLICT DO UPDATE command cannot affect row a second time"))
            ;; We may be able to avoid this with `merge`, but we'd need
            ;; to upgrade postgres to version 17
            ;; https://www.postgresql.org/docs/current/sql-merge.html
            (ex/throw-validation-err!
             :lookup
             lookup-refs
             [{:message (multiline->single-line
                         "Updates with lookups can only update
                             the lookup attribute if an entity with
                             the unique attribute value already exists.")}])

            (and pg-server-message
                 (str/starts-with? pg-server-message value-lookup-error-prefix))
            (let [[aid value] (<-json (str/trim (subs pg-server-message (count value-lookup-error-prefix))))
                  attr (some-> aid
                               (uuid-util/coerce)
                               (attr-model/seek-by-id attrs))]
              (ex/throw-validation-err!
               :lookup
               {:attribute-id aid
                :namespace (attr-model/fwd-etype attr)
                :label (attr-model/fwd-label attr)
                :value value}
               [{:message "The entity for the lookup does not exist."}]))

            :else
            (throw e)))))))

(defn delete-entity-multi!
  "Deleting an entity does two things:

   1. Deletes all object triples and eav references:
      [id _ _]

   2. Deletes all reference triples where this entity is the value:
      [_ _ id]"
  [conn app-id id+etypes]
  (let [query (sql/format
               "WITH

                id_etypes AS (
                  SELECT
                    cast(elem ->> 0 AS uuid) AS entity_id,
                    cast(elem ->> 1 AS text) AS etype
                  FROM
                    jsonb_array_elements(cast(?id+etypes AS jsonb)) AS elem
                ),

                forward_attrs AS (
                  SELECT
                    triples.ctid
                  FROM
                    triples
                    JOIN id_etypes ON triples.entity_id = id_etypes.entity_id
                    JOIN attrs ON triples.attr_id = attrs.id
                  WHERE triples.app_id = ?app-id
                  AND attrs.etype = id_etypes.etype
                ),

                reverse_attrs AS (
                  SELECT
                    triples.ctid
                  FROM
                    triples
                    JOIN id_etypes ON json_uuid_to_uuid(triples.value) = id_etypes.entity_id
                    JOIN attrs ON triples.attr_id = attrs.id
                  WHERE
                    triples.vae
                    AND triples.app_id = ?app-id
                    AND attrs.reverse_etype = id_etypes.etype
                )

                DELETE FROM triples

                WHERE ctid IN (
                  (SELECT * FROM forward_attrs)
                  UNION
                  (SELECT * FROM reverse_attrs)
                )

                RETURNING
                  entity_id,
                  attr_id,
                  value,
                  created_at"
               {"?id+etypes" (->json id+etypes)
                "?app-id" app-id})]

    (sql/execute! ::delete-entity-multi! conn query)))

;; n.b. if we ever use `:retract-triple` for blob attrs (it's currently
;;      just links), we'll need to add code in `delete-multi!` to
;;      insert nulls for indexed blob attrs
(defn delete-multi!
  "Deletes triples from postgres.

   We enhance given triples with their hashed values to assist postgres in
   quickly finding which triples to delete"
  [conn app-id triples]
  (let [input-triples
        (mapv
         (fn [[e a v]]
           (let [e' (if (eid-lookup-ref? e)
                      {:select :entity-id
                       :from :triples
                       :where [:and
                               [:= :app-id app-id]
                               [:= :attr-id (first e)]
                               [:= :value [:cast (->json (second e)) :jsonb]]]}
                      e)
                 v' (if-not (value-lookup-ref? v)
                      (->json v)
                      [[[:case (value-lookupable-sql app-id a)
                         {:select [[[:cast [:to_jsonb :entity-id] :text]]]
                          :from [[{:select :entity-id
                                   :from :triples
                                   :where [:and
                                           [:= :app-id app-id]
                                           [:= :attr-id (first v)]
                                           [:= :value [:cast (->json (second v)) :jsonb]]]}
                                  :lookups]]
                          :limit 1}
                         :else (->json v)]]])]
             [app-id e' a v']))
         triples)

        enhanced-triples
        {:select [:app-id
                  :entity-id
                  :attr-id
                  [[:md5 :value] :value-md5]]
         :from :input-triples}

        query
        {:with [[[:input-triples {:columns [:app-id :entity-id :attr-id :value]}]
                 {:values input-triples}]
                [:enhanced-triples enhanced-triples]]
         :delete-from :triples
         :where [:in
                 [:composite :app-id :entity-id :attr-id :value-md5]
                 {:select :* :from :enhanced-triples}]
         :returning [:entity-id :attr-id]}]
    (sql/execute! ::delete-multi! conn (hsql/format query))))

;; ---
;; fetch

(defn- row->enhanced-triple
  "Marshal triples from postgres into clj representation"
  [{:keys [entity_id attr_id
           value value_md5
           ea eav av ave vae
           checked_data_type]}]
  (cond-> {:triple [entity_id attr_id
                    (if eav
                      (UUID/fromString value)
                      value)]
           :md5 value_md5
           :index (->> [[ea :ea] [eav :eav] [av :av] [ave :ave] [vae :vae]]
                       (filter first)
                       (map second)
                       set)}
    checked_data_type (assoc :checked-data-type checked_data_type)))

(defn fetch
  "Fetches triples from postgres by app-id and optional sql statements and
   returns them as clj representations"
  ([conn app-id] (fetch conn app-id []))
  ([conn app-id stmts] (fetch conn app-id stmts {}))
  ([conn app-id stmts {:keys [include-soft-deleted?]}]
   (map row->enhanced-triple
        (sql/select
         ::fetch
         conn
         (hsql/format
          {:select
           [:triples.*]
           :from :triples
           :join [[:attrs :a] [:and
                               [:= :a.app-id [:any [:array [:triples.app-id
                                                            system-catalog-app-id]]]]
                               [:= :a.id :triples.attr_id]]]
           :where
           (concat [:and
                    [:= :triples.app-id app-id]]
                   (when-not include-soft-deleted?
                     [[:= :a.deletion-marked-at nil]])
                   stmts)})))))

;; Migration for inferred types
;; ----------------------------

(defn update-attr-inferred-types [conn-pool rows]
  (tracer/with-span! {:name "populate-inferrred-types/update-attr-inferred-types"
                      :attributes {:row-count (count rows)}}
    (let [values (->> (reduce (fn [acc {:strs [app_id attr_id value]}]
                                (if (nil? value)
                                  acc
                                  (update acc
                                          [app_id attr_id]
                                          (fnil bit-or 0)
                                          (-> value
                                              attr-model/inferred-value-type
                                              attr-model/type->binary))))
                              {}
                              rows)
                      (map (fn [[[app_id id] typ]]
                             [app_id id [:cast typ [:bit :32]]])))]
      (when (seq values)
        (let [res (sql/do-execute! conn-pool
                                   (hsql/format
                                    {:update :attrs
                                     :set {:inferred-types [:|
                                                            [:coalesce
                                                             :attrs.inferred_types
                                                             [:cast :0 [:bit :32]]]
                                                            :updates.typ]}
                                     :from [[{:values values}
                                             [:updates {:columns [:app-id :id :typ]}]]]
                                     :where [:and
                                             [:= :attrs.id :updates.id]
                                             [:= :attrs.app_id :updates.app-id]]}))]
          (tracer/add-data! {:attributes {:update-count (-> res first :next.jdbc/update-count)}}))))))

(defn populate-inferred-types [conn-pool]
  (tracer/with-span! {:name "populate-inferrred-types/process"}
    (let [config-key "inferred-types-migration-status"
          limit 10000
          {:keys [v]} (sql/select-one conn-pool ["select v from config
                                                 where k = ?"
                                                 config-key])
          row-count (atom 0)]
      (if (get v "completed")
        (tracer/record-info! {:name "populated-inferred-types/completed"})
        (loop [{:strs [app_id entity_id attr_id value_md5]} v
               i 0]
          (tracer/record-info! {:name "populate-inferred-types/loop"
                                :attributes {:count @row-count
                                             :loops i}})
          (let [rows (sql/select-string-keys
                      conn-pool
                      (hsql/format (merge {:select [:app_id
                                                    :entity_id
                                                    :attr_id
                                                    :value_md5
                                                    :value]
                                           :from :triples
                                           :limit limit
                                           :order-by [[:app_id :asc]
                                                      [:entity_id :asc]
                                                      [:attr_id :asc]
                                                      [:value_md5 :asc]]}
                                          (when app_id
                                            {:where [:or
                                                     [:and
                                                      [:= :app_id [:cast app_id :uuid]]
                                                      [:= :entity_id [:cast entity_id :uuid]]
                                                      [:= :attr_id [:cast attr_id :uuid]]
                                                      [:> :value_md5 [:cast value_md5 :text]]]
                                                     [:and
                                                      [:= :app_id [:cast app_id :uuid]]
                                                      [:= :entity_id [:cast entity_id :uuid]]
                                                      [:> :attr_id [:cast attr_id :uuid]]]
                                                     [:and
                                                      [:= :app_id [:cast app_id :uuid]]
                                                      [:> :entity_id [:cast entity_id :uuid]]]
                                                     [:> :app_id [:cast app_id :uuid]]]}))))]
            (swap! row-count + (count rows))
            (update-attr-inferred-types conn-pool rows)
            (let [last-row (last rows)
                  new-config (if last-row
                               (-> last-row
                                   (select-keys ["app_id"
                                                 "entity_id"
                                                 "attr_id"
                                                 "value_md5"])
                                   (assoc "completed" false))
                               {"completed" true})]
              (sql/execute! conn-pool
                            ["insert into config (k, v) values (?, ?) on conflict (k) do update set v = ?"
                             config-key new-config new-config])
              (when last-row
                (recur last-row
                       (inc i)))))))
      (tracer/add-data! {:attributes {:total-count @row-count}})
      {:row-count @row-count})))

(defn zoned-date-time-str->instant
  ([s] (.toInstant (ZonedDateTime/parse s)))
  ([formatter s] (.toInstant (ZonedDateTime/parse s formatter))))

(defn local-date-time-str->instant
  ([s]
   (-> (LocalDateTime/parse s)
       (.atZone ZoneOffset/UTC)
       (.toInstant)))
  ([formatter s]
   (-> (LocalDateTime/parse s formatter)
       (.atZone ZoneOffset/UTC)
       (.toInstant))))

(defn local-date-str->instant
  ([s]
   (-> (LocalDate/parse s)
       (.atStartOfDay)
       (.toInstant ZoneOffset/UTC)))
  ([formatter s]
   (-> (LocalDate/parse s formatter)
       (.atStartOfDay)
       (.toInstant ZoneOffset/UTC))))

(defn special-str->instant
  "Parses the special values
   https://www.postgresql.org/docs/17/datatype-datetime.html#DATATYPE-DATETIME-SPECIAL-VALUES"
  [s db-timestamp]
  (let [^Instant now (or db-timestamp (Instant/now))]
    (case s
      "epoch" (Instant/ofEpochMilli 0)
      ;; https://github.com/pgjdbc/pgjdbc/blob/82d480fdb247bd5da7dcea23bd261dc32b6e8217/pgjdbc/src/main/java/org/postgresql/PGStatement.java#L21
      "infinity" (Instant/ofEpochMilli 9223372036825200000)
      "-infinity" (Instant/ofEpochMilli -9223372036832400000)
      "now" now
      "today" (.truncatedTo now ChronoUnit/DAYS)
      "tomorrow" (-> now
                     (.plus (Duration/ofDays 1))
                     (.truncatedTo ChronoUnit/DAYS))
      "yesterday" (-> now
                      (.plus (Duration/ofDays -1))
                      (.truncatedTo ChronoUnit/DAYS)))))

;; Docs on DateTimeFormatterBuilder
;; https://docs.oracle.com/en/java/javase/24/docs/api/java.base/java/time/format/DateTimeFormatterBuilder.html

(defn append-year ^DateTimeFormatterBuilder [^DateTimeFormatterBuilder builder]
  (.appendValue builder ChronoField/YEAR 1 19 SignStyle/NORMAL))

(def optional-nano-or-milli
  (let [builder (DateTimeFormatterBuilder.)]
    (.appendOptional builder
                     (.. (DateTimeFormatterBuilder.)
                         (appendFraction ChronoField/NANO_OF_SECOND 0 9 true)
                         (toFormatter)))
    (.appendOptional builder
                     (.. (DateTimeFormatterBuilder.)
                         (appendFraction ChronoField/MILLI_OF_SECOND 0 3 true)
                         (toFormatter)))

    (.toFormatter builder)))

;; Formatters without time zone
(def local-date-time-formatters
  [(-> (DateTimeFormatterBuilder.)
       (append-year)
       (.appendPattern "-MM-dd HH:mm:ss")
       (.append optional-nano-or-milli)
       (.toFormatter))
   DateTimeFormatter/RFC_1123_DATE_TIME
   (DateTimeFormatter/ofPattern "M/d/yyyy, h:mm:ss a")
   (DateTimeFormatter/ofPattern "yyyy-MM-dd HH:mm")])

;; Formatters with time zone
(def zoned-date-time-formatters
  [(-> (DateTimeFormatterBuilder.)
       (.appendPattern "EEE MMM dd ")
       (.appendValue ChronoField/YEAR 1 19 SignStyle/NORMAL)
       (.appendPattern " HH:mm:ss zZ")
       (.toFormatter))
   ;; 2025-03-01T16:08:53+0000
   (-> (DateTimeFormatterBuilder.)
       (.appendValue ChronoField/YEAR 1 19 SignStyle/NORMAL)
       (.appendPattern "-M-dd'T'HH:mm:ss")
       (.append optional-nano-or-milli)
       (.appendPattern "[Z][X]")
       (.toFormatter))
   (-> (DateTimeFormatterBuilder.)
       (.appendValue ChronoField/YEAR 1 19 SignStyle/NORMAL)
       (.appendPattern "-M-d'T'HH:mm:ss.SSSX")
       (.toFormatter))
   (-> (DateTimeFormatterBuilder.)
       (.appendValue ChronoField/YEAR 1 19 SignStyle/NORMAL)
       (.appendPattern "-M-dd HH:mm:ss")
       (.append optional-nano-or-milli)
       (.appendOffset "+HHmm" "Z")
       (.toFormatter))
   (-> (DateTimeFormatterBuilder.)
       (.appendValue ChronoField/YEAR 1 19 SignStyle/NORMAL)
       (.appendPattern "-M-dd'T'HH:mm:ss")
       (.append pgtime/tz-abbrev-formatter)
       (.toFormatter))])

;; Formatters with just the date
(def date-formatters
  [(.. (DateTimeFormatterBuilder.)
       (appendPattern "EEE MMM dd ")
       (appendValue ChronoField/YEAR 1 19 SignStyle/NORMAL)
       (toFormatter))
   (.. (DateTimeFormatterBuilder.)
       (appendPattern "MM-dd-")
       (appendValue ChronoField/YEAR 1 19 SignStyle/NORMAL)
       (toFormatter))
   (.. (DateTimeFormatterBuilder.)
       (appendValue ChronoField/YEAR 1 19 SignStyle/NORMAL)
       (appendPattern "-MM-dd")
       (toFormatter))
   (.. (DateTimeFormatterBuilder.)
       (appendPattern "M/d/")
       (appendValue ChronoField/YEAR 1 19 SignStyle/NORMAL)
       (toFormatter))])

;; If you update anything here, be sure to also update the client:
;; client/packages/core/src/utils/dates.ts
(def date-parsers (concat [zoned-date-time-str->instant
                           local-date-time-str->instant
                           local-date-str->instant]
                          (mapv (fn [formatter]
                                  (with-meta
                                    (partial local-date-time-str->instant formatter)
                                    {:formatter formatter}))
                                local-date-time-formatters)
                          (mapv (fn [formatter]
                                  (with-meta
                                    (partial zoned-date-time-str->instant formatter)
                                    {:formatter formatter}))
                                zoned-date-time-formatters)
                          (mapv (fn [formatter]
                                  (with-meta
                                    (partial local-date-str->instant formatter)
                                    {:formatter formatter}))
                                date-formatters)))

(defn try-parse-date-string [parser s]
  (try
    (parser s)
    (catch Exception _e
      nil)))

(defn date-str->instant [s]
  (loop [parsers date-parsers]
    (when-let [parser (first parsers)]
      (if-let [instant (try-parse-date-string parser s)]
        instant
        (recur (rest parsers))))))

(defn json-str->instant [maybe-json]
  (when-let [s (try
                 (<-json maybe-json)
                 (catch Throwable _e
                   nil))]
    (date-str->instant s)))

(defn parse-date-value
  (^Instant [x] (parse-date-value x nil))
  (^Instant [x db-timestamp]
   (cond (string? x)
         (or (date-str->instant x)
             (json-str->instant x)
             (date-str->instant (str/trim x))
             (try (special-str->instant x db-timestamp)
                  (catch Exception _e nil))
             (throw (Exception. (str "Unable to parse date string " x))))

         (number? x)
         (Instant/ofEpochMilli x))))

(comment
  (parse-date-value "3/12/4444")
  (parse-date-value "3/02/4444")

  (parse-date-value "Wed Jul 09 2025")
  (parse-date-value "Sat, 05 Apr 2025 18:00:31 GMT")
  (parse-date-value "2025-01-01T00:00:00Z")
  (parse-date-value "2025-01-01")
  (parse-date-value "2025-01-02T00:00:00-08")
  (parse-date-value "\"2025-01-02T00:00:00-08\"")
  (parse-date-value "2025-01-15 20:53:08")
  (parse-date-value "\"2025-01-15 20:53:08\"")
  (parse-date-value "8/4/2025, 11:02:31 PM")
  (parse-date-value "2025-9-29T23:59:59.999Z")

  ;; These should throw an exception
  (parse-date-value "2025-01-0")
  (parse-date-value "\"2025-01-0\""))
