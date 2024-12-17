(ns instant.db.instaql
  (:require
   [clojure.set :as set :refer [map-invert]]
   [clojure.spec.alpha :as s]
   [clojure.string :as string]
   [clojure.walk :as walk]
   [honey.sql :as hsql]
   [instant.data.constants :refer [zeneca-app-id]]
   [instant.data.resolvers :as resolvers]
   [instant.db.cel :as cel]
   [instant.db.datalog :as d]
   [instant.db.model.attr :as attr-model]
   [instant.db.model.attr-pat :as attr-pat]
   [instant.db.model.entity :as entity-model]
   [instant.db.model.triple :as triple-model]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.model.rule :as rule-model]
   [instant.util.coll :as ucoll]
   [instant.util.exception :as ex]
   [instant.util.io :as io]
   [instant.util.json :refer [->json]]
   [instant.util.tracer :as tracer]
   [instant.util.uuid :as uuid-util]
   [medley.core :refer [update-existing-in]])
  (:import
   (java.util UUID)))

;; ----
;; Form

(defn where-value-valid? [x]
  (or (string? x) (uuid? x) (number? x) (boolean? x)))

(s/def ::$in (s/coll-of where-value-valid?
                        :kind vector?
                        :min-count 0
                        :into #{}))
;; Backwards compatibility
(s/def ::in ::$in)

(s/def ::$not where-value-valid?)
(s/def ::$isNull boolean?)
(s/def ::comparator (s/or :string string?
                          :number number?
                          :boolean boolean?))

(s/def ::$gt ::comparator)
(s/def ::$gte ::comparator)
(s/def ::$lt ::comparator)
(s/def ::$lte ::comparator)
(s/def ::$like ::comparator)
(s/def ::$ilike ::comparator)

(defn where-value-valid-keys? [m]
  (every? #{:in :$in
            :$not :$isNull
            :$gt :$gte :$lt :$lte
            :$like :$ilike}
          (keys m)))

(s/def ::where-args-map (s/and
                         (s/keys :opt-un [::in ::$in ::$not ::$isNull
                                          ::$gt ::$gte ::$lt ::$lte ::$like ::$ilike])
                         where-value-valid-keys?))

(s/def ::where-v
  (s/with-gen
    (s/or :value where-value-valid?
          :args-map ::where-args-map)
    #(s/gen #{"foo" (UUID/randomUUID) 25 true {:in [1 2 3]}})))

(s/def ::where-cond (s/or :cond (s/cat :path (s/coll-of string?) :v ::where-v)
                          :or (s/keys :req-un [::or])
                          :and (s/keys :req-un [::and])))
(s/def ::where-conds (s/coll-of ::where-cond))

(s/def ::k string?)

(s/def ::or (s/coll-of ::where-conds))
(s/def ::and (s/coll-of ::where-conds))
(s/def ::direction #{:asc :desc})

(s/def ::order (s/keys :req-un [::k ::direction]))
(s/def ::limit (s/and int? pos?))
(s/def ::first (s/and int? pos?))
(s/def ::last (s/and int? pos?))
(s/def ::offset (s/and int? #(>= % 0)))

(s/def ::byop-cursor (s/tuple any? string? ::triple-model/value))
(s/def ::normal-cursor (s/tuple ::triple-model/entity-id ::triple-model/attr-id ::triple-model/value int?))

(defn cursor-conformer [c]
  (case (count c)
    4 (s/conform ::normal-cursor c)
    3 (s/conform ::byop-cursor c)))

(s/def ::cursor (s/conformer cursor-conformer))
(s/def ::before ::cursor)
(s/def ::after ::cursor)
(s/def ::aggregate #{:count})

(s/def ::option-map (s/keys :opt-un [::where-conds
                                     ::order
                                     ::limit
                                     ::first
                                     ::last
                                     ::offset
                                     ::before
                                     ::after
                                     ::aggregate]))

(s/def ::forms (s/coll-of ::form))
(s/def ::child-forms ::forms)
(s/def ::form (s/keys :req-un [::k ::option-map ::child-forms]))

(defn or-where-cond? [[k v]]
  (and (= "or" (name k))
       (sequential? v)))

(defn and-where-cond? [[k v]]
  (and (= "and" (name k))
       (sequential? v)))

(defn- collapse-or-where-conds
  "Converts {:or [{:or [{:handle \"Jack\"}]}]} -> {:or [{:handle \"Jack\"}]}"
  [conds]
  (reduce (fn [acc [_k v :as c]]
            (if (or-where-cond? c)
              (apply conj acc (mapcat collapse-or-where-conds v))
              (conj acc c)))
          []
          conds))

(defn grow-paths
  "Given a path, creates a list of paths leading up to that path,
   including the path itself.
   (grow-paths [1 2 3]) => ((1) (1 2) (1 2 3))"
  [path]
  (map (fn [i]
         (take (inc i) path))
       (range (count path))))

(defn- coerce-where-cond
  "Splits keys into segments."
  [state [k v :as c]]
  (cond (or-where-cond? c)
        {:or (let [conds (map (fn [conds]
                                (map (partial coerce-where-cond state)
                                     (collapse-or-where-conds conds)))
                              v)]
               (if (seq conds)
                 conds
                 (ex/throw-validation-err!
                  :query
                  (:root state)
                  [{:expected 'non-empty-list?
                    :in (conj (:in state) :or)
                    :message "The list of `or` conditions can't be empty."}])))}
        (and-where-cond? c)
        {:and (let [conds (map (fn [conds]
                                 (map (partial coerce-where-cond state)
                                      conds))
                               v)]
                (if (seq conds)
                  conds
                  (ex/throw-validation-err!
                   :query
                   (:root state)
                   [{:expected 'non-empty-list?
                     :in (conj (:in state) :and)
                     :message "The list of `and` conditions can't be empty."}])))}

        (and (map? v) (contains? v :$not))
        ;; If the where cond has `not`, then the check will only include
        ;; entities where the entity has a triple with the attr. If the
        ;; attr is missing, then we won't find it. We add an extra
        ;; `isNull` check to ensure that we find the entity.
        (let [path (string/split (name k) #"\.")]
          {:or (concat [[[path v]]]
                       (map (fn [p]
                              [[p {:$isNull true}]])
                            (grow-paths path)))})

        (and (map? v) (contains? v :$isNull) (= true (:$isNull v)))
        ;; If the where cond has `$isNull=true`, then we
        ;; need it should match if any of the intermediate
        ;; paths are null
        (let [path (string/split (name k) #"\.")]
          {:or (concat [[[path v]]]
                       (map (fn [p]
                              [[p {:$isNull true}]])
                            (grow-paths path)))})

        :else [(string/split (name k) #"\.") v]))

(defn coerce-order [state order-map]
  (case (count order-map)
    0 nil
    1 (let [[k direction] (first order-map)]
        (if (#{"desc" "asc" :desc :asc} direction)
          (let [k (name k)]
            {:k k
             :direction (case direction
                          ("desc" :desc) :desc
                          ("asc" :asc) :asc)})
          (ex/throw-validation-err!
           :query
           (:root state)
           [{:expected 'valid-direction?
             :in (conj (:in state) k)
             :message (format "We only support \"asc\" or \"desc\" in the `order` clause. Got %s."
                              (->json direction))}])))
    (ex/throw-validation-err!
     :query
     (:root state)
     [{:expected 'single-key?
       :in (:in state)
       :message (format "We only support a single key in the `order` clause. Got %s."
                        (string/join "," (map name (keys order-map))))}])))

(defn- assert-map! [{:keys [in root]} x]
  (when-not (map? x)
    (ex/throw-validation-err!
     :query
     root
     [{:expected 'map? :in in}]))
  x)

(defn- assert-cursor! [{:keys [in root]} x]
  (let [err (fn [msg]
              (ex/throw-validation-err!
               :query
               root
               [{:expected 'join-row?
                 :in in
                 :message msg}]))]
    (when (not (sequential? x))
      (err (format "Expected a join row for the cursor, got %s."
                   (->json x))))
    (when (not (#{3 4} (count x)))
      (err (format "Expected a join row with 4 items for the cursor, got %s."
                   (->json x))))
    (let [[e a v t] x
          e-uuid (uuid-util/coerce e)
          a-uuid (uuid-util/coerce a)]
      (when (not a-uuid)
        (err (format "Expected a join row with a uuid attribute id in the second position, got %s."
                     (->json a))))
      (when (and t
                 (not (int? t)))
        (err (format "Expected a join row with an integer created_at in the last position, got %s."
                     (->json t))))
      (if t
        [(or e-uuid e) (or a-uuid a) v t]
        [(or e-uuid e) (or a-uuid a) v]))))

(defn- coerce-limit! [state limit]
  (if (and (int? limit) (pos? limit))
    limit
    (ex/throw-validation-err!
     :query
     (:root state)
     [{:expected 'supported-options?
       :in (conj (:in state) :limit)
       :message (format "The limit field must be a positive integer. Got %s."
                        (->json limit))}])))

(defn- coerce-first! [state limit]
  (if (and (int? limit) (pos? limit))
    limit
    (ex/throw-validation-err!
     :query
     (:root state)
     [{:expected 'supported-options?
       :in (conj (:in state) :first)
       :message (format "The first field must be a positive integer. Got %s."
                        (->json first))}])))

(defn- coerce-last! [state limit]
  (if (and (int? limit) (pos? limit))
    limit
    (ex/throw-validation-err!
     :query
     (:root state)
     [{:expected 'supported-options?
       :in (conj (:in state) :last)
       :message (format "The last field must be a positive integer. Got %s."
                        (->json limit))}])))

(defn- coerce-offset! [state offset]
  (if (and (int? offset) (not (neg? offset)))
    offset
    (ex/throw-validation-err!
     :query
     (:root state)
     [{:expected 'supported-options?
       :in (conj (:in state) :offset)
       :message (format "The offset field must be a non-negative integer. Got %s."
                        (->json offset))}])))

(defn- coerce-aggregate! [state aggregate]
  (if (#{"count" :count} aggregate)
    :count
    (ex/throw-validation-err!
     :query
     (:root state)
     [{:expected 'supported-options?
       :in (conj (:in state) :aggregate)
       :message (format "The aggregate field only accepts \"count\", got %s."
                        (->json aggregate))}])))

(defn- coerce-option-map!
  "Coerce the where conditions into paths and values."
  [state x]
  (let [where-conds (some->> (get x :where)
                             (assert-map! (update state :in conj :where))
                             (map (partial coerce-where-cond state)))
        order (let [order-state (update state :in conj :order)]
                (some->> (:order x)
                         (assert-map! order-state)
                         (coerce-order order-state)))

        limit (when-let [limit (:limit x)]
                (coerce-limit! state limit))

        first (when-let [first (:first x)]
                (coerce-first! state first))

        last (when-let [last (:last x)]
               (coerce-last! state last))

        offset (when-let [offset (:offset x)]
                 (coerce-offset! state offset))

        after (when-let [after (:after x)]
                (assert-cursor! (update state :in conj :after) after))

        before (when-let [before (:before x)]
                 (assert-cursor! (update state :in conj :before) before))

        aggregate (when-let [aggregate (:aggregate x)]
                    (coerce-aggregate! state aggregate))

        x (dissoc x :where :order :limit :first :last :offset :before :after :aggregate)]

    (when (seq x)
      (ex/throw-validation-err!
       :query
       (:root state)
       [{:expected 'supported-options?
         :in (:in state)
         :message "We only support `where`, `order`, `limit`, `offset`, `before`, and `after` clauses."}]))

    (when (and (< 0 (:level state))
               (or limit offset after before))
      (ex/throw-validation-err!
       :query
       (:root state)
       [{:expected 'supported-options?
         :in (:in state)
         :message "We currently only support `limit`, `offset`, `before`, and `after` clauses on the top-level field."}]))

    (let [limit-opts (filter identity [(when limit "`limit`")
                                       (when first "`first`")
                                       (when last "`last`")])]
      (when (< 1 (count limit-opts))
        (ex/throw-validation-err!
         :query
         (:root state)
         [{:expected 'supported-options?
           :in (:in state)
           :message (format "Only provide one of %s." (string/join " or " limit-opts))}])))

    (cond-> x
      (seq where-conds) (assoc :where-conds where-conds)
      order (assoc :order order)
      limit (assoc :limit limit)
      first (assoc :first first)
      last (assoc :last last)
      offset (assoc :offset offset)
      after (assoc :after after)
      before (assoc :before before)
      aggregate (assoc :aggregate aggregate))))

(defn- coerce-forms!
  "Converts our InstaQL object into a list of forms."
  [state o]
  (assert-map! state o)
  (->> o
       (map (fn [[k v]]
              (let [state' (update state :in conj k)
                    _ (assert-map! state' v)
                    option (coerce-option-map! (update state' :in conj :$)
                                               (get v :$ {}))
                    child-forms (dissoc v :$)]
                {:k (name k)
                 :option-map option
                 :child-forms (coerce-forms! (update state' :level inc)
                                             child-forms)})))))

(defn ->forms! [o]
  (let [coerced (coerce-forms! {:root o :in [] :level 0} o)
        conformed (s/conform ::forms coerced)]
    (when (s/invalid? conformed)
      (ex/throw-validation-err!
       :coerced-query
       coerced
       (ex/explain->validation-errors
        (s/explain-data ::forms coerced))))
    conformed))

(comment
  (coerce-option-map!
   {:in []}
   {:where {:bookshelves.books.title "The Count of Monte Cristo"
            :email {:in ["test@example.com"]}
            :or [{:email "test"}
                 {:or [{:a "b"}]}]
            :and [{:email "test"}
                  {:handle "test"}]}})
  (coerce-forms!
   {:in []}
   {:users {:$ {:where {:bookshelves.books.title "The Count of Monte Cristo"
                                        ;:email "test@example.com"
                        }}
            :books {}}})

  (coerce-forms!
   {:in []}
   {:users {:$ {:where {:bookshelves.books.title "The Count of Monte Cristo"}
                :order {:serverCreatedAt "desc"}}
            :books {}}})

  (->forms!
   {:users {:$ {:where {:bookshelves.books.title "The Count of Monte Cristo"
                        :email "test@example.com"}}
            :books {}}
    :bookshelves {}})

  (->forms!
   {:users {:$ {:where {:handle {:in ["stopa", "joe"]}
                        :or [{:email "test"}
                             {:or [{:a "b"}]}]
                        :and [{:email "test"}
                              {:handle "test"}]}}
            :books {}}})

  (->forms!
   {:users {:$ {:where {:and [{:or [{:handle "somebody"}
                                    {:handle "joe"}
                                    {:handle "nobody"}]}]}}}}))

;; ------
;; Node

(s/def ::child-nodes (s/coll-of ::node))
(s/def ::datalog-query ::d/patterns)
(s/def ::datalog-result ::d/result)
(s/def ::data (s/keys :req-un [::datalog-query ::datalog-result]))

(s/def ::node
  (s/keys :req-un [::data ::child-nodes]))

(defn make-node [data]
  {:data data :child-nodes []})

(defn add-children [node children]
  (update node :child-nodes into children))

(defn data-seq
  "Given a node, return the tree as a sequence in dfs order."
  [node]
  (lazy-seq
   (cons (:data node)
         (mapcat data-seq (:child-nodes node)))))

;; ----
;; ->where-cond-attr-pats

(defn- level-sym-gen
  "Generates a level-sym function that will namespace all but the join variable."
  [base-level-sym etype idx]
  (fn level-sym [x level]
    (let [base (base-level-sym x level)]
      (if (= x etype)
        base
        (symbol (str base "-" idx))))))

(defn- ->where-cond-attr-pats
  "Take the where-cond:

   [\"users\" \"bookshelves\" \"books\" \"title\"] \"Foo\"

   This creates the attr-pats for the where-cond:

   [[?users bookshelves-attr ?bookshelves]
    [?bookshelves books-attr ?books]
    [?books title-attr \"Foo\"]]"
  [{:keys [level-sym attrs] :as ctx}
   {:keys [etype level] :as _form}
   {:keys [path v] :as _where-cond}]
  (let [level-sym (or level-sym
                      attr-pat/default-level-sym)
        [v-type v-value] v
        v (case v-type
            :value v-value
            :args-map (let [[func args-map-val] (first v-value)]
                        (case func
                          (:$in :in) args-map-val
                          {func args-map-val})))
        [refs-path value-label] (ucoll/split-last path)

        [last-etype last-level ref-attr-pats referenced-etypes]
        (attr-pat/->ref-attr-pats ctx level-sym etype level refs-path)

        value-attr-pats (if (and (map? v) (contains? v :$isNull))
                          (let [id-attr (attr-model/seek-by-fwd-ident-name [last-etype "id"] attrs)
                                fwd-attr (attr-model/seek-by-fwd-ident-name [last-etype value-label] attrs)
                                rev-attr (attr-model/seek-by-rev-ident-name [last-etype value-label] attrs)
                                value-attr (or fwd-attr
                                               rev-attr)]
                            (ex/assert-record!
                             id-attr :attr {:args [last-etype "id"]})
                            (ex/assert-record!
                             value-attr :attr {:args [last-etype value-label]})

                            [[(level-sym last-etype last-level)
                              (:id id-attr)
                              {:$isNull {:attr-id (:id value-attr)
                                         :nil? (:$isNull v)
                                         :ref? (= :ref (:value-type value-attr))
                                         :reverse? (= value-attr rev-attr)}}]])
                          [(attr-pat/->value-attr-pat ctx
                                                      level-sym
                                                      last-etype
                                                      last-level
                                                      value-label
                                                      v)])]
    {:pats (concat ref-attr-pats value-attr-pats)
     :referenced-etypes (conj referenced-etypes
                              etype)}))

;; ----
;; ->all-ids-attr-pat

(defn- ->all-ids-attr-pat
  "consider the plain query: {users: {}}

   This has no where-cond or a join. In this case, we want to get all ids
   for the etype.

   This function does just that.

   Note: We rely on the fact that all objects have
   an `id` attr."
  [ctx etype level]
  (let [esym (attr-pat/default-level-sym etype level)
        {:keys [id]} (attr-pat/id-attr-by-etype ctx etype)]
    [esym id '_]))

;; ---
;; optimize-attr-pats

(defn- some-constant
  "Returns either e or v if they are a constant
   [?e attr-id ?v] => nil
   [?e attr-id 5] => 5
   [5 attr-id ?v] => 5"
  [[e _ v :as _attr-pat]]
  (some d/constant? [e v]))

(defn- optimize-attr-pats
  "Given a list of attr pats, this tries to return a list that will be more
   efficient to query. For example:

   [[?users bookshelves ?bookshelves]
    [?bookshelves title \"Foo\"]]

   It's more efficient to write:

   [[?bookshelves title \"Foo\"]
    [?users bookshelves ?bookshelves]]"
  [attr-pats]
  (cond
    ;; If there is only one attr-pat, we don't need to optimize
    (<= (count attr-pats) 1)
    attr-pats

    ;; If the first attr-pat has a constant in it, it's optimized-enough for now
    (and (vector? (first attr-pats))
         (some-constant (first attr-pats)))
    attr-pats

    ;; If the last-attr-pat has constant in it, we'd gain a lot by reversing!
    (and (vector? (last attr-pats))
         (some-constant (last attr-pats)))
    (reverse attr-pats)

    :else attr-pats))

;; ----
;; where-query

(declare where-cond->patterns)

(defn- where-conds->patterns [ctx form where-conds]
  (reduce (fn [acc [i where-cond]]
            (let [{:keys [pats referenced-etypes]}
                  (where-cond->patterns (if (zero? i)
                                          ctx
                                          (assoc ctx :skip-optimize? true))
                                        form where-cond)]
              (-> acc
                  (update :pats into pats)
                  (update :referenced-etypes set/union referenced-etypes))))
          {:pats []
           :referenced-etypes #{}}
          (map-indexed vector where-conds)))

(defn- where-cond->patterns [ctx form [tag where-cond]]
  (let [level-sym (or (:level-sym ctx)
                      attr-pat/default-level-sym)]
    (case tag
      :cond
      (let [ret (->where-cond-attr-pats ctx form where-cond)]
        (if (:skip-optimize? ctx)
          ret
          (update ret :pats optimize-attr-pats)))
      :or (-> (reduce
               (fn [acc [i conds]]
                 (let [level-sym (level-sym-gen level-sym (:etype form) i)]
                   (as-> (where-conds->patterns (assoc ctx :level-sym level-sym)
                                                form
                                                conds) %
                     (update % :pats (fn [pats] [{:and pats}]))
                     (merge-with into acc %))))
               {:pats []
                :referenced-etypes #{}}
               (map-indexed vector (:or where-cond)))
              (update :pats (fn [pats]
                              [{:or {:patterns pats
                                     :join-sym (attr-pat/default-level-sym
                                                (:etype form)
                                                (:level form))}}])))

      :and (-> (reduce
                (fn [acc [i conds]]
                  (let [level-sym (level-sym-gen level-sym (:etype form) i)]
                    (as-> (where-conds->patterns (assoc ctx :level-sym level-sym)
                                                 form
                                                 conds) %
                      (update % :pats (fn [pats] [{:and pats}]))
                      (merge-with into acc %))))
                {:pats []
                 :referenced-etypes #{}}
                (map-indexed vector (:and where-cond)))
               (update :pats (fn [pats]
                               [{:and pats}]))))))

(defn- where-query
  "Given a form, return the query that could get the relevant ids,
   and the symbol that represents the ids.

   i.e {users: {where: {handle: \"stopa\"}}} =>

   (?users, [[:av ?users handle-attr \"stopa\"]]])

   This considers:

   - a plain scan: {users: {}}

   - a join: {users: {bookshelves: {}}}

   - a where clause: {users: {where: {handle: \"stopa\"}}}

   We also do some light optimizations:
    - If we have a pattern with a constant, we put that pattern first.

   Note: there's an implicit assumption here:
     - When we generate the patterns, we assume that the variable for eids
       will be (? etype level) "
  [ctx {:keys [option-map join-attr-pat etype level] :as form}]
  (let [{:keys [where-conds]} option-map
        {where-cond-patterns :pats
         referenced-etypes :referenced-etypes}
        (if where-conds
          (where-conds->patterns (assoc ctx
                                        :skip-optimize? false) form where-conds)
          {:pats nil
           :referenced-etypes #{}})
        with-join (cond-> []
                    join-attr-pat (conj join-attr-pat))
        with-where-cond (cond-> with-join
                          where-cond-patterns (into where-cond-patterns))
        with-fallback (if (seq with-where-cond)
                        with-where-cond
                        [(->all-ids-attr-pat ctx etype level)])
        optimized (optimize-attr-pats (distinct with-fallback))
        datalog-query (attr-pat/attr-pats->patterns ctx optimized)]
    (list false
          (attr-pat/default-level-sym etype level)
          etype
          datalog-query
          (conj referenced-etypes etype))))

(defn guarded-where-query [ctx {:keys [etype level] :as form}]
  (try
    (where-query ctx form)
    (catch clojure.lang.ExceptionInfo e
      (if (contains? #{::ex/validation-failed}
                     (::ex/type (ex-data e)))
        (throw e)
        (list true
              (attr-pat/default-level-sym etype level)
              etype
              [[:ea (attr-pat/default-level-sym etype level)]
               [:eav]]
              #{etype})))))

;; ----------
;; pagination

;; A default order if the user only provides a limit/offset/cursor without
;; an order.
(def default-order {:k "serverCreatedAt" :direction :asc})

(defn wrong-attribute-msg [{:keys [attrs]} order-attr cursor-attr-id]
  (let [order-label (fn [attr]
                      (let [lbl (attr-model/fwd-label attr)]
                        (if (= lbl "id")
                          "serverCreatedAt"
                          lbl)))]
    (if-let [cursor-attr (attr-model/seek-by-id cursor-attr-id attrs)]
      (format "The query orders by `%s`, but the query that returned the cursor orders by `%s`."
              (order-label order-attr)
              (order-label cursor-attr))
      (format "The query orders by `%s`, but the query that returned the cursor orders by a missing attribute."
              (order-label order-attr)))))

(defn page-info-of-form [{:keys [state] :as ctx}
                         {:keys [etype level option-map] :as _form}]
  (let [{:keys [order limit first last offset before after]} option-map]
    ;; We don't need to do extra work to order the results if we're returning
    ;; everything. We only need to order if there is pagination.
    ;; The client is just going to get a set of triples anyway, so it can handle
    ;; ordering on the frontend.
    (when (or limit first last offset before after order)
      (let [{:keys [k direction]} (or order default-order)
            etype-sym (attr-pat/default-level-sym etype level)
            order-sym (if (= "serverCreatedAt" k)
                        (symbol (str "?t-" level))
                        (attr-pat/default-level-sym k level))
            order-attr (if (= "serverCreatedAt" k)
                         (attr-model/seek-by-fwd-ident-name [etype "id"] (:attrs ctx))
                         (attr-model/seek-by-fwd-ident-name [etype k] (:attrs ctx)))]

        (when (not order-attr)
          (ex/throw-validation-err!
           :query
           (:root state)
           [{:expected 'supported-order?
             :in (apply conj (:in (:state ctx)) [:$ :order])
             :message (format "There is no `%s` attribute for %s."
                              (if (= "serverCreatedAt" k)
                                "id"
                                k)
                              etype)}]))

        (when (not= "serverCreatedAt" k)
          (let [errors (keep identity
                             [(when (:checking-data-type? order-attr)
                                (format "The `%s` attribute is still in the process of validating its type. It must finish before ordering by the attribute."
                                        (attr-model/fwd-friendly-name order-attr)))
                              (when (:indexing? order-attr)
                                (format "The `%s` attribute is still in the process of indexing. It must finish before ordering by the attribute."
                                        (attr-model/fwd-friendly-name order-attr)))
                              (when (not (:index? order-attr))
                                (format "The `%s` attribute is not indexed. Only indexed and type-checked attrs can be used to order by."
                                        (attr-model/fwd-friendly-name order-attr)))
                              (when (not (:checked-data-type order-attr))
                                (format "The `%s` attribute is not type-checked. Only type-checked and indexed attrs can be used to order by."
                                        (attr-model/fwd-friendly-name order-attr)))
                              (when (not= :one (:cardinality order-attr))
                                (format "The `%s` attribute has cardinality `%s`. Only attrs with cardinality `one` can be used to order by."
                                        (attr-model/fwd-friendly-name order-attr)
                                        (name (:cardinality order-attr))))])]
            (when (seq errors)
              (ex/throw-validation-err!
               :query
               (:root state)
               (map (fn [message]
                      {:expected 'supported-order?
                       :in (apply conj (:in (:state ctx)) [:$ :order])
                       :message message})
                    errors)))))

        (when (and before
                   (not= (:id order-attr) (second before)))
          (ex/throw-validation-err!
           :query
           (:root state)
           [{:expected 'valid-cursor?
             :in (apply conj (:in (:state ctx)) [:$ :before])
             :message (format "Invalid before cursor. %s"
                              (wrong-attribute-msg ctx order-attr (second before)))}]))

        (when (and after
                   (not= (:id order-attr) (second after)))
          (ex/throw-validation-err!
           :query
           (:root state)
           [{:expected 'valid-cursor?
             :in (apply conj (:in (:state ctx)) [:$ :after])
             :message (format "Invalid after cursor. %s"
                              (wrong-attribute-msg ctx order-attr (second after)))}]))

        {:limit (or limit first last)
         :last? (not (nil? last))
         :offset offset
         :direction direction
         :order-sym order-sym
         :order-col-type (if (= k "serverCreatedAt")
                           :created-at-timestamp
                           (:checked-data-type order-attr))
         :pattern (if (= "serverCreatedAt" k)
                    [:ea etype-sym (:id order-attr) '_ order-sym]
                    [{:idx-key :ave
                      :data-type (:checked-data-type order-attr)}
                     etype-sym
                     (:id order-attr)
                     order-sym])
         :attr-id (:id order-attr)
         :before before
         :after after}))))

;; -----
;; query

(defn- form->child-forms
  "Given a form and eid, return a seq of all the possible child queries.
   This determines the etype for the child form, and adds a join condition on
   the eid"
  [ctx {:keys [etype child-forms level]} eid]
  (for [form child-forms]
    (let [{:keys [k]} form

          [next-etype next-level attr-pat]
          (attr-pat/->guarded-ref-attr-pat ctx etype level k)

          join-attr-pat (attr-pat/replace-in-attr-pat
                         attr-pat (attr-pat/default-level-sym etype level) eid)
          form' (-> form
                    (assoc :etype next-etype)
                    (assoc :level next-level)
                    (assoc :join-attr-pat join-attr-pat))]
      form')))

(defn collect-query-results
  "Takes the datalog result from a nested query and the forms to constructs the
   query output.

   Assumes the structure of the datalog result matches the structure of the forms."
  [datalog-result forms]
  (mapv (fn [form child]
          (let [nodes (map (fn [child]
                             (add-children
                              (make-node {:datalog-query (:datalog-query (first child))
                                          :datalog-result (:result (first child))})
                              (collect-query-results (first (:children (first child)))
                                                     (:child-forms form))))
                           (:children child))]
            (add-children
             (make-node {:k (:k form)
                         :option-map (:option-map form)
                         :datalog-query (:datalog-query child)
                         :datalog-result (:result child)})
             nodes)))
        forms datalog-result))

(defn- replace-sym-placeholders
  "Updates the patterns to replace the placeholder with the join-sym.
   We use a placeholder so that `guarded-where-query` will use a good
   index.

   The index works because the join-sym will reference the value from
   the parent query in the actual sql query."
  [placeholders patterns]
  (mapv (fn [p]
          (cond (:or p)
                (update-in p [:or :patterns] (partial replace-sym-placeholders placeholders))

                (:and p)
                (update p :and (partial replace-sym-placeholders placeholders))

                :else
                (mapv (fn [c] (get placeholders c c))
                      p)))
        patterns))

(defn collect-query-one [query-one-results]
  (reduce (fn [acc {:keys [pattern-group referenced-etypes]}]
            (-> acc
                (update :pattern-groups conj pattern-group)
                (update :referenced-etypes into referenced-etypes)))
          {:pattern-groups []
           :referenced-etypes #{}}
          query-one-results))

(defn- query-one
  "Generates nested datalog query that combines all datalog queries into a
   single sql query."
  [ctx {:keys [k] :as form}]
  (let [ctx (update-in ctx [:state :in] conj k)

        [missing-attr? sym etype patterns where-etypes]
        (guarded-where-query ctx form)

        page-info (when-not missing-attr?
                    (page-info-of-form ctx form))

        ;; Create an eid placeholder for the sym so that `guarded-where-query`
        ;; will use good indexes, then we'll replace it in the patterns later
        sym-placeholder (or (get-in ctx [:sym-placeholders sym])
                            (random-uuid))
        ctx (assoc-in ctx [:sym-placeholders sym] sym-placeholder)
        child-forms (form->child-forms ctx form sym-placeholder)
        aggregate (get-in form [:option-map :aggregate])
        etype-attr-ids (attr-model/attr-ids-for-etype etype (:attrs ctx))
        child-patterns (collect-query-one
                        (mapv (partial query-one ctx)
                              child-forms))]
    (when (and aggregate (not (:admin? ctx)))
      (ex/throw-validation-err!
       :query
       (:root (:state ctx))
       [{:expected 'admin?
         :in (apply conj (:in (:state ctx)) [:$ :aggregate])
         :message "Aggregates are currently only available for admin queries."}]))

    (when (and aggregate (seq child-forms))
      (ex/throw-validation-err!
       :query
       (:root (:state ctx))
       [{:expected 'valid-query?
         :in (apply conj (:in (:state ctx)) [:$ :aggregate])
         :message "You can not combine aggregates with child queries at this time."}]))

    {:referenced-etypes (set/union #{etype}
                                   (:referenced-etypes child-patterns)
                                   where-etypes)
     :pattern-group
     (merge
      {:patterns (replace-sym-placeholders (map-invert (:sym-placeholders ctx))
                                           patterns)
       :children {:pattern-groups
                  [(merge {:patterns [[:ea sym etype-attr-ids]]}
                          (when (seq child-forms)
                            {:children {:pattern-groups (:pattern-groups child-patterns)
                                        :join-sym sym}}))]
                  :join-sym sym}}
      (when missing-attr?
        {:missing-attr? missing-attr?})
      (when page-info
        {:page-info page-info})
      (when aggregate
        {:aggregate aggregate
         :children nil}))}))

(defn instaql-query->patterns [ctx o]
  (let [forms (->> (->forms! o)
                   ;; at the top-level, `k` _must_ be the etype
                   (mapv (fn [{:keys [k] :as form}]
                           (assoc form :etype k :level 0))))
        {:keys [pattern-groups
                referenced-etypes]}
        (collect-query-one
         (map (partial query-one (assoc ctx :state {:root o :in []}))
              forms))]
    {:patterns {:children {:pattern-groups pattern-groups}}
     :forms forms
     :referenced-etypes referenced-etypes}))

(defn clean-where-for-hash [where]
  (walk/postwalk (fn [x]
                   (cond (string? x)
                         :string
                         (number? x)
                         :number
                         (uuid? x)
                         :uuid
                         (boolean? x)
                         :boolean
                         :else x))
                 where))

(defn clean-forms-for-hash [forms]
  (walk/postwalk (fn [v]
                   (if (and (map? v)
                            (contains? v :$))
                     (-> v
                         (update-existing-in [:$ :where] clean-where-for-hash)
                         (update-existing-in [:$ :before] (constantly :cursor))
                         (update-existing-in [:$ :after] (constantly :cursor)))
                     v))
                 forms))

(defn forms-hash [forms]
  (hash (clean-forms-for-hash forms)))

(defn query-normal
  "Generates and runs a nested datalog query, then collects the results into nodes."
  [ctx o]
  (let [query-hash (forms-hash o)]
    (tracer/with-span! {:name "instaql/query-nested"
                        :attributes {:app-id (:app-id ctx)
                                     :forms o
                                     :query-hash query-hash}}
      (let [datalog-query-fn (or (:datalog-query-fn ctx)
                                 #'d/query)
            {:keys [patterns forms]} (instaql-query->patterns ctx o)
            datalog-result (datalog-query-fn (assoc ctx :query-hash query-hash)
                                             patterns)]
        (collect-query-results (:data datalog-result) forms)))))

;; BYOP InstaQL

(defn safe-table
  "Ensures that we only allow known tables to prevent sql injection."
  [state table-info table-name]
  (if (contains? table-info table-name)
    (keyword table-name)
    (ex/throw-validation-err!
     :query
     (:root state)
     [{:expected 'valid-table
       :in (:in state)
       :message (str table-name " is not a recognized table.")}])))

(defn select-fields
  "Generates list of select fields for a table."
  [state table-info table-name]
  (if (contains? table-info table-name)
    (keys (get-in table-info [table-name :fields]))
    (ex/throw-validation-err!
     :query
     (:root state)
     [{:expected 'valid-table
       :in (:in state)
       :message (str table-name " is not a recognized table.")}])))

(defn safe-field
  "Ensures that we only allow known fields to prevent sql injection."
  [state table-info table-name field-name]
  (if (contains? table-info table-name)
    (let [fields (get-in table-info [table-name :fields])]
      (if (contains? fields (keyword field-name))
        (keyword field-name)
        (ex/throw-validation-err!
         :query
         (:root state)
         [{:expected 'valid-table
           :in (:in state)
           :message (str field-name " is not a recognized field on " table-name ".")}])))
    (ex/throw-validation-err!
     :query
     (:root state)
     [{:expected 'valid-table
       :in (:in state)
       :message (str table-name " is not a recognized table.")}])))

(defn t-field
  "Gets the field we'll use to populate the `t` field in the triple."
  [table-info table-name]
  (-> table-info (get table-name) :t-field))

(defn safe-order-by-field
  "Ensures that we only allow known fields to prevent sql injection.
   Also prevents ordering by unindexed fields."
  [state table-info table-name field-name]
  (let [field (safe-field state table-info table-name field-name)
        field-info (get-in table-info [table-name :fields field])]
    (if (:indexed? field-info)
      field
      (ex/throw-validation-err!
       :query
       (:root state)
       [{:expected 'indexed-field?
         :in (:in state)
         :message (str field-name " on " table-name " needs an index to be used for ordering")}]))))

(declare where-conds->sql)

(defn relations->conds
  "Creates sql conditions for filtering by relations, e.g.
   {:where {:apps.members.name \"some-name\"}}
   -> exists (select * from apps
              where apps.id = users.app_id
                and exists (select * from members
                             where apps.id = members.app_id
                               and exists (select * from members
                                            where name = 'some-name')))
   Also generates topics."
  [state table-info relations field values]
  (let [[{:keys [table table-field
                 other-table other-table-field] :as _relation} & rest] relations

        {:keys [topics sql-conds]}
        (if (seq rest)
          (relations->conds state table-info rest field values)
          {:topics [] :sql-conds []})]
    {:sql-conds
     [:exists
      {:select :*
       :from other-table
       :where [:and
               [:=
                (keyword (str (name table) "." (name table-field)))
                (keyword (str (name other-table) "." (name other-table-field)))]
               (if (seq rest)
                 sql-conds
                 (let [field-type (get-in table-info [(name other-table)
                                                      :fields
                                                      field
                                                      :db-type])]
                   (list* :or
                          (for [value values]
                            [:= field [:cast value field-type]]))))]}]
     :topics (if (seq rest)
               topics
               [[:ea
                 '_
                 (get-in table-info [(name other-table) :fields field :attr-id])
                 ;; TODO(byop): Should be able to use values to narrow the topics,
                 ;;       but need a way to convert "variables", e.g. t.id
                 '_]])}))

(defn cond-where-cond->sql [state table-info table-name where-cond]
  (let [{:keys [path v]} where-cond
        values (case (first v)
                 :value [(second v)]
                 :args-map (cond (contains? (second v) :in)
                                 (:in (second v))

                                 (contains? (second v) :gt)
                                 [(:gt (second v))]

                                 (contains? (second v) :lt)
                                 [(:lt (second v))]

                                 (contains? (second v) :$like)
                                 (when-let [like-val (:$like (second v))]
                                   like-val)

                                 (contains? (second v) :$ilike)
                                 (when-let [like-val (:$ilike (second v))]
                                   like-val)))]

    (if (< 1 (count path))
      (let [relations-fields (butlast path)

            [_ relations]
            (reduce
             (fn [[previous-table relations] relation-field]
               (if-let [relation (get-in table-info [previous-table
                                                     :relations
                                                     relation-field])]
                 [(name (:other-table relation)) (conj relations relation)]
                 (ex/throw-validation-err!
                  :query
                  (:root state)
                  [{:expected 'not-implemented
                    :in (:in state)
                    :message (str relation-field
                                  " is not a recognized relation on "
                                  previous-table)}])))
             [table-name []]
             relations-fields)
            field (safe-field state
                              table-info
                              (name (:other-table (last relations)))
                              (last path))]
        (relations->conds state table-info relations field values))

      (let [field (safe-field state table-info table-name (first path))
            field-info (get-in table-info [table-name :fields field])
            field-type (:db-type field-info)
            comparison (case (first v)
                         :value :=
                         :args-map (cond (contains? (second v) :in)
                                         :=

                                         (contains? (second v) :gt)
                                         :>

                                         (contains? (second v) :lt)
                                         :<

                                         (contains? (second v) :$like)
                                         :like

                                         (contains? (second v) :$ilike)
                                         :ilike))]
        {:sql-conds (list* :or
                           (for [value values]
                             [comparison field [:cast value field-type]]))
         :topics [[:ea '_ #{(:attr-id field-info)} '_]]}))))

(defn where-cond->sql [state table-info table-name [tag where-cond]]
  (case tag
    :cond (cond-where-cond->sql state table-info table-name where-cond)
    :or (let [{:keys [sql-conds topics]}
              (reduce (fn [acc where-cond]
                        (merge-with concat
                                    acc
                                    (where-conds->sql state
                                                      table-info
                                                      table-name
                                                      where-cond)))
                      {:sql-conds []
                       :topics []}
                      (:or where-cond))]
          {:sql-conds (list* :or sql-conds)
           :topics topics})

    :and (let [{:keys [sql-conds topics]}
               (reduce (fn [acc where-cond]
                         (merge-with concat
                                     acc
                                     (where-conds->sql state
                                                       table-info
                                                       table-name
                                                       where-cond)))
                       {:sql-conds []
                        :topics []}
                       (:and where-cond))]
           {:sql-conds (list* :and sql-conds)
            :topics topics})))

(defn where-conds->sql [state table-info table-name where-conds]
  (if (contains? table-info table-name)
    (let [{:keys [sql-conds topics]}
          (reduce (fn [acc where-cond]
                    (merge-with concat
                                acc
                                (where-cond->sql state
                                                 table-info
                                                 table-name
                                                 where-cond)))
                  {:sql-conds []
                   :topics []}
                  where-conds)]
      {:sql-conds [:and sql-conds]
       :topics topics})
    (ex/throw-validation-err!
     :query
     (:root state)
     [{:expected 'valid-table
       :in (:in state)
       :message (str table-name " is not a recognized table.")}])))

(defn needs-page-info? [form]
  (let [{:keys [offset limit before after first last]} (:option-map form)]
    (or offset limit before after first last)))

(defn order-of-form [state table-info form]
  (when-let [{:keys [field direction]}
             (if-let [user-provided-field (get-in form [:option-map :order :k])]
               {:field (safe-order-by-field state
                                            table-info
                                            (:etype form)
                                            user-provided-field)
                :direction (get-in form [:option-map :order :direction])}
               (when (needs-page-info? form)
                 {:field (get-in table-info [(:etype form) :primary-key :field])
                  :direction :asc}))]
    (if (get-in form [:option-map :last])
      {:field field
       :reversed? true
       :direction (d/reverse-direction direction)}
      {:field field
       :reversed? false
       :direction direction})))

(defn limit-of-form [form]
  (or (get-in form [:option-map :limit])
      (get-in form [:option-map :first])
      (get-in form [:option-map :last])))

(defn where-conds-for-cursors [state table-info form]
  (let [{:keys [before after]} (:option-map form)
        cursor (or before after)]
    (when cursor
      (let [[_e a v] cursor
            field (get-in table-info [(:etype form) :attr-id->field a])
            direction (:direction (order-of-form state table-info form))]
        (when (not field)
          (ex/throw-validation-err!
           :query
           (:root state)
           [{:expected 'valid-cursor?
             :in (:in state)
             :message "Unable to determine field in cursor."}]))
        ;; TODO(byop): Secondary sorting field
        [[:cond {:path [(name field)]
                 :v [:args-map (if before
                                 (case direction
                                   :asc {:lt v}
                                   :desc {:gt v})
                                 (case direction
                                   :asc {:gt v}
                                   :desc {:lt v}))]}]]))))

(defn relation-conds [table-info form child-form]
  (let [relation (get-in table-info [(:etype form)
                                     :relations
                                     (:k child-form)])]
    [:cond {:path [(name (:other-table-field relation))]
            :v [:value (keyword (str "t." (name (:table-field relation))))]}]))

(defn sql-data-field [state table-info form sql-conds children-sql-query]
  {:select (if-let [aggregate (get-in form [:option-map :aggregate])]
             [[[:json_build_object
                "aggregate"
                [:json_build_object (name aggregate) [aggregate :t]]]]]

             [[[(list*
                 :json_build_object
                 "rows"
                 [:json_agg
                  (list*
                   :json_build_object
                   "row" [:row_to_json :t]
                   (concat
                    (when-let [t-field (t-field table-info (:etype form))]
                      ["t" [:cast [:* [:extract [:epoch-from t-field]] 1000] :bigint]])
                    (when (seq (:child-forms form))
                      ["children" children-sql-query])))]

                 (when-let [{:keys [field reversed?]}
                            (order-of-form state table-info form)]
                   ["page-info" [:json_build_object
                                 "sort-field" (name field)
                                 "reversed" reversed?]]))]]])

   :from [[(merge
            {:select (select-fields state table-info (:etype form))
             :from (safe-table state table-info (:etype form))}
            (when-let [limit (limit-of-form form)]
              {:limit limit})
            (when-let [offset (get-in form [:option-map :offset])]
              {:offset offset})
            (when-let [{:keys [field direction]}
                       (order-of-form state table-info form)]
              ;; TODO(byop): Add in secondary ordering field if ordering field isn't unique
              {:order-by [[field direction]]})
            (when sql-conds
              {:where sql-conds}))
           :t]]})

(defn forms->sql-query [ctx table-info forms]
  (let [{:keys [queries topics]}
        (reduce (fn [{:keys [topics queries]} form]
                  (let [where-conds (concat (get-in form [:option-map :where-conds])
                                            (where-conds-for-cursors (:state ctx)
                                                                     table-info
                                                                     form))
                        {sql-conds :sql-conds where-topics :topics}
                        (when (seq where-conds)
                          (where-conds->sql (:state ctx)
                                            table-info
                                            (:etype form)
                                            where-conds))

                        aggregate (get-in form [:option-map :aggregate])

                        _ (when (and aggregate (not (:admin? ctx)))
                            (ex/throw-validation-err!
                             :query
                             (:root (:state ctx))
                             [{:expected 'admin?
                               :in (apply conj (:in (:state ctx)) [:$ :aggregate])
                               :message "Aggregates are currently only available for admin queries."}]))

                        {children-sql-query :sql-query children-topics :topics}
                        (when (and (not aggregate)
                                   (seq (:child-forms form)))
                          (forms->sql-query
                           ctx
                           table-info
                           (map (fn [child-form]
                                  (-> child-form
                                      (assoc :etype (:k child-form))
                                      (update-in [:option-map :where-conds]
                                                 (fn [conds]
                                                   (conj conds
                                                         (relation-conds table-info
                                                                         form
                                                                         child-form))))))
                                (:child-forms form))))

                        query
                        [:json_build_object
                         "k" (:k form)
                         "etype" (:etype form)

                         "data" (sql-data-field (:state ctx)
                                                table-info
                                                form
                                                sql-conds
                                                children-sql-query)]]
                    {:topics (concat topics
                                     where-topics
                                     children-topics)
                     :queries (conj queries query)}))
                {:topics []
                 :queries []}
                forms)]
    {:topics topics
     :sql-query {:select [[[(list* :json_build_array queries)]]]}}))

(defn row->cursor [sort-field attr-id id-field row]
  (when row
    [(get row id-field)
     attr-id
     (get row (name sort-field))]))

(defn relation-join-rows [table-info etype id child]
  (let [relation (get-in table-info [etype
                                     :relations
                                     (get child "k")])

        child-id-field (get-in table-info [(get child "etype")
                                           :primary-key
                                           :attr-name])]
    (map (fn [data]
           (let [child-row (get data "row")
                 child-id (get child-row child-id-field)]
             (case (:direction relation)
               :forward [id
                         (:attr-id relation)
                         child-id]
               :reverse [child-id
                         (:attr-id relation)
                         id])))
         (get-in child ["data" "rows"]))))

(defn rows->join-rows [table-info etype rows]
  (let [id-field (name (get-in table-info [etype :primary-key :field]))]
    (map (fn [{:strs [t row children]}]
           (let [id (get row id-field)]
             (concat
              (for [[k v] row]
                (let [a (get-in table-info [etype :fields (keyword k) :attr-id])
                      join-row [id a v]]
                  (if t
                    (conj join-row t)
                    join-row)))
              (mapcat (partial relation-join-rows table-info etype id)
                      children))))
         rows)))

(defn rows->topics [table-info etype rows]
  (let [primary-key (get-in table-info [etype :primary-key])
        id-field (name (:field primary-key))
        id-attr (:attr-id primary-key)

        ;; TODO(byop): narrow this down if there is a where clause
        catch-all [[:ea '_ #{id-attr} '_]]
        entity-topics (map (fn [{:strs [row]}]
                             [:ea #{(get row id-field)} '_ '_])
                           rows)

        relations (get-in table-info [etype :relations])
        relation-topics
        (mapcat
         (fn [{:strs [children]}]
           (map (fn [child]
                  (let [relation (get relations (get child "k"))]
                    ;; TODO(byop): narrow these down to relevant topics for this relation
                    [:ea '_ #{(:attr-id relation)} '_]))
                children))
         rows)]
    (concat catch-all
            entity-topics
            relation-topics)))

(defn data->page-info [table-info etype data]
  (when-let [sort-field-name (get-in data ["page-info" "sort-field"])]
    (let [sort-field (safe-field {} table-info etype sort-field-name)
          reversed? (get-in data ["page-info" "reversed"])
          id-field (name (get-in table-info [etype :primary-key :field]))
          attr-id (get-in table-info [etype :fields sort-field :attr-id])
          start-row (-> (get data "rows")
                        first
                        (get "row"))
          end-row (-> (get data "rows")
                      last
                      (get "row"))]
      {:start-cursor (row->cursor sort-field attr-id id-field (if reversed?
                                                                end-row
                                                                start-row))
       :end-cursor (row->cursor sort-field attr-id id-field (if reversed?
                                                              start-row
                                                              end-row))})))

(defn query-results->rows [table-info results]
  (mapv (fn [{:strs [k etype data]}]
          {:data
           {:k k
            :datalog-result
            (merge
             {:join-rows (set (rows->join-rows table-info etype (get data "rows")))
              :topics (rows->topics table-info etype (get data "rows"))}
             (when-let [aggregate (get data "aggregate")]
               {:aggregate aggregate})
             (when-let [page-info (data->page-info table-info etype data)]
               {:page-info page-info}))}
           :child-nodes (if-let [children (seq (map #(get % "children")
                                                    (get data "rows")))]
                          (query-results->rows table-info
                                               (reduce
                                                ;; We get a list of children per row. This collects the
                                                ;; children for all of the rows together
                                                (fn [acc children]
                                                  (map (fn [x y]
                                                         (update-in x ["data" "rows"] concat (get-in y ["data" "rows"])))
                                                       acc children))
                                                children))
                          [])})
        results))

(defn collect-topics [query-result]
  (reduce (fn [topics result]
            (set/union topics
                       (-> result :data :datalog-result :topics)
                       (when-let [child-nodes (seq (:child-nodes result))]
                         (collect-topics child-nodes))))
          #{}
          query-result))

(defn query-byop [ctx o]
  (let [{:keys [table-info]} ctx
        {:keys [forms]} (instaql-query->patterns ctx o)
        {:keys [sql-query topics]} (forms->sql-query ctx table-info forms)
        topics-id (random-uuid)
        _ (when-let [record-coarse-topics (:record-datalog-query-start! ctx)]
            (record-coarse-topics topics-id topics))
        sql-result (sql/select-string-keys
                    (:conn-pool (:db ctx))
                    (hsql/format sql-query :quoted true))

        result (query-results->rows table-info
                                    (-> sql-result
                                        first
                                        (get "json_build_array")))]

    (when-let [record-topics (:record-datalog-query-finish! ctx)]
      (record-topics topics-id {:topics (concat (collect-topics result)
                                                topics)}))
    result))

(defn query [ctx o]
  (if (:table-info ctx)
    (query-byop ctx o)
    (query-normal ctx o)))

(defn- join-rows->etype-maps
  "Takes a set of join-rows and returns maps from entity id to etype and
   etype to program."
  [acc {:keys [attrs rules]} join-rows]
  (reduce
   (fn [acc join-rows]
     (reduce
      (fn [acc [e a]]
        (let [etype (-> (attr-model/seek-by-id a attrs)
                        attr-model/fwd-etype)]
          (-> acc
              (update-in [:etype->eids+program etype :eids] (fnil conj #{}) e)
              (update-in [:etype->eids+program etype :program] (fn [p]
                                                                 (or p
                                                                     (rule-model/get-program! rules etype "view")))))))
      acc
      join-rows))
   acc
   join-rows))

(defn extract-permission-helpers*
  ([acc ctx instaql-res]
   (reduce (fn [acc {:keys [data child-nodes]}]
             (let [join-rows (get-in data [:datalog-result :join-rows])
                   next-acc (-> acc
                                (assoc-in [:query-cache (:datalog-query data)]
                                          (:datalog-result data))
                                (join-rows->etype-maps ctx join-rows))]
               (if (seq child-nodes)
                 (extract-permission-helpers* next-acc ctx child-nodes)
                 next-acc)))
           acc
           instaql-res)))

(defn extract-permission-helpers
  "Takes the result of `query` and generates a query cache of
   datalog-query -> datalog-result, and maps for etype->program and eid->type."
  ([ctx instaql-res]
   (extract-permission-helpers {:etype->eids+program {}
                                :query-cache {}}
                               ctx
                               instaql-res))

  ([acc ctx instaql-res]
   (tracer/with-span! {:name "extract-permission-helpers"}
     (extract-permission-helpers* acc ctx instaql-res))))

(defn permissioned-node [{:keys [attrs] :as ctx} etype+eid->check res]
  (let [cleaned-join-rows (->> res
                               :data
                               :datalog-result
                               :join-rows
                               (filter (fn [triples]
                                         (every? (fn [[e a]]
                                                   (let [etype (-> (attr-model/seek-by-id a attrs)
                                                                   attr-model/fwd-etype)
                                                         check (get etype+eid->check [etype e])]
                                                     (:result check)))
                                                 triples)))
                               set)

        cleaned-page-info
        (when (get-in res [:data :datalog-result :page-info])
          (when-let [filtered-rows (seq (filter (fn [[e a]]
                                                  (let [etype (-> (attr-model/seek-by-id a attrs)
                                                                  attr-model/fwd-etype)
                                                        check (get etype+eid->check [etype e])]
                                                    (:result check)))
                                                (get-in res [:data
                                                             :datalog-result
                                                             :page-info-rows])))]
            {:start-cursor (first filtered-rows)
             :end-cursor (last filtered-rows)
             ;; nb: this may be incorrect if rows are filtered by permissions
             :has-next-page? (get-in res [:data
                                          :datalog-result
                                          :page-info
                                          :has-next-page?])
             :has-previous-page? (get-in res [:data
                                              :datalog-result
                                              :page-info
                                              :has-previous-page?])}))]
    (-> res
        (assoc-in [:data :datalog-result :join-rows] cleaned-join-rows)
        (ucoll/assoc-in-when [:data :datalog-result :page-info] cleaned-page-info)
        (ucoll/dissoc-in [:data :datalog-result :page-info-rows])
        (update :child-nodes
                (fn [child-nodes]
                  (if (empty? cleaned-join-rows)
                    []
                    (->> child-nodes
                         (map (partial permissioned-node ctx etype+eid->check))
                         (filter
                          (fn [node]
                            (seq (-> node :data :datalog-result :join-rows))))
                         vec)))))))

(defn entity-map [{:keys [datalog-query-fn attrs] :as ctx}
                  query-cache
                  etype
                  eid]
  (let [datalog-query [[:ea eid (attr-model/attr-ids-for-etype etype attrs)]]
        datalog-result
        (or (get query-cache datalog-query)
            (datalog-query-fn ctx datalog-query))]
    (entity-model/datalog-result->map ctx datalog-result)))

(defn extract-refs
  "Extracts a list of refs that can be passed to cel/prefetch-data-refs.
   Returns: [{:etype string path-str string eids #{uuid}}]"
  [user-id etype->eids+program]
  (reduce-kv (fn [acc etype {:keys [eids program]}]
               (if-let [refs (some-> program
                                     :cel-ast
                                     cel/collect-ref-uses
                                     seq)]
                 (reduce (fn [acc {:keys [obj path]}]
                           (case obj
                             "data" (conj acc {:etype etype
                                               :path-str path
                                               :eids eids})
                             "auth" (conj acc {:etype "$users"
                                               :path-str path
                                               :eids (if user-id
                                                       #{user-id}
                                                       #{})})

                             acc))
                         acc
                         refs)
                 acc))
             []
             etype->eids+program))

(defn preload-refs [ctx etype->eids+program]
  (let [refs (extract-refs (-> ctx
                               :current-user
                               :id)
                           etype->eids+program)]
    (if (seq refs)
      (cel/prefetch-data-refs ctx refs)
      {})))

(defn get-etype+eid-check-result! [{:keys [current-user] :as ctx}
                                   {:keys [etype->eids+program query-cache]}]
  (tracer/with-span! {:name "instaql/get-eid-check-result!"}
    (let [preloaded-refs (tracer/with-span! {:name "instaql/preload-refs"}
                           (let [res (preload-refs ctx etype->eids+program)]
                             (tracer/add-data! {:attributes {:ref-count (count res)}})
                             res))]
      (reduce-kv (fn [acc etype {:keys [eids program]}]
                   (reduce (fn [acc eid]
                             (assoc acc
                                    [etype eid]
                                    (if-not program
                                      {:result true}
                                      {:program program
                                       :result
                                       (let [em (io/warn-io :instaql/entity-map
                                                            (entity-map ctx
                                                                        query-cache
                                                                        etype
                                                                        eid))
                                             ctx (assoc ctx
                                                        :preloaded-refs preloaded-refs)]
                                         (io/warn-io :instaql/eval-program
                                                     (cel/eval-program!
                                                      program
                                                      {"auth" (cel/->cel-map {:ctx ctx
                                                                              :type :auth
                                                                              :etype "$users"}
                                                                             current-user)
                                                       "data" (cel/->cel-map {:ctx ctx
                                                                              :etype etype
                                                                              :type :data}
                                                                             em)})))})))
                           acc
                           eids))
                 {}
                 etype->eids+program))))

(defn permissioned-query [{:keys [app-id current-user admin?] :as ctx} o]
  (tracer/with-span! {:name "instaql/permissioned-query"
                      :attributes {:app-id app-id
                                   :current-user (pr-str current-user)
                                   :admin? admin?
                                   :query (pr-str o)}}

    (let [res (query ctx o)]
      (if admin?
        res
        (let [rules (rule-model/get-by-app-id {:app-id app-id})
              perm-helpers
              (extract-permission-helpers {:attrs (:attrs ctx)
                                           :rules rules}
                                          res)
              etype+eid->check (get-etype+eid-check-result! ctx perm-helpers)
              res' (tracer/with-span! {:name "instaql/map-permissioned-node"}
                     (mapv (partial permissioned-node ctx etype+eid->check) res))]
          res')))))

(defn permissioned-query-check [{:keys [app-id] :as ctx} o rules-override]
  (let [res (query ctx o)
        rules (or (when rules-override {:app_id app-id :code rules-override})
                  (rule-model/get-by-app-id {:app-id app-id}))
        perm-helpers
        (extract-permission-helpers {:attrs (:attrs ctx)
                                     :rules rules}
                                    res)
        etype+eid->check (get-etype+eid-check-result! ctx perm-helpers)
        check-results (map
                       (fn [[[etype id] {:keys [result program]}]]
                         {:id id
                          :entity etype
                          :record (entity-map ctx
                                              (:query-cache perm-helpers)
                                              etype
                                              id)
                          :program (select-keys program [:code
                                                         :display-code
                                                         :etype
                                                         :action])
                          :check result})
                       etype+eid->check)
        nodes (mapv (partial permissioned-node ctx etype+eid->check) res)]
    {:nodes nodes :check-results check-results}))

;; ----
;; play

(comment
  (def r (resolvers/make-zeneca-resolver))
  (def attrs (attr-model/get-by-app-id zeneca-app-id))
  (def ctx {:db {:conn-pool (aurora/conn-pool)}
            :app-id zeneca-app-id
            :datalog-query-fn #'d/query
            :attrs attrs})
  (resolvers/walk-friendly
   r
   (permissioned-query ctx {:bookshelves {}}))
  (resolvers/walk-friendly
   r
   (permissioned-query ctx {:users {}})))

;; Kein query

(comment
  (def rec-app-id #uuid "f8cac3ee-b867-4651-b02e-e16d0397eb50")

  (def attrs (attr-model/get-by-app-id rec-app-id))

  (def ctx {:db {:conn-pool (aurora/conn-pool)}
            :app-id rec-app-id
            :attrs attrs})

  (require 'instant.util.instaql)
  (instant.util.instaql/instaql-nodes->object-tree
   ctx
   (query ctx {:eb {:child {}}})))

;; Inspect query
(comment
  (def r (resolvers/make-zeneca-resolver))
  (def attrs (attr-model/get-by-app-id zeneca-app-id))
  (def ctx {:db {:conn-pool (aurora/conn-pool)}
            :app-id zeneca-app-id
            :attrs attrs})
  (resolvers/walk-friendly
   r
   (query ctx {:users {:$ {:where {:handle "alex"}}
                       :bookshelves {}}})))

;; Time query
(comment
  (def app-id #uuid "6a0e56c8-f847-4890-8ae9-06bba6249d34")
  (query
   {:db {:conn-pool (aurora/conn-pool)}
    :app-id app-id
    :attrs (attr-model/get-by-app-id app-id)}
   {:tables {:rows {}, :$ {:where {:id "b2f7658d-c5b5-4486-b298-e811098009b9"}}}}))
