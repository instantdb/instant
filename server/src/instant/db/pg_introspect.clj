(ns instant.db.pg-introspect
  (:require [clojure.string :as string]
            [honey.sql :as hsql]
            [instant.jdbc.sql :as sql]
            [instant.db.model.attr :as attr-model])
  (:import [java.util UUID]))

(def att-select
  [:*
   [{:select :typname
     :from [[:pg_catalog.pg_type :typ]]
     :where [:= :typ.oid :att.atttypid]}
    :typename]
   [[:exists {:select :*
              :from :pg_catalog.pg_index
              :where [:and
                      [:= :indrelid :att.attrelid]
                      ;; n.b. int2vectors are 0-indexed
                      [:= :att.attnum [:raw "indkey[0]"]]]
              }] :indexed]
   [[:exists {:select :*
              :from :pg_catalog.pg_constraint
              :where [:and
                      [:= :conrelid :att.attrelid]
                      [:= :att.attnum [:raw "conkey[0]"]]
                      [:= :contype [:inline "u"]]]
              }] :unique]])

(defn introspection-query [namespace]
  {:with [[:namespace {:select :*
                       :from [[:pg_catalog.pg_namespace :nsp]]
                       :where [:= :nsp.nspname namespace]}]
          [:tables {:select [:*
                             ;; table attributes
                             {:select [[[:json_agg [:row_to_json :att]] :attributes]]
                              :from [[{:select att-select
                                       :from [[:pg_catalog.pg_attribute :att]]
                                       :where [:and
                                               [:= :att.attrelid :rel.oid]
                                               [:> :att.attnum 0]
                                               [:not :att.attisdropped]]
                                       :order-by [:att.attnum]}
                                      :att]]}
                             ;; primary key constraint
                             {:select [[[:row_to_json :con] :primary-key]]
                              :from [[{:select [:*
                                                [{:select [[[:json_agg [:row_to_json :att]] :attributes]]
                                                  :from [[{:select att-select
                                                           :from [[:pg_catalog.pg_attribute :att]]
                                                           :where [:and
                                                                   [:= :att.attrelid :rel.oid]
                                                                   [:= :att.attnum [:any :con.conkey]]]}
                                                          :att]]}]]
                                       :from [[:pg_catalog.pg_constraint :con]]
                                       :where [:and
                                               [:= :con.contype [:inline "p"]]
                                               [:= :con.conrelid :rel.oid]]}
                                      :con]]}
                             ;; foreign key constraints
                             {:select [[[:json_agg [:row_to_json :con]] :foreign-keys]]
                              :from [[{:select [:*
                                                [{:select [[[:json_agg [:row_to_json :att]] :attributes]]
                                                  :from [[{:select att-select
                                                           :from [[:pg_catalog.pg_attribute :att]]
                                                           :where [:and
                                                                   [:= :att.attrelid :con.conrelid]
                                                                   [:= :att.attnum [:any :con.conkey]]]}
                                                          :att]]}]
                                                [{:select [[[:json_agg [:row_to_json :att]] :foreign_attributes]]
                                                  :from [[{:select att-select
                                                           :from [[:pg_catalog.pg_attribute :att]]
                                                           :where [:and
                                                                   [:= :att.attrelid :con.confrelid]
                                                                   [:= :att.attnum [:any :con.confkey]]]}
                                                          :att]]}]
                                                [{:select [[[:row_to_json :rel] :foreign-table]]
                                                  :from [[{:select :*
                                                           :from [[:pg_catalog.pg_class :rel]]
                                                           :where [:and
                                                                   [:= :con.confrelid :rel.oid]]}
                                                          :rel]]}]]
                                       :from [[:pg_catalog.pg_constraint :con]]
                                       :where [:and
                                               [:= :con.contype [:inline "f"]]
                                               [:= :con.conrelid :rel.oid]]}
                                      :con]]}
                             ;; foreign key constraints that reference this table
                             {:select [[[:json_agg [:row_to_json :con]] :reverse-foreign-keys]]
                              :from [[{:select [:*
                                                [{:select [[[:json_agg [:row_to_json :att]] :attributes]]
                                                  :from [[{:select att-select
                                                           :from [[:pg_catalog.pg_attribute :att]]
                                                           :where [:and
                                                                   [:= :att.attrelid :con.confrelid]
                                                                   [:= :att.attnum [:any :con.confkey]]]}
                                                          :att]]}]
                                                [{:select [[[:json_agg [:row_to_json :att]] :parent_attributes]]
                                                  :from [[{:select :*
                                                           :from [[:pg_catalog.pg_attribute :att]]
                                                           :where [:and
                                                                   [:= :att.attrelid :con.conrelid]
                                                                   [:= :att.attnum [:any :con.conkey]]]}
                                                          :att]]}]
                                                [{:select [[[:row_to_json :rel] :parent-table]]
                                                  :from [[{:select :*
                                                           :from [[:pg_catalog.pg_class :rel]]
                                                           :where [:and
                                                                   [:= :con.conrelid :rel.oid]]}
                                                          :rel]]}]]
                                       :from [[:pg_catalog.pg_constraint :con]]
                                       :where [:and
                                               [:= :con.contype [:inline "f"]]
                                               [:= :con.confrelid :rel.oid]]}
                                      :con]]}]
                    :from [[:pg_catalog.pg_class :rel]]
                    :where [:and
                            [:in :rel.relnamespace {:select :oid :from :namespace}]
                            [:= :rel.relkind [:inline "r"]]]}]]
   :select [[[:json_build_object
              "tables" {:select [[[:json_agg [:row_to_json :tables]]]]
                        :from :tables}]]]})

(defn get-introspection-result [conn namespace]
  (-> (sql/select conn (hsql/format (introspection-query namespace)))
      first
      :json_build_object))

(defn attribute->attr-id [att]
  (UUID. (Long. ^String (get att "attrelid"))
         (get att "attnum")))

(defn constraint->attr-id [con]
  (UUID. (Long. ^String (get con "oid")) 0))

(defn attribute->attr [relation attribute]
  {:id (attribute->attr-id attribute)
   :value-type :blob
   :cardinality :one
   ;; TODO(byop): id for forward-identity
   :forward-identity [(random-uuid)
                      (get relation "relname")
                      (get attribute "attname")]
   :unique? (get attribute "unique")
   :index? (get attribute "indexed")
   ;; TODO(byop): This won't work with multi-column primary keys
   :primary? (= (get attribute "attnum")
                (-> relation
                    (get "primary_key")
                    (get "attributes")
                    first
                    (get "attnum")))})

(defn foreign-key->attr [relation constraint]
  {:id (constraint->attr-id constraint)
   :value-type :ref
   :cardinality :one
   ;; TODO(byop): id for forward-identity
   :forward-identity [(random-uuid)
                      (get relation "relname")
                      (-> constraint
                          (get "foreign_table")
                          (get "relname"))
                      (-> constraint
                          (get "attributes")
                          first
                          (get "indexed"))]
   ;; TODO(byop): id for reverse-identity
   :reverse-identity [(random-uuid)
                      (-> constraint
                          (get "foreign_table")
                          (get "relname"))
                      (get relation "relname")
                      (-> constraint
                          (get "foreign_attributes")
                          first
                          (get "indexed"))]
   :index? (and (-> constraint
                    (get "attributes")
                    first
                    (get "indexed"))
                (-> constraint
                    (get "foreign_attributes")
                    first
                    (get "indexed")))})

(defn foreign-key-filter [constraint]
  ;; TODO(byop): Handle multi-column foreign keys
  (and (= 1 (count (get constraint "attributes")))
       ;; only include foreign keys
       ;; that we can query efficiently
       (-> constraint
           (get "attributes")
           first
           (get "indexed"))))

(defn tables->attrs [tables]
  (mapcat (fn [{:strs [attributes foreign_keys] :as table}]
            (concat
             (map (partial attribute->attr table)
                  attributes)
             ;; TODO(byop): Handle duplicates
             (map (partial foreign-key->attr table)
                  (filter foreign-key-filter foreign_keys))))
          tables))

(defn table->fields [table]
  (reduce (fn [acc {:strs [attname typename] :as att}]
            (assoc acc
                   (keyword attname)
                   {:db-type (keyword typename)
                    :attr-id (attribute->attr-id att)
                    ;; TODO(byop): There may be some indexes that
                    ;;       are bad for sorting and we should ignore those
                    :indexed? (get att "indexed")}))
          {}
          (get table "attributes")))

(defn table->attr-map [table]
  (reduce (fn [acc {:strs [attname] :as att}]
            (assoc acc (attribute->attr-id att) (keyword attname)))
          {}
          (get table "attributes")))

(defn constraint->forward-relation [table constraint]
  {:direction :forward
   :attr-id (constraint->attr-id constraint)
   :table (keyword (get table "relname"))
   :table-field (-> constraint
                    (get "attributes")
                    first
                    (get "attname")
                    keyword)
   :other-table (-> constraint
                    (get "foreign_table")
                    (get "relname")
                    keyword)
   :other-table-field (-> constraint
                          (get "foreign_attributes")
                          first
                          (get "attname")
                          keyword)})

(defn constraint->reverse-relation [table constraint]
  {:direction :reverse
   :attr-id (constraint->attr-id constraint)
   :table (keyword (get table "relname"))
   :table-field (-> constraint
                    (get "attributes")
                    first
                    (get "attname")
                    keyword)
   :other-table (-> constraint
                    (get "parent_table")
                    (get "relname")
                    keyword)
   :other-table-field (-> constraint
                          (get "parent_attributes")
                          first
                          (get "attname")
                          keyword)})

(defn table->relations [table]
  (let [forward-relations
        (reduce (fn [acc con]
                  (assoc acc
                         (-> con
                             (get "foreign_table")
                             (get "relname"))
                         (constraint->forward-relation table con)))
                {}
                (filter foreign-key-filter (get table "foreign_keys")))
        reverse-relations
        (reduce (fn [acc con]
                  (assoc acc
                         (-> con
                             (get "parent_table")
                             (get "relname"))
                         (constraint->reverse-relation table con)))
                {}
                (filter foreign-key-filter
                        (get table "reverse_foreign_keys")))]
    ;; TODO(byop): Handle duplicates
    (merge forward-relations reverse-relations)))

(defn table->primary-key [table]
  (let [attr (-> table
                 (get "primary_key")
                 (get "attributes")
                 first)]
    {:attr-name (get attr "attname")
     :field (keyword (get attr "attname"))
     :attr-id (attribute->attr-id attr)}))

(def date-types #{"time" "timestamp" "timetz" "timestamptz" "time_stamp" "date"})

(defn table->t-field
  "Determines which field, if any, we can use for a rough approximation of the
   t field in a triple. Not a great solution, but it's the best we've got.

   It must be a date that starts with created."
  [table]
  (when-let [attr (first
                   (filter (fn [attr]
                             (and (string/starts-with?
                                   (string/lower-case (get attr "attname"))
                                   "created")
                                  (contains? date-types
                                             (get attr "typename"))))
                           (get table "attributes")))]
    (keyword (get attr "attname"))))

(defn table->table-info [table]
  {:fields (table->fields table)
   :attr-id->field (table->attr-map table)
   :relations (table->relations table)
   :primary-key (table->primary-key table)
   :t-field (table->t-field table)})

(defn tables->table-info [tables]
  (reduce (fn [acc table]
            (assoc acc (get table "relname") (table->table-info table)))
          {}
          tables))

(defn introspection-result->data [introspection-result]
  (let [tables (filter (fn [table]
                         ;; In order to convert to triples, we need an entity id,
                         ;; so only include tables where they have a primary key.
                         ;; No support for compound keys yet.
                         (= 1 (count (get-in table ["primary_key" "attributes"]))))
                       (get introspection-result "tables"))]

    {:attrs (attr-model/wrap-attrs (tables->attrs tables))
     :table-info (tables->table-info tables)}))

(defn introspect [conn namespace]
  (-> (get-introspection-result conn namespace)
      introspection-result->data))
