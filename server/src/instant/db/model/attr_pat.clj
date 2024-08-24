(ns instant.db.model.attr-pat
  (:require [instant.db.datalog :as d]
            [instant.db.model.attr :as attr-model]
            [instant.util.exception :as ex]
            [instant.jdbc.aurora :as aurora]
            [instant.data.constants :refer [zeneca-app-id]]
            [clojure.spec.alpha :as s]
            [instant.db.model.triple :as triple-model]))

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
  [{:keys [value-type index? unique?]} v-actualized?]
  (let [ref? (= value-type :ref)
        e-idx (if ref? :eav :ea)
        v-idx (cond
                unique? :av
                index? :ave
                ref? :vae
                :else :ea ;; this means we are searching over an unindexed blob attr
                )]
    (if v-actualized? v-idx e-idx)))

(defn component-actualized?
  "A component is actualized if:
   a. It is a constant
   b. It is a variable that has already been bound

   [[user-id bookshelves-attr ?bookshelves] ;; user-id is actualized (it's a constant)
    [?bookshelves books-attr ?books]] ;; ?bookshelves is actualized (it's been bound)
  "
  [seen component]
  (or (d/constant? component)
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
        {:keys [id value-type] :as attr}

        (ex/assert-record!
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
    (list next-etype next-level attr-pat)))

(defn ->ref-attr-pats
  "Take the where-cond:

   [\"users\" \"bookshelves\" \"books\" \"title\"] \"Foo\"

   This creates the attr-pats for the `ref` portion:

   [[?users bookshelves-attr ?bookshelves]
    [?bookshelves books-attr ?books]]"
  [ctx level-sym etype level refs-path]
  (let [[last-etype last-level attr-pats]
        (reduce (fn [[etype level attr-pats] label]
                  (let [[next-etype next-level attr-pat]
                        (->ref-attr-pat ctx level-sym etype level label)]
                    [next-etype next-level (conj attr-pats attr-pat)]))
                [etype level []]
                refs-path)]
    (list last-etype last-level attr-pats)))

(defn replace-in-attr-pat
  "Handy function to replace a component in an attr-pat with a new value

   (replace-in-attr-pat [?posts post-owner-attr ?owner] ?owner foo])
   ; => [?posts post-owner-attr foo]"
  [attr-pat needle v]
  (->> attr-pat
       (map (fn [x] (if (= x needle) v x)))
       vec))

(defn ->value-attr-pat
  "Take the where-cond:
   [\"users\" \"bookshelves\" \"books\" \"title\"] \"Foo\"

   This creates the attr-pat for the `value` portion:

   [?books title-attr \"Foo\"]"
  [{:keys [attrs]} level-sym value-etype value-level value-label v]
  (let [{:keys [id]}
        (ex/assert-record!
         (attr-model/seek-by-fwd-ident-name [value-etype value-label] attrs)
         :attr
         {:args [value-etype value-label]})]
    [(level-sym value-etype value-level) id v]))

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
  (def attrs (attr-model/get-by-app-id aurora/conn-pool zeneca-app-id))
  (def ctx {:db {:conn-pool aurora/conn-pool}
            :app-id zeneca-app-id
            :datalog-query-fn #'d/query
            :attrs attrs})
  (attr-pats->patterns
   ctx
   [['?users (:id (id-attr-by-etype ctx "users")) '_]
    ['?foo  (:id (id-attr-by-etype ctx "users")) '?users]]))
