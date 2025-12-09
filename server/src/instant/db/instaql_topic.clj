(ns instant.db.instaql-topic
  (:require [instant.db.cel :as cel]
            [instant.db.model.attr :as attr-model]
            [clojure+.core :as clojure+])
  (:import (clojure.lang ExceptionInfo)
           (com.google.protobuf NullValue)
           (dev.cel.common CelAbstractSyntaxTree CelSource)
           (dev.cel.common.ast CelConstant CelExprFactory CelExpr)
           (dev.cel.common.types MapType SimpleType)
           (dev.cel.compiler CelCompiler CelCompilerFactory)
           (dev.cel.parser CelStandardMacro Operator)
           (dev.cel.runtime CelRuntime CelRuntimeFactory)
           (java.util HashMap)))

(defn throw-not-supported! [reason]
  (throw (ex-info "not-supported" {::not-supported reason})))

;; ---------
;; CEL AST building helpers

(def ^:private ^CelSource cel-source
  (-> (CelSource/newBuilder "<instaql-topic>")
      (.build)))

(defn- index-expr
  "Build entity[key] expression"
  ^CelExpr [^CelExprFactory factory ^CelExpr obj ^CelExpr key]
  (.newGlobalCall factory
                  (.getFunction Operator/INDEX)
                  ^CelExpr/1 (into-array CelExpr [obj key])))

(defn- eq-expr
  "Build a == b expression"
  ^CelExpr [^CelExprFactory factory ^CelExpr a ^CelExpr b]
  (.newGlobalCall factory
                  (.getFunction Operator/EQUALS)
                  ^CelExpr/1 (into-array CelExpr [a b])))

(defn- neq-expr
  "Build a != b expression"
  ^CelExpr [^CelExprFactory factory ^CelExpr a ^CelExpr b]
  (.newGlobalCall factory
                  (.getFunction Operator/NOT_EQUALS)
                  ^CelExpr/1 (into-array CelExpr [a b])))

(defn- and-expr
  "Build a && b expression"
  ^CelExpr [^CelExprFactory factory ^CelExpr a ^CelExpr b]
  (.newGlobalCall factory
                  (.getFunction Operator/LOGICAL_AND)
                  ^CelExpr/1 (into-array CelExpr [a b])))

(defn- and-exprs
  "Build (a && b && c && ...) from a sequence of expressions"
  ^CelExpr [^CelExprFactory factory exprs]
  (reduce (fn [^CelExpr acc ^CelExpr expr]
            (and-expr factory acc expr))
          exprs))

(defn- null-expr
  "Build a null literal expression"
  ^CelExpr [^CelExprFactory factory]
  (.newConstant factory (CelConstant/ofValue NullValue/NULL_VALUE)))

(defn- value->cel-expr
  "Convert a Clojure value to a CEL expression"
  ^CelExpr [^CelExprFactory factory v]
  (cond
    (nil? v) (null-expr factory)
    (string? v) (.newStringLiteral factory v)
    (int? v) (.newIntLiteral factory (long v))
    (float? v) (.newDoubleLiteral factory (double v))
    (boolean? v) (.newBoolLiteral factory v)
    (uuid? v) (.newStringLiteral factory (str v))
    :else (throw (ex-info "Unsupported value type for CEL" {:value v :type (type v)}))))

(defn- entity-etype-expr
  "Build entity[\"etype\"] expression"
  ^CelExpr [^CelExprFactory factory]
  (index-expr factory
              (.newIdentifier factory "entity")
              (.newStringLiteral factory "etype")))

(defn- entity-attr-expr
  "Build entity[\"attrs\"][aid] expression"
  ^CelExpr [^CelExprFactory factory aid]
  (index-expr factory
              (index-expr factory
                          (.newIdentifier factory "entity")
                          (.newStringLiteral factory "attrs"))
              (.newStringLiteral factory (str aid))))

(defn- eq-etype-cel-expr
  "Build entity[\"etype\"] == etype expression"
  ^CelExpr [^CelExprFactory factory ^String etype]
  (eq-expr factory
           (entity-etype-expr factory)
           (.newStringLiteral factory etype)))

(defn- eq-attr-cel-expr
  "Build entity[\"attrs\"][aid] == value expression"
  ^CelExpr [^CelExprFactory factory aid v]
  (eq-expr factory
           (entity-attr-expr factory aid)
           (value->cel-expr factory v)))

(defn- is-null-attr-cel-expr
  "Build entity[\"attrs\"][aid] == null expression for $isNull: true
   or entity[\"attrs\"][aid] != null expression for $isNull: false"
  ^CelExpr [^CelExprFactory factory aid is-null?]
  (if is-null?
    (eq-expr factory
             (entity-attr-expr factory aid)
             (null-expr factory))
    (neq-expr factory
              (entity-attr-expr factory aid)
              (null-expr factory))))

;; ---------
;; form->ast!

(defn- single-cond->cel-expr!
  ^CelExpr [^CelExprFactory factory {:keys [etype attrs]} {:keys [cond-data]}]
  (let [{:keys [path v]} cond-data
        [v-type v-data] v]
    (cond
      (> (count path) 1)
      (throw-not-supported! [:multi-part-path])

      (and (= v-type :args-map) (contains? v-data :$isNull))
      (clojure+/cond+
       :let [label (first path)
             rev-attr (attr-model/seek-by-rev-ident-name [etype label] attrs)]

       rev-attr  (throw-not-supported! [:reverse-attribute])

       :let [{:keys [id cardinality] :as fwd-attr} (attr-model/seek-by-fwd-ident-name [etype label] attrs)]

       (not fwd-attr) (throw-not-supported! [:unknown-attribute])

       (not= :one cardinality) (throw-not-supported! [:cardinality-many])

       :else
       (is-null-attr-cel-expr factory id (:$isNull v-data)))

      (not= v-type :value)
      (throw-not-supported! [:complex-value-type])

      :else
      (let [label (first path)
            {:keys [id] :as attr} (attr-model/seek-by-fwd-ident-name [etype label] attrs)]
        (if-not attr
          (throw-not-supported! [:unknown-attribute])
          (eq-attr-cel-expr factory id v-data))))))

(defn- where-cond->cel-expr!
  ^CelExpr [^CelExprFactory factory ctx {:keys [where-cond]}]
  (let [[cond-type cond-data] where-cond]
    (case cond-type
      :cond
      (single-cond->cel-expr! factory ctx {:cond-data cond-data})
      (throw-not-supported! [:where-cond cond-type]))))

(defn- form->ast!
  "Convert an InstaQL form directly to a CEL AST"
  ^CelAbstractSyntaxTree [{:keys [attrs]} {etype :k :keys [option-map child-forms]}]
  (if (seq child-forms)
    (throw-not-supported! [:child-forms])
    (let [factory (CelExprFactory/newInstance)
          {:keys [where-conds]} option-map
          etype-check (eq-etype-cel-expr factory etype)
          attr-checks (mapv (fn [where-cond]
                              (where-cond->cel-expr!
                               factory
                               {:etype etype
                                :attrs attrs}
                               {:where-cond where-cond}))
                            where-conds)
          all-checks (cons etype-check attr-checks)
          combined-expr (and-exprs factory all-checks)]
      (CelAbstractSyntaxTree/newParsedAst combined-expr cel-source))))

;; ------
;; Compiler and Runtime

(def ^MapType entity-type (MapType/create SimpleType/STRING SimpleType/DYN))

(def ^:private ^CelCompiler instaql-topic-cel-compiler
  (-> (CelCompilerFactory/standardCelCompilerBuilder)
      (.addVar "entity" entity-type)
      (.setStandardMacros CelStandardMacro/STANDARD_MACROS)
      (.build)))

(def ^:private ^CelRuntime instaql-topic-cel-runtime
  (-> (CelRuntimeFactory/standardCelRuntimeBuilder)
      (.build)))

(defn eval-topic-program [program entity]
  (let [bindings (HashMap.)
        _ (.put bindings "entity" (cel/->CelMap entity))]
    (cel/eval-program-with-bindings program bindings)))

;; ------
;; instaql-topic

(defn- instaql-topic* [ctx form]
  (let [parsed-ast (form->ast! ctx form)
        checked-ast (.getAst (.check instaql-topic-cel-compiler parsed-ast))
        cel-program (.createProgram instaql-topic-cel-runtime checked-ast)]
    {:ast checked-ast
     :program (fn [entity]
                (eval-topic-program cel-program entity))}))

(defn instaql-topic [ctx form]
  (try
    (instaql-topic* ctx form)
    (catch ExceptionInfo e
      (if-let [not-supported (::not-supported (ex-data e))]
        {:not-supported not-supported}
        (throw e)))))
