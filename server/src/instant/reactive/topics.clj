(ns instant.reactive.topics
  (:require
   [clojure.set]
   [instant.db.model.attr :as attr-model]
   [instant.db.model.triple :as triple-model]
   [instant.util.coll :as ucoll]
   [instant.util.json :refer [<-json]]
   [instant.util.memoize :refer [vmemoize]]
   [medley.core :as medley])
  (:import
   (java.util UUID)))

(defn columns->triple [cols]
  (ucoll/reduce-tr (fn [acc {:keys [name value]}]
                     (case name
                       "entity_id" (assoc! acc 0 value)
                       "attr_id" (assoc! acc 1 value)
                       "value" (assoc! acc 2 (<-json value))
                       "created_at" (assoc! acc 3 value)
                       acc))
                   [nil nil nil nil]
                   cols))

(defn columns->ea [cols]
  (ucoll/reduce-tr (fn [acc {:keys [name value]}]
                     (case name
                       "entity_id" (assoc! acc 0 value)
                       "attr_id" (let [res (assoc! acc 1 value)]
                                   (if (and (not (nil? (nth acc 0)))
                                            (not (nil? (nth acc 1))))
                                     (reduced res)
                                     res))
                       acc))
                   [nil nil]
                   cols))

(defn columns->eav [cols]
  (ucoll/reduce-tr (fn [acc {:keys [name value]}]
                     (case name
                       "entity_id" (assoc! acc 0 value)
                       "attr_id" (assoc! acc 1 value)
                       "value" (let [res (assoc! acc 2 (<-json value))]
                                 (if (and (not (nil? (nth acc 0)))
                                          (not (nil? (nth acc 1)))
                                          (not (nil? (nth acc 2))))
                                   (reduced res)
                                   res))
                       acc))
                   [nil nil nil]
                   cols))

(defn columns->map
  ([columns]
   (columns->map columns false))
  ([columns keywordize]
   (reduce (fn [acc column]
             (assoc acc
                    (if keywordize
                      (keyword (:name column))
                      (:name column))
                    (:value column)))
           {}
           columns)))

(defn get-column [columns col-name]
  (reduce (fn [_acc col]
            (when (= col-name (:name col))
              (reduced (:value col))))
          nil
          columns))

(defn parse-v [m]
  (let [v-parsed (<-json (:value m))]
    (cond
      (:eav m)
      (UUID/fromString v-parsed)
      (= (:checked_data_type m) "date")
      (triple-model/parse-date-value v-parsed)
      :else
      v-parsed)))

(defn- topics-for-triple-insert [change created-entities]
  (let [m (columns->map (:columns change) true)
        e (UUID/fromString (:entity_id m))
        a (UUID/fromString (:attr_id m))
        v (parse-v m)
        ks (->> #{:ea :eav :av :ave :vae}
                (filter m)
                set)
        ;; A value appearing on an entity that *already existed* (e.g. setting an
        ;; order attr for the first time) is a re-sort an ordered+limited query
        ;; must catch, so we add the `:mutated` marker. A value written while
        ;; *creating* the entity is already caught by the where/enumeration topic
        ;; (the new row's id/link triples), so we leave it off -- that's what
        ;; keeps a new row in some other parent from re-running the query.
        ks (if (contains? created-entities e)
             ks
             (conj ks :mutated))]
    [[ks #{e} #{a} #{v}]]))

(defn- topics-for-triple-update
  [change]
  (let [m (columns->map (:columns change) true)
        e (UUID/fromString (:entity_id m))
        a (UUID/fromString (:attr_id m))
        v (parse-v m)

        ks (->> #{:ea :eav :av :ave :vae}
                (filter m)
                set)

        old-m (columns->map (:identity change) true)
        old-e (UUID/fromString (:entity_id old-m))
        old-a (UUID/fromString (:attr_id old-m))
        old-v (parse-v old-m)]
    (cond (and (= e old-e)
               (= a old-a)
               ;; toasted value not included if it didn't change
               (or (not (contains? m :value))
                   (= v old-v)))
          ;; value didn't change, so we can ignore this update
          []

          (and (= e old-e)
               (= a old-a))
          ;; `:mutated` marks that this attr's value changed (vs was just
          ;; inserted). Ordered+limited queries subscribe to it so they catch a
          ;; row reordering into the window without also re-running on every
          ;; insert (new rows are caught by the where/enumeration topic).
          [[(conj ks :mutated) #{e} #{a} (set [v old-v])]]

          ;; We shouldn't hit this, but just in case
          :else
          [[(conj ks :mutated) #{e} #{a} #{v}]
           [(conj ks :mutated) #{e} #{a} #{old-v}]])))

(defn- topics-for-triple-delete [change deleted-entities]
  (let [m (columns->map (:identity change) true)
        e (UUID/fromString (:entity_id m))
        a (UUID/fromString (:attr_id m))
        v (parse-v m)
        ks (->> #{:ea :eav :av :ave :vae}
                (filter m)
                set)
        ;; Retracting one of an entity's values (without deleting the whole
        ;; entity) can drop a row out of an ordered window, so we mark it
        ;; `:mutated` like an update. Deleting the *entity* instead removes its
        ;; id triple and is caught by the where/enumeration topic, so its value
        ;; retractions don't need the marker (see lifecycle-entities).
        ks (if (contains? deleted-entities e)
             ks
             (conj ks :mutated))]
    [[ks #{e} #{a} #{v}]]))

(defn- id-self-triple?
  "An entity's id triple is its self-triple `[e id-attr e]`: the value equals the
   entity and it's an object (non-ref) attr. Its insert/delete is our marker that
   the *entity itself* was created/destroyed in this batch (the client always
   writes the id triple on create, and we skip no-op id updates otherwise)."
  [m]
  (boolean
   (and (not (:eav m))
        (:value m)
        (= (:entity_id m) (<-json (:value m))))))

(defn- lifecycle-entities
  "Scans a batch of triple changes for entities whose existence changed in it,
   keyed off the id self-triple. Returns `{:created #{..} :deleted #{..}}`. A
   value insert/delete on an entity *outside* these sets is a value appearing or
   disappearing on a surviving row -- a re-sort -- so it earns `:mutated`; one
   *inside* them is part of creating/destroying the row and is already caught by
   the where/enumeration topic."
  [changes]
  (reduce (fn [acc {:keys [action columns identity]}]
            (case action
              :insert (let [m (columns->map columns true)]
                        (cond-> acc
                          (id-self-triple? m)
                          (update :created conj (UUID/fromString (:entity_id m)))))
              :delete (let [m (columns->map identity true)]
                        (cond-> acc
                          (id-self-triple? m)
                          (update :deleted conj (UUID/fromString (:entity_id m)))))
              acc))
          {:created #{} :deleted #{}}
          changes))

(defn topics-for-change
  ([change]
   (topics-for-change change nil))
  ([{:keys [action] :as change} {:keys [created deleted]}]
   (case action
     :insert (topics-for-triple-insert change (or created #{}))
     :update (topics-for-triple-update change)
     :delete (topics-for-triple-delete change (or deleted #{}))
     [])))

(defn topics-for-triple-changes [changes]
  (let [lifecycle (lifecycle-entities changes)]
    (->> changes
         (mapcat #(topics-for-change % lifecycle))
         set)))

(defn- topics-for-ident-upsert [{:keys [columns]}]
  (let [indexes #{:ea :eav :av :ave :vae}
        attr-id (parse-uuid (get-column columns "attr_id"))]
    #{[indexes '_ #{attr-id} '_]}))

(defn- topics-for-attr-upsert [{:keys [columns identity] :as _change}]
  (let [indexes #{:ea :eav :av :ave :vae}
        attr-id (parse-uuid (get-column columns "id"))
        topics [[indexes '_ #{attr-id} '_]]

        value-type (get-column columns "value_type")
        object-attr? (not= value-type "ref")
        restoration? (and (get-column identity "deletion_marked_at")
                          (nil? (get-column columns "deletion_marked_at")))]

    (cond-> topics
      ;; Queries specifically request object attributes.
      ;; If we are restoring an attr, all queries that require
      ;; object attributes would need to be refreshed
      (and object-attr? restoration?) (conj [#{:ea} '_ '_ '_])

      true set)))

(defn- topics-for-attr-delete [{:keys [identity] :as _change}]
  (let [attr-id (parse-uuid (get-column identity "id"))
        indexes #{:ea :eav :av :ave :vae}]
    #{[indexes '_ #{attr-id} '_]}))

(defn topics-for-ident-change [{:keys [action] :as change}]
  (case action
    :update (topics-for-ident-upsert change)
    :insert (topics-for-ident-upsert change)
    #{}))

(defn topics-for-ident-changes [changes]
  (->> changes
       (mapcat topics-for-ident-change)
       set))

(defn topics-for-attr-change [{:keys [action] :as change}]
  (case action
    :update (topics-for-attr-upsert change)
    :insert (topics-for-attr-upsert change)
    :delete (topics-for-attr-delete change)
    #{}))

(defn topics-for-attr-changes [changes]
  (->> changes
       (mapcat topics-for-attr-change)
       set))

(defn topics-for-changes [{:keys [ident-changes triple-changes attr-changes]}]
  (let [topics-for-attr-changes (topics-for-attr-changes attr-changes)
        topics-for-ident-changes (topics-for-ident-changes ident-changes)
        topics-for-triple-changes (topics-for-triple-changes triple-changes)
        topics (clojure.set/union topics-for-ident-changes
                                  topics-for-triple-changes
                                  topics-for-attr-changes)]
    topics))

;; Wal entities
;; ------------

(defn extract-entities-from-messages [init messages]
  (reduce (fn [acc message]
            (case (:prefix message)
              ("update_ents" "delete_ents")
              (reduce (fn [acc [etype attr-id ent]]
                        (assoc-in acc [etype attr-id] ent))
                      acc
                      (<-json (:content message)))
              acc))
          init
          messages))

(defn extract-entities-from-table [init wal-logs]
  (let [parsed-logs (keep (fn [wal-log]
                            (when (= :insert (:action wal-log))
                              (reduce (fn [acc {:keys [name value]}]
                                        (case name
                                          "prefix" (assoc acc :prefix value)
                                          "content" (assoc acc :content value)
                                          "created_at" (assoc acc :created-at (triple-model/parse-date-value value))
                                          acc))
                                      {}
                                      (:columns wal-log))))
                          wal-logs)
        sorted-logs (sort-by :created-at parsed-logs)]
    (reduce (fn [acc message]
              (case (:prefix message)
                ("update_ents" "delete_ents")
                (reduce (fn [acc [etype attr-id ent]]
                          (assoc-in acc [etype attr-id] ent))
                        acc
                        (<-json (:content message)))
                acc))
            init
            sorted-logs)))

(defn extract-entities-after [{:keys [messages wal-logs]}]
  (-> {}
      (extract-entities-from-messages messages)
      (extract-entities-from-table wal-logs)))

(defn extract-entities-before [attrs entities-after {:keys [triple-changes]}]
  (let [attr-etype (vmemoize (fn [id-str]
                               (let [attr (attr-model/seek-by-id (parse-uuid id-str) attrs)]
                                 (when (= :one (:cardinality attr))
                                   (attr-model/fwd-etype attr)))))]
    (reduce (fn [acc change]
              (case (:action change)
                :insert (let [[e a] (columns->eav (:columns change))]
                          (if-let [etype (attr-etype a)]
                            (medley.core/dissoc-in acc [etype e a])
                            acc))
                (:update :delete) (let [[e a v] (columns->eav (:identity change))]
                                    (if-let [etype (attr-etype a)]
                                      (assoc-in acc [etype e a] v)
                                      acc))))
            entities-after
            (reverse triple-changes))))

;; ----
;; BYOP

(defn- topics-for-byop-triple-insert [table-info change]
  (let [m (columns->map (:columns change) true)
        id-field (get-in table-info [(:table change) :primary-key :field])
        e (get m id-field)
        ;; just making everything :ea for now
        ks [:ea]]
    (for [k ks
          [col v] m
          :let [a (get-in table-info [(:table change) :fields (keyword col) :attr-id])]]
      [k #{e} #{a} #{v}])))

(defn- topics-for-byop-triple-update
  [table-info change]
  (let [m (columns->map (:columns change) true)
        id-field (get-in table-info [(:table change) :primary-key :field])
        e (get m id-field)
        ;; just making everything :ea for now
        ks [:ea]]
    ;; (XXX): If we had the old value we wouldn't need to do this wildcard
    ;; business. Would be better if we can be more specific
    (for [k ks
          [col _v] m
          :let [a (get-in table-info [(:table change) :fields (keyword col) :attr-id])]]
      [k #{e} #{a} '_])))

(defn- topics-for-byop-triple-delete [table-info change]
  (let [m (columns->map (:identity change) true)
        id-field (get-in table-info [(:table change) :primary-key :field])
        e (get m id-field)
        ;; just making everything :ea for now
        ks [:ea]]
    ;; (XXX): Similar to update, we don't have the prev val, so we use wildcard
    ;; later on lets think how we can be more specific
    (for [k ks
          [col _v] m
          :let [a (get-in table-info [(:table change) :fields (keyword col) :attr-id])]]
      [k #{e} #{a} '_])))

(defn topics-for-byop-change [table-info {:keys [action] :as change}]
  ;; (XXX): We only handle triples atm, later on we should handle things
  ;; like add/delete attrs and apps
  (case action
    :insert (topics-for-byop-triple-insert table-info change)
    :update (topics-for-byop-triple-update table-info change)
    :delete (topics-for-byop-triple-delete table-info change)
    #{}))


(defn topics-for-byop-triple-changes [table-info changes]
  (->> changes
       (mapcat (partial topics-for-byop-change table-info))
       set))

(defn topics-for-byop-changes [table-info {:keys [triple-changes]}]
  (topics-for-byop-triple-changes table-info triple-changes))
