(ns instant.db.instaql-topic
  (:require [instant.db.cel :as cel]
            [instant.db.model.attr :as attr-model])
  (:import (clojure.lang ExceptionInfo)
           (dev.cel.common CelAbstractSyntaxTree CelSource)
           (dev.cel.common.ast CelExprFactory CelExpr)
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
  ^CelExpr [^CelExprFactory f ^CelExpr obj ^CelExpr key]
  (.newGlobalCall f
                  (.getFunction Operator/INDEX)
                  ^"[Ldev.cel.common.ast.CelExpr;"
                  (into-array CelExpr [obj key])))

(defn- eq-expr
  "Build a == b expression"
  ^CelExpr [^CelExprFactory f ^CelExpr a ^CelExpr b]
  (.newGlobalCall f
                  (.getFunction Operator/EQUALS)
                  ^"[Ldev.cel.common.ast.CelExpr;"
                  (into-array CelExpr [a b])))

(defn- and-expr
  "Build a && b expression"
  ^CelExpr [^CelExprFactory f ^CelExpr a ^CelExpr b]
  (.newGlobalCall f
                  (.getFunction Operator/LOGICAL_AND)
                  ^"[Ldev.cel.common.ast.CelExpr;"
                  (into-array CelExpr [a b])))

(defn- and-exprs
  "Build (a && b && c && ...) from a sequence of expressions"
  ^CelExpr [^CelExprFactory f exprs]
  (reduce (fn [^CelExpr acc ^CelExpr expr]
            (and-expr f acc expr))
          exprs))

(defn- value->cel-expr
  "Convert a Clojure value to a CEL expression"
  ^CelExpr [^CelExprFactory f v]
  (cond
    (string? v) (.newStringLiteral f v)
    (int? v) (.newIntLiteral f (long v))
    (float? v) (.newDoubleLiteral f (double v))
    (boolean? v) (.newBoolLiteral f v)
    (uuid? v) (.newStringLiteral f (str v))
    :else (throw (ex-info "Unsupported value type for CEL" {:value v :type (type v)}))))

(defn- entity-etype-expr
  "Build entity[\"etype\"] expression"
  ^CelExpr [^CelExprFactory f]
  (index-expr f
              (.newIdentifier f "entity")
              (.newStringLiteral f "etype")))

(defn- entity-attr-expr
  "Build entity[\"attrs\"][aid] expression"
  ^CelExpr [^CelExprFactory f aid]
  (index-expr f
              (index-expr f
                          (.newIdentifier f "entity")
                          (.newStringLiteral f "attrs"))
              (.newStringLiteral f (str aid))))

(defn- eq-etype-cel-expr
  "Build entity[\"etype\"] == etype expression"
  ^CelExpr [^CelExprFactory f ^String etype]
  (eq-expr f
           (entity-etype-expr f)
           (.newStringLiteral f etype)))

(defn- eq-attr-cel-expr
  "Build entity[\"attrs\"][aid] == value expression"
  ^CelExpr [^CelExprFactory f aid v]
  (eq-expr f
           (entity-attr-expr f aid)
           (value->cel-expr f v)))

;; ---------
;; form->ast!

(defn- single-cond->cel-expr!
  ^CelExpr [^CelExprFactory f {:keys [etype attrs]} {:keys [cond-data]}]
  (let [{:keys [path v]} cond-data
        [v-type v-data] v]
    (cond
      (> (count path) 1)
      (throw-not-supported! [:multi-part-path])

      (not= v-type :value)
      (throw-not-supported! [:complex-value-type])

      :else
      (let [label (first path)
            {:keys [id] :as attr} (attr-model/seek-by-fwd-ident-name [etype label] attrs)]
        (if-not attr
          (throw-not-supported! [:unknown-attribute])
          (eq-attr-cel-expr f id v-data))))))

(defn- where-cond->cel-expr!
  ^CelExpr [^CelExprFactory f ctx {:keys [where-cond]}]
  (let [[cond-type cond-data] where-cond]
    (case cond-type
      :cond
      (single-cond->cel-expr! f ctx {:cond-data cond-data})
      (throw-not-supported! [:where-cond cond-type]))))

(defn- form->ast!
  "Convert an InstaQL form directly to a CEL AST"
  ^CelAbstractSyntaxTree [{:keys [attrs]} {etype :k :keys [option-map child-forms]}]
  (if (seq child-forms)
    (throw-not-supported! [:child-forms])
    (let [f (CelExprFactory/newInstance)
          {:keys [where-conds]} option-map
          etype-check (eq-etype-cel-expr f etype)
          attr-checks (mapv (fn [where-cond]
                              (where-cond->cel-expr!
                               f
                               {:etype etype
                                :attrs attrs}
                               {:where-cond where-cond}))
                            where-conds)
          all-checks (cons etype-check attr-checks)
          combined-expr (and-exprs f all-checks)]
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
        ;; Type-check the parsed AST to get a checked AST
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
