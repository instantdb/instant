(ns instant.db.model.attr
  (:require
   [clojure.core.cache.wrapped :as cache]
   [clojure.set :refer [map-invert]]
   [clojure.spec.alpha :as s]
   [clojure.string :as string]
   [honey.sql :as hsql]
   [instant.db.model.triple-cols :refer [triple-cols]]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.system-catalog :refer [system-catalog-app-id]]
   [instant.util.crypt :refer [json-null-md5]]
   [instant.util.exception :as ex]
   [instant.util.spec :as uspec]
   [instant.util.string :as string-util]
   [instant.util.uuid :as uuid]
   [next.jdbc :as next-jdbc]))

(set! *warn-on-reflection* true)

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

(s/def ::required? boolean?)

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
                             [::required?
                              ::checked-data-type
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
  next)

(defn fwd-ident-name
  "Returns forward etype and label for an attr"
  [attr]
  (-> attr :forward-identity ident-name))

(defn rev-ident-name
  "Returns reverse etype and label for an attr. Note: Reverse identity may not exist"
  [attr]
  (-> attr :reverse-identity ident-name))

(defn fwd-etype
  "Given an attr, return it's forward etype"
  [attr]
  (-> attr :forward-identity (nth 1)))

(defn fwd-label
  "Given an attr, return it's forward label"
  [attr]
  (-> attr :forward-identity (nth 2)))

(defn rev-etype
  "Given an attr, return it's reverse etype or nil"
  [attr]
  (-> attr :reverse-identity (nth 1)))

(defn fwd-friendly-name
  "Given an attr, returns `etype.label`"
  [attr]
  (str (fwd-etype attr) "." (fwd-label attr)))

(defn attr-details [attr]
  {:etype (fwd-etype attr)
   :label (fwd-label attr)})

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
   :cardinality :is-unique :is-indexed :is-required
   :forward-ident :reverse-ident :on-delete :on-delete-reverse
   :checked-data-type])

(defn attr-table-values
  "Marshals a collection of attrs into insertable sql attr values"
  [app-id attrs]
  (map (fn [{:keys [id value-type cardinality unique? index? required?
                    forward-identity reverse-identity on-delete on-delete-reverse
                    checked-data-type]}]
         [id
          app-id
          [:cast (when value-type (name value-type)) :text]
          [:cast (when cardinality (name cardinality)) :text]
          [:cast unique? :boolean]
          [:cast index? :boolean]
          [:cast (or required? false) :boolean]
          [:cast (first forward-identity) :uuid]
          [:cast (first reverse-identity) :uuid]
          [:cast (some-> on-delete name) :attr_on_delete]
          [:cast (some-> on-delete-reverse name) :attr_on_delete]
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

(defn insert-multi!
  "Attr data is expressed as one object in clj but is persisted across two tables
   in sql: `attrs` and `idents`.

   We extract relevant data for each table and build a CTE to insert into
   both tables in one statement"
  ([conn app-id attrs]
   (insert-multi! conn app-id attrs {:allow-reserved-names? false}))
  ([conn app-id attrs {:keys [allow-reserved-names?]}]
   (when-not allow-reserved-names?
     (validate-reserved-names! attrs))
   (with-cache-invalidation app-id
     (let [query {:with [[[:attr-values
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
                           ;; MERGE in postgres > 17 may fix this issue
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
                           :returning :*}]
                         [:attr-idents
                          {:union
                           [{:select :* :from :ident-inserts}
                            {:select :*
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
                             :join [:attr-idents
                                    [:= :attr-values.forward-ident :attr-idents.id]]}]
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
                           :returning :*}]

                         [:indexed-null-triples
                          {:select [[:attr-inserts.app-id :app-id]
                                    [:needs-null-triple.entity-id :entity-id]
                                    [:attr-inserts.id :attr-id]
                                    [[:cast "null" :jsonb] :value]
                                    [[:inline json-null-md5] :value-md5]
                                    [[:= :attr-inserts.cardinality [:inline "one"]] :ea]
                                    [[:= :attr-inserts.value_type [:inline "ref"]] :eav]
                                    [:attr-inserts.is_unique :av]
                                    [:attr-inserts.is_indexed :ave]
                                    [[:= :attr-inserts.value_type [:inline "ref"]] :vae]
                                    [:attr-inserts.checked-data-type :checked-data-type]]
                           :from :attr-inserts
                           :where [:and
                                   [:= :attr-inserts.value-type [:inline "blob"]]
                                   :attr-inserts.is-indexed]
                           :join [[:attr-idents :ident]
                                  [:= :attr-inserts.forward-ident :ident.id]

                                  [:idents :id-ident]
                                  [:and
                                   [:= :id-ident.app-id app-id]
                                   [:= :id-ident.label [:inline "id"]]
                                   [:= :id-ident.etype :ident.etype]]

                                  [:attrs :id-attr]
                                  [:and
                                   [:= :id-attr.app-id app-id]
                                   [:= :id-attr.forward-ident :id-ident.id]]

                                  [:triples :needs-null-triple]
                                  [:and
                                   [:= :needs-null-triple.app-id app-id]
                                   [:= :needs-null-triple.attr-id :id-attr.id]
                                   ;; No existing triple for this attr
                                   ;; This should always be null here, but just in case...
                                   [:not [:exists {:select :1
                                                   :from :triples
                                                   :where [:and
                                                           :triples.ave
                                                           [:= :triples.app-id app-id]
                                                           [:= :triples.attr-id :attr-inserts.id]
                                                           [:= :triples.entity-id :needs-null-triple.entity-id]]}]]]]}]
                         [:indexed-null-inserts
                          {:insert-into [[:triples triple-cols]
                                         {:select triple-cols
                                          :from :indexed-null-triples}]
                           :on-conflict [:app-id :entity-id :attr-id :value-md5]
                           :do-nothing true
                           :returning :entity-id}]]
                  :select [[[:json_build_object
                             "idents" [:coalesce
                                       {:select [[[:json_agg :id]]]
                                        :from :ident-inserts}
                                       [:cast [:inline "[]"] :json]]
                             "attrs" [:coalesce
                                      {:select [[[:json_agg :id]]]
                                       :from :attr-inserts}
                                      [:cast [:inline "[]"] :json]]
                             "triples" [:coalesce
                                        {:select [[[:json_agg :entity-id]]]
                                         :from :indexed-null-inserts}
                                        [:cast [:inline "[]"] :json]]]]]}
           result (sql/execute-one! ::insert-multi! conn (hsql/format query))]
       {:attrs (-> result
                   (get-in [:json_build_object "attrs"])
                   (#(map (fn [id]
                            {:id (uuid/parse-uuid id)})
                          %)))
        :idents (-> result
                    (get-in [:json_build_object "idents"])
                    (#(map (fn [id]
                             {:id (uuid/parse-uuid id)})
                           %)))
        :triples (-> result
                     (get-in [:json_build_object "triples"])
                     (#(map (fn [id]
                              {:entity_id (uuid/parse-uuid id)})
                            %)))}))))

(defn- not-null-or [check fallback]
  [:case [:not= check nil] check :else fallback])

(defn- changes-that-require-attr-model-updates
  [updates]
  (let [ks #{:cardinality :value-type :unique? :index? :on-delete :on-delete-reverse}]
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
                   :set {:value-type        (not-null-or :attr-values.value-type :attrs.value-type)
                         :cardinality       (not-null-or :attr-values.cardinality :attrs.cardinality)
                         :is-unique         (not-null-or :attr-values.is-unique :attrs.is-unique)
                         :is-indexed        (not-null-or :attr-values.is-indexed :attrs.is-indexed)
                         :on-delete         :attr-values.on-delete
                         :on-delete-reverse :attr-values.on-delete-reverse}
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
           is_required
           forward_ident
           fwd_label
           fwd_etype
           reverse_ident
           rev_label
           rev_etype
           inferred_types
           on_delete
           on_delete_reverse
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
           :required? is_required
           :inferred-types (when inferred_types
                             (friendly-inferred-types inferred_types))
           :catalog (if (= app_id system-catalog-app-id)
                      :system
                      :user)}
    on_delete (assoc :on-delete (keyword on_delete))
    on_delete_reverse (assoc :on-delete-reverse (keyword on_delete_reverse))
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
              (update :ids-by-etype update (fwd-etype attr) (fnil conj #{}) (:id attr))

              (= :one (:cardinality attr))
              (update :ea-ids-by-etype update (fwd-etype attr) (fnil conj #{}) (:id attr))))
          {:by-id {}
           :by-fwd-ident {}
           :by-rev-ident {}
           :ids-by-etype {}
           :ea-ids-by-etype {}}
          attrs))

(defprotocol AttrsExtension
  (seekById [this id])
  (seekByFwdIdentName [this fwd-ident])
  (seekByRevIdentName [this revIdent])
  (attrIdsForEtype [this etype])
  (eaIdsForEtype [this etype])
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
    elements)
  (eaIdsForEtype [_this etype]
    (-> @cache
        :ea-ids-by-etype
        (get etype #{}))))

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
   (cache/lookup-or-miss attr-cache app-id (partial get-by-app-id* (aurora/conn-pool :read))))
  ([conn app-id]
   (if (= conn (aurora/conn-pool :read))
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

(defn ea-ids-for-etype [etype ^Attrs attrs]
  (.eaIdsForEtype attrs etype))

(defn remove-hidden
  "Removes the system attrs that might be confusing for the users."
  [^Attrs attrs]
  (remove (fn [a]
            (or
             (and (= :system (:catalog a))
                  (not (#{"$users" "$files"} (fwd-etype a))))
             (and (= "$files" (fwd-etype a))
                  (#{"content-type" "content-disposition" "size"
                     "location-id" "key-version"} (fwd-label a)))))
          attrs))

(defn resolve-attr-id [attrs etype label]
  {:post [(uuid? %)]}
  (let [wrapped-attrs (if (instance? Attrs attrs)
                        attrs
                        (wrap-attrs attrs))
        n [(name etype) (name label)]]
    (:id (or (seek-by-fwd-ident-name n wrapped-attrs)
             (seek-by-rev-ident-name n wrapped-attrs)))))

(defn get-attr-details
  "Used in exception to construct nicer error messages."
  [app-id attr-id]
  (let [attrs (get-by-app-id app-id)]
    (some-> (seek-by-id attr-id attrs)
            (attr-details))))

(ex/define-get-attr-details get-attr-details)

;; ------
;; required?

(defn check-required
  "Checks if attribute is effectiveliy required (all entities with the same etype have it set).
   Returns map with :count and first 10 :entity-ids that miss that attribute"
  [conn attr-id]
  (let [query "WITH inputs_cte AS (
                 SELECT idents.app_id, idents.etype, idents.label
                   FROM attrs
                   JOIN idents on attrs.forward_ident = idents.id
                  WHERE attrs.id = ?attr-id
                  LIMIT 1
               ),
               attr_ids_cte AS (
                 SELECT attr_id
                   FROM inputs_cte, idents
                   JOIN attrs ON idents.id = attrs.forward_ident
                  WHERE idents.etype = inputs_cte.etype
               ),
               triples_cte AS (
                 SELECT DISTINCT entity_id
                   FROM inputs_cte, triples
                  WHERE triples.attr_id IN (SELECT attr_id FROM attr_ids_cte)
                    AND triples.app_id = inputs_cte.app_id
               )
               SELECT triples_cte.entity_id, count(triples_cte.entity_id) OVER (), input_cte.etype, input_cte.label
                 FROM triples_cte
                 LEFT JOIN triples ON triples_cte.entity_id = triples.entity_id
                                  AND triples.attr_id = ?attr-id
                      JOIN input_cte ON 1 = 1
                WHERE triples.ctid IS NULL
                LIMIT 10"
        res (sql/execute! conn (sql/format query {"?attr-id" attr-id}))]
    (when (seq res)
      (let [{:keys [count etype label]} (first res)
            entity-ids (map :entity_id res)]
        (ex/throw+
         {::ex/message (str "Attribute " label " (" attr-id ") can’t be marked required because " count " " etype " entities are missing it")
          ::ex/type    ::validation-failed
          ::ex/hint    {:count count
                        :etype etype
                        :label label
                        :entity-ids entity-ids}})))))

(comment
  (check-required (aurora/conn-pool :read) #uuid "6eebf15a-ed3c-4442-8869-a44a7c85a1be")
  (check-required (aurora/conn-pool :read) #uuid "275e5c3c-d565-4f5a-b832-4290cc6de915"))

(defn set-required! [conn-pool attr-id value]
  (let [query "UPDATE attrs SET is_required = ?value WHERE id = ?attr-id"]
    (if value
      (do
        (next-jdbc/with-transaction [tx-conn conn-pool]
          ;; check that current attr is effectively required
          (check-required tx-conn attr-id)

          ;; swap is_required
          (sql/execute! tx-conn (sql/format query {"?value" true, "?attr-id" attr-id}))

          ;; commit for other txes to see results of this one
          )

        ;; now all new txes will validate against attr being required
        (next-jdbc/with-transaction [tx-conn conn-pool]
          ;; check again to catch possible txes between first check and flipping the flag
          (try
            (check-required tx-conn attr-id)
            (catch Exception e
              ;; undo is_required
              (sql/execute! tx-conn (sql/format query {"?value" false, "?attr-id" attr-id}))
              (throw e))))

        ;; success!
        )

      ;; can always flip to not required
      (sql/execute! conn-pool (sql/format query {"?value" false, "?attr-id" attr-id})))))
