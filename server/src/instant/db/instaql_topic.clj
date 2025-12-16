(ns instant.db.instaql-topic
  (:require [instant.db.cel :as cel]
            [instant.db.cel-builder :as b]
            [instant.db.model.attr :as attr-model]
            [instant.db.model.triple :as triple-model]
            [clojure+.core :refer [cond+]]
            [instant.util.tracer :as tracer])
  (:import (clojure.lang ExceptionInfo)
           (com.google.protobuf NullValue)
           (dev.cel.common CelAbstractSyntaxTree CelSource)
           (dev.cel.common.ast CelExprFactory)
           (dev.cel.common CelFunctionDecl CelOverloadDecl)
           (dev.cel.common.types CelType MapType SimpleType)
           (dev.cel.compiler CelCompiler CelCompilerFactory)
           (dev.cel.parser CelStandardMacro)
           (dev.cel.runtime CelFunctionOverload CelRuntime CelRuntime$CelFunctionBinding CelRuntimeFactory)
           (java.time Instant)
           (java.util Date HashMap)))

(defn throw-not-supported! [reason]
  (throw (ex-info "not-supported" {::not-supported reason})))

;; ---------
;; CEL AST building

(def ^:private ^CelSource cel-source
  (-> (CelSource/newBuilder "<instaql-topic>")
      (.build)))

;; ---------
;; form->ast!

(defn- normalize-date-value [v]
  (.toEpochMilli ^Instant (triple-model/parse-date-value v)))

(defn- normalize-date-literal! [x]
  (try
    (normalize-date-value x)
    (catch Throwable t
      (throw-not-supported! [:invalid-date-literal {:value x :message (.getMessage t)}]))))

(defn- single-cond->cel-expr!
  [{:keys [etype attrs]} {:keys [cond-data]}]
  (let [{:keys [path v]} cond-data
        [v-type v-data] v]
    (cond
      (> (count path) 1)
      (throw-not-supported! [:multi-part-path])

      (and (= v-type :args-map) (contains? v-data :$isNull))
      (cond+
       :let [label (first path)
             rev-attr (attr-model/seek-by-rev-ident-name [etype label] attrs)]

       rev-attr  (throw-not-supported! [:reverse-attribute])

       :let [{:keys [id cardinality] :as fwd-attr} (attr-model/seek-by-fwd-ident-name [etype label] attrs)]

       (not fwd-attr) (throw-not-supported! [:unknown-attribute])

       (not= :one cardinality) (throw-not-supported! [:cardinality-many])

       :else
       (if (:$isNull v-data)
         (b/= (b/get-in 'entity ["attrs" (str id)]) nil)
         (b/not= (b/get-in 'entity ["attrs" (str id)]) nil)))

      (not= v-type :value)
      (throw-not-supported! [:complex-value-type])

      :else
      (cond+
       :let [label (first path)
             rev-attr (attr-model/seek-by-rev-ident-name [etype label] attrs)]

       rev-attr (throw-not-supported! [:reverse-attribute])

       :let [{:keys [id cardinality] :as fwd-attr} (attr-model/seek-by-fwd-ident-name [etype label] attrs)]

       (not fwd-attr) (throw-not-supported! [:unknown-attribute])

       (not= :one cardinality) (throw-not-supported! [:cardinality-many])

       :else
       (let [left (b/get-in 'entity ["attrs" (str id)])]
         (if (= :date (:checked-data-type fwd-attr))
           (b/call "instant_date_eq" left (normalize-date-literal! v-data))
           (b/= left v-data)))))))

(defn- where-cond->cel-expr!
  [ctx {:keys [where-cond]}]
  (let [[cond-type cond-data] where-cond]
    (case cond-type
      :cond
      (single-cond->cel-expr! ctx {:cond-data cond-data})
      (throw-not-supported! [:where-cond cond-type]))))

;; ---------
;; Child form validation
;; We don't generate CEL expressions for child form where clauses,
;; but we need to validate they don't contain patterns that would
;; reference other etypes (like dotted paths).

(defn- validate-child-form-single-cond!
  [{:keys [etype attrs]} {:keys [cond-data]}]
  (let [{:keys [path v]} cond-data
        [v-type v-data] v]
    (cond
      (> (count path) 1)
      (throw-not-supported! [:multi-part-path])

      (and (= v-type :args-map) (contains? v-data :$isNull))
      (cond+
       :let [label (first path)
             rev-attr (attr-model/seek-by-rev-ident-name [etype label] attrs)]

       rev-attr (throw-not-supported! [:reverse-attribute])

       :let [{:keys [cardinality] :as fwd-attr} (attr-model/seek-by-fwd-ident-name [etype label] attrs)]

       (not fwd-attr) (throw-not-supported! [:unknown-attribute])

       (not= :one cardinality) (throw-not-supported! [:cardinality-many])

       :else nil)

      (not= v-type :value)
      (throw-not-supported! [:complex-value-type])

      :else
      (cond+
       :let [label (first path)
             rev-attr (attr-model/seek-by-rev-ident-name [etype label] attrs)]

       rev-attr (throw-not-supported! [:reverse-attribute])

       :let [{:keys [cardinality] :as fwd-attr} (attr-model/seek-by-fwd-ident-name [etype label] attrs)]

       (not fwd-attr) (throw-not-supported! [:unknown-attribute])

       (not= :one cardinality) (throw-not-supported! [:cardinality-many])

       :else nil))))

(defn- validate-child-form-where-cond!
  [ctx {:keys [where-cond]}]
  (let [[cond-type cond-data] where-cond]
    (case cond-type
      :cond
      (validate-child-form-single-cond! ctx {:cond-data cond-data})
      (throw-not-supported! [:where-cond cond-type]))))

(defn- validate-child-form-where!
  [{:keys [attrs]} {:keys [etype option-map child-forms]}]
  (let [{:keys [where-conds]} option-map]
    (doseq [where-cond where-conds]
      (validate-child-form-where-cond!
       {:etype etype :attrs attrs}
       {:where-cond where-cond}))
    (doseq [child-form child-forms]
      (validate-child-form-where! {:attrs attrs} child-form))))

(defn- top-form->cel-expr!
  [{:keys [attrs]} {:keys [etype option-map]}]
  (let [{:keys [where-conds]} option-map
        etype-check (b/= (b/get 'entity "etype") etype)
        attr-checks (mapv (fn [where-cond]
                            (where-cond->cel-expr!
                             {:etype etype
                              :attrs attrs}
                             {:where-cond where-cond}))
                          where-conds)]
    (apply b/and etype-check attr-checks)))

(defn- child-form->cel-expr!
  [{:keys [attrs]} {:keys [etype child-forms] :as form}]
  (validate-child-form-where! {:attrs attrs} form)
  (let [etype-check (b/= (b/get 'entity "etype") etype)]
    (apply b/or etype-check (map (partial child-form->cel-expr! {:attrs attrs}) child-forms))))

(defn- form->ast! [ctx {:keys [child-forms] :as form}]
  (let [top-expr (top-form->cel-expr! ctx form)]
    (apply b/or top-expr (map (partial child-form->cel-expr! ctx) child-forms))))

(defn- forms->ast!
  ^CelAbstractSyntaxTree [ctx forms]
  (b/with-cel-factory (CelExprFactory/newInstance)
    (let [exprs (mapv (partial form->ast! ctx) forms)]
      (CelAbstractSyntaxTree/newParsedAst (apply b/or exprs) cel-source))))

;; ------
;; Compiler and Runtime

(def ^MapType entity-type (MapType/create SimpleType/STRING SimpleType/DYN))

(def ^:private ^CelFunctionDecl instant-date-eq-fn-decl
  (CelFunctionDecl/newFunctionDeclaration
   "instant_date_eq"
   (into-array
    CelOverloadDecl
    [(CelOverloadDecl/newGlobalOverload
      "_instant_date_eq_dyn_int"
      SimpleType/BOOL
      (into-array CelType [SimpleType/DYN SimpleType/INT]))])))

(def ^:private ^CelRuntime$CelFunctionBinding instant-date-eq-fn-binding
  (CelRuntime$CelFunctionBinding/from
   "_instant_date_eq_dyn_int"
   [Object Long]
   (reify CelFunctionOverload
     (apply [_this args]
       (let [[x ^Long epoch-millis] args
             epoch-millis (long epoch-millis)]
         (cond
           (= x NullValue/NULL_VALUE)
           false

           (nil? x)
           false

           (instance? Instant x)
           (= (.toEpochMilli ^Instant x) epoch-millis)

           (instance? Date x)
           (= (.getTime ^Date x) epoch-millis)

           (string? x)
           (= (normalize-date-value x) epoch-millis)

           (instance? Number x)
           (= (.longValue ^Number x) epoch-millis)

           :else
           (throw (ex-info "Unsupported date conversion" {::args args}))))))))

(def ^:private ^CelCompiler instaql-topic-cel-compiler
  (-> (CelCompilerFactory/standardCelCompilerBuilder)
      (.addVar "entity" entity-type)
      (.addFunctionDeclarations (into-array CelFunctionDecl [instant-date-eq-fn-decl]))
      (.setStandardMacros CelStandardMacro/STANDARD_MACROS)
      (.build)))

(def ^:private ^CelRuntime instaql-topic-cel-runtime
  (-> (CelRuntimeFactory/standardCelRuntimeBuilder)
      (.addFunctionBindings (into-array CelRuntime$CelFunctionBinding [instant-date-eq-fn-binding]))
      (.build)))

(defn eval-topic-program [program entity]
  (let [bindings (HashMap.)
        _ (.put bindings "entity" (cel/->CelMap entity))]
    (cel/eval-program-with-bindings program bindings)))

;; ------
;; instaql-topic

(defn- instaql-topic* [ctx form]
  (let [parsed-ast (forms->ast! ctx form)
        checked-ast (.getAst (.check instaql-topic-cel-compiler parsed-ast))
        cel-program (.createProgram instaql-topic-cel-runtime checked-ast)]
    {:ast checked-ast
     :program (fn [entity]
                (try
                  (eval-topic-program cel-program entity)
                  (catch Throwable e
                    (tracer/record-exception-span! e {:name "instaql-topic/runtime-error"})
                    true)))}))

(defn instaql-topic [ctx forms]
  (try
    (instaql-topic* ctx forms)
    (catch ExceptionInfo e
      (if-let [not-supported (::not-supported (ex-data e))]
        {:not-supported not-supported}
        (throw e)))))
