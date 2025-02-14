(ns hooks.with-indexing-job-queue
  (:require [clj-kondo.hooks-api :as api]))

(defn with-indexing-job-queue
  [{:keys [node]}]
  (let [[binding-var & body] (rest (:children node))
        job-queue-sym-node binding-var
        new-node
        (api/list-node
         (list*
          (api/token-node 'clojure.core/let)
          (api/vector-node
           [job-queue-sym-node
            (api/token-node :dummy-v)])
          body))]
    {:node new-node}))
