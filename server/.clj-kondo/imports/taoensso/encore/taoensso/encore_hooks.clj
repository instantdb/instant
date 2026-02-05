(ns taoensso.encore-hooks
  "I don't personally use clj-kondo, so these hooks are
  kindly authored and maintained by contributors.
  PRs very welcome! - Peter Taoussanis"
  (:refer-clojure :exclude [defonce])
  (:require
   [clj-kondo.hooks-api :as hooks]))

(defn defalias
  [{:keys [node]}]
  (let [[alias src-raw _attrs body] (rest (:children node))
        src (or src-raw alias)
        sym (if src-raw (hooks/sexpr alias) (symbol (name (hooks/sexpr src))))]
    {:node
     (with-meta
       (hooks/list-node
        [(hooks/token-node 'def)
         (hooks/token-node sym)
         (if body
           (hooks/list-node
            ;; use :body in the def to avoid unused import/private var warnings
            [(hooks/token-node 'or) body src])
           src)])
       (meta src))}))

(defn defaliases
  [{:keys [node]}]
  (let [alias-nodes (rest (:children node))]
    {:node
     (hooks/list-node
      (into
       [(hooks/token-node 'do)]
       (map
        (fn alias->defalias [alias-node]
          (cond
            (hooks/token-node? alias-node)
            (hooks/list-node
             [(hooks/token-node 'taoensso.encore/defalias)
              alias-node])

            (hooks/map-node? alias-node)
            (let [{:keys [src alias attrs body]} (hooks/sexpr alias-node)
                  ;; workaround as can't seem to (get) using a token-node
                  ;; and there's no update-keys (yet) in sci apparently
                  [& {:as node-as-map}] (:children alias-node)
                  {:keys [attrs body]} (zipmap (map hooks/sexpr (keys node-as-map))
                                               (vals node-as-map))]
              (hooks/list-node
               [(hooks/token-node 'taoensso.encore/defalias)
                (or alias src) (hooks/token-node src) attrs body])))))
       alias-nodes))}))

(defn defn-cached
  [{:keys [node]}]
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

(defn defonce
  [{:keys [node]}]
  ;; args = [sym doc-string? attr-map? init-expr]
  (let [[sym & args] (rest (:children node))
        [doc-string args]    (if (and (hooks/string-node? (first args)) (next args)) [(hooks/sexpr (first args)) (next  args)] [nil        args])
        [attr-map init-expr] (if (and (hooks/map-node?    (first args)) (next args)) [(hooks/sexpr (first args)) (fnext args)] [nil (first args)])

        attr-map (if doc-string (assoc attr-map :doc doc-string) attr-map)
        sym+meta (if attr-map (with-meta sym attr-map) sym)
        rewritten
        (hooks/list-node
          [(hooks/token-node 'clojure.core/defonce)
           sym+meta
           init-expr])]

    {:node rewritten}))
