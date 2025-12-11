(ns instant.db.cel-builder
  (:refer-clojure :exclude [get get-in and or = not=])
  (:import (com.google.protobuf NullValue)
           (dev.cel.common.ast CelConstant CelExpr CelExprFactory)
           (dev.cel.parser Operator)))

(set! *warn-on-reflection* true)

(def ^:dynamic ^CelExprFactory *factory* nil)

(defmacro with-cel-factory [factory & body]
  `(binding [*factory* ~factory]
     ~@body))

(defprotocol ToCelExpr
  (->cel-expr [x factory]))

(extend-protocol ToCelExpr
  CelExpr
  (->cel-expr [x _factory] x)

  clojure.lang.Symbol
  (->cel-expr [x factory] (.newIdentifier ^CelExprFactory factory (name x)))

  nil
  (->cel-expr [_ factory] (.newConstant ^CelExprFactory factory (CelConstant/ofValue NullValue/NULL_VALUE)))

  String
  (->cel-expr [x factory] (.newStringLiteral ^CelExprFactory factory x))

  Long
  (->cel-expr [x factory] (.newIntLiteral ^CelExprFactory factory x))

  Integer
  (->cel-expr [x factory] (.newIntLiteral ^CelExprFactory factory (long x)))

  Double
  (->cel-expr [x factory] (.newDoubleLiteral ^CelExprFactory factory x))

  Float
  (->cel-expr [x factory] (.newDoubleLiteral ^CelExprFactory factory (double x)))

  Boolean
  (->cel-expr [x factory] (.newBoolLiteral ^CelExprFactory factory x))

  java.util.UUID
  (->cel-expr [x factory] (.newStringLiteral ^CelExprFactory factory (str x))))

(defn get
  "Build obj[key] index expression"
  ^CelExpr [obj key]
  (.newGlobalCall *factory*
                  (.getFunction Operator/INDEX)
                  ^CelExpr/1
                  (into-array CelExpr [(->cel-expr obj *factory*)
                                       (->cel-expr key *factory*)])))

(defn =
  "Build a == b expression"
  ^CelExpr [a b]
  (.newGlobalCall *factory*
                  (.getFunction Operator/EQUALS)
                  ^CelExpr/1
                  (into-array CelExpr [(->cel-expr a *factory*)
                                       (->cel-expr b *factory*)])))

(defn not=
  "Build a != b expression"
  ^CelExpr [a b]
  (.newGlobalCall *factory*
                  (.getFunction Operator/NOT_EQUALS)
                  ^CelExpr/1
                  (into-array CelExpr [(->cel-expr a *factory*)
                                       (->cel-expr b *factory*)])))

(defn and
  "Build (a && b && c && ...) from expressions.
   Returns true for 0 args, unwraps single arg."
  ^CelExpr [& exprs]
  (case (count exprs)
    0 (->cel-expr true *factory*)
    1 (->cel-expr (first exprs) *factory*)
    (let [cel-exprs (map #(->cel-expr % *factory*) exprs)]
      (reduce (fn [^CelExpr acc ^CelExpr expr]
                (.newGlobalCall *factory*
                                (.getFunction Operator/LOGICAL_AND)
                                ^CelExpr/1
                                (into-array CelExpr [acc expr])))
              cel-exprs))))

(defn or
  "Build (a || b || c || ...) from expressions.
   Returns false for 0 args, unwraps single arg."
  ^CelExpr [& exprs]
  (case (count exprs)
    0 (->cel-expr false *factory*)
    1 (->cel-expr (first exprs) *factory*)
    (let [cel-exprs (map #(->cel-expr % *factory*) exprs)]
      (reduce (fn [^CelExpr acc ^CelExpr expr]
                (.newGlobalCall *factory*
                                (.getFunction Operator/LOGICAL_OR)
                                ^CelExpr/1
                                (into-array CelExpr [acc expr])))
              cel-exprs))))

(defn get-in
  "Build nested index: obj[k1][k2][k3]..."
  ^CelExpr [obj ks]
  (reduce (fn [^CelExpr acc k]
            (get acc k))
          (->cel-expr obj *factory*)
          ks))

(defn call
  "Build a function call: fn-name(arg1, arg2, ...)"
  ^CelExpr [fn-name & args]
  (.newGlobalCall *factory*
                  ^String fn-name
                  ^"[Ldev.cel.common.ast.CelExpr;"
                  (into-array CelExpr (map #(->cel-expr % *factory*) args))))
