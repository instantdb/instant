(ns hooks.with-test-replication-slot
  (:require [clj-kondo.hooks-api :as api]))

(defn with-test-replication-slot
  [{:keys [node]}]
  (let [[binding-vec & body] (rest (:children node))
        records-sym (first (:children binding-vec))
        new-node
        (api/list-node
         (list*
          (api/token-node 'clojure.core/let)
          (api/vector-node
           [records-sym
            (api/list-node
             [(api/token-node 'clojure.core/atom)
              (api/token-node nil)])])
          body))]
    {:node new-node}))
