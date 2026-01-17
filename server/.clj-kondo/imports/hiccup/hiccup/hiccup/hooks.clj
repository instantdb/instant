(ns hiccup.hooks
  (:require [clj-kondo.hooks-api :as api]
            [clojure.set :as set]))

;; See https://github.com/clj-kondo/clj-kondo/blob/master/doc/hooks.md

(defn- parse-defn [elems]
  (let [[fhead fbody] (split-with #(not (or (api/vector-node? %)
                                            (api/list-node? %)))
                                  elems)
        arities (if (api/vector-node? (first fbody))
                  (list (api/list-node fbody))
                  fbody)]
    [fhead arities]))

(defn- count-args [arity]
  (let [args (first (api/sexpr arity))]
    (if (= '& (fnext (reverse args)))
      true ; unbounded args
      (count args))))

(defn- dummy-arity [arg-count]
  (api/list-node
   (list
    (api/vector-node
     (vec (repeat arg-count (api/token-node '_)))))))

(defn defelem [{:keys [node]}]
  (let [[_ & rest] (:children node)
        [fhead arities] (parse-defn rest)
        arg-counts (set (filter number? (map count-args arities)))
        dummy-arg-counts (set/difference (set (map inc arg-counts)) arg-counts)
        dummy-arities (for [n dummy-arg-counts] (dummy-arity n))]
    {:node
     (api/list-node
      (list*
       (api/token-node 'clojure.core/defn)
       (concat fhead arities dummy-arities)))}))
