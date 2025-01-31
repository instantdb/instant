(ns hooks.with-prod-conn
  (:require [clj-kondo.hooks-api :as api]))

(defn with-prod-conn
  [{:keys [node]}]
  (let [[binding-vec & body] (rest (:children node))
        conn-sym-node (first (:children binding-vec))
        new-node
        (api/list-node
         (list*
          (api/token-node 'clojure.core/let)
          (api/vector-node
           [conn-sym-node
            (api/token-node :dummy-v)])
          body))]
    {:node new-node}))
