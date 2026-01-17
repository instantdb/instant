(ns taoensso.encore
  "I don't personally use clj-kondo, so these hooks are
  kindly authored and maintained by contributors.
  PRs very welcome! - Peter Taoussanis"
  (:require
   [clj-kondo.hooks-api :as hooks]))

(defn defalias
  [{:keys [node]}]
  (let [[sym-raw src-raw] (rest (:children node))
        src (if src-raw src-raw sym-raw)
        sym
        (if src-raw
          sym-raw
          (symbol (name (hooks/sexpr src))))]

    {:node
     (with-meta
       (hooks/list-node
         [(hooks/token-node 'def)
          (hooks/token-node (hooks/sexpr sym))
          (hooks/token-node (hooks/sexpr src))])
       (meta src))}))

(defn defn-cached
  [{:keys [node] :as x}]
  (let [[sym _opts binding-vec & body] (rest (:children node))]
    {:node
     (hooks/list-node
       (list
         (hooks/token-node 'def)
         sym
         (hooks/list-node
           (list*
             (hooks/token-node 'fn)
             binding-vec
             body))))}))
