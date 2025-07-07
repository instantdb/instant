(ns instant.db.model.attr-pat
  (:require [clojure.spec.alpha :as s]
            [instant.db.datalog :as d]
            [instant.db.model.attr :as attr-model]
            [instant.util.exception :as ex]
            [instant.util.json :as json]
            [instant.util.uuid :as uuid-util]
            [instant.jdbc.aurora :as aurora]
            [instant.db.model.triple :as triple-model]
            [instant.comment :as c]))

(s/def ::attr-pat
  (s/cat :e (d/pattern-component uuid?)
         :a uuid?
         :v (d/pattern-component ::triple-model/value)))

(defn best-index
  "To determine the best index to use, we need to know two things:
   - The attr tells us what indexes are available
   - v-actualized? tells us if the value component is actualized

   So for a ref pattern:
   [?posts post-owner-attr ?owner]

   [post-owner-attr true] => :vae if ?owner is actualized
   [posts-owner-attr false] => :eav if ?owner isn't actualized"
  [{:keys [value-type
           index?
           indexing?
           unique?
           setting-unique?
           checked-data-type
           checking-data-type?]}
   v-actualized?]
  (let [ref? (= value-type :ref)
        e-idx (if ref? :vae :ea)
        v-idx (cond
                ref? :vae

                (and index?
                     (not indexing?)
                     checked-data-type
                     (not checking-data-type?))
                {:idx-key :ave
                 :data-type checked-data-type}

                (and unique? (not setting-unique?)) :av
                (and index? (not indexing?)) :ave

                :else :ea ;; this means we are searching over an unindexed blob attr
                )]
    (if v-actualized? v-idx e-idx)))

(defn constant-component? [component]
  (and (not (symbol? component))
       (not (:$isNull component))))

(defn component-actualized?
  "A component is actualized if:
   a. It is a constant
   b. It is a variable that has already been bound

   [[user-id bookshelves-attr ?bookshelves] ;; user-id is actualized (it's a constant)
    [?bookshelves books-attr ?books]] ;; ?bookshelves is actualized (it's been bound)
  "
  [seen component]
  (or (constant-component? component)
      (seen component)))

(defn attr-by-id
  "A handy function to get an attr by id, enforcing that it exists.
  Right now this causes a seek, because `attrs` is a list.
  We can use a  more optimal structure down the road"
  [{:keys [attrs]} attr-id]
  (ex/assert-record!
   (attr-model/seek-by-id attr-id attrs)
   :attr
   {:args [attr-id]}))

(defn id-attr-by-etype
  "Every etype _must_ have an id attr.
   We use this attr to satisfy queries like:
   'Get me all user ids' [?e user-id-attr]
   'See if user with id 5 exists' [5 user-id-attr]"
  [{:keys [attrs]} etype]
  (ex/assert-record!
   (attr-model/seek-by-fwd-ident-name [etype "id"] attrs)
   :attr
   {:args [etype "id"]}))

(defn default-level-sym
  "A handy generator for pat variables:
  (? \"users\" 0) => ?users-0"
  [x level]
  (symbol (str "?" x "-" level)))

(defn ->ref-attr-pat
  "etype=users, level=0, label=bookshelves =>
     next-etype: ?bookshelves
     next-level: 1
     attr-pat: [?users-0 bookshelves-attr ?bookshelves-1]"
  [{:keys [attrs] :as _ctx} level-sym etype level label]
  (let [attr-fwd (attr-model/seek-by-fwd-ident-name [etype label] attrs)
        attr-rev (attr-model/seek-by-rev-ident-name [etype label] attrs)
        {:keys [id value-type] :as attr} (ex/assert-record!
                                          (or attr-fwd attr-rev)
                                          :attr
                                          {:args [etype label]})

        _ (when-not (= value-type :ref)
            (ex/throw-validation-err!
             :attr
             attr
             [{:message (format "%s.%s needs to be a link" etype label)}]))

        {:keys [forward-identity reverse-identity]} attr
        [_ fwd-etype] forward-identity
        [_ rev-etype] reverse-identity

        next-level (inc level)
        attr-pat (if attr-fwd
                   [(level-sym fwd-etype level)
                    id
                    (level-sym rev-etype next-level)]
                   [(level-sym fwd-etype next-level)
                    id
                    (level-sym rev-etype level)])
        next-etype (if attr-fwd rev-etype fwd-etype)]
    (list next-etype next-level attr-pat attr (boolean attr-fwd))))

(defn ->guarded-ref-attr-pat
  [ctx etype level label]
  (try
    (->ref-attr-pat ctx default-level-sym etype level label)
    (catch clojure.lang.ExceptionInfo e
      (if (contains? #{::ex/validation-failed}
                     (::ex/type (ex-data e)))
        (throw e)
        (list (default-level-sym label level)
              [(default-level-sym label level) '_ '_]
              nil
              nil)))))

(defn ->ref-attr-pats
  "Take the where-cond:

   [\"users\" \"bookshelves\" \"books\" \"title\"] \"Foo\"

   This creates the attr-pats for the `ref` portion:

   [[?users bookshelves-attr ?bookshelves]
    [?bookshelves books-attr ?books]]"
  [ctx level-sym etype level refs-path]
  (let [[last-etype last-level attr-pats referenced-etypes]
        (reduce (fn [[etype level attr-pats referenced-etypes] label]
                  (let [[next-etype next-level attr-pat]
                        (->ref-attr-pat ctx level-sym etype level label)]
                    [next-etype
                     next-level
                     (conj attr-pats attr-pat)
                     (conj referenced-etypes next-etype)]))
                [etype level [] #{etype}]
                refs-path)]
    (list last-etype last-level attr-pats referenced-etypes)))

(defn replace-in-attr-pat
  "Handy function to replace a component in an attr-pat with a new value

   (replace-in-attr-pat [?posts post-owner-attr ?owner] ?owner foo])
   ; => [?posts post-owner-attr foo]"
  [attr-pat needle v]
  (->> attr-pat
       (map (fn [x] (if (= x needle) v x)))
       vec))

(defn coerce-value-uuid [v]
  (cond (and (map? v)
             (contains? v :$not))
        (let [{:keys [$not]} v]
          (when-let [v-coerced (uuid-util/coerce $not)]
            {:$not v-coerced}))

        (and (map? v)
             (contains? v :$isNull))
        v

        :else (uuid-util/coerce v)))

(defn assert-checked-attr-data-type! [state attr]
  (cond (:checking-data-type? attr)
        (ex/throw-validation-err!
         :query
         (:root state)
         [{:expected? 'checked-data-type?
           :in (:in state)
           :message (format "The `%s` attribute is still in the process of checking its data type. It must finish before using comparison operators."
                            (attr-model/fwd-friendly-name attr))}])

        (:indexing? attr)
        (ex/throw-validation-err!
         :query
         (:root state)
         [{:expected? 'indexed?
           :in (:in state)
           :message (format "The `%s` attribute is still in the process of indexing. It must finish before using comparison operators."
                            (attr-model/fwd-friendly-name attr))}])

        (not (:index? attr))
        (ex/throw-validation-err!
         :query
         (:root state)
         [{:expected? 'indexed?
           :in (:in state)
           :message (format "The `%s` attribute must be indexed to use comparison operators."
                            (attr-model/fwd-friendly-name attr))}])

        (not (:checked-data-type attr))
        (ex/throw-validation-err!
         :query
         (:root state)
         [{:expected? 'checked-data-type?
           :in (:in state)
           :message (format "The `%s` attribute must have an enforced type to use comparison operators."
                            (attr-model/fwd-friendly-name attr))}])

        :else (:checked-data-type attr)))

(defn throw-invalid-timestamp! [state attr value]
  (ex/throw-validation-err!
   :query
   (:root state)
   [{:expected? 'timestamp?
     :in (:in state)
     :message (format "The data type of `%s` is `date`, but the query got value `%s` of type `%s`."
                      (attr-model/fwd-friendly-name attr)
                      (json/->json value)
                      (json/json-type-of-clj value))}]))

(defn throw-invalid-date-string! [state attr value]
  (ex/throw-validation-err!
   :query
   (:root state)
   [{:expected? 'date-string?
     :in (:in state)
     :message (format "The data type of `%s` is `date`, but the query got value `%s` of type `%s`."
                      (attr-model/fwd-friendly-name attr)
                      (json/->json value)
                      (json/json-type-of-clj value))}]))

(defn throw-invalid-data-value!
  [state attr data-type value]
  (ex/throw-validation-err!
   :query
   (:root state)
   [{:expected? (symbol (format "%s?" (name data-type)))
     :in (:in state)
     :message (format "The data type of `%s` is `%s`, but the query got the value `%s` of type `%s`."
                      (attr-model/fwd-friendly-name attr)
                      (name data-type)
                      (json/->json value)
                      (json/json-type-of-clj value))}]))

(defn coerce-value-data-value!
  "Coerces an individual value"
  [state attr data-type v]
  (case data-type
    :string (if (string? v)
              v
              (throw-invalid-data-value! state attr data-type v))
    :number (if (number? v)
              v
              (throw-invalid-data-value! state attr data-type v))
    :boolean (if (boolean? v)
               v
               (throw-invalid-data-value! state attr data-type v))
    :date (cond (number? v)
                (try
                  (triple-model/parse-date-value v)
                  (catch Exception _e
                    (throw-invalid-timestamp! state attr v)))

                (string? v)
                (try
                  (triple-model/parse-date-value v)
                  (catch Exception _e
                    (throw-invalid-date-string! state attr v)))

                :else
                (throw-invalid-data-value! state attr data-type v))
    v))

(defn assert-like-is-string! [state attr tag value]
  (when (not= tag :string)
    (ex/throw-validation-err!
     :query
     (:root state)
     [{:expected? 'string?
       :in (:in state)
       :message (format "The $like value for `%s` must be a string, but the query got the value `%s` of type `%s`."
                        (attr-model/fwd-friendly-name attr)
                        (json/->json value)
                        (json/json-type-of-clj value))}])))

(defn coerced-type-comparison-value! [state attr attr-data-type tag value]
  (case attr-data-type
    :date (case tag
            :number (try
                      (triple-model/parse-date-value value)
                      (catch Exception _e
                        (throw-invalid-timestamp! state attr value)))
            :string (try
                      (triple-model/parse-date-value value)
                      (catch Exception _e
                        (throw-invalid-date-string! state attr value))))
    (if-not (= tag attr-data-type)
      (throw-invalid-data-value! state attr attr-data-type value)
      value)))

(defn coerce-v-single! [state attr data-type v]
  (if (and (map? v)
           (contains? v :$not))
    (update v :$not (partial coerce-value-data-value! state attr data-type))
    (coerce-value-data-value! state attr data-type v)))

(defn coerced-value-with-checked-type! [state attr data-type v]
  (if (set? v)
    (set (map (partial coerce-v-single! state attr data-type) v))
    (coerce-v-single! state attr data-type v)))

(defn coerce-value-for-typed-comparison!
  "Coerces the value for a typed comparison, throwing a validation error
   if the attr doesn't support the comparison."
  [state attr v]
  (cond (symbol? v) v

        (and (map? v)
             (= (count v) 1)
             (contains? #{:$gt :$gte :$lt :$lte :$like :$ilike} (ffirst v)))
        (let [[op [tag value]] (first v)
              attr-data-type (assert-checked-attr-data-type! state attr)
              state (update state :in conj op)]
          (when (or (= op :$like)
                    (= op :$ilike))
            (assert-like-is-string! state attr tag value))
          {:$comparator
           {:op op
            :value (coerced-type-comparison-value! state attr attr-data-type tag value)
            :data-type attr-data-type}})

        :else
        (if (and (:checked-data-type attr)
                 (not (:checking-data-type? attr)))
          (let [coerced (coerced-value-with-checked-type! state attr (:checked-data-type attr) v)]
            (if (:index? attr)
              coerced
              v))
          v)))

(defn ->value-attr-pat
  "Take the where-cond:
   [\"users\" \"bookshelves\" \"books\" \"title\"] \"Foo\"

   This creates the attr-pat for the `value` portion:

   [?books title-attr \"Foo\"]"
  [{:keys [state attrs]} level-sym value-etype value-level value-label v]
  (let [fwd-attr (attr-model/seek-by-fwd-ident-name [value-etype value-label] attrs)
        rev-attr (attr-model/seek-by-rev-ident-name [value-etype value-label] attrs)

        {:keys [id value-type] :as attr}
        (ex/assert-record! (or fwd-attr
                               rev-attr)
                           :attr
                           {:args [value-etype value-label]})
        v-coerced (if (not= :ref value-type)
                    (let [state (update state :in conj :$ :where value-label)]
                      (coerce-value-for-typed-comparison! state
                                                          attr
                                                          v))
                    (if (set? v)
                      (set (map (fn [vv]
                                  (if-let [v-coerced (coerce-value-uuid vv)]
                                    v-coerced
                                    (ex/throw-validation-err!
                                     :query
                                     (:root state)
                                     [{:expected 'uuid?
                                       :in (conj (:in state) :$ :where value-label)
                                       :message (format "Expected %s to match on a uuid, found %s in %s"
                                                        value-label
                                                        (json/->json vv)
                                                        (json/->json v))}])))
                                v))

                      (if-let [v-coerced (coerce-value-uuid v)]
                        v-coerced
                        (ex/throw-validation-err!
                         :query
                         (:root state)
                         [{:expected 'uuid?
                           :in (conj (:in state) :$ :where value-label)
                           :message (format "Expected %s to be a uuid, got %s"
                                            value-label
                                            (json/->json v))}]))))]
    (if (and (= :ref value-type)
             (= attr rev-attr))
      [v-coerced id (level-sym value-etype value-level)]
      [(level-sym value-etype value-level) id v-coerced])))

(defn attr-pats->patterns-impl
  "Helper for attr-pats->patterns that allows recursion"
  [ctx seen attr-pats]
  (reduce
   (fn [{:keys [seen] :as acc} attr-pat]
     (if-let [ors (:or attr-pat)]
       (let [res (attr-pats->patterns-impl ctx seen (:patterns ors))]
         (-> acc
             (update :pats conj {:or (merge ors
                                            {:patterns (:pats res)})})
             (update :seen into (:seen res))))
       (if-let [ands (:and attr-pat)]
         (let [res (attr-pats->patterns-impl ctx seen ands)]
           (-> acc
               (update :pats conj {:and (:pats res)})
               (update :seen into (:seen res))))
         (let [[e a v] attr-pat
               attr (attr-by-id ctx a)
               v-actualized? (component-actualized? seen v)
               pat [(best-index attr v-actualized?) e a v]
               acc' (update acc :pats conj pat)]
           (cond-> acc'
             (d/variable? e) (update :seen conj e)
             (d/variable? v) (update :seen conj v))))))
   {:seen seen
    :pats []}
   attr-pats))

(defn attr-pats->patterns
  "An attr-pat is a partial pattern. It _must_ include the attr-id.

   This function takes a list of attr-pats, find the best indexes for them,
   and returns a list of patterns we can query with


   [[?users handle-attr \"stopa\"]
    [?users bookshelves-attr ?bookshelves] ]
   ;=>
   [[:av ?users handle-attr \"stopa\"]
    [:eav ?users bookshelves-attr ?bookshelves]]"
  [ctx attr-pats]
  (:pats (attr-pats->patterns-impl ctx #{} attr-pats)))

(comment
  (def z (c/zeneca-app!))
  (def z-id (:id z))
  (def attrs (attr-model/get-by-app-id z-id))
  (def ctx {:db {:conn-pool (aurora/conn-pool :read)}
            :app-id z-id
            :datalog-query-fn #'d/query
            :attrs attrs})
  (attr-pats->patterns
   ctx
   [['?users (:id (id-attr-by-etype ctx "users")) '_]
    ['?foo  (:id (id-attr-by-etype ctx "users")) '?users]]))
