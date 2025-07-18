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
   [instant.util.coll :as coll]
   [instant.util.crypt :refer [json-null-md5]]
   [instant.util.exception :as ex]
   [instant.util.spec :as uspec]
   [instant.util.string :as string-util]
   [instant.util.uuid :as uuid]))

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
   :forward-ident :etype :label
   :reverse-ident :reverse-etype :reverse-label
   :on-delete :on-delete-reverse
   :checked-data-type])

(defn attr-table-values
  "Marshals a collection of attrs into insertable sql attr values"
  [app-id attrs]
  (map (fn [attr]
         (let [{:keys [id value-type cardinality unique? index? required?
                       forward-identity reverse-identity on-delete on-delete-reverse
                       checked-data-type]} attr
               [forward-ident etype label] forward-identity
               [reverse-ident reverse-etype reverse-label] reverse-identity]
           [id
            app-id
            [:cast (when value-type (name value-type)) :text]
            [:cast (when cardinality (name cardinality)) :text]
            [:cast unique? :boolean]
            [:cast index? :boolean]
            [:cast required? :boolean]
            [:cast forward-ident :uuid]
            [:cast etype :text]
            [:cast label :text]
            [:cast reverse-ident :uuid]
            [:cast reverse-etype :text]
            [:cast reverse-label :text]
            [:cast (some-> on-delete name) :attr_on_delete]
            [:cast (some-> on-delete-reverse name) :attr_on_delete]
            [:cast (some-> checked-data-type name) :checked_data_type]]))
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
  (mapcat (fn [{:keys [id forward-identity reverse-identity]}]
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

(defn validate-add-required! [conn app-id attrs]
  (doseq [attr  attrs
          :when (:required? attr)
          :let  [[_ etype label] (:forward-identity attr)
                 query "SELECT *
                          FROM attrs
                          JOIN triples ON attrs.id = triples.attr_id
                         WHERE attrs.app_id = ?app-id
                           AND attrs.etype = ?etype
                           AND triples.app_id = ?app-id
                         LIMIT 1"
                 res   (sql/execute! conn (sql/format query {"?etype" etype, "?app-id" app-id}))]
          :when (seq res)]
    (ex/throw-validation-err!
     :attributes
     attr
     [{:message (str "Can't create attribute `" label "` as required because `" etype "` already have entities")}])))

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
   (validate-add-required! conn app-id attrs)
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
                           :join [[:attrs :id-attr]
                                  [:and
                                   [:= :id-attr.app-id app-id]
                                   [:= :id-attr.label "id"]
                                   [:= :id-attr.etype :attr-inserts.etype]]

                                  [:triples :needs-null-triple]
                                  [:and
                                   [:= :needs-null-triple.app-id app-id]
                                   [:= :needs-null-triple.attr-id :id-attr.id]
                                   ;; No existing triple for this attr
                                   ;; This should always be null here, but just in case...
                                   [:not [:exists {:select :1
                                                   :from :triples
                                                   :where [:and
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

(defn validate-update-required! [conn app-id attrs]
  (when-some [attrs (not-empty (filter :required? attrs))]
    (let [query "WITH attrs_cte AS (
                   SELECT CAST(elem AS uuid) AS id
                   FROM JSONB_ARRAY_ELEMENTS_TEXT(CAST(?attr-ids AS JSONB)) AS elem
                 ),

                 attrs_etype_cte AS (
                   SELECT attrs.id, attrs.etype, attrs.label
                     FROM attrs_cte
                     JOIN attrs ON attrs_cte.id = attrs.id
                 )

                 SELECT attrs_etype_cte.*,
                        attr_cnt.cnt AS attr_count,
                        etype_cnt.cnt AS etype_count
                 FROM attrs_etype_cte,

                 LATERAL (
                   SELECT count(DISTINCT triples.entity_id) AS cnt
                     FROM triples
                    WHERE triples.app_id = ?app-id
                      AND triples.attr_id = attrs_etype_cte.id
                     AND triples.value IS NOT NULL
                     AND triples.value <> 'null'
                 ) AS attr_cnt,

                 LATERAL (
                   SELECT count(DISTINCT triples.entity_id) AS cnt
                     FROM triples
                    WHERE triples.app_id = ?app-id
                      AND triples.attr_id IN (
                       SELECT attrs.id
                         FROM attrs
                        WHERE attrs.app_id = ?app-id
                          AND attrs.etype = attrs_etype_cte.etype
                      )
                     AND triples.value IS NOT NULL
                     AND triples.value <> 'null'
                 ) AS etype_cnt"
          params {"?attr-ids" (mapv :id attrs)
                  "?app-id"   app-id}
          res    (sql/execute! conn (sql/format query params))]
      (doseq [{:keys [id etype label attr_count etype_count]} res
              :when (not= attr_count etype_count)]
        (ex/throw-validation-err!
         :attributes
         {:id id}
         [{:message (str "Can't update attribute `" label "` to required because `" etype "` already have entities without it")}])))))

(defn update-multi!
  [conn app-id updates]
  (validate-reserved-names! updates)
  (with-cache-invalidation app-id
    (sql/do-execute!
     ::update-multi!
     conn
     (hsql/format
      {:with (concat
              [[[:attr-values
                 {:columns attr-table-cols}]
                {:values (attr-table-values app-id updates)}]
               [:attr-updates
                {:update :attrs
                 :set {:etype             (not-null-or :attr-values.etype :attrs.etype)
                       :label             (not-null-or :attr-values.label :attrs.label)
                       :reverse-etype     (not-null-or :attr-values.reverse-etype :attrs.reverse-etype)
                       :reverse-label     (not-null-or :attr-values.reverse-label :attrs.reverse-label)
                       :value-type        (not-null-or :attr-values.value-type :attrs.value-type)
                       :cardinality       (not-null-or :attr-values.cardinality :attrs.cardinality)
                       :is-unique         (not-null-or :attr-values.is-unique :attrs.is-unique)
                       :is-indexed        (not-null-or :attr-values.is-indexed :attrs.is-indexed)
                       :is-required       (not-null-or :attr-values.is-required :attrs.is-required)
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
              (if-some [ident-table-vals (seq (ident-table-values app-id updates))]
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
           etype
           label
           reverse_ident
           reverse_etype
           reverse_label
           inferred_types
           on_delete
           on_delete_reverse
           checked_data_type
           checking_data_type
           indexing
           setting_unique]}]
  (cond-> (transient {:id               id
                      :value-type       (keyword value_type)
                      :cardinality      (keyword cardinality)
                      :forward-identity [forward_ident etype label]
                      :unique?          is_unique
                      :index?           is_indexed
                      :required?        (or is_required false)
                      :inferred-types   (when inferred_types
                                          (friendly-inferred-types inferred_types))
                      :catalog          (if (= app_id system-catalog-app-id)
                                          :system
                                          :user)})
    on_delete          (assoc! :on-delete (keyword on_delete))
    on_delete_reverse  (assoc! :on-delete-reverse (keyword on_delete_reverse))
    reverse_ident      (assoc! :reverse-identity [reverse_ident reverse_etype reverse_label])
    checked_data_type  (assoc! :checked-data-type (keyword checked_data_type))
    checking_data_type (assoc! :checking-data-type? true)
    indexing           (assoc! :indexing? true)
    setting_unique     (assoc! :setting-unique? true)
    true               persistent!))

;; Creates a wrapper over attrs. Makes them act like a regular list, but
;; we can also index them on demand so that our access patterns will be
;; efficient.
(declare wrap-attrs)

(deftype Attrs [elements
                by-id-cache
                by-fwd-ident-cache
                by-rev-ident-cache
                ids-by-etype-cache
                ea-ids-by-etype-cache]
  clojure.lang.ISeq
  (count [_this]
    (count elements))
  (first [_this]
    (first elements))
  (next [_this]
    (some-> elements next wrap-attrs))
  (more [_this]
    (if-some [nxt (next elements)]
      (wrap-attrs nxt)
      clojure.lang.PersistentList/EMPTY))
  (empty [_this]
    (wrap-attrs ()))
  (equiv [_this other]
    (if (instance? Attrs other)
      (= elements (.-elements ^Attrs other))
      (= elements other)))
  (cons [_this other]
    (wrap-attrs (cons other elements)))
  (seq [this]
    (if (empty? elements)
      nil
      this))

  clojure.lang.IHashEq
  (hasheq [_this]
    (hash elements))

  java.lang.Object
  (equals [_this other]
    (and (instance? Attrs other)
         (= elements (.-elements ^Attrs other))))
  (hashCode [_this]
    (hash elements)))

(defn wrap-attrs ^Attrs [attrs]
  (Attrs.
   attrs
   ;; by-id-cache
   (delay
     (coll/map-by :id attrs))
   ;; by-fwd-ident-cache
   (delay
     (coll/map-by fwd-ident-name attrs))
   ;; by-rev-ident-cache
   (delay
     (->> attrs
          (filter rev-ident-name)
          (coll/map-by rev-ident-name)))
   ;; ids-by-etype-cache
   (delay
     (coll/group-by-to fwd-etype :id #{} attrs))
   ;; ea-ids-by-etype-cache
   (delay
     (->> attrs
          (filter #(= :one (:cardinality %)))
          (coll/group-by-to fwd-etype :id #{})))))

(defn unwrap [^Attrs attrs]
  (.-elements attrs))

(defn get-by-app-id*
  "Returns clj representation of all attrs for an app"
  [conn app-id]
  (wrap-attrs
   (mapv row->attr
         (sql/select
          ::get-by-app-id*
          conn
          (sql/format
           "SELECT
              *
            FROM
              attrs
            WHERE
              app_id = CAST(?app-id AS UUID)
              OR app_id = CAST(?system-catalog-app-id AS UUID)
            ORDER BY
              id ASC"
           {"?app-id" app-id
            "?system-catalog-app-id" system-catalog-app-id})))))

(defn get-by-app-id
  ([app-id]
   (cache/lookup-or-miss attr-cache app-id (partial get-by-app-id* (aurora/conn-pool :read))))
  ([conn app-id]
   (if (= conn (aurora/conn-pool :read))
     (get-by-app-id app-id)
     ;; Don't cache if we're using a custom connection
     (get-by-app-id* conn app-id))))

(defn get-by-app-ids
  "Returns a map of attrs by app-id"
  ([app-ids]
   (get-by-app-ids (aurora/conn-pool :read) app-ids))
  ([conn app-ids]
   (let [rows (sql/select
               ::get-by-app-ids
               conn
               (hsql/format
                {:select [:attrs.*
                          [:etype :fwd-etype]
                          [:label :fwd-label]
                          [:reverse_etype :rev-etype]
                          [:reverse_label :rev-label]]
                 :from :attrs
                 :where [:= :attrs.app-id [:any (with-meta (conj (set app-ids) system-catalog-app-id)
                                                  {:pgtype "uuid[]"})]]}))
         rows-by-app-id (group-by :app_id rows)
         system-catalog-attrs (map row->attr (get rows-by-app-id system-catalog-app-id))]
     (reduce (fn [acc app-id]
               (assoc acc app-id (wrap-attrs (concat (map row->attr (get rows-by-app-id app-id))
                                                     system-catalog-attrs))))
             {}
             app-ids))))

;; ------
;; seek

(defn seek-by-id [id ^Attrs attrs]
  (get @(.-by-id-cache attrs) id))

(defn seek-by-fwd-ident-name [fwd-ident ^Attrs attrs]
  (get @(.-by-fwd-ident-cache attrs) fwd-ident))

(defn seek-by-rev-ident-name [rev-ident ^Attrs attrs]
  (get @(.-by-rev-ident-cache attrs) rev-ident))

(defn attr-ids-for-etype [etype ^Attrs attrs]
  (get @(.-ids-by-etype-cache attrs) etype #{}))

(defn ea-ids-for-etype [etype ^Attrs attrs]
  (get @(.-ea-ids-by-etype-cache attrs) etype #{}))

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
