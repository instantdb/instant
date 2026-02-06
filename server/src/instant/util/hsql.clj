(ns instant.util.hsql
  (:require clojure.string
            [honey.sql :as hsql]))

;; ------------------------
;; merge-into custom clause

;; :merge-into

(defn format-matched-cond [expr]
  (let [[sql & params] (honey.sql/format-expr expr)]
    (when-not (clojure.string/blank? sql)
      (into [(str "AND " sql)] params))))

(defn matched-merge-action? [x]
  (case x
    :do-nothing :do-nothing
    :delete :delete
    (and (map? x)
         (or (:update x)
             (:insert x)))))

(defn format-matched-merge-action [x]
  (case x
    :do-nothing ["DO NOTHING"]
    :delete ["DELETE"]
    (cond (:update x)
          (let [[sql & params] (honey.sql/format-dsl (:update x))]
            (into [(str "UPDATE " sql)] params))

          (:insert x)
          (let [[sql & params] (honey.sql/format-dsl (:insert x))]
            (into [(str "INSERT " sql)] params)))))

(defn matched-cases [exp]
  (cond
    ;; just a single action with no condition
    (matched-merge-action? exp)
    [exp]

    ;; single action with condition
    (and (vector? exp)
         (= 2 (count exp))
         (not (vector? (first exp)))
         (not (matched-merge-action? (first exp)))
         (matched-merge-action? (second exp)))
    [exp]

    ;; A list of condition+action
    (vector? exp)
    exp

    :else
    (throw (Exception. "Unknown match clauses for :when-matched/:when-not-matched"))))

(honey.sql/register-clause!
 :when-not-matched
 (fn [_clause exp]
   (reduce (fn [[sql & params] expr]
             (if (matched-merge-action? expr)
               (let [[expr-sql & expr-params] (format-matched-merge-action expr)]
                 (into [(str sql " WHEN NOT MATCHED THEN " expr-sql)]
                       (into params expr-params)))
               (do
                 (assert (and (vector? expr)
                              (matched-merge-action? (second expr)))
                         "Invalid match clause for :when-not-matched")
                 (let [[cond-expr action-expr] expr
                       [case-sql & case-params] (format-matched-cond cond-expr)
                       [expr-sql & expr-params] (format-matched-merge-action action-expr)]
                   (into [(str sql " WHEN NOT MATCHED " case-sql " THEN " expr-sql)]
                         (concat params case-params expr-params))))

               ))
           [""]
           (matched-cases exp)))
 ;; Get behind of :using
 :join-by)

(honey.sql/register-clause!
 :when-matched
 (fn [_clause exp]
   (reduce (fn [[sql & params] expr]
             (if (matched-merge-action? expr)
               (let [[expr-sql & expr-params] (format-matched-merge-action expr)]
                 (into [(str sql " WHEN MATCHED THEN " expr-sql)]
                       (into params expr-params)))
               (do
                 (assert (and (vector? expr)
                              (matched-merge-action? (second expr)))
                         "Invalid match clause for :when-matched")
                 (let [[cond-expr action-expr] expr
                       [case-sql & case-params] (format-matched-cond cond-expr)
                       [expr-sql & expr-params] (format-matched-merge-action action-expr)]
                   (into [(str sql " WHEN MATCHED " case-sql " THEN " expr-sql)]
                         (concat params case-params expr-params))))

               ))
           [""]
           (matched-cases exp)))
 :when-not-matched)

(honey.sql/register-clause!
 :on
 (fn [_clause expr]
   (let [[sql & params] (honey.sql/format-expr expr)]
     (into [(str "ON " sql)] params)))
 :when-matched)

(honey.sql/register-clause!
 :merge-into
 (fn [_clause tbl]
   [(str "MERGE INTO " (honey.sql/format-entity tbl))])
 :using)

;; ----------------------
;; pg-hints custom clause

(defn add-args! [^StringBuilder s args]
  (when (seq args)
    (loop [s (.append s (hsql/format-entity (first args)))
           more (next args)]
      (when more
        (recur (-> s
                   (.append " ")
                   (.append (hsql/format-entity (first more))))
               (next more))))))

;; pg-hints expects a list of hints, e.g.
;; {:select :*
;;  :pg-hints [(index-scan :t2 :ea_index)]
;;  :from :triples}
;;
;; Can only be included once per query
(hsql/register-clause!
 :pg-hints
 (fn [_clause exps]
   (if-not (seq exps)
     []
     (let [s (StringBuilder.)]
       (.append s "/*+\n")
       (doseq [[op & args] exps]
         (.append s (hsql/sql-kw op))
         (.append s \()
         (case op
           :'Rows (do (add-args! s (butlast args))
                      (.append s " #")
                      (assert (number? (last args)))
                      (.append s (last args)))


           :'Parallel (do (add-args! s (take 1 args))
                          (.append s " ")
                          (assert (number? (second args)))
                          (.append s (second args))
                          (.append s " ")
                          (.append s (case (last args)
                                       :soft "soft"
                                       :hard "hard")))

           (add-args! s args))
         (.append s ")\n"))
       (.append s "*/")
       [(.toString s)])))
 :raw)

;; --------------------
;; preformatted queries

(defn preformat [q]
  {:pre [(map? q)]
   ;; Ensure that we don't accidentally encode a variable
   ;; into the query. If you need to embed a constant use :inline
   ;; Bad: {:select :* :where [:= :type "my-type"]
   ;; Good: {:select :* :where [:= :type [:inline "my-type"]]}
   :post [(every? (fn [arg] (::hsql/wrapper (meta arg)))
                  (rest %))]}
  (binding [hsql/*clause-order* (deref (deref #'hsql/current-clause-order))]
    (hsql/format-dsl q nil)))

(defn formatp
  "Takes a preformatted query, generated by `preformat` and a map of
   keyword params and returns a query you can pass to sql/query.

   (let [q {:select :* :from :users :where [:= :id :?id]}
         pq (preformat q)]
     (is (= (formatp pq {:id 1})
            (hsql/format q {:params {:id 1}}))))

  Does not support any honeysql options. Only supports map-based queries.

  You must use predefined params, e.g. `[:= :id :?id]` not `[:= :id 1]`"
  [preformatted-query params]
  (binding [hsql/*params* params]
    (mapv #(#'hsql/unwrap % {}) preformatted-query)))
