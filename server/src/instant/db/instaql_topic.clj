(ns instant.db.instaql-topic
  (:require [instant.db.cel :as cel]
            [instant.db.cel-builder :as b]
            [instant.db.model.attr :as attr-model]
            [clojure+.core :as clojure+])
  (:import (clojure.lang ExceptionInfo)
           (dev.cel.common CelAbstractSyntaxTree CelSource)
           (dev.cel.common.ast CelExprFactory)
           (dev.cel.common.types MapType SimpleType)
           (dev.cel.compiler CelCompiler CelCompilerFactory)
           (dev.cel.parser CelStandardMacro)
           (dev.cel.runtime CelRuntime CelRuntimeFactory)
           (java.util HashMap)))

(defn throw-not-supported! [reason]
  (throw (ex-info "not-supported" {::not-supported reason})))

;; ---------
;; CEL AST building

(def ^:private ^CelSource cel-source
  (-> (CelSource/newBuilder "<instaql-topic>")
      (.build)))

;; ---------
;; form->ast!

(defn- single-cond->cel-expr!
  [{:keys [etype attrs]} {:keys [cond-data]}]
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
       (if (:$isNull v-data)
         (b/= (b/get-in 'entity "attrs" (str id)) nil)
         (b/not= (b/get-in 'entity "attrs" (str id)) nil)))

      (not= v-type :value)
      (throw-not-supported! [:complex-value-type])

      :else
      (clojure+/cond+
       :let [label (first path)
             rev-attr (attr-model/seek-by-rev-ident-name [etype label] attrs)]

       rev-attr (throw-not-supported! [:reverse-attribute])

       :let [{:keys [id cardinality] :as fwd-attr} (attr-model/seek-by-fwd-ident-name [etype label] attrs)]

       (not fwd-attr) (throw-not-supported! [:unknown-attribute])

       (not= :one cardinality) (throw-not-supported! [:cardinality-many])

       :else
       (b/= (b/get-in 'entity "attrs" (str id)) v-data)))))

(defn- where-cond->cel-expr!
  [ctx {:keys [where-cond]}]
  (let [[cond-type cond-data] where-cond]
    (case cond-type
      :cond
      (single-cond->cel-expr! ctx {:cond-data cond-data})
      (throw-not-supported! [:where-cond cond-type]))))

(defn- form->ast!
  "Convert an InstaQL form directly to a CEL AST"
  ^CelAbstractSyntaxTree [{:keys [attrs]} {etype :k :keys [option-map child-forms]}]
  (if (seq child-forms)
    (throw-not-supported! [:child-forms])
    (b/with-cel-factory (CelExprFactory/newInstance)
      (let [{:keys [where-conds]} option-map
            etype-check (b/= (b/get-in 'entity "etype") etype)
            attr-checks (mapv (fn [where-cond]
                                (where-cond->cel-expr!
                                 {:etype etype
                                  :attrs attrs}
                                 {:where-cond where-cond}))
                              where-conds)
            combined-expr (apply b/and etype-check attr-checks)]
        (CelAbstractSyntaxTree/newParsedAst combined-expr cel-source)))))

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
