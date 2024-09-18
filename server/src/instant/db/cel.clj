(ns instant.db.cel
  (:require
   [instant.db.model.attr :as attr-model]
   [instant.data.constants :refer [zeneca-app-id]]
   [instant.jdbc.aurora :as aurora]
   [instant.db.datalog :as d]
   [instant.db.model.attr-pat :as attr-pat]
   [instant.util.coll :as ucoll]
   [clojure.string :as clojure-string]
   [clojure.set :as clojure-set]
   [instant.util.exception :as ex]
   [instant.db.dataloader :as dataloader]
   [instant.util.tracer :as tracer])
  (:import
   (java.util Map Optional)
   (com.google.protobuf NullValue)
   (dev.cel.common CelFunctionDecl
                   CelOverloadDecl
                   CelAbstractSyntaxTree)
   (dev.cel.common.ast CelExpr
                       CelExpr$CelCall
                       CelExpr$CelComprehension
                       CelExpr$ExprKind$Kind)
   (dev.cel.extensions CelExtensions)
   (dev.cel.common.types SimpleType MapType ListType CelType)
   (dev.cel.compiler CelCompiler CelCompilerFactory CelCompilerLibrary)
   (dev.cel.runtime CelEvaluationException)
   (dev.cel.runtime CelRuntime
                    CelRuntimeFactory
                    CelRuntime$Program
                    CelRuntime$CelFunctionBinding CelFunctionOverload$Binary)))

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
        [last-etype last-level ref-attr-pats] (attr-pat/->ref-attr-pats ctx
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
    (attr-pat/attr-pats->patterns ctx attr-pats)))

(defn- find-val-path [query]
  (first
   (for [[i pattern] (map-indexed vector query)
         :let [pos (.indexOf pattern value-sym)]
         :when (not= pos -1)]
        ;; `dec` because these patterns include the `index`, but join-rows don't.
     [i (dec pos)])))

(defn- get-ref-many
  [{:keys [datalog-query-fn] :as ctx} {:keys [etype eids path-str]}]
  (let [query (build-query ctx {:etype etype :eids (set eids) :path-str path-str})
        ;; We know that the `eid` is always going to be 
        ;; the first element in the join row
        group-by-path [0 0]
        val-path (find-val-path query)
        {:keys [join-rows]} (datalog-query-fn ctx query)
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
  (def ctx {:db {:conn-pool aurora/conn-pool}
            :app-id zeneca-app-id
            :datalog-query-fn d/query
            :attrs (attr-model/get-by-app-id aurora/conn-pool zeneca-app-id)})
  (def params {:etype "bookshelves"
               :eid #uuid "8164fb78-6fa3-4aab-8b92-80e706bae93a"
               :path-str "users.handle"})
  (get-ref ctx params))

;; ----
;; Cel

(def ^MapType type-obj (MapType/create SimpleType/STRING SimpleType/DYN))

(def ^ListType type-ref-return (ListType/create SimpleType/DYN))

(def ref-fn {:decl (CelFunctionDecl/newFunctionDeclaration
                    "ref"
                    (ucoll/array-of
                     CelOverloadDecl
                     [(CelOverloadDecl/newMemberOverload
                       "data_ref"
                       type-ref-return
                       (ucoll/array-of CelType [type-obj SimpleType/STRING]))]))
             :runtime (let [impl (reify CelFunctionOverload$Binary
                                   (apply [_ {:strs [_ctx id _etype] :as _self} path-str]
                                     (let [ref-data {:eid (parse-uuid id)
                                                     :etype _etype
                                                     :path-str path-str}]
                                       (if-let [preloaded-ref (-> _ctx
                                                                  :preloaded-refs
                                                                  (get ref-data))]
                                         (vec preloaded-ref)
                                         (vec (get-ref _ctx ref-data))))))]
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
      (.addVar "newData" type-obj)
      (.addFunctionDeclarations (ucoll/array-of CelFunctionDecl custom-fn-decls))
      (.addLibraries (ucoll/array-of CelCompilerLibrary [(CelExtensions/bindings)]))
      (.build)))

(def ^:private ^CelRuntime cel-runtime
  (-> (CelRuntimeFactory/standardCelRuntimeBuilder)
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

(defn ->cel-map [m]
  (proxy [java.util.AbstractMap] []
    ;; If a value is not found, we must return a null value that CEL understands
    (get [k]
      (let [res (get m k NullValue/NULL_VALUE)]
        (cond (nil? res)
              NullValue/NULL_VALUE

              ;; For some reason, cel-java only supports longs when determining
              ;; type. We convert ints to longs to prevent type(data.param) from
              ;; throwing a NPE
              ;; https://github.com/google/cel-java/blob/dae82c6d10114bb1da643203569f90a757c6c5e6/runtime/src/main/java/dev/cel/runtime/StandardTypeResolver.java#L73
              (int? res)
              (long res)

              :else res)))
    ;; CEL throws if a key doesn't exist. We don't want this behavior -- we'd 
    ;; rather just return null when a key is accessed. 
    ;; To get this behavior, we override `containsKey`, so we always return true 
    ;; when checking for key presence.
    (containsKey [k]
      true)
    (entrySet []
      (let [m' (or m {})
            ^java.util.Map clean-m (dissoc m' "_ctx" "_etype")]
        (.entrySet clean-m)))))


;; Static analysis
;; ---------------

(declare expr->data-ref-uses)

(defn get-optional-value
  "Returns value in optional if it's some, or nil if it's none."
  [^Optional o]
  (when (.isPresent o)
    (.get o)))

(defn function-name
  "Returns the qualified function name, e.g. `data.ref`, `type`, `_+_`"
  [^CelExpr$CelCall call]
  (let [f (.function call)]
    (if-let [target (get-optional-value (.target call))]
      (if (= CelExpr$ExprKind$Kind/IDENT (.getKind target))
        (format "%s.%s" (.name (.ident target)) f)
        (tracer/with-span! {:name "cel/unknown-function-name"
                            :attributes {:cel-call call}}
          f))
      f)))

(defn data-ref-arg
  "Returns the `path-str` if the args match what we expect for data.ref,
   otherwise nil. Logs if the arg isn't a constant string so that we can
   investigate."
  [^CelExpr$CelCall call]
  (if (= 1 (count (.args call)))
    (if (= CelExpr$ExprKind$Kind/CONSTANT (.getKind (first (.args call))))
      (.stringValue (.constant (first (.args call))))
      (tracer/with-span! {:name "cel/unknown-data-ref-arg"
                          :attributes {:cel-call call}}
        nil))
    (tracer/with-span! {:name "cel/data-ref-arg"
                        :attributes {:cel-call call}}
      nil)))

(defn call->data-ref-uses
  "Walks the cel call, looking for `data.ref` calls, returning a set of
   `path-str`s."
  [^CelExpr$CelCall call]
  (if (= "data.ref" (function-name call))
    (if-let [arg (data-ref-arg call)]
      #{arg}
      #{})
    (reduce (fn [acc expr]
              (into acc (expr->data-ref-uses expr)))
            #{}
            (.args call))))

(defn compression->data-ref-uses
  "Walks the cel comprehension, looking for `data.ref` calls, returning a set of
   `path-str`s."
  [^CelExpr$CelComprehension c]
  (clojure-set/union (expr->data-ref-uses (.iterRange c))
                     (expr->data-ref-uses (.accuInit c))
                     (expr->data-ref-uses (.loopCondition c))
                     (expr->data-ref-uses (.loopStep c))
                     (expr->data-ref-uses (.result c))))

(defn expr->data-ref-uses
  "Walks the cel expression, looking for `data.ref` calls, returning a set of
   `path-str`s."
  [^CelExpr expr]
  (condp = (.getKind expr)
    CelExpr$ExprKind$Kind/NOT_SET #{}
    CelExpr$ExprKind$Kind/CONSTANT #{}
    ;; An identifier expression. e.g. `request`.
    CelExpr$ExprKind$Kind/IDENT #{}
    ;; A field selection expression. e.g. `request.auth`.
    CelExpr$ExprKind$Kind/SELECT #{}
    CelExpr$ExprKind$Kind/LIST (reduce (fn [acc item]
                                         (into acc (expr->data-ref-uses item)))
                                       #{}
                                       (.elements (.list expr)))
    ;; Not sure how to make one of these, will ignore for now
    CelExpr$ExprKind$Kind/STRUCT (tracer/with-span! {:name "cel/unknown-struct"
                                                     :attributes {:expr expr}}
                                   #{})
    CelExpr$ExprKind$Kind/MAP (reduce (fn [acc entry]
                                        (-> acc
                                            (into (expr->data-ref-uses (.key entry)))
                                            (into (expr->data-ref-uses (.value entry)))))
                                      #{}
                                      (.entries (.map expr)))
    ;; https://github.com/google/cel-java/blob/10bb524bddc7c32a55101f6b4967eb52cd14fb18/common/src/main/java/dev/cel/common/ast/CelExpr.java#L925
    CelExpr$ExprKind$Kind/COMPREHENSION (compression->data-ref-uses (.comprehension expr))
    CelExpr$ExprKind$Kind/CALL (call->data-ref-uses (.call expr))))

;; It would be nice to have a more abstract walker over the ast,
;; but this will do for now.
(defn collect-data-ref-uses
  "Returns a set of `path-str` used in `data.ref` calls in the given cel ast."
  [^CelAbstractSyntaxTree ast]
  (expr->data-ref-uses (.getExpr ast)))

(defn prefetch-data-refs
  "refs should be a list of:
     {eids: #{uuid}
      etype: string
      path-str: string}
   Returns a map of:
     {{eid: uuid, etype: string, path: string}: get-ref-result}"
  [{:keys [datalog-query-fn] :as ctx} refs]
  (let [patterns (map (partial build-query ctx) refs)
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
            (map (fn [ref pattern result]
                   [ref pattern (:result result)])
                 refs
                 patterns
                 results))))

(comment
  (def m (->cel-map {"id" #uuid "8164fb78-6fa3-4aab-8b92-80e706bae93a"
                     "name" "Nonfiction"
                     "creatorEmail" "stopa@instantdb.com"
                     "_etype" "bookshelves"})))

(comment
  (def attrs (attr-model/get-by-app-id aurora/conn-pool zeneca-app-id))
  (def ctx {:db {:conn-pool aurora/conn-pool}
            :app-id zeneca-app-id
            :datalog-query-fn d/query
            :attrs attrs})
  (let [ast (->ast "data.ref('users.handle')")
        program (->program ast)
        result
        (eval-program! {:cel-program program} {"auth" (->cel-map {"email" "stopa@instantdb.com"})
                                               "data" (->cel-map {"id" "8164fb78-6fa3-4aab-8b92-80e706bae93a"
                                                                  "creatorEmail" "stopa@instantdb.com"
                                                                  "name" "Nonfiction"
                                                                  "_ctx" ctx
                                                                  "_etype" "bookshelves"})})]
    result))
