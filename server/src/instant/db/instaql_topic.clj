(ns instant.db.instaql-topic
  (:require [instant.db.cel :as cel]
            [clojure.string :as str]
            [instant.db.model.attr :as attr-model])
  (:import (clojure.lang ExceptionInfo)
           (dev.cel.common.types MapType SimpleType)
           (dev.cel.compiler CelCompiler CelCompilerFactory)
           (dev.cel.parser CelStandardMacro)
           (dev.cel.runtime CelRuntime CelRuntimeFactory)
           (java.util HashMap)))

(defn throw-not-supported! [reason]
  (throw (ex-info "not-supported" {::not-supported reason})))

;; --------- 
;; ->edn! 

(defn- eq-etype-expr [etype]
  (list '= (list :etype 'entity) etype))

(defn- eq-attr-expr [aid v]
  (list '= (list 'get (list :attrs 'entity) aid) v))

(defn- single-cond->edn! [{:keys [etype attrs]} {:keys [cond-data]}]
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
          (eq-attr-expr id v-data))))))

(defn- where-cond->edn! [ctx {:keys [where-cond]}]
  (let [[cond-type cond-data] where-cond]
    (case cond-type
      :cond
      (single-cond->edn! ctx {:cond-data cond-data})
      (throw-not-supported! [:where-cond cond-type]))))

(defn- ->edn!
  [{:keys [attrs]} {etype :k :keys [option-map child-forms]}]
  (if (seq child-forms)
    (throw-not-supported! [:child-forms])
    (let [{:keys [where-conds]} option-map
          checks (mapv (fn [where-cond]
                         (where-cond->edn!
                          {:etype etype
                           :attrs attrs}
                          {:where-cond where-cond}))
                       where-conds)]
      (list*
       'and
       (eq-etype-expr etype)
       checks))))

;; ------
;; edn->cel-str

(defn edn->cel-str
  [edn]
  (cond
    (string? edn) (pr-str edn)
    (number? edn) (pr-str edn)
    (boolean? edn) (pr-str edn)
    (symbol? edn) (pr-str edn)

    (nil? edn) "null"
    (keyword? edn) (pr-str (name edn))
    (uuid? edn) (pr-str (str edn))

    (seq? edn)
    (let [[op & args] edn]
      (cond
        (= op 'and)
        (str "(" (str/join " && " (map edn->cel-str args)) ")")

        (= op '=)
        (str (edn->cel-str (first args)) " == " (edn->cel-str (second args)))

        (= op 'get)
        (let [[obj k] args]
          (str (edn->cel-str obj) "[" (edn->cel-str k) "]"))

        (keyword? op)
        (str (edn->cel-str (first args)) "[" (edn->cel-str op) "]")

        :else
        (throw (ex-info "Unsupported operation" {:op op :edn edn}))))

    :else
    (throw (ex-info "Unsupported EDN expression for CEL conversion" {:edn edn}))))

;; ------
;; eval-topic-program 

(def ^MapType entity-type (MapType/create SimpleType/STRING SimpleType/DYN))

(def ^:private ^CelCompiler instaql-topic-cel-compiler
  (-> (CelCompilerFactory/standardCelCompilerBuilder)
      (.addVar "entity" entity-type)
      (.setStandardMacros CelStandardMacro/STANDARD_MACROS)
      (.build)))

(def ^:private ^CelRuntime instaql-topic-cel-runtime
  (-> (CelRuntimeFactory/standardCelRuntimeBuilder)
      (.build)))

(defn compile-cel-str [cel-str]
  (let [ast (.getAst (.compile instaql-topic-cel-compiler cel-str))
        program (.createProgram instaql-topic-cel-runtime ast)]
    program))

(defn edn->program [edn]
  (-> edn edn->cel-str compile-cel-str))

(defn eval-topic-program [program entity]
  (let [bindings (HashMap.)
        _ (.put bindings "entity" (cel/->CelMap entity))]
    (cel/eval-program-with-bindings program bindings)))

;; ------
;; instaql-topic 

(defn- instaql-topic* [ctx form]
  (let [edn (->edn! ctx form)
        cel-str (edn->cel-str edn)
        cel-program (compile-cel-str cel-str)]
    {:edn edn
     :cel-str cel-str
     :program (fn [entity]
                (eval-topic-program cel-program entity))}))

(defn instaql-topic [ctx form]
  (try
    (instaql-topic* ctx form)
    (catch ExceptionInfo e
      (if-let [not-supported (::not-supported (ex-data e))]
        {:not-supported not-supported}
        (throw e)))))

