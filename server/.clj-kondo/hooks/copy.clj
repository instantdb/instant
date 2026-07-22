(ns hooks.copy
  (:require [clj-kondo.hooks-api :as api]))

(defn def-construct-row-fn [{:keys [node]}]
  (let [[n-node] (rest (:children node))
        n (api/sexpr n-node)
        row-fn (api/token-node 'row-fn)
        field-decoders (api/token-node (if (zero? n)
                                         '_field-decoders
                                         'field-decoders))
        bb (api/token-node (if (zero? n) '_bb 'bb))
        decode-args (map (fn [i]
                           (api/list-node
                            (list (api/list-node
                                   (list field-decoders
                                         (api/token-node i)))
                                  bb)))
                         (range n))
        new-node (api/list-node
                  (list
                   (api/token-node 'defn)
                   (api/token-node (symbol (str "construct-row-fn-" n)))
                   (api/vector-node [row-fn field-decoders])
                   (api/list-node
                    (list
                     (api/token-node 'fn)
                     (api/vector-node [bb])
                     (api/list-node
                      (concat [row-fn] decode-args))))))]
    {:node new-node}))
