(ns instant.reactive.topics
  (:require
   [clojure.set]
   [instant.db.model.triple :as triple-model]
   [instant.util.coll :as ucoll]
   [instant.util.json :refer [<-json]])
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

(defn- topics-for-triple-insert [change]
  (let [m (columns->map (:columns change) true)
        e (UUID/fromString (:entity_id m))
        a (UUID/fromString (:attr_id m))
        v-parsed (<-json (:value m))
        v (cond
            (:eav m)
            (UUID/fromString v-parsed)
            (= (:checked_data_type m) "date")
            (triple-model/parse-date-value v-parsed)
            :else
            v-parsed)
        ks (->> #{:ea :eav :av :ave :vae}
                (filter m)
                set)]
    [[ks #{e} #{a} #{v}]]))

(defn- topics-for-triple-update
  [change]
  (let [m (columns->map (:columns change) true)
        e (UUID/fromString (:entity_id m))
        a (UUID/fromString (:attr_id m))
        v (<-json (:value m))

        ks (->> #{:ea :eav :av :ave :vae}
                (filter m)
                set)

        old-m (columns->map (:identity change) true)
        old-e (UUID/fromString (:entity_id old-m))
        old-a (UUID/fromString (:attr_id old-m))
        old-v (<-json (:value old-m))]
    (cond (and (= e old-e)
               (= a old-a)
               ;; toasted value not included if it didn't change
               (or (not (contains? m :value))
                   (= v old-v)))
          ;; value didn't change, so we can ignore this update
          []

          (and (= e old-e)
               (= a old-a))
          [[ks #{e} #{a} (set [v old-v])]]

          ;; We shouldn't hit this, but just in case
          :else
          [[ks #{e} #{a} #{v}]
           [ks #{e} #{a} #{old-v}]])))

(defn- topics-for-triple-delete [change]
  (let [m (columns->map (:identity change) true)
        e (UUID/fromString (:entity_id m))
        a (UUID/fromString (:attr_id m))
        v (<-json (:value m))
        ks (->> #{:ea :eav :av :ave :vae}
                (filter m)
                set)]
    [[ks #{e} #{a} #{v}]]))

(defn topics-for-change [{:keys [action] :as change}]
  (case action
    :insert (topics-for-triple-insert change)
    :update (topics-for-triple-update change)
    :delete (topics-for-triple-delete change)
    []))

(defn topics-for-triple-changes [changes]
  (->> changes
       (mapcat topics-for-change)
       set))

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
