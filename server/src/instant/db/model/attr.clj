(ns instant.db.model.attr
  (:require
   [clojure.core.cache.wrapped :as cache]
   [clojure.set :refer [map-invert]]
   [clojure.spec.alpha :as s]
   [clojure.spec.gen.alpha :as gen]
   [clojure.string :as string]
   [honey.sql :as hsql]
   [instant.data.constants :refer [empty-app-id]]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.system-catalog :refer [system-catalog-app-id]]
   [instant.util.exception :as ex]
   [instant.util.spec :as uspec]
   [instant.util.string :as string-util]))

(def types
  [:number
   :string
   :boolean
   :json])

(def type->binary (into {}
                        (map-indexed (fn [i type]
                                       [type (bit-shift-left 1 i)])
                                     types)))

(def binary->type (map-invert type->binary))

(defn inferred-value-type [v]
  (cond (uuid? v) :string
        (string? v) :string
        (number? v) :number
        (boolean? v) :boolean
        :else :json))

(defn friendly-inferred-types [b]
  (set (keep (fn [[type bin]]
               (when (not= 0 (bit-and b bin))
                 type))
             type->binary)))

(defn binary-inferred-types [friendly-set]
  (reduce (fn [acc friendly-type]
            (bit-or acc (type->binary friendly-type)))
          0
          friendly-set))

(def checked-data-types #{"number" "string" "boolean" "date"})

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

(s/def ::checked-data-type checked-data-types)

(s/def ::indexing? boolean?)
(s/def ::checking-data-type? boolean?)
(s/def ::setting-unique? boolean?)

(s/def ::attr-common (s/keys :req-un
                             [::id
                              ::forward-identity
                              ::value-type
                              ::cardinality
                              ::unique?
                              ::index?]
                             :opt-un
                             [::checked-data-type
                              ::indexing?
                              ::checking-data-type?
                              ::setting-unique?]))

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

(def rev-etype
  "Given an attr, return it's reverse etype or nil"
  (comp second :reverse-identity))

(defn fwd-friendly-name
  "Given an attr, returns `etype.label`"
  [attr]
  (format "%s.%s" (fwd-etype attr) (fwd-label attr)))

;; -------
;; caching

(def attr-cache (cache/lru-cache-factory {} :threshold 256))

(defn evict-app-id-from-cache [app-id]
  (cache/evict attr-cache app-id))

(defmacro with-cache-invalidation [app-id & body]
  `(do
     (evict-app-id-from-cache ~app-id)
     (let [res# ~@body]
       (evict-app-id-from-cache ~app-id)
       res#)))

;; -----------------
;; delete-by-app-id!

(defn delete-by-app-id!
  "Deletes all attrs for an app. Note: This will also delete all triples for an app"
  [conn app-id]
  (with-cache-invalidation app-id
    (sql/do-execute!
     ::delete-by-app-id!
     conn
     ["DELETE FROM attrs WHERE attrs.app_id = ?::uuid" app-id])))

;; ------
;; insert-multi!

(def attr-table-cols
  "Manual reflection of postgres attr table columns"
  [:id :app-id :value-type
   :cardinality :is-unique :is-indexed
   :forward-ident :reverse-ident :on-delete
   :checked-data-type])

(defn attr-table-values
  "Marshals a collection of attrs into insertable sql attr values"
  [app-id attrs]
  (map (fn [{:keys [id value-type cardinality unique? index?
                    forward-identity reverse-identity on-delete
                    checked-data-type]}]
         [id
          app-id
          [:cast (when value-type (name value-type)) :text]
          [:cast (when cardinality (name cardinality)) :text]
          [:cast unique? :boolean]
          [:cast index? :boolean]
          [:cast (first forward-identity) :uuid]
          [:cast (first reverse-identity) :uuid]
          [:cast (some-> on-delete name) :attr_on_delete]
          [:cast (some-> checked-data-type name) :checked_data_type]])
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

(defn validate-reserved-names!
  "Prevents users from creating namespaces that start with `$`. Only looks
   at the forward-identity. That way users can still create links into the
   reserved namespaces.
   We need this so that users don't clash with special namespaces, like the
   $users table and $files rules."
  [attrs]
  (doseq [attr attrs]
    (when-let [fwd-etype (-> attr :forward-identity second)]
      (when (string/starts-with? fwd-etype "$")
        (ex/throw-validation-err!
         :attributes
         attr
         [{:message (string-util/multiline->single-line
                     "Namespaces are not allowed to start with a `$`.
                      Those are reserved for system namespaces.")}])))))

(defn validate-on-deletes!
  "Prevents users from setting on-delete :cascade on attrs. This would
   be a nice feature to release, but it needs some thought on what
   restrictions we put in place. The implementation also needs optimization."
  [attrs]
  (doseq [attr attrs]
    (when (:on-delete attr)
      (ex/throw-validation-err!
       :attributes
       attr
       [{:message "The :on-delete property can't be set on an attribute."}]))))

(defn insert-multi!
  "Attr data is expressed as one object in clj but is persisted across two tables
   in sql: `attrs` and `idents`.

   We extract relevant data for each table and build a CTE to insert into
   both tables in one statement"
  ([conn app-id attrs]
   (insert-multi! conn app-id attrs {:allow-reserved-names? false
                                     :allow-on-deletes? false}))
  ([conn app-id attrs {:keys [allow-reserved-names?
                              allow-on-deletes?]}]
   (when-not allow-reserved-names?
     (validate-reserved-names! attrs))
   (when-not allow-on-deletes?
     (validate-on-deletes! attrs))
   (with-cache-invalidation app-id
     (sql/do-execute!
      ::insert-multi!
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
                 ;; This can still conflict on (app_id, etype, label),
                 ;; but you can only handle a single constraint.
                 ;; MERGE in postgres > 15 may fix this issue
                 :on-conflict {:on-constraint :idents_pkey}
                 :do-update-set {:etype [:case
                                         (list* :and
                                                (map (fn [col]
                                                       [:=
                                                        (qualify-col :idents col)
                                                        (qualify-col :EXCLUDED col)])
                                                     ident-table-cols))
                                         :EXCLUDED.etype
                                         ;; raise_exception_message is typed to return
                                         ;; a boolean, so we cast it to text so that it
                                         ;; can throw its exception
                                         :else [:cast
                                                [:raise_exception_message
                                                 [:||
                                                  "Another attribute for "
                                                  :EXCLUDED.etype  "." :EXCLUDED.label
                                                  " exists with different properties."]]
                                                :text]]}
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
                 :on-conflict {:on-constraint :attrs_pkey}
                 :do-update-set {:value_type [:case
                                              (list* :and
                                                     (map (fn [col]
                                                            ;; Some fields can be null, so we need to
                                                            ;; use "distinct from" instead of "="
                                                            [:raw [[:inline (qualify-col :attrs col)]
                                                                   " is not distinct from "
                                                                   [:inline (qualify-col :EXCLUDED col)]]])
                                                          attr-table-cols))
                                              :EXCLUDED.value_type
                                              ;; raise_exception_message is typed to return
                                              ;; a boolean, so we cast it to text so that it
                                              ;; can throw its exception
                                              :else [:cast
                                                     [:raise_exception_message
                                                      [:||
                                                       "The attribute with id "
                                                       [:cast :EXCLUDED.id :text]
                                                       " conflicts with an existing attribute with id "
                                                       [:cast :attrs.id :text] "."]]
                                                     :text]]}
                 :returning [:id]}]]
        :union-all
        [{:select :id :from :ident-inserts}
         {:select :id :from :attr-inserts}]})))))

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
  (validate-reserved-names! updates)
  (with-cache-invalidation app-id
    (sql/do-execute!
     ::update-multi!
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
       :select :%count.* :from :union-ids}))))

(defn delete-multi!
  "Deletes a batch of attrs for an app. We
   rely on CASCADE DELETE to remove associated
   idents and triples"
  [conn app-id ids]
  (with-cache-invalidation app-id
    (sql/do-execute!
     ::delte-multi!
     conn
     (hsql/format
      {:delete-from :attrs
       :where [[:and
                [:= :app-id app-id]
                [:in :id ids]]]}))))
;; -------
;; app-attrs

(defn- row->attr
  "Clj representation of sql attrs"
  [{:keys [id
           app_id
           value_type
           cardinality
           is_unique
           is_indexed
           forward_ident
           fwd_label
           fwd_etype
           reverse_ident
           rev_label
           rev_etype
           inferred_types
           on_delete
           checked_data_type
           checking_data_type
           indexing
           setting_unique]}]
  (cond-> {:id id
           :value-type (keyword value_type)
           :cardinality (keyword cardinality)
           :forward-identity [forward_ident fwd_etype fwd_label]
           :unique? is_unique
           :index? is_indexed
           :inferred-types (when inferred_types
                             (friendly-inferred-types inferred_types))
           :catalog (if (= app_id system-catalog-app-id)
                      :system
                      :user)}
    on_delete (assoc :on-delete (keyword on_delete))
    reverse_ident (assoc :reverse-identity [reverse_ident rev_etype rev_label])
    checked_data_type (assoc :checked-data-type (keyword checked_data_type))
    checking_data_type (assoc :checking-data-type? true)
    indexing (assoc :indexing? true)
    setting_unique (assoc :setting-unique? true)))

(defn index-attrs
  "Groups attrs by common lookup patterns so that we can efficiently look them up."
  [attrs]
  (reduce (fn [acc attr]
            (cond-> acc
              true
              (update :by-id assoc (:id attr) attr)

              true
              (update :by-fwd-ident assoc (fwd-ident-name attr) attr)

              (seq (rev-ident-name attr))
              (update :by-rev-ident assoc (rev-ident-name attr) attr)

              true
              (update :ids-by-etype update (fwd-etype attr) (fnil conj #{}) (:id attr))))
          {:by-id {}
           :by-fwd-ident {}
           :by-rev-ident {}
           :ids-by-etype {}}
          attrs))

(defprotocol AttrsExtension
  (seekById [this id])
  (seekByFwdIdentName [this fwd-ident])
  (seekByRevIdentName [this revIdent])
  (attrIdsForEtype [this etype])
  (unwrap [this]))

;; Creates a wrapper over attrs. Makes them act like a regular list, but
;; we can also index them on demand so that our access patterns will be
;; efficient.
(deftype Attrs [elements cache]
  clojure.lang.ISeq
  (count [_this]
    (count elements))
  (first [_this]
    (first elements))
  (next [_this]
    (let [nxt (next elements)]
      (if nxt
        (Attrs. nxt (delay (index-attrs nxt)))
        nil)))
  (more [_this]
    (if-let [nxt (next elements)]
      (Attrs. nxt (delay (index-attrs nxt)))
      clojure.lang.PersistentList/EMPTY))
  (empty [_this]
    (Attrs. () (delay {})))
  (equiv [_this other]
    (= elements other))
  (cons [_this o]
    (let [new-elements (cons o elements)]
      (Attrs. new-elements (delay (index-attrs new-elements)))))
  (seq [this]
    (if (empty? elements)
      nil
      this))

  AttrsExtension
  (seekById [_this id]
    (-> @cache
        :by-id
        (get id)))
  (seekByFwdIdentName [_this fwdIdent]
    (-> @cache
        :by-fwd-ident
        (get fwdIdent)))
  (seekByRevIdentName [_this revIdent]
    (-> @cache
        :by-rev-ident
        (get revIdent)))
  (attrIdsForEtype [_this etype]
    (-> @cache
        :ids-by-etype
        (get etype #{})))
  (unwrap [_this]
    elements))

(defn wrap-attrs [attrs]
  (Attrs. attrs (delay (index-attrs attrs))))

(defn get-by-app-id*
  "Returns clj representation of all attrs for an app"
  [conn app-id]
  (wrap-attrs
   (map row->attr
        (sql/select
         ::get-by-app-id*
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
           :where [:or
                   [:= :attrs.app-id [:cast app-id :uuid]]
                   [:= :attrs.app-id [:cast system-catalog-app-id :uuid]]]})))))

(defn get-by-app-id
  ([app-id]
   (cache/lookup-or-miss attr-cache app-id (partial get-by-app-id* (aurora/conn-pool))))
  ([conn app-id]
   (if (= conn (aurora/conn-pool))
     (get-by-app-id app-id)
     ;; Don't cache if we're using a custom connection
     (get-by-app-id* conn app-id))))

;; ------
;; seek

(defn seek-by-id
  [id ^Attrs attrs]
  (.seekById attrs id))

(defn seek-by-fwd-ident-name [n ^Attrs attrs]
  (.seekByFwdIdentName attrs n))

(defn seek-by-rev-ident-name [n ^Attrs attrs]
  (.seekByRevIdentName attrs n))

(defn attr-ids-for-etype [etype ^Attrs attrs]
  (.attrIdsForEtype attrs etype))

(defn remove-hidden
  "Removes the system attrs that might be confusing for the users."
  [^Attrs attrs]
  (remove (fn [a]
            (and (= :system (:catalog a))
                 (not= "$users" (fwd-etype a))))
          attrs))

;; ------
;; play

(comment
  (delete-by-app-id! (aurora/conn-pool) empty-app-id)
  (insert-multi!
   (aurora/conn-pool)
   empty-app-id
   [(gen/generate (s/gen ::attr))])
  (map (partial s/valid? ::attr)
       (get-by-app-id (aurora/conn-pool) empty-app-id))
  (def a (first (get-by-app-id (aurora/conn-pool) empty-app-id)))
  (update-multi!
   (aurora/conn-pool)
   empty-app-id
   [{:id (:id a)
     :forward-identity
     [(-> a :forward-identity first) "new_etype" "new_label"]
     :index? true}])
  (delete-multi!
   (aurora/conn-pool)
   empty-app-id
   [(:id a)]))
