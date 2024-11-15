(ns hooks.defsql
  (:require [clj-kondo.hooks-api :as api]))


(defn defsql [{:keys [node]}]
  (let [[name query-fn] (rest (:children node))
        conn-token (api/token-node 'conn)
        query-token (api/token-node 'query)
        tag-token (api/token-node '_tag)
        new-node (api/list-node
                  (list
                   (api/token-node 'defn)
                   name
                   (api/list-node
                    (list
                     (api/vector-node [conn-token query-token])
                     (api/list-node (list query-fn conn-token query-token))))
                   (api/list-node
                    (list
                     (api/vector-node [tag-token conn-token query-token])
                     (api/list-node (list query-fn conn-token query-token))))))]
    {:node new-node}))
