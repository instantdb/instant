(ns instant.db.cel-builder
  "DSL for building CEL AST expressions.

   Usage:
     (require '[instant.db.cel-builder :as b])

     (b/with-cel-factory (CelExprFactory/newInstance)
       (b/and
         (b/eq (b/get-in 'entity \"etype\") \"users\")
         (b/eq (b/get-in 'entity \"attrs\" aid) value)))"
  (:refer-clojure :exclude [get get-in and not=])
  (:import (com.google.protobuf NullValue)
           (dev.cel.common.ast CelConstant CelExpr CelExprFactory)
           (dev.cel.parser Operator)))

(set! *warn-on-reflection* true)

(def ^:dynamic ^CelExprFactory *factory* nil)

(defmacro with-cel-factory [factory & body]
  `(binding [*factory* ~factory]
     ~@body))

(defn cel-expr
  "Coerce x to CelExpr - pass through if already CelExpr, otherwise convert"
  ^CelExpr [x]
  (cond
    (instance? CelExpr x) x
    (symbol? x) (.newIdentifier *factory* (name x))
    (nil? x) (.newConstant *factory* (CelConstant/ofValue NullValue/NULL_VALUE))
    (string? x) (.newStringLiteral *factory* ^String x)
    (int? x) (.newIntLiteral *factory* (long x))
    (float? x) (.newDoubleLiteral *factory* (double x))
    (boolean? x) (.newBoolLiteral *factory* (boolean x))
    (uuid? x) (.newStringLiteral *factory* (str x))
    :else (throw (ex-info "Unsupported value type for CEL" {:value x :type (type x)}))))

(defn get
  "Build obj[key] index expression"
  ^CelExpr [obj key]
  (.newGlobalCall *factory*
                  (.getFunction Operator/INDEX)
                  ^CelExpr/1 (into-array CelExpr [(cel-expr obj) (cel-expr key)])))

(defn eq
  "Build a == b expression"
  ^CelExpr [a b]
  (.newGlobalCall *factory*
                  (.getFunction Operator/EQUALS)
                  ^CelExpr/1 (into-array CelExpr [(cel-expr a) (cel-expr b)])))

(defn not=
  "Build a != b expression"
  ^CelExpr [a b]
  (.newGlobalCall *factory*
                  (.getFunction Operator/NOT_EQUALS)
                  ^CelExpr/1 (into-array CelExpr [(cel-expr a) (cel-expr b)])))

(defn and
  "Build (a && b && c && ...) from expressions"
  ^CelExpr [& exprs]
  (let [cel-exprs (map cel-expr exprs)]
    (reduce (fn [^CelExpr acc ^CelExpr expr]
              (.newGlobalCall *factory*
                              (.getFunction Operator/LOGICAL_AND)
                              ^CelExpr/1 (into-array CelExpr [acc expr])))
            cel-exprs)))

(defn get-in
  "Build nested index: obj[k1][k2][k3]..."
  ^CelExpr [obj & keys]
  (reduce (fn [^CelExpr acc k]
            (get acc k))
          (cel-expr obj)
          keys))
