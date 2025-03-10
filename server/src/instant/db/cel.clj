
(ns instant.db.cel
  (:require
   [clojure.set :as clojure-set]
   [clojure.string :as clojure-string]
   [instant.data.constants :refer [zeneca-app-id]]
   [instant.db.dataloader :as dataloader]
   [instant.db.datalog :as d]
   [instant.db.model.attr :as attr-model]
   [instant.db.model.attr-pat :as attr-pat]
   [instant.jdbc.aurora :as aurora]
   [instant.util.coll :as ucoll]
   [instant.util.exception :as ex]
   [instant.util.tracer :as tracer])
  (:import
   (com.google.protobuf NullValue)
   (dev.cel.common CelAbstractSyntaxTree CelFunctionDecl CelOverloadDecl)
   (dev.cel.common.ast CelExpr
                       CelExpr$CelCall
                       CelExpr$CelComprehension
                       CelExpr$ExprKind$Kind
                       Expression$Map$Entry)
   (dev.cel.common.navigation CelNavigableExpr)
   (dev.cel.common.types CelType ListType MapType SimpleType)
   (dev.cel.compiler CelCompiler CelCompilerFactory CelCompilerLibrary)
   (dev.cel.extensions CelExtensions)
   (dev.cel.parser CelStandardMacro)
   (dev.cel.runtime CelEvaluationException
                    CelFunctionOverload$Binary
                    CelRuntime
                    CelRuntime$CelFunctionBinding
                    CelRuntime$Program
                    CelRuntimeFactory)
   (dev.cel.validator CelAstValidator CelValidatorFactory)
   (java.util Date Map Optional SimpleTimeZone)
   (java.text SimpleDateFormat)))

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
  (def ctx {:db {:conn-pool (aurora/conn-pool :read)}
            :app-id zeneca-app-id
            :datalog-query-fn d/query
            :attrs (attr-model/get-by-app-id zeneca-app-id)})
  (def params {:etype "bookshelves"
               :eid #uuid "8164fb78-6fa3-4aab-8b92-80e706bae93a"
               :path-str "users.handle"})
  (get-ref ctx params))

;; ----
;; Cel

(declare ->cel-list ->cel-map)

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
    (sequential? x)    (->cel-list x)
    (associative? x)   (->cel-map nil x)
    (instance? Date x) (doto (SimpleDateFormat. "yyyy-MM-dd'T'HH:mm:ss'Z'")
                         (.setTimeZone (SimpleTimeZone. 0 "UTC"))
                         (.format ^Date x))
    :else              x))

(defn get-cel-value [m k]
  (stringify
   (if (contains? m k)
     (get m k)
     (get m (keyword k)))))

(deftype CelList [xs]
  java.util.List
  (get [_ i]
    (stringify (nth xs i)))

  ;; for printing
  (iterator [_]
    (java.util.List/.iterator xs)))

(defn ->cel-list [xs]
  (CelList. xs))

(deftype CelMap [metadata m]
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
         set))

  clojure.lang.IMeta
  (meta [_]
    metadata))

(defn ->cel-map [metadata m]
  (CelMap. metadata m))

(def ^MapType type-obj (MapType/create SimpleType/STRING SimpleType/DYN))

(def ^ListType type-ref-return (ListType/create SimpleType/DYN))

(def ref-fn
  {:decl (CelFunctionDecl/newFunctionDeclaration
          "ref"
          (ucoll/array-of
           CelOverloadDecl
           [(CelOverloadDecl/newMemberOverload
             "data_ref"
             type-ref-return
             (ucoll/array-of CelType [type-obj SimpleType/STRING]))]))
   :runtime (let [impl (reify CelFunctionOverload$Binary
                         (apply [_ ^CelMap {:strs [id] :as self} path-str]
                           (if (= id NullValue/NULL_VALUE)
                             []
                             (let [self ^CelMap self
                                   {:keys [ctx etype type]} (meta self)
                                   path-str (if (= type :auth)
                                              (clojure-string/replace path-str
                                                                      #"^\$user\."
                                                                      "")
                                              path-str)
                                   ref-data {:eid (parse-uuid id)
                                             :etype etype
                                             :path-str path-str}]
                               (if-let [preloaded-ref (-> ctx
                                                          :preloaded-refs
                                                          (get ref-data))]
                                 (vec preloaded-ref)
                                 (vec (get-ref ctx ref-data)))))))]
              (CelRuntime$CelFunctionBinding/from
               "data_ref"
               Map
               String
               impl))})

(def custom-fns [ref-fn])
(def custom-fn-decls (mapv :decl custom-fns))
(def custom-fn-bindings (mapv :runtime custom-fns))

(def ^:private ^CelCompiler cel-compiler
  (-> (CelCompilerFactory/standardCelCompilerBuilder)
      (.addVar "data" type-obj)
      (.addVar "auth" type-obj)
      (.addVar "ruleParams" type-obj)
      (.addVar "newData" type-obj)
      (.addFunctionDeclarations (ucoll/array-of CelFunctionDecl custom-fn-decls))
      (.setStandardMacros (CelStandardMacro/STANDARD_MACROS))
      (.addLibraries (ucoll/array-of CelCompilerLibrary [(CelExtensions/bindings) (CelExtensions/strings)]))
      (.build)))

(def ^:private ^CelRuntime cel-runtime
  (-> (CelRuntimeFactory/standardCelRuntimeBuilder)
      (.addLibraries [(CelExtensions/strings)])
      (.addFunctionBindings (ucoll/array-of CelRuntime$CelFunctionBinding custom-fn-bindings))
      (.build)))

(defn ->ast [expr-str] (.getAst (.compile cel-compiler expr-str)))
(defn ->program [ast] (.createProgram cel-runtime ast))

(defn eval-program!
  [{:keys [cel-program etype action]} bindings]
  (try
    (let [result (.eval ^CelRuntime$Program cel-program ^java.util.Map bindings)]
      (if (= result NullValue/NULL_VALUE)
        nil
        result))
    (catch CelEvaluationException e
      (ex/throw-permission-evaluation-failed!
       etype action e))))

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

(def auth-ref-validator ^CelAstValidator
  (reify CelAstValidator
    (validate [_this ast _cel issues-factory]
      (doseq [^CelNavigableExpr node (-> ast
                                         (.getRoot)
                                         (.allNodes)
                                         (.iterator)
                                         iterator-seq)]
        (when (= CelExpr$ExprKind$Kind/CALL (.getKind node))
          ;; Not sure why this is necessary, but can't call
          ;; .expr on the node without manually making it
          ;; accessible. It's what they do in the example,
          ;; so not sure why it's a problem here
          ;; https://tinyurl.com/46zbw98p
          (let [clazz (.getClass node)
                method (.getDeclaredMethod clazz "expr" (into-array Class []))
                _ (.setAccessible method true)
                ^CelExpr expr (.invoke method node (object-array 0))
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

(defn validation-errors [^CelAbstractSyntaxTree ast]
  (-> (CelValidatorFactory/standardCelValidatorBuilder cel-compiler
                                                       cel-runtime)
      (.addAstValidators (ucoll/array-of CelAstValidator [auth-ref-validator]))
      (.build)
      (.validate ast)
      (.getErrors)))

(comment
  (def m (->cel-map {:etype "bookshelves"}
                    {"id" #uuid "8164fb78-6fa3-4aab-8b92-80e706bae93a"
                     "name" "Nonfiction"
                     "creatorEmail" "stopa@instantdb.com"})))

(comment
  (def attrs (attr-model/get-by-app-id zeneca-app-id))
  (def ctx {:db {:conn-pool (aurora/conn-pool :read)}
            :app-id zeneca-app-id
            :datalog-query-fn d/query
            :attrs attrs})
  (let [ast (->ast "data.ref('users.handle').exists_one(x, x == 'alex')")
        program (->program ast)
        result
        (eval-program! {:cel-program program} {"auth" (->cel-map {} {"email" "stopa@instantdb.com"})
                                               "data" (->cel-map {:ctx ctx
                                                                  :etype "bookshelves"}
                                                                 {"id" "8164fb78-6fa3-4aab-8b92-80e706bae93a"
                                                                  "creatorEmail" "stopa@instantdb.com"
                                                                  "name" "Nonfiction"})})]
    result))
