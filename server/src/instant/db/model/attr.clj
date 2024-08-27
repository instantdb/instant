(ns instant.db.model.attr
  (:require
   [clojure.spec.alpha :as s]
   [instant.util.spec :as uspec]
   [clojure.spec.gen.alpha :as gen]
   [instant.jdbc.sql :as sql]
   [instant.jdbc.aurora :as aurora]
   [honey.sql :as hsql]
   [instant.util.coll :as ucoll]
   [instant.data.constants :refer [empty-app-id]]))

;; ----
;; Spec

(s/def ::cardinality #{:one :many})

(s/def ::value-type #{:blob :ref})

(s/def ::id uuid?)

(s/def ::etype ::uspec/non-blank-string)
(s/def ::label ::uspec/non-blank-string)
(s/def ::identity (s/cat :id uuid? :etype ::etype :label ::label))

(s/def ::forward-identity ::identity)

(s/def ::reverse-identity ::identity)

(s/def ::unique? boolean?)

(s/def ::index? boolean?)

(s/def ::attr-common (s/keys :req-un
                             [::id
                              ::forward-identity
                              ::value-type
                              ::cardinality
                              ::unique?
                              ::index?]))

(s/def ::blob-attr ::attr-common)

(s/def ::ref-attr
  (s/merge ::attr-common
           (s/keys :req-un [::reverse-identity])))

(defmulti value-type :value-type)
(defmethod value-type :blob [_] ::blob-attr)
(defmethod value-type :ref [_] ::ref-attr)

(comment
  (ns-unmap *ns* 'value-type-mm))

(s/def ::attr (s/multi-spec value-type :value-type))

(s/def ::attr-update
  (s/keys
   :req-un [::id]
   :opt-un
   [::forward-identity ::reverse-identity ::unique? ::index? ::cardinality]))

;; ---
;; ident

(def ident-name
  "Identities contain an id, etype, and label (in that order) but we consider the ident name to simply be the etype and label"
  (partial drop 1))

(defn fwd-ident-name
  "Returns forward etype and label for an attr"
  [attr]
  (->> attr :forward-identity ident-name))

(defn rev-ident-name
  "Returns reverse etype and label for an attr. Note: Reverse identity may not exist"
  [attr]
  (->> attr :reverse-identity ident-name))

(def fwd-etype
  "Given an attr, return it's forward etype"
  (comp second :forward-identity))

(def fwd-label
  "Given an attr, return it's forward label"
  (comp last :forward-identity))
;; ---
;; delete-by-app-id!

(defn delete-by-app-id!
  "Deletes all attrs for an app. Note: This will also delete all triples for an app"
  [conn app-id]
  (sql/do-execute!
   conn
   ["DELETE FROM attrs WHERE attrs.app_id = ?" app-id]))

;; ------
;; insert-multi!

(def attr-table-cols
  "Manual reflection of postgres attr table columns"
  [:id :app-id :value-type
   :cardinality :is-unique :is-indexed
   :forward-ident :reverse-ident])

(defn attr-table-values
  "Marshals a collection of attrs into insertable sql attr values"
  [app-id attrs]
  (map (fn [{:keys [:id :value-type :cardinality :unique? :index?
                    :forward-identity :reverse-identity]}]
         [id
          app-id
          [:cast (when value-type (name value-type)) :text]
          [:cast (when cardinality (name cardinality)) :text]
          [:cast unique? :boolean]
          [:cast index? :boolean]
          [:cast (first forward-identity) :uuid]
          [:cast (first reverse-identity) :uuid]])
       attrs))

(def ident-table-cols
  "Manual reflection of postgres ident table columns"
  [:id :app-id :attr-id :etype :label])

(defn ->ident-row
  "Marshal to sql-compatible ident row"
  [attr-id app-id [id etype label]]
  [id app-id attr-id etype label])

(defn ident-table-values
  "Extracts ident information from a collection of attrs/updates 
  and marshals into into sql-compatible ident values"
  [app-id attrs]
  (mapcat (fn [{:keys [:id :forward-identity :reverse-identity]}]
            (cond-> []
              forward-identity
              (conj (->ident-row id app-id forward-identity))
              reverse-identity
              (conj (->ident-row id app-id reverse-identity))))
          attrs))

(defn qualify-col [ns col]
  (keyword (format "%s.%s" (name ns) (name col))))

(defn qualify-cols [ns cols]
  (map (partial qualify-col ns) cols))

(defn insert-multi!
  "Attr data is expressed as one object in clj but is persisted across two tables
   in sql: `attrs` and `idents`.

   We extract relevant data for each table and build a CTE to insert into
   both tables in one statement"
  [conn app-id attrs]
  (sql/do-execute!
   conn
   (hsql/format
    {:with [[[:attr-values
              {:columns attr-table-cols}]
             {:values (distinct (attr-table-values app-id attrs))}]
            [[:ident-values
              {:columns ident-table-cols}]
             {:values (distinct (ident-table-values app-id attrs))}]
            [:ident-inserts
             {:insert-into
              [[:idents ident-table-cols]
               {:select (qualify-cols :ident-values ident-table-cols)
                :from :ident-values
                ;; Filter out idents we've already saved
                :where [:not [:exists
                              {:select :1
                               :from :idents
                               :where (list* :and
                                             (map (fn [col]
                                                    [:=
                                                     (qualify-col :ident-values col)
                                                     (qualify-col :idents col)])
                                                  ident-table-cols))}]]}]
              :returning [:id]}]
            [:ident-ids
             {:union-all
              [{:select :id :from :ident-inserts}
               {:select :id
                :from :idents
                :where [:in :id {:select :id
                                 :from :attr-values}]}]}]
            [:attr-inserts
             {:insert-into
              [[:attrs attr-table-cols]
               {:select (qualify-cols :attr-values attr-table-cols)
                :from [:attr-values]
                ;; Filter out attrs we've already saved
                :where [:not [:exists
                              {:select :1
                               :from :attrs
                               :where (list* :and
                                             (map (fn [col]
                                                    [:=
                                                     (qualify-col :attr-values col)
                                                     (qualify-col :attrs col)])
                                                  attr-table-cols))}]]
                :join [:ident-ids
                       [:= :attr-values.forward-ident :ident-ids.id]]}]
              :returning [:id]}]]
     :union-all
     [{:select :id :from :ident-inserts}
      {:select :id :from :attr-inserts}]})))

(defn- not-null-or [check fallback]
  [:case [:not= check nil] check :else fallback])

(defn- changes-that-require-attr-model-updates
  [updates]
  (let [ks #{:cardinality :value-type :unique? :index?}]
    (->> updates
         (filter (fn [x]
                   (some (partial contains? x) ks))))))

(defn update-multi!
  [conn app-id updates]
  (sql/do-execute!
   conn
   (hsql/format
    {:with (concat
            (if-let [attr-table-updates
                     (seq (changes-that-require-attr-model-updates updates))]
              [[[:attr-values
                 {:columns attr-table-cols}]
                {:values (attr-table-values app-id attr-table-updates)}]
               [:attr-updates
                {:update :attrs
                 :set {:value-type (not-null-or :attr-values.value-type :attrs.value-type)
                       :cardinality (not-null-or :attr-values.cardinality :attrs.cardinality)
                       :is-unique (not-null-or :attr-values.is-unique :attrs.is-unique)
                       :is-indexed (not-null-or :attr-values.is-indexed :attrs.is-indexed)}
                 :from [:attr-values]
                 :where [:and
                         [:= :attrs.id :attr-values.id]
                         [:= :attrs.app-id :attr-values.app-id]]
                 :returning [:attrs.*]}]
               [:triple-updates
                {:update :triples
                 :set {:ea  [:case [:= :a.cardinality [:inline "one"]] true :else false]
                       :eav [:case [:= :a.value-type [:inline "ref"]] true :else false]
                       :av :a.is-unique
                       :ave :a.is-indexed}
                 :from [[:attr-updates :a]]
                 :where [:and
                         [:= :triples.app-id :a.app-id]
                         [:= :triples.attr-id :a.id]]
                 :returning :triples.entity_id}]]
              [[:attr-updates
                {:select [[[:cast nil :uuid] :id]]}]
               [:triple-updates
                {:select [[[:cast nil :uuid] :entity-id]]}]])
            (if-let [ident-table-vals (seq (ident-table-values app-id updates))]
              [[[:ident-values
                 {:columns ident-table-cols}]
                {:values ident-table-vals}]
               [:ident-updates
                {:update :idents,
                 :set {:etype :ident-values.etype, :label :ident-values.label},
                 :from [:ident-values]
                 :where [:and
                         [:= :idents.id :ident-values.id]
                         [:= :idents.app-id :ident-values.app-id]
                         [:= :idents.attr-id :ident-values.attr-id]]
                 :returning :idents.id}]]
              [[:ident-updates
                {:select [[[:cast nil :uuid] :id]]}]])
            [[:union-ids
              {:union-all
               [{:select :entity_id :from :triple-updates}
                {:select :id :from :attr-updates}
                {:select :id :from :ident-updates}]}]])
     :select :%count.* :from :union-ids})))

(defn delete-multi!
  "Deletes a batch of attrs for an app. We 
   rely on CASCADE DELETE to remove associated 
   idents and triples"
  [conn app-id ids]
  (sql/do-execute!
   conn
   (hsql/format
    {:delete-from :attrs
     :where [[:and
              [:= :app-id app-id]
              [:in :id ids]]]})))
;; -------
;; app-attrs

(defn- row->attr
  "Clj representation of sql attrs"
  [{:keys [id
           value_type
           cardinality
           is_unique
           is_indexed
           forward_ident
           fwd_label
           fwd_etype
           reverse_ident
           rev_label
           rev_etype]}]
  (cond-> {:id id
           :value-type (keyword value_type)
           :cardinality (keyword cardinality)
           :forward-identity [forward_ident fwd_etype fwd_label]
           :unique? is_unique
           :index? is_indexed}
    reverse_ident (assoc :reverse-identity [reverse_ident rev_etype rev_label])))

(defn get-by-app-id
  "Returns clj representation of all attrs for an app"
  [conn app-id]
  (map row->attr
       (sql/select
        conn
        (hsql/format
         {:select [:attrs.*
                   [:fwd-idents.etype :fwd-etype]
                   [:fwd-idents.label :fwd-label]
                   [:rev-idents.etype :rev-etype]
                   [:rev-idents.label :rev-label]]
          :from :attrs
          :join [[:idents :fwd-idents] [:= :attrs.forward-ident :fwd-idents.id]]
          :left-join [[:idents :rev-idents] [:= :attrs.reverse-ident :rev-idents.id]]
          :where [:= :attrs.app-id [:cast app-id :uuid]]}))))

;; ------
;; seek

(defn seek-by-id
  [id attrs]
  (ucoll/seek (comp #{id} :id) attrs))

(defn seek-by-fwd-ident-name [n attrs]
  (ucoll/seek (comp #{n} fwd-ident-name) attrs))

(defn seek-by-rev-ident-name [n attrs]
  (ucoll/seek (comp #{n} rev-ident-name) attrs))

(defn attrs-by-id [attrs]
  (reduce (fn [acc attr]
            (assoc acc (:id attr) attr))
          {}
          attrs))

;; ------
;; play

(comment
  (delete-by-app-id! aurora/conn-pool empty-app-id)
  (insert-multi!
   aurora/conn-pool
   empty-app-id
   [(gen/generate (s/gen ::attr))])
  (map (partial s/valid? ::attr)
       (get-by-app-id aurora/conn-pool empty-app-id))
  (def a (first (get-by-app-id aurora/conn-pool empty-app-id)))
  (update-multi!
   aurora/conn-pool
   empty-app-id
   [{:id (:id a)
     :forward-identity
     [(-> a :forward-identity first) "new_etype" "new_label"]
     :index? true}])
  (delete-multi!
   aurora/conn-pool
   empty-app-id
   [(:id a)]))
