(ns instant.db.model.triple
  (:require
   [instant.jdbc.sql :as sql]
   [instant.db.model.attr :as attr-model]
   [instant.jdbc.aurora :as aurora]
   [honey.sql :as hsql]
   [clojure.spec.alpha :as s]
   [instant.util.spec :as uspec]
   [instant.util.json :refer [->json]]
   [instant.util.tracer :as tracer]
   [instant.data.constants :refer [empty-app-id]])

  (:import
   (java.util UUID)))

;; (XXX): Currently we allow value to be nil
;; In the future, we may want to _retract_ the triple if the value is nil
(defn value? [x]
  (or (string? x) (uuid? x) (number? x) (nil? x) (boolean? x)
      (sequential? x) (associative? x)))


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

;; ---
;; insert-multi!

(def triple-cols
  [:app-id :entity-id :attr-id :value :value-md5 :ea :eav :av :ave :vae])

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
                    [:= :app-id app-id]
                    [:or
                     [:and
                      [:= :id a]
                      [:= :value-type [:inline "ref"]]]
                     [:exists {:select :*
                               :from :idents
                               :where [:and
                                       [:= :app-id app-id]
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
                                     [:= :attrs.app_id app-id]]}])))

(defn deep-merge-multi!
  [conn app-id triples]
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
                         :vae]]
                       :from [[:input-lookup-refs :ilr]]
                       :left-join [[:attrs :a] [:and
                                                :a.is-unique
                                                [:= :a.app-id [:cast :ilr.app-id :uuid]]
                                                [:= :a.id [:cast :ilr.attr-id :uuid]]]]}]

                     ;; insert lookup refs
                     [:lookup-ref-inserts
                      {:insert-into [[:triples triple-cols]
                                     {:select triple-cols
                                      :from :enhanced-lookup-refs}]
                       :on-conflict [:app-id :attr-id :value {:where :av}]
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
                                                          [:= :attr-id a]
                                                          [:= :value [:cast (->json v) :jsonb]]]))]}]}]])
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
                       :vae]]
                     :from [[:applied-triples :at]]
                     :left-join [[:attrs :a] [:and
                                              [:= :a.app-id :at.app-id]
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
  [conn app-id triples]
  (sql/do-execute!
   conn
   (hsql/format
    (let [lookup-refs (distinct (keep (fn [[e]]
                                        (when (eid-lookup-ref? e)
                                          e))
                                      triples))]
      {:with (concat
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
                     :vae]]
                   :from [[:input-lookup-refs :ilr]]
                   :left-join [[:attrs :a] [:and
                                            :a.is-unique
                                            [:= :a.app-id [:cast :ilr.app-id :uuid]]
                                            [:= :a.id [:cast :ilr.attr-id :uuid]]]]}]

                 ;; insert lookup refs
                 [:lookup-ref-inserts
                  {:insert-into [[:triples triple-cols]
                                 {:select triple-cols
                                  :from :enhanced-lookup-refs}]
                   :on-conflict [:app-id :attr-id :value {:where :av}]
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
                                                      [:= :attr-id a]
                                                      [:= :value [:cast (->json v) :jsonb]]]))]}]}]])
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
                                                                   [:= :app-id app-id]
                                                                   [:= :attr-id (first v)]
                                                                   [:= :value [:cast (->json (second v)) :jsonb]]]}]}
                                             :lookups]]
                                           [[{:select :entity-id
                                              :from :triples
                                              :where [:and
                                                      [:= :app-id app-id]
                                                      [:= :attr-id (first v)]
                                                      [:= :value [:cast (->json (second v)) :jsonb]]]}
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
                   :vae]]
                 :from [[:input-triples :it]]
                 :left-join [[:attrs :a] [:and
                                          [:= :a.app-id [:cast :it.app-id :uuid]]
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
                 :returning :entity-id}]
               [:remaining-inserts
                {:insert-into [[:triples triple-cols]
                               {:select triple-cols
                                :from :remaining-triples}]
                 :on-conflict [:app-id :entity-id :attr-id :value-md5]
                 :do-nothing true
                 :returning :entity-id}]]
              (when-let [attr-inferred-types (insert-attr-inferred-types-cte app-id triples)]
                [attr-inferred-types]))
       :union-all [{:select :entity-id :from :ea-index-inserts}
                   {:select :entity-id :from :remaining-inserts}]}))))

(defn delete-entity-multi!
  "Deleting an entity does two things:

   1. Deletes all object triples and eav references:
      [id _ _]

   2. Deletes all reference triples where this entity is the value:
      [_ _ id]"
  [conn app-id ids]
  (let [{ids false
         lookup-refs true} (group-by eid-lookup-ref? ids)]
    (sql/do-execute!
     conn
     (hsql/format
      {:with [[:eids {:select :entity-id
                      :from :triples
                      :where [:and
                              [:= :app-id app-id]
                              (list*
                               :or
                               (when (seq ids)
                                 [:in :entity-id (or ids [])])
                               (for [[attr-id value] lookup-refs]
                                 [:and
                                  [:= :attr-id attr-id]
                                  [:= :value [:cast (->json value) :jsonb]]]))]}]
              [:deletes {:delete-from :triples
                         :where [[:and
                                  [:= :app-id app-id]
                                  [:or
                                   [:in :entity-id {:select :entity-id
                                                    :from :eids}]
                                   [:and
                                    :vae
                                    [:in :value-md5 {:select [[[:md5 [:cast [:to_jsonb :entity_id] :text]]]]
                                                     :from :eids}]]]]]
                         :returning :*}]]
       :select :*
       :from :deletes}))))

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
                         [app-id
                          (if (eid-lookup-ref? e)
                            {:select :entity-id
                             :from :triples
                             :where [:and
                                     [:= :app-id app-id]
                                     [:= :attr-id (first e)]
                                     [:= :value [:cast (->json (second e)) :jsonb]]]}
                            e)
                          a
                          (if-not (value-lookup-ref? v)
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
                               :else (->json v)]]])])
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
           ea eav av ave vae]}]
  {:triple [entity_id attr_id
            (if eav
              (UUID/fromString value)
              value)]
   :md5 value_md5
   :index (->> [[ea :ea] [eav :eav] [av :av] [ave :ave] [vae :vae]]
               (filter first)
               (map second)
               set)})

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
  (attr-model/delete-by-app-id! aurora/conn-pool empty-app-id)
  (def name-attr-id #uuid "3c0c37e2-49f7-4912-8808-02ca553cb36d")
  (attr-model/insert-multi!
   aurora/conn-pool
   empty-app-id
   [{:id name-attr-id
     :forward-identity [#uuid "963c3f22-4389-4f5a-beea-87644409e458"
                        "users" "name"]
     :value-type :blob
     :cardinality :one
     :index? false
     :unique? false}])
  (def t [#uuid "83ae4cbf-8b19-42f6-bb8f-3eac7bd6da29" name-attr-id "Stopa"])
  (insert-multi! aurora/conn-pool empty-app-id [t])
  (fetch aurora/conn-pool empty-app-id)
  (delete-multi! aurora/conn-pool empty-app-id [t]))

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
