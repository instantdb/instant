(ns instant.db.datalog
  "A Datalog(ish) Query Engine designed for Aurora.

   ## Key features:

   1. sets for 'or' conditions:

   You can include sets in patterns. For example, `[:ea ?e movie-year-aid #{1987 1988}]]`
   would find all the movies released in 1987 _or_ 1988

   2. `topics` for invalidation

   Every query returns a list of `topics`. These are a sort of short-hand that lets you
   quickly decide when a query is invalid.

   3. `join-rows` for isomorphic queries

   Queries return _every_ triple that caused the patterns to match. This is important,
   because eventually the client will need to run an isomorphic query, and will need
   every 'in-between' value.

   ## Key constraints:

   1. Every pattern must include the `index` to search over.

   Patterns ultimately translate to a SQL CTE, where every subquery runs over
   an index. It's up to the caller to figure out which index to use for a pattern.
   InstaQL can do this by looking at the `attr`. To get a sense for this,
   see `instaql/best-index`"
  (:require [clojure.spec.alpha :as s]
            [clojure.set :as set]
            [instant.db.model.triple :as triple-model]
            [instant.util.spec :as uspec]
            [instant.data.constants :refer [zeneca-app-id]]
            [clojure.spec.gen.alpha :as gen]
            [instant.util.tracer :as tracer]
            [instant.util.coll :as coll]
            [clojure.string :as string]
            [honey.sql :as hsql]
            [instant.jdbc.sql :as sql]
            [instant.util.json :refer [->json]]
            [instant.util.string :refer [safe-name]])
  (:import (com.zaxxer.hikari HikariDataSource)
           (java.util UUID)))

;; ---
;; Pattern

(defn pattern-component [v-type]
  (s/or :constant (s/coll-of v-type :kind set? :min-count 0)
        :any #{'_}
        :variable symbol?))

(s/def ::pattern
  (s/cat :idx ::triple-model/index
         :e (pattern-component ::triple-model/lookup)
         :a (pattern-component uuid?)
         :v (pattern-component ::triple-model/value)
         :created-at (pattern-component number?)))

(s/def ::patterns (s/coll-of (s/or :pattern ::pattern
                                   :or (s/keys :req-un [::or])
                                   :and (s/keys :req-un [::and]))
                             :min-count 1
                             :into []))

(s/def ::join-sym symbol?)

(s/def ::or (s/keys :req-un [::patterns ::join-sym]))
(s/def ::and ::patterns)

(def variable? (fn [x]
                 (and (symbol? x) (not= x '_))))

(def constant? (comp not symbol?))

(def named-variable? (partial uspec/tagged-as? :variable))
(def named-constant? (partial uspec/tagged-as? :constant))

(defn variable-components [named-pattern]
  (->> named-pattern
       (filter (comp named-variable? second))))

(defn constant-components [named-pattern]
  (->> named-pattern
       (filter (comp named-constant? second))))

(defn- ensure-set-constants
  "For named patterns, all constants are sets. This function
   wraps single values in a set.
   So
   [?e ?a 25]
   Becomes
   [?e ?a #{25}]"
  [[idx & cs :as _triple]]
  (list*
   idx
   (map (fn [c]
          (if (or (symbol? c) (set? c)) c #{c}))
        cs)))

(defn coerce-pattern
  "1. pads patterns to 5 elements
   2. Converts the constants to sets

   [:ea #{id-a id-b} id-c]

   would become:

   [:ea #{id-a id-b} #{id-c} _ _]"
  [p]
  (cond (:or p)
        (update-in p [:or :patterns] (partial map coerce-pattern))

        (:and p)
        (update p :and (partial map coerce-pattern))

        :else
        (->> p
             (coll/pad 5 '_)
             ensure-set-constants)))

(defn untag-e
  "Removes the tag from the entity-id position, where it can be either :entity-id
   or :lookup-ref. We can inspect the type (uuid? vs vector?) to determine if it's
   a lookup ref."
  [named-patterns]
  (mapv (fn [[tag p]]
          (case tag
            :pattern [tag (update p :e (fn [[tag vs]]
                                         (case tag
                                           :constant [tag (reduce (fn [acc [_tag v]]
                                                                    (conj acc v))
                                                                  #{}
                                                                  vs)]
                                           [tag vs])))]
            :and [tag (update p :and untag-e)]
            :or [tag (update-in p [:or :patterns] untag-e)]))
        named-patterns))

(defn ->named-patterns [patterns]
  (->> patterns
       (map coerce-pattern)
       (uspec/conform-throwing ::patterns)
       untag-e))

(defn nested->named-patterns
  "Takes a nested query and updates the patterns to named patterns.
   Incoming data is in form:
   {:children {:join-sym ?users-0
               :pattern-groups [{:patterns [[:ea ?users-0]]
                                 :children [...]}]}}
   Returns:
   {:children {:join-sym ?users-0
               :pattern-groups [{:patterns [[{:idx :ea :e [:variable ?users-0], ...}]]
                                 :datalog-query [[:ea ?users-o]]
                                 :children [...]}]}}"
  [nested]
  (if (:children nested)
    (cond-> nested
      true (update-in [:children :pattern-groups]
                      (fn [groups]
                        (mapv (fn [group]
                                (-> group
                                    (update :patterns ->named-patterns)
                                    ;; Keep track of original patterns so that we
                                    ;; can return the datalog-query with the
                                    ;; join-sym resolved in the result
                                    (assoc :datalog-query (:patterns group))
                                    nested->named-patterns))
                              groups)))
      (:page-info nested) (assoc-in [:page-info :named-pattern]
                                    (-> [(get-in nested [:page-info :pattern])]
                                        ->named-patterns
                                        first)))
    nested))

;; ----------
;; symbol-map

(defn symbol-map-of-pattern
  "Given a named pattern, returns a mapping of symbols to their
   binding paths:

   idx [:eav ?a ?b ?c]


   ;=>

   {?a [[idx 0]],
    ?b [[idx 1]],
    ?c [[idx 2]]}"
  [idx {:keys [e a v]}]
  (reduce (fn [acc [x path]]
            (if (named-variable? x)
              (update acc (uspec/tagged-unwrap x) (fnil conj []) path)
              acc))
          {}
          [[e [idx 0]]
           [a [idx 1]]
           [v [idx 2]]]))

;; ----
;; join-vals

(s/def ::triple (s/cat :e ::triple-model/entity-id
                       :a ::triple-model/attr-id
                       :v ::triple-model/value
                       :t number?))
(s/def ::join-row (s/coll-of ::triple))
(s/def ::join-rows (s/coll-of ::join-row :kind set?))

;; ------------
;; Coarse topic

(defn pat-part->coarse-topic-part [pat-part]
  (if
   (symbol? pat-part) '_
   pat-part))

(defn pat->coarse-topic [pat]
  (->> pat
       (map pat-part->coarse-topic-part)
       coerce-pattern
       vec))

(defn flatten-pats-for-coarse-topics [pats]
  (if (map? pats)
    (reduce (fn [acc group]
              (-> acc
                  (into (flatten-pats-for-coarse-topics (:patterns group)))
                  (into (flatten-pats-for-coarse-topics group))))
            []
            (get-in pats [:children :pattern-groups]))
    (reduce (fn [acc pat]
              (if (vector? pat)
                (conj acc pat)
                (let [pats (or (:and pat)
                               (get-in pat [:or :patterns]))]
                  (apply conj acc (flatten-pats-for-coarse-topics pats)))))
            []
            pats)))

(defn pats->coarse-topics [pats]
  (->> pats
       flatten-pats-for-coarse-topics
       (mapv pat->coarse-topic)))

;; -----
;; Topic

(defn topic-component [v-type]
  (s/or :constant (s/coll-of v-type :kind set? :min-count 1)
        :any #{'_}))

(s/def ::topic
  (s/cat :idx ::triple-model/index
         :e (topic-component uuid?)
         :a (topic-component uuid?)
         :v (topic-component ::triple-model/value)))

(defn- sym->topic-part
  "Consider the raw pattern:

  [[:eav foo-id friend-id ?f]
   [:ea ?f ?a ?v]]

  The correct topic for this would be:

  [[:eav foo-id friend-id _]
   [:ea #{friend-ids-from-first-join} _ _]]

  Note how the first ?f was replaced by _, and the second ?f
  was replaced by the set of friend ids.

  This is because in the context of the first pattern, ?f is not bound.
  But in the second pattern, it is bound.

  This function takes the symbol, and either returns the ids of the variable if it is bound,
  or _ otherwise"
  [symbol-values sym]
  (get symbol-values sym '_))

(defn component->topic-component [symbol-values _component-type x]
  (let [unwrapped (uspec/tagged-unwrap x)]
    (cond
      (named-variable? x)
      (sym->topic-part symbol-values unwrapped)

      :else
      unwrapped)))

(defn named-pattern->topic
  "Given a named-pattern and the symbol-values from previous patterns,
   returns the topic that would invalidate the query"
  [{:keys [idx e a v]} symbol-values]
  [idx
   (component->topic-component symbol-values :e e)
   (component->topic-component symbol-values :a a)
   (component->topic-component symbol-values :v v)])

;; ----------
;; Validation

(defn invalid-pattern?
  "Returns true if the pattern has no constant components and has no variables
   that also appear in a pattern with a constant component."
  [ok-patterns checked-for-sym
   symbol-map named-ps {:keys [e a v]} pattern-idx]
  (if (or (@ok-patterns pattern-idx)
          ;; At least one component has a constant
          (not (every? (comp not named-constant?) [e a v])))
    (do
      (swap! ok-patterns conj pattern-idx)
      nil)
    (if-let [variables (seq (filter named-variable? [e a v]))]
      ;; Check if a variable appears in at least one pattern with a constant component
      (if (->> variables
               (filter
                (fn [[_ sym]]
                  (swap! checked-for-sym update sym (fnil conj #{}) pattern-idx)
                  (->> (symbol-map sym)
                       (filter
                        (fn [[sym-idx _]]
                          (cond
                            (@ok-patterns sym-idx)
                            true

                            (get-in @checked-for-sym [sym sym-idx])
                            false

                            :else
                            (do
                              (swap! checked-for-sym update sym conj sym-idx)
                              (not (invalid-pattern? ok-patterns
                                                     checked-for-sym
                                                     symbol-map
                                                     named-ps
                                                     (nth named-ps sym-idx)
                                                     sym-idx))))))
                       seq)))
               seq)
        (do
          (swap! ok-patterns conj pattern-idx)
          nil)
        ;; None of the variables are in a component that has a bound variable
        true)

      ;; Every component is [:any _]
      true)))

(defn throw-invalid-patterns
  "Throws `Pattern is not joinable` if none of the patterns are valid."
  [named-patterns]
  (let [ok-patterns (atom #{})
        checked-for-sym (atom {})

        accumulate-patterns
        (fn accumulate-patterns [acc [tag pattern]]
          (case tag
            :pattern
            (-> acc
                (update :patterns conj pattern)
                (update :symbols
                        (fn [sm]
                          (merge-with into
                                      sm
                                      (symbol-map-of-pattern (:i acc) pattern))))
                (update :i inc))

            :or (reduce (fn [acc pattern] (accumulate-patterns acc pattern))
                        acc
                        (:patterns (:or pattern)))
            :and (reduce (fn [acc pattern] (accumulate-patterns acc pattern))
                         acc
                         (:and pattern))))

        {:keys [patterns symbols]} (reduce accumulate-patterns
                                           {:patterns []
                                            :symbols {}
                                            :i 0}
                                           named-patterns)
        {:keys [bad-pattern]}
        (reduce (fn [acc pattern]
                  (if (invalid-pattern? ok-patterns
                                        checked-for-sym
                                        symbols
                                        patterns
                                        pattern
                                        (:i acc))
                    (reduced {:bad-pattern pattern})
                    (update acc :i inc)))
                {:i 0}
                patterns)]

    (when bad-pattern
      (assert false (str "Pattern is not joinable " (pr-str bad-pattern))))))

;; Used to validate patterns when validating nested patterns
(def ^:private placeholder-uuid (UUID. 0 0))

(defn replace-sym-in-component [component sym val]
  (if (and (named-variable? component)
           (= (uspec/tagged-unwrap component) sym))
    [:constant val]
    component))

(defn replace-sym-in-named-patterns [patterns sym val]
  (reduce (fn [acc [tag pattern]]
            (let [next-pattern
                  (case tag
                    :pattern
                    (-> pattern
                        (update :a replace-sym-in-component sym val)
                        (update :e replace-sym-in-component sym val)
                        (update :v replace-sym-in-component sym val))

                    :or (update-in pattern [:or :patterns] replace-sym-in-named-patterns sym val)
                    :and (update pattern :and replace-sym-in-named-patterns sym val))]
              (conj acc [tag next-pattern])))
          []
          patterns))

(defn throw-invalid-nested-patterns [nested-named-patterns]
  (doseq [pattern-group (get-in nested-named-patterns [:children :pattern-groups])]
    (when-not (:missing-attr? pattern-group)
      (let [patterns
            (if-let [join-sym (get-in nested-named-patterns [:children :join-sym])]
              (replace-sym-in-named-patterns (:patterns pattern-group)
                                             join-sym
                                             placeholder-uuid)
              (:patterns pattern-group))]
        (throw-invalid-patterns patterns)))
    (when (:children nested-named-patterns)
      (throw-invalid-nested-patterns pattern-group))))

;; ----
;; Result

(s/def ::topics (s/coll-of ::topic))
(s/def ::symbol-values (s/map-of symbol?
                                 (s/coll-of ::triple-model/value :kind set?)))
(s/def ::result
  (s/keys :req-un [::topics ::symbol-values ::join-rows]))

;; ---
;; table name helpers

(defn- kw [& parts]
  (keyword (string/join (map safe-name parts))))

(defn sql-name [x]
  (string/replace (name x) "-" "_"))

(defn- match-table-cols
  "Every match table returns entity-id, attr-id, value-blob, value-uuid,
   and created-at columns. This is a quick helper to generate the column names"
  [table-name]
  [(kw table-name :-entity-id)
   (kw table-name :-attr-id)
   (kw table-name :-value-blob)
   (kw table-name :-value-uuid)
   (kw table-name :-created-at)])

(defn- match-table-select
  "This generates the select portion of the match table. "
  [table-name]
  (map vector [:entity-id :attr-id :value
               [:case :eav [:cast [:->> :value :0] :uuid] :else :null]
               :created-at]
       (match-table-cols table-name)))

;; -----
;; where

(defn- in-or-eq
  "If the set has only one element,
   return an = clause. Otherwise, return an :in clause."
  [k v-set]
  (case (count v-set)
    0 [:= 0 1]
    1 [:= k (first v-set)]
    [:in k v-set]))

(defn- value->jsonb [x]
  [:cast (->json x) :jsonb])

(defn- constant->where-part [app-id component-type [_ v]]
  (condp = component-type
    :e (list* :or
              (for [lookup v]
                (if (uuid? lookup)
                  [:= :entity-id lookup]
                  [:=
                   :entity-id
                   {:select :entity-id
                    :from :triples
                    :where [:and
                            [:= :app-id app-id]
                            [:= :value [:cast (->json (second lookup)) :jsonb]]
                            [:= :attr-id [:cast (first lookup) :uuid]]]}])))
    :a (in-or-eq :attr-id v)
    :v (in-or-eq :value (map value->jsonb v))))

(defn- where-clause
  "
    Given a named pattern, return a where clause with the constants:

    [?e ?a 25]

    Would produce:

    [:and [:= :app-id app-id]
          [:= :value [:cast \"25\" :jsonb]]]
  "
  [app-id {:keys [idx] :as named-pattern} additional-clauses]
  (list*
   :and
   [:= :app-id app-id]
   [:= idx :true]
   (concat (->> named-pattern
                constant-components
                (map (fn [[component-type v]]
                       (constant->where-part app-id component-type v))))
           additional-clauses)))

(comment
  (where-clause
   zeneca-app-id
   (s/conform ::pattern (gen/generate (s/gen ::pattern)))
   nil))

;; ---
;; join-clause

(def idx->component-type
  {0 :e
   1 :a
   2 :v
   3 :created-at})

(def ^:private component-type->col-name
  {:e :entity-id :a :attr-id :created-at :created-at})

(defn- join-cols
  "Given the component types and the index of the dest table,

   Generates the columns to join on.

   For example:

   [1 [:v :v]] => [:value :match-1-value-blob]
   [1 [:e :v]] => [:entity-id :match-1-value-uuid]
   [1 [:v :a]] => [:value [:to_jsonb :match-1-attr-id]]"
  [prefix dest-idx [origin-ctype dest-ctype]]

  (let [dest-col #(kw prefix dest-idx "-" %)]
    (cond
      (every? #{:v} [origin-ctype dest-ctype])
      [:value (dest-col :value-blob)]

      (= :v origin-ctype)
      [:value [:to_jsonb (dest-col (component-type->col-name dest-ctype))]]

      (= :v dest-ctype)
      [(component-type->col-name origin-ctype) (dest-col :value-uuid)]

      :else
      [(component-type->col-name origin-ctype)
       (dest-col (component-type->col-name dest-ctype))])))

(comment
  (join-cols :match- 1 [:v :v]))

(defn- join-cond
  "Generates a single join condition,
   given the origin component type and the destination path"
  [prefix origin-ctype [dest-idx dest-col-idx]]
  (let [dest-ctype (idx->component-type dest-col-idx)
        [origin-col dest-col] (join-cols prefix dest-idx [origin-ctype dest-ctype])]
    [:= origin-col dest-col]))

(defn- join-cond-for-or
  "Generates a join cond for the set of paths generated by the or ctes.
   Each path in the set should be joined with OR"
  [prefix ctype paths]
  (list* :or
         (map (fn [paths]
                (if (set? paths)
                  (join-cond-for-or prefix ctype paths)
                  (list* :and
                         (map (fn [path]
                                (if (set? path)
                                  (join-cond-for-or prefix ctype path)
                                  (join-cond prefix ctype path)))
                              paths))))
              paths)))

(defn join-conds
  "Generate a list of join conditions from a symbol map and a named pattern.

   Consider the raw pattern:
   [[?a ?b ?c]
    [?c ?d ?e]]

   The second part joins the first on

   [[:= :entity-id :match-0-value-uuid]]"
  [prefix symbol-map named-p]
  (->> named-p
       variable-components
       (keep (fn [[ctype [_ sym]]]
               (when-let [paths (get symbol-map sym)]
                 (map (fn [path]
                        (if (set? path)
                          (join-cond-for-or prefix ctype path)
                          (join-cond prefix ctype path)))
                      paths))))
       (apply concat)))

(defn- join-cond-for-or-gather
  "Generates a join condition for combining two or ctes. In contrast to join-cond,
   each column name needs to be fully qualified."
  [prefix [origin-idx origin-col-idx] [dest-idx dest-col-idx]]
  (let [origin-ctype (idx->component-type origin-col-idx)
        dest-ctype (idx->component-type dest-col-idx)
        [origin-col dest-col] (join-cols prefix dest-idx [origin-ctype dest-ctype])]
    [:= (kw prefix origin-idx "-" origin-col) dest-col]))

(defn- or-join-cond-for-or-gather
  [prefix paths dest-path]
  (mapv (fn [path]
          (if (set? path)
            (list* :or (or-join-cond-for-or-gather prefix path dest-path))
            (join-cond-for-or-gather prefix path dest-path)))
        paths))

(defn join-conds-for-or-gather
  "Generates the join conditions for connecting the or cte into the previous ctes."
  [prefix symbol-map or-symbol-maps join-sym]
  (let [ors (for [or-symbol-map or-symbol-maps
                  :let [ands (for [dest-sym (get symbol-map join-sym)
                                   origin-sym (get or-symbol-map join-sym)]
                               (if (set? origin-sym)
                                 (list* :or (map (fn [paths]
                                                   (or-join-cond-for-or-gather prefix paths dest-sym))
                                                 origin-sym))
                                 (join-cond-for-or-gather prefix origin-sym dest-sym)))]
                  :when (seq ands)]
              (list* :and ands))]
    (when (seq ors)
      (list* :or ors))))

;; ---
;; match-query

(defn- joining-with
  "Produces subsequent match tables. Each table joins
   on the previous table unless it is the first cte or the
   start of a new AND/OR clause.
   additional-joins is a map from symbol to path. It allows us to connect the
   cte to the parent cte if this is a child pattern in a nested query."
  [prefix app-id additional-joins symbol-map prev-idx start-of-group? named-p]
  (let [cur-idx (inc prev-idx)
        cur-table (kw prefix cur-idx)
        prev-table (when-not (or start-of-group? (neg? prev-idx))
                     (kw prefix prev-idx))
        joins (if start-of-group?
                []
                (join-conds prefix symbol-map named-p))
        parent-joins (->> named-p
                          variable-components
                          (keep (fn [[ctype [_ sym]]]
                                  (when-let [path (get additional-joins sym)]
                                    (join-cond prefix ctype path)))))
        all-joins (into joins parent-joins)
        parent-froms (->> named-p
                          variable-components
                          (keep (fn [[_ [_ sym]]]
                                  (when-let [path (get additional-joins sym)]
                                    (kw prefix (first path))))))]
    [cur-table
     {:select (concat (when prev-table
                        [(kw prev-table :.*)])
                      (match-table-select cur-table))
      :from (concat (list* :triples (when prev-table
                                      [prev-table]))
                    parent-froms)
      :where (where-clause app-id named-p all-joins)}
     :materialized]))

(defn symbol-fields-of-pattern
  "Keeps track of which idx in the triple maps to which variable.
   Used to collect symbol-values from the join rows and construct
   the topics when we process the sql result.

   {:idx :eav
    :e [:variable ?users]
    :a [:variable ?books]
    :v [:variable ?shelves]} => {0 {:sym ?users :ref-value? false}
                                 1 {:sym ?books :ref-value? false}
                                 2 {:sym ?shelves :ref-value? true}}"
  [named-p]
  (reduce (fn [acc [component pat-idx]]
            (let [x (get named-p component)
                  sym (uspec/tagged-unwrap x)]
              (if (named-variable? x)
                (assoc acc pat-idx {:sym sym
                                    :ref-value? (and (= :v component)
                                                     (= :eav (:idx named-p)))})
                acc)))
          {}
          [[:e 0] [:a 1] [:v 2]]))

(defn cte-for-pattern
  "Generates cte for a pattern. Also generates the symbol map and pattern
   metadata that will be used to generate the query result from the sql data."
  [prefix app-id additional-joins {:keys [idx symbol-map group-idx]} pattern]
  (let [start-of-group? (zero? group-idx)
        cte-cols (mapv sql-name (match-table-cols (kw prefix idx)))
        symbol-fields (symbol-fields-of-pattern pattern)
        prev-idx (dec idx)]
    {:ctes (joining-with prefix
                         app-id
                         additional-joins
                         symbol-map
                         prev-idx
                         start-of-group?
                         pattern)
     :symbol-map (symbol-map-of-pattern idx pattern)
     :pattern-meta {:cte-cols cte-cols
                    :symbol-fields symbol-fields
                    :pattern pattern}}))

(defn or-gather-cte
  "Generates the cte that will tie together all of the or branches, doing a full
   join on the last cte from each branch."
  [prefix prev-idx idx join-idxes symbol-map group-symbol-maps join-sym]
  (let [tbl-name (kw prefix idx)
        full-join-idxes (seq (drop 1 join-idxes))
        prev-table (when-not (neg? prev-idx)
                     (kw prefix prev-idx))]
    [tbl-name
     (merge
      {:select (concat
                (when-not (neg? prev-idx)
                  ;; Include the previous cte if we're not the first
                  [(kw prev-table ".*")])
                (for [i join-idxes]
                  (kw prefix i ".*")))
       :from (concat
              (when prev-table
                ;; Include the previous cte if we're not the first
                [prev-table])
              [(kw prefix (first join-idxes))])}
      (when full-join-idxes
        {:full-join (mapcat (fn [i]
                              ;; Ensures everything is included
                              [(kw prefix i) [:= :0 :1]])
                            full-join-idxes)})
      (when-not (neg? prev-idx)
        (when-let [wheres (join-conds-for-or-gather prefix
                                                    symbol-map
                                                    group-symbol-maps
                                                    join-sym)]
          {:where wheres})))]))

(defn accumulate-ctes
  "Walks the patterns to generate the list of CTEs. Also generates the metadata
   that will be used to transform the sql result into the query result."
  [prefix app-id additional-joins acc [tag pattern]]
  (case tag
    :pattern (let [{:keys [ctes symbol-map pattern-meta]}
                   (cte-for-pattern prefix
                                    app-id
                                    additional-joins
                                    {:idx (:next-idx acc)
                                     :group-idx (:group-idx acc)
                                     :symbol-map (:symbol-map acc)}
                                    pattern)]
               (-> acc
                   (update :ctes conj ctes)
                   (update :next-idx inc)
                   (update :group-idx inc)
                   (update :symbol-map #(merge-with into % symbol-map))
                   (update :pattern-metas conj pattern-meta)))

    :and (reduce (fn [acc pat]
                   (accumulate-ctes prefix app-id additional-joins acc pat))
                 acc
                 (:and pattern))

    :or (let [{:keys [patterns join-sym]} (:or pattern)
              {:keys [group-acc]}
              (reduce (fn [{:keys [acc group-acc]} pat]
                        (let [res (accumulate-ctes prefix app-id additional-joins acc pat)]
                          {:acc {:next-idx (:next-idx res)
                                 :group-idx 0
                                 :ctes []
                                 :symbol-map {}
                                 :pattern-metas []
                                 :or-idxes (conj (or (:or-idxes acc) #{})
                                                 (dec (:next-idx res)))}
                           :group-acc (-> group-acc
                                          (assoc :next-idx (:next-idx res))
                                          (update :ctes into (:ctes res))
                                          (update :or-idxes conj (dec (:next-idx res)))
                                          (update :symbol-maps conj (:symbol-map res))
                                          (update :pattern-metas conj (:pattern-metas res)))}))
                      {;; :group-acc collects information about each OR clause
                       :group-acc {:next-idx (:next-idx acc)
                                   :ctes (:ctes acc)
                                   ;; Collect pattern maps from each or branch so that
                                   ;; we can build the topics in isolation
                                   :pattern-metas []
                                   ;; Collect symbol maps from each or branch so that
                                   ;; we can join the branches in to the rest of the
                                   ;; ctes
                                   :symbol-maps []
                                   ;; Keep track of the last cte in each or branch
                                   ;; so that we can construct a cte to collect all
                                   ;; the results
                                   :or-idxes []}
                       ;; :acc is what we pass to `accumulate-ctes` and gets reset
                       ;; for each clause (except for `next-idx`, which increases)
                       :acc {:next-idx (:next-idx acc)
                             :group-idx 0
                             :ctes []
                             :symbol-map {}
                             :pattern-metas []
                             :or-idxes (:or-idxes acc)}}
                      patterns)
              prev-idx (dec (:next-idx acc))
              join-idxes (:or-idxes group-acc)
              gather-cte (or-gather-cte prefix
                                        ;; Don't link to the previous index if it's part of a
                                        ;; parent OR clause or else the cte will get included
                                        ;; twice and pg will complain about ambiguous columns
                                        (if (contains? (:or-idxes acc) prev-idx)
                                          -1
                                          prev-idx)
                                        (:next-idx group-acc)
                                        join-idxes
                                        (:symbol-map acc)
                                        (:symbol-maps group-acc)
                                        join-sym)]
          {:next-idx (inc (:next-idx group-acc))
           :or-idxes (into (or (:or-idxes acc)
                               #{})
                           (:or-idxes group-acc))
           :group-idx (inc (:group-idx acc))
           :ctes (conj (:ctes group-acc) gather-cte)
           :symbol-map (merge-with into
                                   (:symbol-map acc)
                                   (apply merge-with (fn [& xs]
                                                       [(set xs)])
                                          (:symbol-maps group-acc)))
           :pattern-metas (conj (:pattern-metas acc) {:or (:pattern-metas group-acc)})})))

(defn match-query
  "Generates honeysql data structure to produce sql that joins named patterns,
   and the metadata that will be used to transform the sql result into the query
   result."
  ([prefix app-id named-patterns]
   (match-query {} prefix app-id {} named-patterns))
  ([acc prefix app-id additional-joins named-patterns]
   (let [{:keys [ctes pattern-metas symbol-map next-idx]}
         (reduce (fn [acc pattern]
                   (accumulate-ctes prefix app-id additional-joins acc pattern))
                 (merge {:next-idx 0
                         ;; Used to determine the start of an or/and clause
                         :group-idx 0
                         :ctes []
                         :symbol-map {}
                         ;; Metadata for each pattern that we'll use to transform the
                         ;; sql data into the datalog query result
                         :pattern-metas []
                         ;; Keeps track of which ctes are going to be included in an OR
                         ;; gather cte so that we don't include them twice.
                         :or-idxes #{}}
                        acc)
                 named-patterns)
         last-table-name (kw prefix (dec next-idx))]
     {:next-idx next-idx
      :pattern-metas pattern-metas
      :symbol-map symbol-map
      :query {:with ctes
              :select (kw last-table-name :.*)
              :from last-table-name}})))

(defn component-type-of-sym
  "Determines the component type of a given sym in the pattern.
  > (sym-component-type {:e [:variable ?my-sym], ...} ?my-sym)
  :e"
  [[tag pattern] sym]
  (case tag
    :pattern (some (fn [k]
                     (let [v (get pattern k)]
                       (when (and (named-variable? v)
                                  (= sym (uspec/tagged-unwrap v)))
                         k)))
                   (vals idx->component-type))))

(defn add-cursor-comparisons
  "Updates the where query to include the constraints from the cursor."
  [query {:keys [direction sym-triple-idx cursor cursor-type order-col-name]}]
  (let [cursor-val (nth cursor sym-triple-idx)
        comparison (case [cursor-type direction]
                     [:before :asc] :<
                     [:before :desc] :>
                     [:after :asc] :>
                     [:after :desc] :<)]
    (update query :where (fn [where]
                           [:and
                            where
                            [:or
                             [comparison order-col-name [:cast cursor-val :bigint]]
                             [:and
                              [:= order-col-name [:cast cursor-val :bigint]]
                              [comparison :entity-id [:cast (first cursor) :uuid]]]]]))))

(defn reverse-direction [direction]
  (case direction
    :asc :desc
    :desc :asc))

(defn has-next-tbl [table]
  (kw table :-has-next))

(defn has-prev-tbl [table]
  (kw table :-has-prev))

(defn add-page-info
  "Updates the cte with pagination constraints."
  [{:keys [limit
           last?
           offset
           direction
           named-pattern
           order-sym
           before
           after]
    :as _page-info}
   ctes]
  (let [[but-last [table query & opts]] (coll/split-last-vec ctes)
        entity-id-col (kw table :-entity-id)
        sym-component-type (component-type-of-sym named-pattern order-sym)
        sym-triple-idx (get (set/map-invert idx->component-type)
                            sym-component-type)
        order-col-name (->> sym-component-type
                            component-type->col-name)

        ;; If they want the last N items, we need to switch the direction so that
        ;; we get the items from the end of the list.
        ;; We'll switch the order back when we collect results so that the results
        ;; are delivered in the correct order.
        order-by-direction (if last?
                             (reverse-direction direction)
                             direction)
        order-by [[(kw table :- order-col-name)
                   order-by-direction]
                  [entity-id-col
                   order-by-direction]]
        paged-query (cond-> query
                      true (assoc :order-by order-by)
                      limit (assoc :limit limit)
                      offset (assoc :offset offset)
                      after (add-cursor-comparisons {:direction direction
                                                     :sym-triple-idx sym-triple-idx
                                                     :order-col-name order-col-name
                                                     :cursor after
                                                     :cursor-type :after})
                      before (add-cursor-comparisons {:direction direction
                                                      :sym-triple-idx sym-triple-idx
                                                      :order-col-name order-col-name
                                                      :cursor before
                                                      :cursor-type :before}))

        first-row-table (kw table :-first)
        last-row-table (kw table :-last)
        first-row-cte [first-row-table
                       {:select [[entity-id-col :e]
                                 [(kw table :- order-col-name) :sym]]
                        :from table
                        :limit 1}]
        last-row-cte [last-row-table
                      {:select [[entity-id-col :e]
                                [(kw table :- order-col-name) :sym]]
                       :from [[{:select [(kw table :.*)
                                         ;; trick to get the last row in the cte
                                         [[:raw "ROW_NUMBER() OVER ()"] :sort-id]]
                                :from table}
                               :subquery]]
                       :order-by [[:sort-id :desc]]
                       :limit 1}]

        has-next-query (-> query
                           (assoc :order-by order-by)
                           (assoc :limit 1)
                           (update :from conj [(if last?
                                                 ;; reverse direction when last?
                                                 first-row-table
                                                 last-row-table) :cursor-row])
                           ;; Use the last row as the cursor to check has next page
                           (add-cursor-comparisons {:direction direction
                                                    :sym-triple-idx 1
                                                    :order-col-name order-col-name
                                                    :cursor [:cursor-row.e
                                                             :cursor-row.sym]
                                                    :cursor-type :after}))
        has-previous-query (-> query
                               (assoc :order-by order-by)
                               (assoc :limit 1)
                               (update :from
                                       conj
                                       [(if last?
                                          ;; reverse direction when last?
                                          last-row-table
                                          first-row-table) :cursor-row])
                               ;; Use the first row as the cursor to check has prev page
                               (add-cursor-comparisons {:direction direction
                                                        :sym-triple-idx 1
                                                        :order-col-name order-col-name
                                                        :cursor [:cursor-row.e
                                                                 :cursor-row.sym]
                                                        :cursor-type :before}))]
    (conj but-last
          (apply conj [table paged-query] opts)
          first-row-cte
          last-row-cte
          [(has-next-tbl table)
           {:select [[[:exists has-next-query]]]}]
          [(has-prev-tbl table)
           {:select [[[:exists has-previous-query]]]}])))

(defn accumulate-nested-match-query
  ([prefix app-id nested-named-patterns]
   (let [acc {:next-idx 0
              :ctes []
              :result-tables []
              :pattern-groups []}]
     (accumulate-nested-match-query acc {} prefix app-id nested-named-patterns)))
  ([acc additional-joins prefix app-id nested-named-patterns]
   (let [res (reduce
              (fn [acc pattern-group]
                (if (:missing-attr? pattern-group)
                  (-> acc
                      (update :pattern-groups
                              (fnil conj [])
                              {:missing-attr? true
                               :patterns (:patterns pattern-group)
                               :datalog-query (:datalog-query pattern-group)}))
                  (let [page-pattern (get-in pattern-group [:page-info :named-pattern])
                        patterns (if page-pattern
                                   (conj (:patterns pattern-group) page-pattern)
                                   (:patterns pattern-group))

                        {:keys [next-idx query symbol-map pattern-metas]}
                        (match-query {:next-idx (:next-idx acc)}
                                     prefix
                                     app-id
                                     additional-joins
                                     patterns)

                        pattern-metas (if page-pattern
                                        ;; Annotate the page pattern so that we'll know to
                                        ;; get the start and end cursors when we process the
                                        ;; results.
                                        (update pattern-metas
                                                (dec (count pattern-metas))
                                                assoc :page-info (:page-info pattern-group))
                                        pattern-metas)

                        ctes (if-let [page-info (:page-info pattern-group)]
                               (add-page-info page-info (:with query))
                               (:with query))



                        next-acc (cond-> acc
                                   true (assoc :next-idx next-idx)
                                   true (update :ctes into ctes)
                                   true (update :result-tables
                                                conj
                                                {:table (:from query)
                                                 :aggregate (:aggregate pattern-group)})

                                   (:page-info pattern-group)
                                   (update :result-tables
                                           conj
                                           {:table (has-next-tbl (:from query))}
                                           {:table (has-prev-tbl (:from query))}))]
                    (if-not (:children pattern-group)
                      (-> next-acc
                          (update :pattern-groups
                                  (fnil conj [])
                                  {:pattern-metas pattern-metas
                                   :page-info (:page-info pattern-group)
                                   :aggregate (:aggregate pattern-group)
                                   :datalog-query (:datalog-query pattern-group)
                                   :table (:from query)}))
                      (let [join-sym (get-in pattern-group [:children :join-sym])
                            join-cte [(kw prefix next-idx)
                                      {:select [[[:distinct :entity-id] (kw prefix next-idx :-entity-id)]]
                                       :from [:triples (kw prefix (dec next-idx))]
                                       :where (list* :and
                                                     [:= :app-id app-id]
                                                     (join-conds prefix
                                                                 symbol-map
                                                                 {:e [:variable join-sym]}))}]
                            child-res (accumulate-nested-match-query (-> next-acc
                                                                         (update :ctes conj join-cte)
                                                                         (update :next-idx inc)
                                                                         (assoc :pattern-groups []))
                                                                     {join-sym [next-idx 0]}
                                                                     prefix
                                                                     app-id
                                                                     pattern-group)]
                        (-> child-res
                            (assoc :pattern-groups ((fnil conj [])
                                                    (:pattern-groups acc)
                                                    {:pattern-metas pattern-metas
                                                     :table (:from query)
                                                     :page-info (:page-info pattern-group)
                                                     :datalog-query (:datalog-query pattern-group)
                                                     :children {:pattern-groups (:pattern-groups child-res)
                                                                :join-sym join-sym}}))))))))
              acc
              (get-in nested-named-patterns [:children :pattern-groups]))]
     (-> res
         (assoc :children {:pattern-groups (:pattern-groups res)
                           :join-sym (get-in nested-named-patterns [:children :join-sym])})))))

(defn nested-match-query
  "Generates the hsql `query` and metadata about the query under `children`.
  `children` matches the structure of nested-named-patterns and has all of the
  info we need to collect the data from the sql result, build fully-qualified
  topics (replacing join-sym with the actual value), and fully-qualified datalog
  queries."
  [prefix app-id nested-named-patterns]
  (let [{:keys [ctes result-tables children]}
        (accumulate-nested-match-query prefix app-id nested-named-patterns)
        query (when (seq ctes)
                {:with (map #(if (= (count %) 2)
                               ;; Forces postgres to only evaluate the cte once
                               ;; https://www.postgresql.org/docs/current/queries-with.html#QUERIES-WITH-CTE-MATERIALIZATION
                               (conj % :materialized)
                               ;; If count != 2, then someone higher up set a materialized
                               ;; option, let's not override their wisdom.
                               %)
                            ctes)
                 :select [[(into [:json_build_array]
                                 (mapv (fn [tables]
                                         (into [:json_build_object]
                                               (mapcat
                                                (fn [{:keys [table aggregate]}]
                                                  [[:inline (name table)]
                                                   (case aggregate
                                                     :count [:coalesce {:select [[[:count :*]]]
                                                                        :from table}
                                                             [:inline "0"]]

                                                     [:coalesce
                                                      {:select [[[:json_agg [:row_to_json table]]]]
                                                       :from table}
                                                      [:cast [:inline "[]"] :json]])])
                                                tables)))
                                       ;; Split into groups of 50 to work around
                                       ;; 100 arg limitation to json_build_object
                                       ;; Now we can do (* 50 50) ctes
                                       (partition-all 50 result-tables)))]]})]
    {:query query
     :children children}))

;; ---------
;; join-rows

(defn- safe-parse-uuid [x]
  (when x
    (parse-uuid x)))

(defn- sql-row->triple
  "Converts the sql result, which returns value in either the
   value-uuid or value-blob col, into our triple format.
   Optionally parses uuids, when handling batched results that return JSON"
  [row [e-col a-col v-blob-col v-uuid-col t-col] coerce-uuids?]
  (if coerce-uuids?
    [(safe-parse-uuid (get row e-col))
     (safe-parse-uuid (get row a-col))
     (or (safe-parse-uuid (get row v-uuid-col))
         (get row v-blob-col))
     (get row t-col)]
    [(get row e-col)
     (get row a-col)
     (or (get row v-uuid-col)
         (get row v-blob-col))
     (get row t-col)]))

(defn- ensure-default-symbol-values [symbol-fields symbol-values]
  (reduce (fn [symbol-values [_ {:keys [sym]}]]
            (if (get symbol-values sym)
              symbol-values
              (assoc symbol-values sym #{})))
          symbol-values
          symbol-fields))

(defn empty-symbol-values
  "Used when missing an attr."
  [named-patterns]
  (reduce (fn [symbol-values [tag pattern]]
            (case tag
              :pattern (ensure-default-symbol-values
                        (symbol-fields-of-pattern pattern)
                        symbol-values)
              :or (merge symbol-values
                         (empty-symbol-values (:patterns (:or pattern))))
              :and (merge symbol-values
                          (empty-symbol-values (:and pattern)))))
          {}
          named-patterns))

(defn- missing-attr-result [named-patterns]
  {:topics '[[:ea _ _ _]
             [:eav _ _ _]]
   :symbol-values (empty-symbol-values named-patterns)
   :join-rows #{}})

(defn- accumulate-results
  "Takes the sql result and the metadata from `match-query` to
   return join-rows, symbol-values, and topics.
   Optionally parses uuids, when handling batched results that return JSON."
  [acc sql-res pattern-metas coerce-uuids?]
  (reduce
   (fn [acc pattern-meta]
     (if-let [ors (:or pattern-meta)]
       ;; Handling a group of patterns, one group for each OR clause
       (let [{:keys [symbol-values symbol-values-for-topics]} acc
             {:keys [acc group-acc]}
             (reduce (fn [{:keys [acc group-acc]} pattern-metas]
                       (let [res (accumulate-results
                                  (assoc acc
                                         :symbol-values symbol-values
                                         :symbol-values-for-topics symbol-values-for-topics)
                                  sql-res
                                  pattern-metas
                                  coerce-uuids?)]
                         {:acc res
                          :group-acc (-> group-acc
                                         (update :symbol-values
                                                 conj
                                                 (:symbol-values res))
                                         (update :symbol-values-for-topics
                                                 conj
                                                 (:symbol-values-for-topics res)))}))
                     {:acc acc
                      ;; collects the symbol-values for all of the OR
                      ;; clauses so that we can collect them at the end
                      :group-acc {:symbol-values []
                                  :symbol-values-for-topics []}}
                     ors)]
         (-> acc
             (update :symbol-values #(apply merge-with into % (:symbol-values group-acc)))
             (update :symbol-values-for-topics #(apply merge-with into % (:symbol-values-for-topics group-acc)))))

       ;; Handling an individual pattern
       (let [{:keys [cte-cols symbol-fields pattern page-info]} pattern-meta
             {:keys [symbol-values symbol-values-for-topics]} acc
             topic (named-pattern->topic pattern symbol-values-for-topics)
             {:keys [join-rows symbol-values symbol-values-for-topics]}
             (reduce (fn [acc row]
                       (let [join-row (sql-row->triple row cte-cols coerce-uuids?)]
                         (-> acc
                             (update :join-rows conj join-row)
                             (update :symbol-values
                                     (fn [symbol-values]
                                       (reduce
                                        (fn [acc [pat-idx {:keys [sym]}]]
                                          (if-let [v (nth join-row pat-idx)]
                                            (update acc sym (fnil conj #{}) v)
                                            acc))
                                        symbol-values
                                        symbol-fields)))
                             (update :symbol-values-for-topics
                                     (fn [symbol-values]
                                       (reduce
                                        (fn [acc [pat-idx {:keys [sym ref-value?]}]]
                                          (if-let [v (when-not ref-value?
                                                       (nth join-row pat-idx))]
                                            (update acc sym (fnil conj #{}) v)
                                            acc))
                                        symbol-values
                                        symbol-fields))))))
                     {:join-rows []
                      :symbol-values symbol-values
                      :symbol-values-for-topics symbol-values-for-topics}
                     sql-res)]
         (-> (if page-info
               (let [join-rows (if (:last? page-info)
                                 ;; We switched the order so we could get items
                                 ;; at the end of the list.
                                 ;; Switch back the order of the results so that
                                 ;; they're in the order the user requested.
                                 (reverse join-rows)
                                 join-rows)]
                 (assoc acc
                        :page-info {:start-cursor (first join-rows)
                                    :end-cursor (last join-rows)}
                        :page-info-rows join-rows))
               acc)
             (update :join-rows
                     (fn [rows]
                       (mapv (fn [row join-row]
                               ;; One of the patterns in an OR clause may return a
                               ;; nil result, so we filter them out here.
                               (if (nil? (first join-row))
                                 row
                                 (conj row join-row)))
                             rows join-rows)))
             (assoc :symbol-values symbol-values)
             (assoc :symbol-values-for-topics symbol-values-for-topics)
             (update :symbol-values (partial ensure-default-symbol-values symbol-fields))
             (update :topics conj topic)))))
   acc
   pattern-metas))

(defn- sql-result->result
  "Takes the sql result and the metadata from `match-query` to
   return join-rows, symbol-values, and topics.
   Optionally parses uuids, when handling batched results that return JSON."
  [sql-res pattern-metas coerce-uuids?]
  (-> (accumulate-results {:join-rows (vec (repeat (count sql-res) []))
                           :symbol-values {}
                           :symbol-values-for-topics {}
                           :topics []}
                          sql-res
                          pattern-metas
                          coerce-uuids?)
      (update :join-rows set)
      (dissoc :symbol-values-for-topics)))

(defn- replace-var [component join-sym join-val]
  (if (and (named-variable? component)
           (= join-sym (second component)))
    [:constant #{join-val}]
    component))

(defn- update-symbol-value
  "Updates join-sym in the pattern metas to the join-val that was used for this
   query. Allows us to return properly scoped topics and symbol-values."
  [pattern-metas join-sym join-val]
  (mapv (fn [m]
          (if (:or m)
            (update m :ors update-symbol-value join-sym join-val)
            (-> m
                (update :pattern (fn [named-p]
                                   (-> named-p
                                       (update :e replace-var join-sym join-val)
                                       (update :a replace-var join-sym join-val)
                                       (update :v replace-var join-sym join-val))))
                (update :symbol-fields (fn [fields]
                                         (apply dissoc fields (keep (fn [[k v]]
                                                                      (when (= (:sym v) join-sym)
                                                                        k))
                                                                    fields)))))))
        pattern-metas))

(defn replace-join-sym-in-datalog-query
  "Update the datalog-query with the value that was used for the join-sym
   in the query. Allows us to populate the cache with the query that would
   have been sent if we sent an individual query instead of nesting."
  [join-sym join-val datalog-query]
  (mapv (fn [p]
          (cond (:or p)
                (update-in p [:or :patterns]
                           (partial replace-join-sym-in-datalog-query
                                    join-sym
                                    join-val))

                (:and p)
                (update p :and (partial replace-join-sym-in-datalog-query
                                        join-sym
                                        join-val))

                :else (mapv (fn [c]
                              (if (= join-sym c)
                                join-val
                                c))
                            p)))
        datalog-query))

(defn cols-for-sym [pattern-metas sym]
  (reduce (fn [acc pattern-meta]
            (if-let [ors (:or pattern-meta)]
              (into acc (cols-for-sym ors sym))
              (into acc (keep (fn [[k v]]
                                (when (= (:sym v) sym)
                                  (nth (:cte-cols pattern-meta) k)))
                              (:symbol-fields pattern-meta)))))
          #{}
          pattern-metas))

(defn group-rows-by-join-sym
  "Groups rows by their join sym value to save us the effort of filtering the
   full set of rows for each child.
   Returns data in form {:match-0-2 {\"join-val-str-uuid\" [rows]}}"
  ([sql-res children]
   (group-rows-by-join-sym {} sql-res children))
  ([acc sql-res {:keys [pattern-groups join-sym]}]
   (reduce (fn [acc group]
             (if (:missing-attr? group)
               acc
               (let [next-acc
                     (if (not join-sym)
                       acc
                       (let [{:keys [pattern-metas table]} group
                             sym-columns (cols-for-sym pattern-metas join-sym)
                             join-groups (group-by (fn [row]
                                                     (some #(get row %)
                                                           sym-columns))
                                                   (get sql-res (name table)))]
                         (assoc acc table join-groups)))]
                 (if-let [children (:children group)]
                   (group-rows-by-join-sym next-acc sql-res children)
                   next-acc))))
           acc
           pattern-groups)))

(defn nested-sql-result->result
  "Generates the sql result for a nested datalog query. Data is returned as
  [{:result {:join-rows [...], topics: [...], symbol-values: {...}}
    :datalog-query [[:ea #uuid \"user-id\"]]
    :children [{:result ...}]}] "
  ([sql-res grouped-rows children]
   (nested-sql-result->result nil grouped-rows sql-res children))
  ([parent-info grouped-rows sql-res children]
   (reduce (fn [acc group]
             (cond
               (:missing-attr? group)
               (conj acc {:result (missing-attr-result (:patterns group))
                          :datalog-query (:datalog-query group)})

               (:aggregate group)
               (let [{:keys [aggregate table datalog-query]} group]
                 (conj acc {:result {:topics (pats->coarse-topics datalog-query)
                                     :symbol-values {}
                                     :join-rows #{}
                                     :aggregate {aggregate (get sql-res (name table))}}
                            :datalog-query datalog-query}))

               :else
               (let [{:keys [pattern-metas table]} group
                     {:keys [join-sym join-val]} parent-info

                     rows (if join-sym
                            (get-in grouped-rows [table (str join-val)])
                            (get sql-res (name table)))

                     transformed-pattern-metas (if join-sym
                                                 (update-symbol-value pattern-metas join-sym join-val)
                                                 pattern-metas)
                     result (cond-> (sql-result->result rows transformed-pattern-metas true)
                              (:page-info group) (assoc-in [:page-info :has-next-page?]
                                                           (-> sql-res
                                                             (get (name (has-next-tbl table)))
                                                             first
                                                             (get "exists")))
                              (:page-info group) (assoc-in [:page-info :has-previous-page?]
                                                           (-> sql-res
                                                             (get (name (has-prev-tbl table)))
                                                             first
                                                             (get "exists"))))
                     datalog-query (if join-sym
                                     (replace-join-sym-in-datalog-query join-sym
                                                                        join-val
                                                                        (:datalog-query group))
                                     (:datalog-query group))]
                 (conj acc (if-let [{:keys [join-sym]} (:children group)]
                             {:result result
                              :datalog-query datalog-query
                              :children (mapv (fn [join-val]
                                                (nested-sql-result->result {:join-sym join-sym
                                                                            :join-val join-val}
                                                                           grouped-rows
                                                                           sql-res
                                                                           (:children group)))
                                              (or (get-in result [:symbol-values join-sym])
                                                  ;; This is a hack to get things to nest properly
                                                  (when (= join-sym (:join-sym parent-info))
                                                    [(:join-val parent-info)])))}
                             {:result result
                              :datalog-query datalog-query})))))
           []
           (:pattern-groups children))))

;; --------
;; batching

(defn- batch-queries [hsql-queries]
  {:select [[(into [:json_build_object]
                   (mapcat (fn [{:keys [from]}]
                             [[:inline (name from)]
                              [:coalesce
                               {:select [[[:json_agg [:row_to_json from]]]]
                                :from from}
                               [:cast [:inline "[]"] :json]]])
                           hsql-queries))]]
   :with (mapcat :with hsql-queries)})

;; This can't be higher than 50 because `json_build_object` can only have 100
;; parameters (we need 1 for each key and 1 for each value)
;; We could work around this by nesting json_build_objects
(def ^:private max-items 50)

;; Map of {[conn-pool]: {items: [{:params [app-id symbol-map named-ps]
;;                                :result result-promise},
;;                               ...
;;                              ]}}
(defn make-loader []
  (atom {}))

(defn- add-pending!
  "Adds item to the loader.
   Returns true if the caller should handle executing the batch."
  [loader conn-pool item]
  (loop []
    (let [old-v @loader
          old-items (get-in old-v [conn-pool :items] [])
          new-items (conj old-items item) ;; add new item to the end
          new-v (assoc-in old-v [conn-pool :items] new-items)
          ;; If we're the first to add to the queue or if we're adding the
          ;; item that would put us in the next batch, then we should do
          ;; the work.
          caller-should-send-query? (or (= 1 (mod (count new-items) max-items))
                                        (= 1 max-items))]
      (if (compare-and-set! loader old-v new-v)
        caller-should-send-query?
        (recur)))))

(defn- take-batch!
  "Pops at most `max-items` from the loader."
  [loader conn-pool max-items]
  (loop []
    (let [old-v @loader
          items (get-in old-v [conn-pool :items] [])
          split-idx (min (count items)
                         max-items)
          items-to-take (subvec items 0 split-idx)
          items-to-leave (subvec items split-idx)
          new-v (assoc-in old-v [conn-pool :items] items-to-leave)]
      (if (compare-and-set! loader old-v new-v)
        items-to-take
        (recur)))))

;; -----
;; query

(defn send-query-single
  "Sends a single query, returns the join rows."
  [conn app-id named-patterns]
  (tracer/with-span! {:name "datalog/send-query-single"}
    (let [{:keys [query pattern-metas]} (match-query :match-0- app-id named-patterns)
          sql-query (hsql/format query)
          sql-res (sql/select-string-keys conn sql-query)]
      (sql-result->result sql-res
                          pattern-metas
                          ;; No need to parse uuids because the db driver will
                          ;; do that for us with the unbatched query
                          false))))

(defn- collect-all-topics
  ([nested-result] (collect-all-topics #{} nested-result))
  ([acc nested-result]
   (reduce (fn [acc {:keys [result children]}]
             (let [next-acc (into acc (:topics result))]
               (if (seq children)
                 (reduce collect-all-topics next-acc children)
                 next-acc)))
           acc
           nested-result)))

(defn send-query-nested
  [conn app-id nested-named-patterns]
  (tracer/with-span! {:name "datalog/send-query-nested"}
    (let [{:keys [query children]} (nested-match-query :match-0-
                                                       app-id
                                                       nested-named-patterns)
          sql-query (hsql/format query)
          sql-res (when query ;; we may not have a query if everything is missing attrs
                    (->> (sql/select-arrays conn sql-query)
                         ;; remove header row
                         second
                         ;; all results are in one json blob in first result
                         first
                         ;; We split them up in batches of 50 to get around
                         ;; 100 argument limitation. The limit is 2500 unless
                         ;; we split further
                         (apply merge)))
          grouped-rows (group-rows-by-join-sym sql-res children)
          result (nested-sql-result->result sql-res grouped-rows children)
          topics (collect-all-topics result)]
      {:data result
       :topics topics})))

(defn send-query-batch
  "Sends a batched query, returns a list of join rows in the same order that
   the args were provided."
  [conn args-col]
  (tracer/with-span! {:name "datalog/send-query-batch"
                      :attributes {:batch-size (count args-col)}}
    (let [batch-data (map-indexed
                      (fn [i args]
                        (apply match-query (kw "match-" i "-") args))
                      args-col)
          hsql-query (batch-queries (map :query batch-data))
          sql-query (hsql/format hsql-query)
          sql-res (-> (sql/select-arrays conn sql-query)
                      second ;; remove header row
                      first ;; all results are in one json blob in first result
                      )]
      (map (fn [{:keys [query pattern-metas]}]
             (sql-result->result (get sql-res (name (:from query)))
                                 pattern-metas
                                 true))
           batch-data))))

(defn query-nested [{:keys [app-id db] :as _ctx} nested-patterns]
  (let [nested-named-patterns (nested->named-patterns nested-patterns)]
    (throw-invalid-nested-patterns nested-named-patterns)
    (send-query-nested (:conn-pool db) app-id nested-named-patterns)))

(defn query
  "Executes a Datalog(ish) query over the given aurora `conn`, Instant `app_id`
   and `patterns`

   All patterns are of the form [idx e a v], in that order.
   Only idx is required to be specified. Any missing pieces will be padded by a
   wildcard represented as '_. See `::pattern` for more details

   Returns

   :topics - a list of `topics` that can be used to invalidate the query.
             `topics` mirror the original list of patterns with reified values
             replaced for symbols

   :symbol-map - map of symbols to their locations in the original list of patterns

   :join-rows - triples returned by the query. Each row contains a list of triples,
                where each triple is a match for it's corresponding pattern

   Example usage:

   ```
    (query conn app-id
      [[:ea ?e movie-year-aid 1987]
       [:ea ?e movie-title-aid ?title]])
    ; =>
    {:topics [[:ea _ :movie/year 1987]
              [:ea #{eid-lethal-weapon eid-robocop eid-predator} :movie/title _]],

     :symbol-map {...}

     :join-rows #{[[eid-robocop :movie/year 1987]
                   [eid-robocop :movie/title RoboCop]
                   ...]}}
   ```"
  [{:keys [app-id missing-attr? db datalog-loader] :as ctx} patterns]
  (if (map? patterns)
    (query-nested ctx patterns)
    (let [named-patterns (->named-patterns patterns)]
      (if missing-attr?
        (missing-attr-result named-patterns)
        (let [_ (throw-invalid-patterns named-patterns)
              args [app-id named-patterns]
              result
              (if-not datalog-loader
                ;; Fall back to regular query if we don't have a loader
                (apply send-query-single (:conn-pool db) args)

                (let [;; The promise that returns the result for our args
                      this-result (promise)]
                  (when (add-pending! datalog-loader
                                      (:conn-pool db)
                                      {:params args
                                       :result-promise this-result})
                    ;; Gets a connection to execute our batch against.
                    ;; While we're waiting for the connection to be available,
                    ;; other threads will add additional items to our batch.
                    ;; Be careful not to do additional blocking code while we
                    ;; have the connection checked out.
                    (sql/with-connection [conn ^HikariDataSource (:conn-pool db)]
                      (let [items (take-batch! datalog-loader (:conn-pool db) max-items)]
                        (try
                          (if (= 1 (count items))
                            ;; Optimized path for a single query
                            (let [{:keys [params result-promise]} (first items)
                                  result (apply send-query-single conn params)]
                              (deliver result-promise result))

                            (let [results (send-query-batch conn (map :params items))]
                              ;; Deliver results to their awaiting promises
                              (dorun (map (fn [{:keys [result-promise]} result]
                                            (deliver result-promise result))
                                          items results))))
                          (catch Exception e
                            ;; If we encounter an error while running the query,
                            ;; then deliver that error to every result in the batch
                            (doseq [{:keys [result-promise]} items]
                              (deliver result-promise e)))))))
                  (let [result @this-result]
                    (if (instance? Exception result)
                      (throw result)
                      result))))]
          result)))))
