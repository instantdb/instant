(ns instant.db.model.triple
  (:require
   [clojure.spec.alpha :as s]
   [honey.sql :as hsql]
   [instant.data.constants :refer [empty-app-id]]
   [instant.db.model.attr :as attr-model]
   [instant.db.model.triple-cols :as triple-cols-ns]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.system-catalog :refer [system-catalog-app-id]]
   [instant.util.crypt :refer [json-null-md5]]
   [instant.util.exception :as ex]
   [instant.util.json :refer [->json <-json]]
   [instant.util.spec :as uspec]
   [instant.util.string :refer [multiline->single-line]]
   [instant.util.tracer :as tracer])
  (:import
   (java.util UUID)
   (java.time Instant LocalDate LocalDateTime ZonedDateTime ZoneOffset)
   (java.time.format DateTimeFormatter)))

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

          lookups->eid (->> triples
                            (map (fn [{:keys [entity_id attr_id value]}]
                                   [[attr_id value] entity_id]))
                            (into {}))]
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
                    [:or
                     [:and
                      [:= :id a]
                      [:= :value-type [:inline "ref"]]]
                     [:exists {:select :*
                               :from :idents
                               :where [:and
                                       [:or
                                        [:= :app-id app-id]
                                        [:= :app-id system-catalog-app-id]]
                                       [:= :attr-id a]
                                       [:= :label "id"]]}]]]}])

(defn insert-attr-inferred-types-cte [app-id triples]
  (let [values (->> (reduce (fn [acc [_e a v]]
                              (if (nil? v)
                                acc
                                (update acc
                                        a
                                        (fnil bit-or 0)
                                        (-> v
                                            attr-model/inferred-value-type
                                            attr-model/type->binary))))
                            {}
                            triples)
                    (map (fn [[id typ]]
                           [id [:cast typ [:bit :32]]])))]
    (when (seq values)
      [:attr-inferred-types {:update :attrs
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
                                            )"]]]}])))

(defn deep-merge-multi!
  [conn _attrs app-id triples]
  (let [input-triples-values
        (->> triples
             (group-by (juxt first second))
             (map-indexed (fn [idx [[entity-id attr-id] patches]]
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
        lookup-refs (distinct (keep (fn [[e]]
                                      (when (eid-lookup-ref? e)
                                        e))
                                    triples))
        q {:with (concat
                  (when (seq lookup-refs)
                    [[[:input-lookup-refs
                       {:columns [:app-id :attr-id :value]}]
                      {:values (map (fn [[a v]]
                                      [app-id a (->json v)])
                                    lookup-refs)}]

                     ;; create data for lookup refs
                     [:enhanced-lookup-refs
                      {:select
                       [[[:cast :ilr.app_id :uuid] :app-id]
                        [[:gen_random_uuid] :entity-id]
                        [[:cast :ilr.attr-id :uuid] :attr-id]
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
                                                [:= :a.id [:cast :ilr.attr-id :uuid]]]]}]

                     ;; insert lookup refs
                     [:lookup-ref-inserts
                      {:insert-into [[:triples triple-cols]
                                     {:select triple-cols
                                      :from :enhanced-lookup-refs}]
                       :on-conflict [:app-id :attr-id [:json_null_to_null :value] {:where :av}]
                       :do-nothing true
                       :returning :*}]

                     [:lookup-ref-lookups
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
                                                          [:= [:json_null_to_null :value] [:cast (->json v) :jsonb]]]))]}]}]])
                  [[[:input-triples
                     {:columns [:idx :app-id :entity-id :attr-id :value]}]
                    {:values input-triples-values}
                    :materialized]
                   [[:applied-triples
                     {:columns [:idx :app-id :entity-id :attr-id :value]}]
                    {:select [:it.idx :it.app-id :it.entity-id :it.attr-id
                              [[:jsonb_deep_merge_many [:cast :t.value :jsonb] [:cast :it.value :jsonb]] :value]]
                     :from [[:input-triples :it]]
                     :left-join [[:triples :t]
                                 [:and
                                  [:= :t.app-id :it.app-id]
                                  [:= :t.entity-id :it.entity-id]
                                  [:= :t.attr-id :it.attr-id]]]}]
                   [:enhanced-triples
                    {:select
                     [[:at.idx :idx]
                      [:at.app_id :app-id]
                      [:at.entity-id :entity-id]
                      [:at.attr-id :attr-id]
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
                                              [:= :a.id :at.attr-id]]]}]
                   [:ea-index-inserts
                    {:insert-into [[[:triples :t] triple-cols]
                                   {:select triple-cols
                                    :from :enhanced-triples}]
                     :on-conflict [:app-id :entity-id :attr-id {:where [:= :ea true]}]
                     :do-update-set {:value :excluded.value
                                     :value-md5 :excluded.value-md5}
                     :returning :entity-id}]]
                  (when-let [attr-inferred-types (insert-attr-inferred-types-cte app-id triples)]
                    [attr-inferred-types]))
           :select :entity-id :from :ea-index-inserts}]
    (sql/do-execute! conn (hsql/format q))))

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
  [conn _attrs app-id triples]
  (let [lookup-refs (distinct (keep (fn [[e]]
                                      (when (eid-lookup-ref? e)
                                        e))
                                    triples))
        query {:with (concat
                      (when (seq lookup-refs)
                        [[[:input-lookup-refs
                           {:columns [:app-id :attr-id :value]}]
                          {:values (map (fn [[a v]]
                                          [app-id a (->json v)])
                                        lookup-refs)}]

                         ;; create data for lookup refs
                         [:enhanced-lookup-refs
                          {:select
                           [[[:cast :ilr.app_id :uuid] :app-id]
                            [[:gen_random_uuid] :entity-id]
                            [[:cast :ilr.attr-id :uuid] :attr-id]
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
                                                    [:= :a.id [:cast :ilr.attr-id :uuid]]]]}]
                         ;; insert lookup refs
                         [:lookup-ref-inserts
                          {:insert-into [[:triples triple-cols]
                                         {:select triple-cols
                                          :from :enhanced-lookup-refs}]
                           :on-conflict [:app-id :attr-id [:json_null_to_null :value] {:where :av}]
                           :do-nothing true
                           :returning :*}]

                         ;; collect lookup ref entities
                         ;; if we do this inline instead of creating a CTE, the lookup
                         ;; ref entity might get created anew when it's updated (e.g.
                         ;; users[lookup({handle: 'me'})].update({handle: 'mee'}) will
                         ;; generate a new triple with value = 'me'
                         [:lookup-ref-lookups
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
                                                               [:cast (->json v) :jsonb]]]))]}]}]])
                      [[[:input-triples
                         {:columns [:idx :app-id :entity-id :attr-id :value]}]
                        {:values (map-indexed
                                  (fn [idx [e a v]]
                                    [idx
                                     app-id
                                     (if-not (eid-lookup-ref? e)
                                       e
                                       {:select :entity-id
                                        :from :lookup-ref-lookups
                                        :where [:and
                                                [:= :app-id app-id]
                                                [:= :attr-id (first e)]
                                                [:= :value [:cast (->json (second e)) :jsonb]]]
                                        :limit 1})

                                     a
                                     (if-not (value-lookup-ref? v)
                                       (->json v)
                                       [[[:case (value-lookupable-sql app-id a)
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
                                          :else (->json v)]]])])
                                  triples)}]
                       [:enhanced-triples
                        {:select
                         [[:it.idx :idx]
                          [[:cast :it.app_id :uuid] :app-id]
                          [[:cast :it.entity-id :uuid] :entity-id]
                          [[:cast :it.attr-id :uuid] :attr-id]
                          [[:cast :it.value :jsonb] :value]
                          [[:md5 :it.value] :value-md5]
                          [[:case [:= :a.cardinality [:inline "one"]] true :else false]
                           :ea]
                          [[:case [:= :a.value-type [:inline "ref"]] true :else false]
                           :eav]
                          [[:case :a.is-unique true :else false] :av]
                          [[:case :a.is-indexed true :else false] :ave]
                          [[:case [:= :a.value-type [:inline "ref"]] true :else false]
                           :vae]
                          [:a.checked_data_type :checked-data-type]]
                         :from [[:input-triples :it]]
                         :left-join [[:attrs :a] [:and
                                                  [:or
                                                   [:= :a.app-id [:cast :it.app-id :uuid]]
                                                   [:= :a.app-id system-catalog-app-id]]
                                                  [:= :a.id [:cast :it.attr-id :uuid]]]]}]
                       [:ea-triples-distinct
                        {:select-distinct-on [[:entity-id :attr-id] :*]
                         :from :enhanced-triples
                         :where [:= :ea true]
                         :order-by [[:entity-id :desc] [:attr-id :desc] [:idx :desc]]}]
                       [:remaining-triples
                        {:select :* :from :enhanced-triples :where [:not :ea]}]
                       [:ea-index-inserts
                        {:insert-into [[:triples triple-cols]
                                       {:select triple-cols
                                        :from :ea-triples-distinct}]
                         :on-conflict [:app-id :entity-id :attr-id {:where [:= :ea true]}]
                         :do-update-set {:value :excluded.value
                                         :value-md5 :excluded.value-md5}
                         :returning :*}]
                       [:remaining-inserts
                        {:insert-into [[:triples triple-cols]
                                       {:select triple-cols
                                        :from :remaining-triples}]
                         :on-conflict [:app-id :entity-id :attr-id :value-md5]
                         :do-nothing true
                         :returning :*}]
                       [:indexed-null-triples
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
                                               [:= :lookup-ref-inserts.attr-id :needs-null-attr.id]]}]]]))}]
                       [:indexed-null-inserts
                        {:insert-into [[:triples triple-cols]
                                       {:select triple-cols
                                        :from :indexed-null-triples}]
                         :on-conflict [:app-id :entity-id :attr-id :value-md5]
                         :do-nothing true
                         :returning :entity-id}]]
                      (when-let [attr-inferred-types (insert-attr-inferred-types-cte app-id triples)]
                        [attr-inferred-types]))
               :union-all [{:select :entity-id :from :ea-index-inserts}
                           {:select :entity-id :from :remaining-inserts}
                           {:select :entity-id :from :indexed-null-inserts}]}]
    (try
      (sql/do-execute! conn (hsql/format query))
      (catch Exception e
        (let [pg-server-message (-> e
                                    ex-data
                                    ::ex/pg-error-data
                                    :server-message)]
          (if (and (seq lookup-refs)
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
            (throw e)))))))

(defn delete-entity-multi!
  "Deleting an entity does two things:

   1. Deletes all object triples and eav references:
      [id _ _]

   2. Deletes all reference triples where this entity is the value:
      [_ _ id]"
  [conn app-id id+etypes]
  (let [query  {:with [[[:id_etypes {:columns [:entity_id :etype]}]
                        {:values id+etypes}]

                       [:forward_attrs
                        {:select :triples.ctid
                         :from   :triples
                         :join   [:id_etypes [:= :triples.entity_id :id_etypes.entity_id]
                                  :attrs     [:= :triples.attr_id :attrs.id]
                                  :idents    [:= :idents.id :attrs.forward-ident]]
                         :where  [:and
                                  [:= :triples.app-id [:param :app-id]]
                                  [:= :idents.etype :id_etypes.etype]
                                  [:or
                                   [:= :idents.app-id [:param :app-id]]
                                   [:= :idents.app-id [:param :system-catalog-app-id]]]]}]

                       [:reverse_attrs
                        {:select :triples.ctid
                         :from   :triples
                         :join   [:id_etypes [:= :triples.value [:to_jsonb :id_etypes.entity_id]]
                                  :attrs     [:= :triples.attr_id :attrs.id]
                                  :idents    [:= :idents.id :attrs.reverse-ident]]
                         :where  [:and
                                  :vae
                                  [:= :triples.app-id [:param :app-id]]
                                  [:= :idents.etype :id_etypes.etype]
                                  [:or
                                   [:= :idents.app-id [:param :app-id]]
                                   [:= :idents.app-id [:param :system-catalog-app-id]]]]}]]
                :delete-from :triples
                :where       [:in :ctid
                              {:union
                               [{:nest {:select :* :from :forward_attrs}}
                                {:nest {:select :* :from :reverse_attrs}}]}]
                :returning   :*}
        params {:app-id app-id
                :system-catalog-app-id system-catalog-app-id}]
    (sql/do-execute! conn (hsql/format query {:params params}))))

;; n.b. if we ever use `:retract-triple` for blob attrs (it's currently
;;      just links), we'll need to add code in `delete-multi!` to
;;      insert nulls for indexed blob attrs
(defn delete-multi!
  "Deletes triples from postgres.

   We enhance given triples with their hashed values to assist postgres in
   quickly finding which triples to delete"
  [conn app-id triples]
  (sql/do-execute!
   conn
   (hsql/format
    {:with [[[:input-triples
              {:columns [:app-id :entity-id :attr-id :value]}]
             {:values (mapv
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
                       triples)}]
            [:enhanced-triples
             {:select [:app-id
                       :entity-id
                       :attr-id
                       [[:md5 :value] :value-md5]]
              :from :input-triples}]]
     :delete-from :triples
     :where [:in
             [:composite :app-id :entity-id :attr-id :value-md5]
             {:select :* :from :enhanced-triples}]})))

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
  ([conn app-id stmts]
   (map row->enhanced-triple
        (sql/select
         conn
         (hsql/format
          {:select
           [:triples.*]
           :from :triples
           :where
           (concat [:and [:= :app-id app-id]] stmts)})))))

(comment
  (attr-model/delete-by-app-id! (aurora/conn-pool :write) empty-app-id)
  (def name-attr-id #uuid "3c0c37e2-49f7-4912-8808-02ca553cb36d")
  (attr-model/insert-multi!
   (aurora/conn-pool :write)
   empty-app-id
   [{:id name-attr-id
     :forward-identity [#uuid "963c3f22-4389-4f5a-beea-87644409e458"
                        "users" "name"]
     :value-type :blob
     :cardinality :one
     :index? false
     :unique? false}])
  (def t [#uuid "83ae4cbf-8b19-42f6-bb8f-3eac7bd6da29" name-attr-id "Stopa"])
  (insert-multi! (aurora/conn-pool :write)
                 (attr-model/get-by-app-id empty-app-id)
                 empty-app-id
                 [t])
  (fetch (aurora/conn-pool :read) empty-app-id)
  (delete-multi! (aurora/conn-pool :write) empty-app-id [t]))

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

(defn zoned-date-time-str->instant [s]
  (.toInstant (ZonedDateTime/parse s)))

(defn local-date-time-str->instant [s]
  (.toInstant (LocalDateTime/parse s)))

(defn local-date-str->instant [s]
  (-> (LocalDate/parse s)
      (.atStartOfDay)
      (.toInstant ZoneOffset/UTC)))

(def offio-date-formatter (DateTimeFormatter/ofPattern "yyyy-MM-dd HH:mm:ss"))

(defn offio-date-str->instant [s]
  (-> s
      (LocalDateTime/parse offio-date-formatter)
      (.toInstant ZoneOffset/UTC)))

(def zeneca-date-formatter (DateTimeFormatter/ofPattern "yyyy-MM-dd HH:mm:ss.n"))

(defn zeneca-date-str->instant [s]
  (-> s
      (LocalDateTime/parse zeneca-date-formatter)
      (.toInstant ZoneOffset/UTC)))


(def date-parsers [zoned-date-time-str->instant
                   local-date-time-str->instant
                   local-date-str->instant
                   offio-date-str->instant
                   zeneca-date-str->instant])

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

(defn parse-date-value [x]
  (cond (string? x)
        (or (date-str->instant x)
            (json-str->instant x)
            (throw (Exception. (str "Unable to parse date string " x))))

        (number? x)
        (Instant/ofEpochMilli x)))

(comment
  (parse-date-value "2025-01-01T00:00:00Z")
  (parse-date-value "2025-01-01")
  (parse-date-value "2025-01-02T00:00:00-08")
  (parse-date-value "\"2025-01-02T00:00:00-08\"")
  (parse-date-value "2025-01-15 20:53:08")
  (parse-date-value "\"2025-01-15 20:53:08\"")

  ;; These should throw an exception
  (parse-date-value "2025-01-0")
  (parse-date-value "\"2025-01-0\""))
