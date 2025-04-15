(ns instant.db.cel
  (:require
   [clojure.set :as clojure-set]
   [clojure.string :as clojure-string]
   [instant.db.dataloader :as dataloader]
   [instant.db.datalog :as d]
   [instant.db.model.attr :as attr-model]
   [instant.db.model.attr-pat :as attr-pat]
   [instant.jdbc.aurora :as aurora]
   [instant.util.coll :as ucoll]
   [instant.util.exception :as ex]
   [instant.util.io :as io]
   [instant.util.tracer :as tracer]
   [instant.comment :as c]
   [instant.data.resolvers :as resolvers])
  (:import
   (com.google.common.collect ImmutableList ImmutableSet)
   (com.google.protobuf NullValue)
   (dev.cel.common CelAbstractSyntaxTree
                   CelFunctionDecl
                   CelOptions
                   CelOverloadDecl)
   (dev.cel.common.ast CelExpr
                       CelExpr$CelCall
                       CelExpr$CelComprehension
                       CelExpr$ExprKind$Kind
                       Expression$Map$Entry)
   (dev.cel.common.navigation CelNavigableAst
                              CelNavigableExpr)
   (dev.cel.common.types CelType
                         ListType
                         MapType
                         SimpleType
                         OpaqueType
                         TypeParamType)
   (dev.cel.compiler CelCompiler
                     CelCompilerFactory
                     CelCompilerLibrary
                     CelCompilerBuilder)
   (dev.cel.extensions CelExtensions)
   (dev.cel.parser CelStandardMacro
                   CelUnparserFactory
                   CelUnparser
                   Operator)
   (dev.cel.runtime CelAttribute
                    CelEvaluationException
                    CelFunctionOverload
                    CelRuntime
                    CelRuntime$CelFunctionBinding
                    CelRuntime$Program
                    CelRuntimeLegacyImpl$Builder
                    CelRuntimeFactory
                    CelStandardFunctions
                    CelStandardFunctions$StandardFunction
                    CelUnknownSet
                    CelVariableResolver
                    UnknownContext)
   (dev.cel.validator CelAstValidator
                      CelValidatorFactory)
   (instant.db.model.attr Attrs)
   (java.text SimpleDateFormat)
   (java.util ArrayList Date HashMap Map Optional SimpleTimeZone)
   (java.util.concurrent.atomic AtomicInteger)
   (java.util.concurrent ConcurrentHashMap)))

(set! *warn-on-reflection* true)

;; ----
;; get-ref

;; this is used inside `build-query` and `find-val-path`,
;; so we can extract the values that `data.ref` needs.

(def ^:private value-sym (attr-pat/default-level-sym "_value" 0))

(defn- build-query
  [ctx {:keys [etype eids path-str]}]
  (let [path (clojure-string/split path-str #"\.")
        [refs-path value-label] (ucoll/split-last path)
        level 0

        [last-etype last-level ref-attr-pats referenced-etypes]
        (attr-pat/->ref-attr-pats ctx
                                  attr-pat/default-level-sym
                                  etype
                                  level
                                  refs-path)
        value-attr-pat (attr-pat/->value-attr-pat ctx
                                                  attr-pat/default-level-sym
                                                  last-etype
                                                  last-level
                                                  value-label
                                                  value-sym)
        {id-attr :id} (attr-pat/id-attr-by-etype ctx etype)
        ;; (XXX): By putting level-sym in the :e portion,
        ;; we scan the entire :ea index.
        ;; It _would_ be better if we put eids in the ?v portion.
        ;; But this would not work, because `id` is currently saved
        ;; as a blob. We may want to save eids as refs in the future
        id-attr-pat [(attr-pat/default-level-sym etype level) id-attr (set eids)]
        ;; Note: if you change the position of `id-attr-pat`,
        ;; make sure to update `group-by-path` in `get-ref-many`
        attr-pats (concat [id-attr-pat] ref-attr-pats [value-attr-pat])]
    {:pats (attr-pat/attr-pats->patterns ctx attr-pats)
     :referenced-etypes (conj referenced-etypes etype)}))

(defn- find-val-path [query]
  (first
   (for [[i pattern] (map-indexed vector query)
         :let [pos (ucoll/index-of value-sym pattern)]
         :when pos]
     ;; `dec` because these patterns include the `index`, but join-rows don't.
     [i (dec pos)])))

(defn- get-ref-many
  [{:keys [datalog-query-fn] :as ctx} {:keys [etype eids path-str]}]
  (let [{:keys [pats]}
        (build-query ctx {:etype etype :eids (set eids) :path-str path-str})

        ;; We know that the `eid` is always going to be
        ;; the first element in the join row
        group-by-path [0 0]
        val-path (find-val-path pats)
        {:keys [join-rows]}
        (datalog-query-fn ctx pats)
        grouped-join-rows (group-by #(get-in % group-by-path) join-rows)
        results (map
                 (fn [eid]
                   (let [rows (grouped-join-rows eid)]
                     (map #(get-in % val-path) rows)))
                 eids)]
    results))

(defonce loader-state (atom {}))

(defn get-ref-batch-fn [all-args]
  (tracer/with-span! {:name "cel/get-ref-batch-fn"
                      :attributes {:batch-size (count all-args)}}
    (let [eids (map (comp :eid second) all-args)
          [ctx args] (first all-args)]
      (get-ref-many ctx (assoc args :eids eids)))))

(defn get-ref-key-fn [{:keys [app-id]} {:keys [etype path-str]}]
  [app-id etype path-str])

(def get-ref (dataloader/create-loader
              {:state loader-state
               :key-fn get-ref-key-fn
               :batch-fn get-ref-batch-fn
               :delay-ms 5
               :timeout-ms 5000}))
(comment
  (def z (c/zeneca-app!))
  (def z-id (:id z))
  (def r (resolvers/make-zeneca-resolver z-id))
  (def ctx {:db {:conn-pool (aurora/conn-pool :read)}
            :app-id z-id
            :datalog-query-fn d/query
            :attrs (attr-model/get-by-app-id z-id)})
  (def params {:etype "bookshelves"
               :eid (resolvers/->uuid r "eid-2014")
               :path-str "users.handle"})
  (get-ref ctx params))

;; ----
;; Cel

(declare stringify get-cel-value)

(deftype CelList [xs]
  java.util.List
  (get [_ i]
    (stringify (nth xs i)))

  ;; for printing
  (iterator [_]
    (java.util.List/.iterator xs)))

(deftype CelMap [m]
  java.util.Map
  (get [_ k]
    (get-cel-value m k))

  ;; CEL throws if a key doesn't exist. We don't want this
  ;; behavior -- we'd rather just return null when a key is
  ;; accessed.  To get this behavior, we override `containsKey`, so
  ;; we always return true when checking for key presence.
  (containsKey [_ _k]
    true)

  ;; for printing
  (entrySet [_]
    (->> (keys (or m {}))
         (map (fn [k] [k (get-cel-value m k)]))
         set)))

(defn stringify [x]
  (cond
    (nil? x)           NullValue/NULL_VALUE
    ;; For some reason, cel-java only supports longs when determining
    ;; type. We convert ints to longs to prevent type(data.param) from
    ;; throwing a NPE
    ;; https://github.com/google/cel-java/blob/dae82c6d10114bb1da643203569f90a757c6c5e6/runtime/src/main/java/dev/cel/runtime/StandardTypeResolver.java#L73
    (int? x)           (long x)
    (keyword? x)       (subs (str x) 1)
    (symbol? x)        (str x)
    (uuid? x)          (str x)
    (sequential? x)    (CelList. x)
    (associative? x)   (CelMap. x)
    (instance? Date x) (doto (SimpleDateFormat. "yyyy-MM-dd'T'HH:mm:ss'Z'")
                         (.setTimeZone (SimpleTimeZone. 0 "UTC"))
                         (.format ^Date x))
    :else              x))

(defn get-cel-value [m k]
  (stringify
   (if (contains? m k)
     (get m k)
     (get m (keyword k)))))

(definterface IRef
  (ref [path-str]))

;; Used for batching data.ref fetches
(def ^{:private true :dynamic true} *register-missing-ref* nil)

(defn ref-impl [ctx {:strs [id] :as ^CelMap _m} ^String etype ^String path-str]
  (if (= id NullValue/NULL_VALUE)
    []
    (let [ref-data {:eid (parse-uuid id)
                    :etype etype
                    :path-str path-str}]
      (if-let [preloaded-ref (-> ctx
                                 :preloaded-refs
                                 (get ref-data))]
        (vec preloaded-ref)
        (if-let [register-missing-ref *register-missing-ref*]
          ;; Will return an UnknownSet
          (register-missing-ref ref-data)
          (vec (get-ref ctx ref-data)))))))

(deftype DataCelMap [ctx etype ^CelMap m]
  java.util.Map
  (get [_ k]
    (.get m k))
  (containsKey [_ k]
    (.containsKey m k))
  (entrySet [_]
    (.entrySet m))

  IRef
  (ref [_ path-str]
    (ref-impl ctx m etype path-str)))

(deftype AuthCelMap [ctx ^CelMap m]
  java.util.Map
  (get [_ k]
    (.get m k))
  (containsKey [_ k]
    (.containsKey m k))
  (entrySet [_]
    (.entrySet m))

  IRef
  (ref [_ path-str]
    (let [path (clojure-string/replace path-str
                                       #"^\$user\."
                                       "")]
      (ref-impl ctx m "$users" path))))

(def ^MapType type-obj (MapType/create SimpleType/STRING SimpleType/DYN))

(def ^ListType type-ref-return (ListType/create SimpleType/DYN))

(defn make-overload
  "Creates new overload functions, each :overload-id should be unique.
   global-or-member should be either :global or :member
    global is a top-level function, e.g. `size`
    member is a method on an object, e.g. `startsWith` in 's'.startsWith('s')
   function-name is the name of the function as it appears in CEL. For global
   functions you'll want to use `(.getFunction Operators/OP_NAME)`
   decls is an array of maps with keys:
     overload-id: the overload id of the function, e.g. _logical_not
     cel-args: a list of CelTypes provided as args, e.g. [SimpleType/BOOL, SimpleType/STRING]
     cel-return-type: the CelType that the function returns
     java-args: a list of classes that the implementation takes as args, e.g. [Boolean, String]
     impl: A function that takes a single arg that will be a list of the java-args, e.g.
       (fn [[^Boolean x ^String y]] ...)"
  [global-or-member ^String function-name decls]
  {:decl (CelFunctionDecl/newFunctionDeclaration
          function-name
          (ucoll/array-of CelOverloadDecl
                          (mapv (fn [decl]
                                  (let [args (ucoll/array-of CelType (:cel-args decl))]
                                    (case global-or-member
                                      :global (CelOverloadDecl/newGlobalOverload
                                               ^String (:overload-id decl)
                                               ^CelType (:cel-return-type decl)
                                               args)
                                      :member (CelOverloadDecl/newMemberOverload
                                               ^String (:overload-id decl)
                                               ^CelType (:cel-return-type decl)
                                               args))))
                                decls)))
   :runtimes (mapv (fn [decl]
                     (CelRuntime$CelFunctionBinding/from
                      ^String (:overload-id decl)
                      ^java.lang.Iterable (:java-args decl)
                      ^CelFunctionOverload (:impl decl)))
                   decls)})

(defn global-overload [^String function-name decls]
  (make-overload :global function-name decls))

(defn member-overload [^String function-name decls]
  (make-overload :member function-name decls))

;; Normal evaluation pipeline
;; --------------------------

(def ref-decl {:overload-id "_ref"
               :cel-args [type-obj SimpleType/STRING]
               :cel-return-type type-ref-return
               :java-args [IRef String]
               :impl (fn [[^IRef m ^String path-str]]
                       (.ref m path-str))})

(def ref-fn (member-overload "ref"
                             [ref-decl]))

(def custom-fns [ref-fn])
(def custom-fn-decls (mapv :decl custom-fns))
(def custom-fn-bindings (mapcat :runtimes custom-fns))

(def cel-options (-> (CelOptions/current)
                     (.populateMacroCalls true)
                     (.enableUnknownTracking true)
                     (.build)))

;; n.b. if you edit something here, make sure you make the
;;      equivalent change to iql-cel-compiler below

(defn- runtime-compiler-builder ^CelCompilerBuilder []
  (-> (CelCompilerFactory/standardCelCompilerBuilder)
      (.addVar "data" type-obj)
      (.addVar "auth" type-obj)
      (.addVar "ruleParams" type-obj)
      (.addFunctionDeclarations (ucoll/array-of CelFunctionDecl custom-fn-decls))
      (.setOptions cel-options)
      (.setStandardMacros CelStandardMacro/STANDARD_MACROS)
      (.addLibraries (ucoll/array-of CelCompilerLibrary [(CelExtensions/bindings) (CelExtensions/strings)]))))

(def ^:private cel-view-delete-compiler
  (-> (runtime-compiler-builder)
      (.build)))

(def ^:private ^CelCompiler cel-create-update-compiler
  (-> (runtime-compiler-builder)
      (.addVar "newData" type-obj)
      (.build)))

;; n.b. if you edit something here, make sure you make the
;;      equivalent change to iql-cel-compiler below
(def ^:private ^CelRuntime cel-runtime
  (let [^CelRuntimeLegacyImpl$Builder builder (CelRuntimeFactory/standardCelRuntimeBuilder)
        ^java.lang.Iterable extensions [(CelExtensions/strings)]]
    (-> builder
        (.addLibraries extensions)
        (.addFunctionBindings (ucoll/array-of CelRuntime$CelFunctionBinding custom-fn-bindings))
        (.setOptions cel-options)
        (.build))))

(defn action->compiler [action]
  (case (name action)
    ("view" "delete")
    cel-view-delete-compiler
    cel-create-update-compiler))

(defn get-expr ^CelExpr [^CelNavigableExpr node]
  ;; Not sure why this is necessary, but can't call
  ;; .expr on the node without manually making it
  ;; accessible. It's what they do in the example,
  ;; so not sure why it's a problem here
  ;; https://tinyurl.com/46zbw98p
  (let [clazz (.getClass node)
        method (.getDeclaredMethod clazz "expr" (into-array Class []))
        _ (.setAccessible method true)
        ^CelExpr expr (.invoke method node (object-array 0))]
    expr))

(defn ident-usages
  "Returns a set of ident names used in the cel expression.
   Useful for determining which bindings we need to add to the expression."
  [^CelCompiler compiler ^String expr-str]
  (set (keep (fn [^CelNavigableExpr n]
               (when (= CelExpr$ExprKind$Kind/IDENT (.getKind n))
                 (.name
                  (.ident
                   (get-expr n)))))
             (-> (.parse compiler expr-str)
                 (.getAst)
                 (CelNavigableAst/fromAst)
                 (.getRoot)
                 (.allNodes)
                 (stream-seq!)))))

(defn ->ast [^CelCompiler compiler expr-str] (.getAst (.compile compiler expr-str)))

(defn ->program [ast] (.createProgram cel-runtime ast))

(defn rule->program [action expr-str]
  (let [compiler (action->compiler action)
        ast (->ast compiler expr-str)]
    (->program ast)))

(defn eval-program!
  [ctx
   {:keys [cel-program etype action]}
   {:keys [data rule-params new-data]}]
  (try
    (let [bindings (HashMap.)

          _ (.put bindings "auth" (AuthCelMap. ctx (CelMap. (:current-user ctx))))
          _ (.put bindings "data" (DataCelMap. ctx etype (CelMap. data)))
          _ (.put bindings "ruleParams" (CelMap. rule-params))
          _ (when new-data
              (.put bindings "newData" (CelMap. new-data)))
          result (.eval ^CelRuntime$Program cel-program
                        bindings)]
      (cond
        (= result NullValue/NULL_VALUE)
        nil

        (instance? CelUnknownSet result)
        (throw (CelEvaluationException.
                "Tried to evaluate a cel program that used unknown variables"))

        :else
        result))

    (catch CelEvaluationException e
      (ex/throw-permission-evaluation-failed!
       etype action e (:show-cel-errors? ctx)))))

(deftype MissingRefData [ref-datas])

(defn missing-ref-datas [^MissingRefData missing-ref-data]
  (.ref_datas missing-ref-data))

(defn is-missing-ref-data? [x]
  (instance? MissingRefData x))

(defn advance-program!
  [ctx
   {:keys [^CelRuntime$Program cel-program
           etype
           action]}
   {:keys [resolver data rule-params new-data]}]
  (try
    (let [missing-data-refs (HashMap.)
          resolver (or resolver
                       (reify CelVariableResolver
                         (find [_this var-name]
                           (case var-name
                             "auth" (Optional/of
                                     (AuthCelMap. ctx (CelMap. (:current-user ctx))))
                             "data" (Optional/of
                                     (DataCelMap. ctx etype (CelMap. data)))
                             "ruleParams" (Optional/of (CelMap. rule-params))
                             "newData" (if new-data
                                         (Optional/of (CelMap. new-data))
                                         (Optional/empty))
                             (Optional/empty)))))
          unknown-ctx (UnknownContext/create resolver (ImmutableList/of))
          i (AtomicInteger.)
          register-missing-ref (fn [ref-data]
                                 (let [unique-name (str "i_" (.incrementAndGet i))
                                       cel-attr (CelAttribute/create unique-name)]
                                   (.put missing-data-refs cel-attr ref-data)
                                   (CelUnknownSet/create cel-attr)))
          result (binding [*register-missing-ref* register-missing-ref]
                   (.advanceEvaluation cel-program unknown-ctx))]
      (cond (= result NullValue/NULL_VALUE)
            nil

            (instance? CelUnknownSet result)
            (let [^CelUnknownSet result result
                  missing-exprs (.unknownExprIds result)
                  ;; We don't handle unknown vars yet, but we could
                  ;; use this to avoid pre-fetching entity maps.
                  _ (when (seq missing-exprs)
                      (throw (CelEvaluationException.
                              "Tried to evaluate a cel program that used unknown variables")))
                  ^ImmutableSet missing-ref-attrs (.attributes result)

                  missing-refs
                  (reduce (fn [acc ref-attr]
                            (if-let [ref-data (.get missing-data-refs ref-attr)]
                              (conj acc ref-data)
                              (throw (CelEvaluationException.
                                      (str "Tried to evaluate a cel program that used unknown variables. "
                                           "Missing attribute is not in missing-ref-attrs.")))))
                          #{}
                          missing-ref-attrs)]
              (if (seq missing-refs)
                (MissingRefData. missing-refs)
                (throw (CelEvaluationException.
                        (str "Tried to evaluate a cel program that used unknown variables. "
                             "Eval returned unknown, but there are no unknown refs.")))))

            :else
            result))
    (catch CelEvaluationException e
      (ex/throw-permission-evaluation-failed!
       etype action e (:show-cel-errors? ctx)))))

(declare prefetch-missing-ref-datas)

(defn create-preloaded-refs-cache []
  (ConcurrentHashMap.))

(defn eval-programs!
  "Takes a map of unique key, e.g. [etype, eid] to program and bindings.
   Returns an updated map with results of running the programs and updates
   the preloaded-refs in the context
   Example:
    (eval-programs!
      ctx
      {[\"books\", \"eid-holes\"] {:program {cel-program, etype, action}
                                   :bindings {data, rule-params, new-data}}})
    => {[\"books\", \"eid-holes\"] {:program {cel-program, etype, action}
                                    :bindings {data, rule-params, new-data}
                                    :result true}}"
  ([ctx programs]
   (eval-programs! {} ctx programs))
  ([results ctx programs]
   (assert (and (:preloaded-refs ctx)
                (instance? ConcurrentHashMap (:preloaded-refs ctx))))
   (let [{:keys [results missing-refs rerun-programs]}
         (reduce-kv (fn [acc k {:keys [program bindings] :as item}]
                      (let [result (io/warn-io :cel/advance-program!
                                     (advance-program! ctx program bindings))]
                        (if (is-missing-ref-data? result)
                          (-> acc
                              (update :missing-refs into (missing-ref-datas result))
                              (assoc-in [:rerun-programs k] item))
                          (-> acc
                              (assoc-in [:results k] (assoc item :result result))))))
                    {:results results
                     :missing-refs #{}
                     :rerun-programs {}}
                    programs)]
     (when (seq missing-refs)
       (assert (seq rerun-programs)))
     (when (seq rerun-programs)
       (assert (seq missing-refs)))
     (if-not (seq missing-refs)
       results
       (let [preloaded-refs (tracer/with-span! {:name "cel/prefetch-missing-ref-datas"
                                                :attributes {:ref-data-count (count missing-refs)}}
                              (prefetch-missing-ref-datas ctx missing-refs))]
         (Map/.putAll (:preloaded-refs ctx) preloaded-refs)
         (recur results
                ctx
                rerun-programs))))))


;; cel -> instaql where clauses
;; ----------------------------

;; Helpers to convert cel rules to instaql where clauses
;; (data.name == 'Daniel' || data.handle == 'dww')
;;   => {:or [{"name" "Daniel"} {"handle" "dww"}]}

;; Here are all of the cases in the wild that we can't handle (as of March 2025):
;; 1. size, e.g. `size(data.ref('tasks.id')) == 0`
;; 2. digging into json fields, e.g. `data.document.title == 'Title'`, or `'tag' in data.tags`
;; 3. Index into the array returned by data.ref, e.g. `data.ref('owner.id')[0] == auth.id`
;; 4. Comparing two fields, e.g. `data.firstName == data.lastName`
;; 5. ['a', 'b'].exists(x => data.path.startsWith(x))
;;       cel generates a loop for this macro and it can't find the overload
;;      for `||` with bool + where_clause on the second trip through the loop
;; 6. Ternary
;;    data.privacy == "private" ? auth.id == data.ownerId : true ->
;;     {:or [{:and [{"privacy" "private"} {"ownerId" "__id__"}]}
;;           {"privacy" {:$not "private"}}]}

;; Cases that we could handle, but nobody has written a rule for yet:
;; 1. >, < on indexed numbers

;; custom java types

;; Important to use deftype so that cel can't call
;; e.g. `size` on our thing

;; data.ref('a.b') returns `(RefPath. 'a.b')`
(deftype RefPath [path-str]
  Object
  (toString [_this]
    (str path-str)))

;; Used to support size(data.ref('a.b')) == 0
(deftype RefPathSize [ref-path empty-list-comparable])

;; data.field returns `(DataKey. field {attr})`
;; if the field is defined in the attrs for the etype
(deftype DataKey [data-key instant-attr]
  Object
  (toString [_this]
    (str data-key)))

;; Replacement for CelMap, returns `DataKey` when the key is accessed
;; so that we can track which attrs we need in the where clause
(deftype CheckedDataMap [^Attrs attrs etype]
  java.util.Map
  (get [_ k]
    (when-let [attr (attr-model/seek-by-fwd-ident-name [etype k] attrs)]
      (DataKey. k attr)))

  (containsKey [_ k]
    (if (attr-model/seek-by-fwd-ident-name [etype k] attrs)
      true
      false))

  ;; for printing
  (entrySet [_]
    (set #{[:etype etype]}))

  (toString [_this]
    (str {:etype etype})))

;; The ors and ands that make up the where clause. This is what the
;; rule will return.
(deftype WhereClause [where-clause]
  Object
  (toString [_this]
    (str where-clause)))

;; custom cel types

(defn create-cel-type [^String name]
  (OpaqueType/create name (ImmutableList/of (TypeParamType/create name))))

(def datakey-cel-type (create-cel-type "DataKey"))
(def whereclause-cel-type (create-cel-type "WhereClause"))
(def refpath-cel-type (create-cel-type "RefPath"))
(def refpath-size-cel-type (create-cel-type "RefPathSize"))

(def ^MapType checked-data-map-cel-type (MapType/create SimpleType/STRING datakey-cel-type))

(def type-info {:bool {:cel-type SimpleType/BOOL
                       :java-type Boolean
                       :name "bool"}
                :double {:cel-type SimpleType/DOUBLE
                         :java-type Double
                         :name "double"}
                :int {:cel-type SimpleType/INT
                      :java-type Long
                      :name "int"}
                :null {:cel-type SimpleType/NULL_TYPE
                       :java-type NullValue
                       :name "null"}
                :string {:cel-type SimpleType/STRING
                         :java-type String
                         :name "string"}
                :datakey {:cel-type datakey-cel-type
                          :java-type DataKey
                          :name "datakey"}
                :whereclause {:cel-type whereclause-cel-type
                              :java-type WhereClause
                              :name "whereclause"}
                :test {:cel-type whereclause-cel-type
                       :java-type WhereClause
                       :name "whereclause"}})

(defn type->name [typ] (get-in type-info [typ :name]))
(defn type->cel [typ] (get-in type-info [typ :cel-type]))
(defn type->java [typ] (get-in type-info [typ :java-type]))

(defn custom-type? [x]
  (or (instance? DataKey x)
      (instance? RefPath x)
      (instance? RefPathSize x)
      (instance? WhereClause x)))

(defn clauses-to-add [op ^WhereClause x]
  (let [clauses (.where_clause x)]
    (if (and (contains? clauses op)
             (vector? (get clauses op)))
      (get clauses op)
      [clauses])))

(defn combine-where-clauses
  "Removes a layer of nesting (if possible) when combining where clauses
   {:or [a b]} + {:or [c d]} -> {:or [a b c d]}"
  [op ^WhereClause x ^WhereClause y]
  (WhereClause. {op (-> []
                        (into (clauses-to-add op x))
                        (into (clauses-to-add op y)))}))

;; Overloads for `OR`
;; We overload the existing OR function to handle our custom types
;; cel won't let us replace the `OR` function unless we rewrite te ast

(defn or-overload-dispatch [args]
  args)

(defmulti or-overload-fn #'or-overload-dispatch)

(defn get-or-overload-fn
  "Allows us to define the function in one direction only.
  [:datakey :bool] executes [:bool :datakey] with the args reversed."
  [arg-typs]
  (if-let [forward-method (get-method or-overload-fn arg-typs)]
    (forward-method arg-typs)
    (when-let [reverse-method (get-method or-overload-fn (reverse arg-typs))]
      (let [f (reverse-method (reverse arg-typs))]
        (fn [args]
          (f (reverse args)))))))

(defmethod or-overload-fn [:datakey :datakey]
  ([_]
   (fn [[^DataKey x ^DataKey y]]
     (combine-where-clauses :or
                            (WhereClause. {(.data_key x) true})
                            (WhereClause. {(.data_key y) true})))))

(defmethod or-overload-fn [:whereclause :whereclause]
  ([_]
   (fn [[^WhereClause x ^WhereClause y]]
     (combine-where-clauses :or x y))))

(defmethod or-overload-fn [:datakey :whereclause]
  ([_]
   (fn [[^DataKey x ^WhereClause y]]
     (combine-where-clauses :or
                            (WhereClause. {(.data_key x) true})
                            y))))

(defmethod or-overload-fn [:whereclause :bool]
  ([_]
   (fn [[^WhereClause x ^Boolean y]]
     (or y x))))

(defmethod or-overload-fn [:datakey :bool]
  ([_]
   (fn [[^DataKey x ^Boolean y]]
     (or y x))))

(defmethod or-overload-fn [:bool :bool]
  ([_]
   (fn [[^Boolean x ^Boolean y]]
     (or x y))))

(def or-overloads
  (global-overload
   (.getFunction Operator/LOGICAL_OR)
   (for [arg-1 [:datakey :whereclause :bool]
         arg-2 [:datakey :whereclause :bool]
         :let [args [arg-1 arg-2]]]
     {:overload-id (str "_or_" (clojure-string/join "_"
                                                    (map type->name args)))
      :cel-args (map type->cel args)
      :cel-return-type (case args
                         ([:whereclause :whereclause]
                          [:datakey :datakey]
                          [:datakey :whereclause]
                          [:whereclause :datakey]) whereclause-cel-type
                         ([:whereclause :bool]
                          [:bool :whereclause]
                          [:datakey :bool]
                          [:bool :datakey]) SimpleType/DYN
                         [:bool :bool] SimpleType/BOOL
                         SimpleType/DYN)
      :java-args (map type->java args)
      :impl (get-or-overload-fn args)})))

;; Overloads for `AND`
;; We overload the existing AND function to handle our custom types
;; cel won't let us replace the `AND` function unless we rewrite the ast

(defn and-overload-dispatch [args]
  args)

(defmulti and-overload-fn #'and-overload-dispatch)

(defn get-and-overload-fn
  "Allows us to define the function in one direction only.
  [:datakey :bool] executes [:bool :datakey] with the args reversed."
  [arg-typs]
  (if-let [forward-method (get-method and-overload-fn arg-typs)]
    (forward-method arg-typs)
    (when-let [reverse-method (get-method and-overload-fn (reverse arg-typs))]
      (let [f (reverse-method (reverse arg-typs))]
        (fn [args]
          (f (reverse args)))))))

(defmethod and-overload-fn [:datakey :datakey]
  ([_]
   (fn [[^DataKey x ^DataKey y]]
     (combine-where-clauses :and
                            (WhereClause. {(.data_key x) true})
                            (WhereClause. {(.data_key y) true})))))

(defmethod and-overload-fn [:whereclause :whereclause]
  ([_]
   (fn [[^WhereClause x ^WhereClause y]]
     (combine-where-clauses :and x y))))

(defmethod and-overload-fn [:datakey :whereclause]
  ([_]
   (fn [[^DataKey x ^WhereClause y]]
     (combine-where-clauses :and
                            (WhereClause. {(.data_key x) true})
                            y))))

(defmethod and-overload-fn [:whereclause :bool]
  ([_]
   (fn [[^WhereClause x ^Boolean y]]
     (and y x))))

(defmethod and-overload-fn [:datakey :bool]
  ([_]
   (fn [[^DataKey x ^Boolean y]]
     (and y x))))

(defmethod and-overload-fn [:bool :bool]
  ([_]
   (fn [[^Boolean x ^Boolean y]]
     (and x y))))

(def and-overloads
  (global-overload
   (.getFunction Operator/LOGICAL_AND)
   (for [arg-1 [:datakey :whereclause :bool]
         arg-2 [:datakey :whereclause :bool]
         :let [args [arg-1 arg-2]]]
     {:overload-id (str "_and_" (clojure-string/join "_"
                                                     (map type->name args)))
      :cel-args (map type->cel args)
      :cel-return-type (case args
                         ([:whereclause :whereclause]
                          [:datakey :datakey]
                          [:datakey :whereclause]
                          [:whereclause :datakey]) whereclause-cel-type
                         ([:whereclause :bool]
                          [:bool :whereclause]
                          [:datakey :bool]
                          [:bool :datakey]) SimpleType/DYN
                         [:bool :bool] SimpleType/BOOL
                         SimpleType/DYN)
      :java-args (map type->java args)
      :impl (get-and-overload-fn args)})))

;; Overloads for `==`, `!=`, and `in`
;; We replace the existing functions because adding overloads
;; for our types will result in ambiguous overloads

(defn where-value-valid? [x]
  (or (string? x) (uuid? x) (number? x) (boolean? x)))

(defn where-eq-value [x]
  (if (= x NullValue/NULL_VALUE)
    {:$isNull true}
    (if (where-value-valid? x)
      x
      (throw (ex-info "Can't handle where value" {:value x})))))

(defn where-neq-value [x]
  (if (= x NullValue/NULL_VALUE)
    {:$isNull false}
    (if (where-value-valid? x)
      {:$not x}
      (throw (ex-info "Can't handle where value" {:value x})))))

(defn empty-list-comparable
  "Returns the path for use in the where clause that could be used to support
   `data.ref('a.b') == []` or `size(data.ref('a.b')) == 0`

   They have to check a non-nullable attribute (only `id` meets this requirement
   for now)."
  [^RefPath ref-path]
  (let [segments (clojure-string/split (.path_str ref-path) #"\.")]
    (when (and (= 2 (count segments))
               (= "id" (last segments)))
      (first segments))))

(def eq-overloads
  (global-overload
   (.getFunction Operator/EQUALS)
   [{:overload-id "_eq_dynamic"
     :cel-args [SimpleType/DYN SimpleType/DYN]
     :cel-return-type SimpleType/DYN
     :java-args [Object Object]
     :impl (fn [[x y]]
             (cond (and (instance? DataKey x)
                        ;; Can't have someone doing data.a == data.b
                        (not (instance? DataKey y)))
                   (WhereClause. {(.data_key ^DataKey x) (where-eq-value y)})

                   (and (instance? DataKey y)
                        (not (instance? DataKey x)))
                   (WhereClause. {(.data_key ^DataKey y) (where-eq-value x)})

                   (and (instance? DataKey y)
                        (instance? DataKey x))
                   (throw (ex-info "Can't represent data.key1 == data.key2" {:x x :y y}))

                   (and (instance? RefPath x)
                        (= [] y)
                        (empty-list-comparable x))
                   (WhereClause. {(empty-list-comparable x) {:$isNull true}})

                   (and (instance? RefPath y)
                        (= [] x)
                        (empty-list-comparable y))
                   (WhereClause. {(empty-list-comparable y) {:$isNull true}})

                   (and (instance? RefPathSize x)
                        (= 0 y))
                   (WhereClause. {(.empty_list_comparable ^RefPathSize x) {:$isNull true}})

                   (and (instance? RefPathSize y)
                        (= 0 x))
                   (WhereClause. {(.empty_list_comparable ^RefPathSize y) {:$isNull true}})

                   (custom-type? x)
                   (throw (ex-info "Can't compare on our custom types" {:x x :y y}))

                   (custom-type? y)
                   (throw (ex-info "Can't compare on our custom types" {:x x :y y}))

                   :else
                   (= x y)))}]))

(def neq-overloads
  (global-overload
   (.getFunction Operator/NOT_EQUALS)
   [{:overload-id "_neq_dynamic"
     :cel-args [SimpleType/DYN SimpleType/DYN]
     :cel-return-type SimpleType/DYN
     :java-args [Object Object]
     :impl (fn [[x y]]
             (cond (and (instance? DataKey x)
                        ;; Can't have someone doing data.a == data.b
                        (not (instance? DataKey y)))
                   (WhereClause. {(.data_key ^DataKey x) (where-neq-value y)})

                   (and (instance? DataKey y)
                        (not (instance? DataKey x)))
                   (WhereClause. {(.data_key ^DataKey y) (where-neq-value x)})

                   (and (instance? DataKey y)
                        (instance? DataKey x))
                   (throw (ex-info "Can't represent data.key1 != data.key2" {:x x :y y}))

                   (and (instance? RefPath x)
                        (= [] y)
                        (empty-list-comparable x))
                   (WhereClause. {(empty-list-comparable x) {:$isNull false}})

                   (and (instance? RefPath y)
                        (= [] x)
                        (empty-list-comparable y))
                   (WhereClause. {(empty-list-comparable y) {:$isNull false}})

                   (and (instance? RefPathSize x)
                        (= 0 y))
                   (WhereClause. {(.empty_list_comparable ^RefPathSize x) {:$isNull false}})

                   (and (instance? RefPathSize y)
                        (= 0 x))
                   (WhereClause. {(.empty_list_comparable ^RefPathSize y) {:$isNull false}})

                   (custom-type? x)
                   (throw (ex-info "Can't compare on our custom types" {:x x :y y}))

                   (custom-type? y)
                   (throw (ex-info "Can't compare on our custom types" {:x x :y y}))

                   :else
                   (not= x y)))}]))

(def in-overloads
  (global-overload
   (.getFunction Operator/IN)
   [{:overload-id "_in_dynamic"
     :cel-args [SimpleType/DYN SimpleType/DYN]
     :cel-return-type SimpleType/DYN
     :java-args [Object Object]
     :impl (fn [[x y]]
             (cond (instance? DataKey x)
                   (if (and (or (instance? ArrayList y)
                                (sequential? y))
                            (every? where-value-valid? y))
                     (WhereClause. {(.data_key ^DataKey x) {:$in (set y)}})
                     (throw (ex-info "invalid inputs for in" {:x x :y y})))

                   (instance? RefPath y)
                   (cond (where-value-valid? x)
                         (WhereClause. {(.path_str ^RefPath y) x})

                         ;; We know that data.ref('x') will return a list of non-empty
                         ;; elements, so null in data.ref('x') is always false
                         (= NullValue/NULL_VALUE x)
                         false

                         :else (throw (ex-info "invalid inputs for in" {:x x :y y})))

                   ;; Hard to know what to do here. Since we set `containsKey` to true
                   ;; in CelMap, this will always return true for the rules.
                   ;; If we didn't do that, then it would return true unless the key
                   ;; was missing from the map (even null returns true). We don't have
                   ;; an instaql query for that.
                   (instance? CheckedDataMap y)
                   (throw (ex-info "can't call in on data" {:x x :y y}))

                   (or (custom-type? x)
                       (and (or (instance? ArrayList y)
                                (sequential? y))
                            (ucoll/exists? custom-type? y)))
                   (throw (ex-info "invalid inputs for in" {:x x :y y}))

                   (or (instance? ArrayList y)
                       (sequential? y))
                   (ucoll/exists? (fn [item]
                                    (= x item))
                                  y)

                   (or (instance? Map y)
                       (associative? y))
                   (contains? y x)))}]))

;; Overloads for `NOT`

(defn negate-where-clauses
  "Uses De Morgan's laws to negate the where clauses:
   not (A or B) = (not A) and (not B)
   not (A and B) = (not A) or (not B)"
  [c]
  (cond (and (:or c) (vector? (:or c)))
        {:and (mapv negate-where-clauses (:or c))}

        (and (:and c) (vector? (:and c)))
        {:or (mapv negate-where-clauses (:and c))}

        :else
        (reduce-kv (fn [acc k v]
                     (assoc acc k (cond (map? v)
                                        (cond (contains? v :$not)
                                              (:$not v)

                                              (contains? v :$isNull)
                                              {:$isNull (not (:$isNull v))}

                                              :else (throw (ex-info "Unsupported operation for negation", {:v v})))

                                        :else
                                        {:$not v})))
                   {}
                   c)))

(def not-overloads
  (global-overload
   (.getFunction Operator/LOGICAL_NOT)
   [{:overload-id "_not_datakey"
     :cel-args [datakey-cel-type]
     :cel-return-type whereclause-cel-type
     :java-args [DataKey]
     :impl (fn [[^DataKey x]]
             (WhereClause. {(.data_key x) false}))}
    {:overload-id "_not_whereclause"
     :cel-args [whereclause-cel-type]
     :cel-return-type whereclause-cel-type
     :java-args [WhereClause]
     :impl (fn [[^WhereClause x]]
             (WhereClause. (negate-where-clauses (.where_clause x))))}]))

;; Overloads for `startsWith`, `endsWith`, and `contains`

(def starts-with-overload
  (member-overload
   "startsWith"
   [{:overload-id "_datakey_starts_with"
     :cel-args [datakey-cel-type SimpleType/STRING]
     :cel-return-type whereclause-cel-type
     :java-args [DataKey String]
     :impl (fn [[^DataKey x ^String y]]
             (let [attr (.instant_attr x)]
               (if (and (= :string (:checked-data-type attr))
                        (:index? attr))
                 (WhereClause. {(.data_key x) {:$like (str y "%")}})
                 (throw (ex-info "Invalid attr" {:x x})))))}]))

(def ends-with-overload
  (member-overload
   "endsWith"
   [{:overload-id "_datakey_ends_with"
     :cel-args [datakey-cel-type SimpleType/STRING]
     :cel-return-type whereclause-cel-type
     :java-args [DataKey String]
     :impl (fn [[^DataKey x ^String y]]
             (let [attr (.instant_attr x)]
               (if (and (= :string (:checked-data-type attr))
                        (:index? attr))
                 (WhereClause. {(.data_key x) {:$like (str "%" y)}})
                 (throw (ex-info "Invalid attr" {:x x})))))}]))

(def contains-overload
  (member-overload
   "contains"
   [{:overload-id "_datakey_contains"
     :cel-args [datakey-cel-type SimpleType/STRING]
     :cel-return-type whereclause-cel-type
     :java-args [DataKey String]
     :impl (fn [[^DataKey x ^String y]]
             (let [attr (.instant_attr x)]
               (if (and (= :string (:checked-data-type attr))
                        (:index? attr))
                 (WhereClause. {(.data_key x) {:$like (str "%" y "%s")}})
                 (throw (ex-info "Invalid attr" {:x x})))))}]))

;; Overloads for `type` to prevent `type(data.key)` from succeeding

(def type-overload
  (global-overload
   "type"
   [{:overload-id "_type_datakey_override"
     :cel-args [datakey-cel-type]
     :cel-return-type SimpleType/DYN
     :java-args [DataKey]
     :impl (fn [[^DataKey x]]
             (throw (ex-info "Can't call type on a DataKey" {:x x})))}
    {:overload-id "_type_refpath_override"
     :cel-args [refpath-cel-type]
     :cel-return-type SimpleType/DYN
     :java-args [RefPath]
     :impl (fn [[^RefPath x]]
             (throw (ex-info "Can't call type on a RefPath" {:x x})))}
    {:overload-id "_type_whereclause_override"
     :cel-args [whereclause-cel-type]
     :cel-return-type SimpleType/DYN
     :java-args [WhereClause]
     :impl (fn [[^WhereClause x]]
             (throw (ex-info "Can't call type on a WhereClause" {:x x})))}]))

(def size-overload
  (global-overload
   "size"
   [{:overload-id "_size_refpath_size"
     :cel-args [refpath-cel-type]
     :cel-return-type refpath-size-cel-type
     :java-args [RefPath]
     :impl (fn [[^RefPath x]]
             (if-let [comparable (empty-list-comparable x)]
               (RefPathSize. x comparable)
               (throw (ex-info "Can't use size with a refpath that isn't empty list comparable"
                               {:refpath x}))))}]))

;; Overload for data.ref

(defn validate-refpath [attrs initial-etype path]
  (loop [etype initial-etype
         [label & rest] (clojure-string/split path #"\.")]
    (let [[attr next-etype] (or (when-let [attr (attr-model/seek-by-fwd-ident-name [etype label] attrs)]
                                  [attr (attr-model/rev-etype attr)])
                                (when-let [attr (attr-model/seek-by-rev-ident-name [etype label] attrs)]
                                  [attr (attr-model/fwd-etype attr)]))]
      (if-not attr
        (throw (ex-info "Invalid data.ref" {:etype initial-etype
                                            :path path
                                            :failing-segment label}))
        (when (seq rest)
          (recur next-etype
                 rest))))))

(def where-ref-fn (member-overload "ref"
                                   ;; Include the default (for auth.ref)
                                   [ref-decl
                                    {:overload-id "_checked_data_ref"
                                     :cel-args [checked-data-map-cel-type SimpleType/STRING]
                                     :cel-return-type refpath-cel-type
                                     :java-args [CheckedDataMap String]
                                     :impl (fn [[^CheckedDataMap m ^String ref-path]]
                                             (validate-refpath (.attrs m) (.etype m) ref-path)
                                             (RefPath. ref-path))}]))
(def where-custom-fns [where-ref-fn
                       or-overloads
                       and-overloads
                       eq-overloads
                       neq-overloads
                       in-overloads
                       not-overloads
                       starts-with-overload
                       ends-with-overload
                       contains-overload
                       type-overload
                       size-overload])
(def where-custom-fn-decls (mapv :decl where-custom-fns))
(def where-custom-fn-bindings (mapcat :runtimes where-custom-fns))

(def where-cel-options (-> (CelOptions/current)
                           (.populateMacroCalls true)
                           (.retainRepeatedUnaryOperators true)
                           (.build)))

;; Differences from cel-compiler
;; 1. No "newData" var
;; 2. "data" var is checked-data-map-cel-type instead of the cel-map type
;; 3. Adds overrides
;; 4. retainRepeatedUnaryOperators == true (makes !!data.test work)
;; 5. Exclude the ==, !=, and `in` standard functions (replaced by our overloads)
;; 6. Additional overload for ref-fn

(def ^:private ^CelCompiler where-cel-compiler
  (-> (CelCompilerFactory/standardCelCompilerBuilder)
      (.addVar "data" checked-data-map-cel-type)
      (.addVar "ruleParams" type-obj)
      (.addVar "auth" type-obj)
      (.addFunctionDeclarations (ucoll/array-of CelFunctionDecl where-custom-fn-decls))
      (.setOptions where-cel-options)
      (.setStandardMacros CelStandardMacro/STANDARD_MACROS)
      (.addLibraries (ucoll/array-of CelCompilerLibrary [(CelExtensions/bindings) (CelExtensions/strings)]))
      (.build)))

(def ^:private ^CelRuntime where-cel-runtime
  (let [^CelRuntimeLegacyImpl$Builder builder (CelRuntimeFactory/standardCelRuntimeBuilder)
        ^java.lang.Iterable extensions [(CelExtensions/strings)]
        ^CelStandardFunctions override-functions
        (-> (CelStandardFunctions/newBuilder)
            (.excludeFunctions (ImmutableList/of CelStandardFunctions$StandardFunction/EQUALS
                                                 CelStandardFunctions$StandardFunction/NOT_EQUALS
                                                 CelStandardFunctions$StandardFunction/IN))
            (.build))]
    (-> builder
        (.setStandardEnvironmentEnabled false)
        (.setStandardFunctions override-functions)
        (.addLibraries extensions)
        (.addFunctionBindings (ucoll/array-of CelRuntime$CelFunctionBinding where-custom-fn-bindings))
        (.setOptions where-cel-options)
        (.build))))

(defn where-clauses-program
  "Takes a string, returns either an Exception (if this code can't
   be evaluated to rule wheres) or the cel program."
  [code]
  (try
    (let [^CelAbstractSyntaxTree ast (.getAst (.compile where-cel-compiler code))
          ^CelRuntime$Program program (.createProgram where-cel-runtime ast)]
      program)
    (catch Exception e
      e)))

(defn format-evaluation-result [evaluation-result]
  (when (and (not (instance? WhereClause evaluation-result))
             (custom-type? evaluation-result))
    (throw (ex-info "Invalid return type from the cel rule" {:evaluation-result evaluation-result})))

  {:short-circuit? (or (= evaluation-result NullValue/NULL_VALUE)
                       (not evaluation-result))
   :evaluation-result evaluation-result
   :where-clauses (when (instance? WhereClause evaluation-result)
                    (.where_clause ^WhereClause evaluation-result))})

(defn get-all-where-clauses
  "Returns a map of {etype {:thrown Throwable} |
                           {:short-circuit? bool
                            :evaluation-result any
                            :where-clauses {where-clauses}}}"
  ([ctx rule-params programs]
   (get-all-where-clauses {} ctx rule-params programs))
  ([results ctx rule-params programs]
   (assert (and (:preloaded-refs ctx)
                (instance? ConcurrentHashMap (:preloaded-refs ctx))))
   (let [{:keys [results missing-refs rerun-programs]}
         (reduce
          (fn [acc {:keys [where-clauses-program etype] :as program}]
            (assert where-clauses-program)
            (try
              (when (instance? Exception where-clauses-program)
                (throw where-clauses-program))
              (let [result
                    (io/warn-io :cel/advance-program!
                      (advance-program!
                       ctx
                       {:cel-program where-clauses-program
                        :etype etype
                        :action "view"}
                       {:resolver (reify CelVariableResolver
                                    (find [_this var-name]
                                      (case var-name
                                        "auth"
                                        (Optional/of
                                         (AuthCelMap. ctx (CelMap. (:current-user ctx))))
                                        "data"
                                        (Optional/of
                                         (CheckedDataMap. (:attrs ctx) etype))
                                        "ruleParams"
                                        (Optional/of (CelMap. rule-params))

                                        (Optional/empty))))}))]
                (if (is-missing-ref-data? result)
                  (-> acc
                      (update :missing-refs into (missing-ref-datas result))
                      (update :rerun-programs conj program))
                  (-> acc
                      (assoc-in [:results etype]
                                (format-evaluation-result result)))))

              (catch Throwable t
                (assoc-in acc [:results etype] {:thrown t}))))
          {:results results
           :missing-refs #{}
           :rerun-programs []}
          programs)]
     (when (seq missing-refs)
       (assert (seq rerun-programs)))
     (when (seq rerun-programs)
       (assert (seq missing-refs)))
     (if-not (seq missing-refs)
       results
       (let [preloaded-refs (tracer/with-span! {:name "cel/prefetch-missing-ref-datas"
                                                :attributes {:ref-data-count (count missing-refs)}}
                              (prefetch-missing-ref-datas ctx missing-refs))]
         (Map/.putAll (:preloaded-refs ctx) preloaded-refs)
         (recur results
                ctx
                rule-params
                rerun-programs))))))

;; Static analysis
;; ---------------

(declare expr->ref-uses)

(defn get-optional-value
  "Returns value in optional if it's some, or nil if it's none."
  [^Optional o]
  (when (.isPresent o)
    (.get o)))

(defn function-name
  "Returns the qualified function name as a list,
   e.g. `[data, ref]`, `[nil, type]`, `[nil, _+_]`"
  [^CelExpr$CelCall call]
  (let [f (.function call)]
    (if-let [target ^CelExpr (get-optional-value (.target call))]
      (if (= CelExpr$ExprKind$Kind/IDENT (.getKind target))
        [(.name (.ident target)) f]
        (tracer/with-span! {:name "cel/unknown-function-name"
                            :attributes {:cel-call call}}
          [nil f]))
      [nil f])))

(defn ref-arg
  "Returns the `path-str` if the args match what we expect for data.ref,
   otherwise nil. Logs if the arg isn't a constant string so that we can
   investigate."
  [^CelExpr$CelCall call]
  (if (= 1 (count (.args call)))
    (let [arg ^CelExpr (first (.args call))]
      (if (= CelExpr$ExprKind$Kind/CONSTANT (.getKind arg))
        (.stringValue (.constant arg))
        (tracer/with-span! {:name "cel/unknown-ref-arg"
                            :attributes {:cel-call call}}
          nil)))
    (tracer/with-span! {:name "cel/incorrect-ref-arg-count"
                        :attributes {:cel-call call}}
      nil)))

(defn call->ref-uses
  "Walks the cel call, looking for `data.ref` calls, returning a set of
   `path-str`s."
  [^CelExpr$CelCall call]
  (let [[obj f] (function-name call)]
    (if (= "ref" f)
      (if-let [arg (ref-arg call)]
        #{{:obj obj
           :path (if (= obj "auth")
                   (clojure-string/replace arg
                                           #"^\$user\."
                                           "")
                   arg)}}
        #{})
      (reduce (fn [acc expr]
                (into acc (expr->ref-uses expr)))
              #{}
              (.args call)))))

(defn compression->ref-uses
  "Walks the cel comprehension, looking for `data.ref` calls, returning a set of
   `path-str`s."
  [^CelExpr$CelComprehension c]
  (clojure-set/union (expr->ref-uses (.iterRange c))
                     (expr->ref-uses (.accuInit c))
                     (expr->ref-uses (.loopCondition c))
                     (expr->ref-uses (.loopStep c))
                     (expr->ref-uses (.result c))))

(defn expr->ref-uses
  "Walks the cel expression, looking for `data.ref` calls, returning a set of
   `path-str`s for each object."
  [^CelExpr expr]
  (condp = (.getKind expr)
    CelExpr$ExprKind$Kind/NOT_SET #{}
    CelExpr$ExprKind$Kind/CONSTANT #{}
    ;; An identifier expression. e.g. `request`.
    CelExpr$ExprKind$Kind/IDENT #{}
    ;; A field selection expression. e.g. `request.auth`.
    CelExpr$ExprKind$Kind/SELECT #{}
    CelExpr$ExprKind$Kind/LIST (reduce (fn [acc item]
                                         (into acc (expr->ref-uses item)))
                                       #{}
                                       (.elements (.list expr)))
    ;; Not sure how to make one of these, will ignore for now
    CelExpr$ExprKind$Kind/STRUCT (tracer/with-span! {:name "cel/unknown-struct"
                                                     :attributes {:expr expr}}
                                   #{})
    CelExpr$ExprKind$Kind/MAP (reduce (fn [acc ^Expression$Map$Entry entry]
                                        (-> acc
                                            (into (expr->ref-uses (.key entry)))
                                            (into (expr->ref-uses (.value entry)))))
                                      #{}
                                      (.entries (.map expr)))
    ;; https://github.com/google/cel-java/blob/10bb524bddc7c32a55101f6b4967eb52cd14fb18/common/src/main/java/dev/cel/common/ast/CelExpr.java#L925
    CelExpr$ExprKind$Kind/COMPREHENSION (compression->ref-uses (.comprehension expr))
    CelExpr$ExprKind$Kind/CALL (call->ref-uses (.call expr))))

;; It would be nice to have a more abstract walker over the ast,
;; but this will do for now.
(defn collect-ref-uses
  "Returns a set of `path-str` used in `data.ref` calls in the given cel ast,
   grouped by the object, e.g. #{{obj: \"data\", path: \"a.b\"}
                                 {obj: \"auth\", path: \"c.d\"}.
   Automatically strips `$user` from auth path-str"
  [^CelAbstractSyntaxTree ast]
  (expr->ref-uses (.getExpr ast)))

(defn prefetch-data-refs
  "refs should be a list of:
     {eids: #{uuid}
      etype: string
      path-str: string}
   Returns a map of:
     {{eid: uuid, etype: string, path: string}: get-ref-result}"
  [{:keys [datalog-query-fn] :as ctx} refs]
  (let [{:keys [patterns]}
        (reduce (fn [acc ref-info]
                  (let [{:keys [pats referenced-etypes]}
                        (build-query ctx ref-info)]
                    (-> acc
                        (update :patterns conj pats)
                        (update :referenced-etypes into referenced-etypes))))
                {:patterns []
                 :referenced-etypes #{}}
                refs)

        query {:children {:pattern-groups (map (fn [patterns]
                                                 {:patterns patterns})
                                               patterns)}}
        results (:data (datalog-query-fn ctx query))]
    (reduce (fn [acc [ref pattern result]]
              (let [group-by-path [0 0]
                    val-path (find-val-path pattern)
                    {:keys [join-rows]} result
                    grouped-join-rows (group-by #(get-in % group-by-path) join-rows)]
                (reduce (fn [acc eid]
                          (assoc acc
                                 {:eid eid
                                  :etype (:etype ref)
                                  :path-str (:path-str ref)}
                                 (let [rows (grouped-join-rows eid)]
                                   (map #(get-in % val-path) rows))))
                        acc
                        (:eids ref))))
            {}
            (map (fn [ref patterns result]
                   [ref patterns (:result result)])
                 refs
                 patterns
                 results))))

(defn prefetch-missing-ref-datas
  "refs should be a set of {:eid uuid
                            :type string
                            :path-str string}
   Converts the refs to the format prefetch-data-refs expects
   and calls prefetch-data-refs."
  [ctx ref-datas]
  (let [refs (vals (reduce (fn [acc {:keys [eid etype path-str]}]
                             (update acc
                                     [etype path-str]
                                     (fn [x]
                                       (update (or x {:eids #{}
                                                      :etype etype
                                                      :path-str path-str})

                                               :eids
                                               conj
                                               eid))))
                           {}
                           ref-datas))]
    (prefetch-data-refs ctx refs)))

(def ^CelUnparser unparser (CelUnparserFactory/newUnparser))

(defn unparse
  "Turns an ast back into code."
  [^CelAbstractSyntaxTree ast]
  (.unparse unparser ast))

(def auth-ref-validator ^CelAstValidator
  (reify CelAstValidator
    (validate [_this ast _cel issues-factory]
      (doseq [^CelNavigableExpr node (-> ast
                                         (.getRoot)
                                         (.allNodes)
                                         (.iterator)
                                         iterator-seq)]
        (when (= CelExpr$ExprKind$Kind/CALL (.getKind node))
          (let [expr (get-expr node)
                call (.call expr)
                [obj f] (function-name call)]
            (when (and (= f "ref")
                       (= obj "auth"))
              (let [arg ^CelExpr (first (.args call))
                    arg-val (ref-arg call)]
                (when (or (not arg-val)
                          (not (clojure-string/starts-with? arg-val "$user.")))
                  (.addError issues-factory
                             (if arg
                               (.id arg)
                               (.id expr))
                             "auth.ref arg must start with `$user.`"))))))))))

(defn validation-errors [^CelCompiler compiler ^CelAbstractSyntaxTree ast]
  (-> (CelValidatorFactory/standardCelValidatorBuilder compiler
                                                       cel-runtime)
      (.addAstValidators (ucoll/array-of CelAstValidator [auth-ref-validator]))
      (.build)
      (.validate ast)
      (.getErrors)))

;; Helper for dev so that `rules.clj` can clear its cache when this
;; namespace is reloaded and the deftypes change
(defonce after-load (atom nil))

(defn set-afterload [f]
  (reset! after-load f))

(when-let [after-load @after-load]
  (after-load))

nil
