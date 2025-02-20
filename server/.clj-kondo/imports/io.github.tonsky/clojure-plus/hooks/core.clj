(ns ^:no-doc hooks.core
  "A clj-kondo hook to allow linting of `if+` macro."
  (:require
   [clj-kondo.hooks-api :as api]))

(defn transform-conds [cond-forms body-form]
  (if (empty? cond-forms)
    body-form
    (let [cond-form (first cond-forms)]
      (if (and (api/keyword-node? cond-form) (= :let (:k cond-form)))
        (api/list-node
          (list
            (api/token-node 'let)
            (second cond-forms)
            (transform-conds (nnext cond-forms) body-form)))
        (api/list-node
          (list
            (api/token-node 'when)
            cond-form
            (transform-conds (next cond-forms) body-form)))))))

(defn ifplus-hook [form]
  (let [[_ cond-form then-form else-form] (:children (:node form))]
    {:node
     (or
       (when (api/list-node? cond-form)
         (let [[f & conds] (:children cond-form)]
           (when (and (api/token-node? f)
                   (= 'and (:value f)))
             (api/list-node
               (list
                 (api/token-node 'or)
                 (transform-conds conds then-form)
                 else-form)))))
       (api/list-node
         (list
           (api/token-node 'if)
           cond-form
           then-form
           else-form)))}))

(defn whenplus-hook [form]
  (let [[_ cond-form & body-forms] (:children (:node form))]
    {:node
     (api/list-node
       (list
         (api/token-node 'clojure+.core/if+)
         cond-form
         (api/list-node
           (list*
             (api/token-node 'do)
             body-forms))
         (api/token-node nil)))}))

(defn condplus-hook [form]
  (let [[_ test expr & rest] (:children (:node form))
        tail (when rest
               (api/list-node
                 (list*
                   (api/token-node 'clojure+.core/cond+)
                   rest)))]
    {:node
     (cond
       (and (api/keyword-node? test) (= :do (:k test)))
       (api/list-node
         (list
           (api/token-node 'do)
           expr
           tail))

       (and (api/keyword-node? test) (= :let (:k test)))
       (api/list-node
         (list
           (api/token-node 'let)
           expr
           tail))

       (and (api/keyword-node? test) (= :some (:k test)))
       (api/list-node
         (list
           (api/token-node 'or)
           expr
           tail))

       :else
       (api/list-node
         (list
           (api/token-node 'clojure+.core/if+)
           test
           expr
           tail)))}))
