(ns instant.util.pg-hint-plan
  (:refer-clojure :exclude [memoize])
  (:require [honey.sql :as hsql]))

;; Expects a list of hints, e.g.
;; {:select :*
;;  :pg-hints [(index-scan :t2 :ea_index)]
;;  :from :triples}
;;
;; Can only be included once per query

(defn add-args! [^StringBuilder s args]
  (when (seq args)
    (loop [s (.append s (hsql/format-entity (first args)))
           more (next args)]
      (when more
        (recur (-> s
                   (.append " ")
                   (.append (hsql/format-entity (first more))))
               (next more))))))

(honey.sql/register-clause!
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

;; Scan method
(defn seq-scan
  "Forces sequential scan on the table."
  [tbl]
  [:'SeqScan tbl])

(defn tid-scan
  "Forces TID scan on the table."
  [tbl]
  [:'TidScan tbl])

(defn index-scan
  "Forces index scan on the table. Restricts to specified indexes if any."
  [tbl & indexes]
  (into [:'IndexScan tbl] indexes))

(defn index-only-scan
  "Forces index-only scan on the table. Restricts to specified indexes
  if any. Index scan may be used if index-only scan is not available."
  [tbl & indexes]
  (into [:'IndexOnlyScan tbl] indexes))

(defn bitmap-scan
  "Forces bitmap scan on the table. Restricts to specified indexes if any."
  [tbl & indexes]
  (into [:'BitMapScan tbl] indexes))

(defn no-seq-scan
  "Forces to not do sequential scan on the table."
  [tbl]
  [:'NoSeqScan tbl])

(defn no-tid-scan
  "Forces to not do TID scan on the table."
  [tbl]
  [:'NoTidScan tbl])

(defn no-index-scan
  "Forces to not do index scan and index-only scan on the table."
  [tbl]
  [:'NoIndexScan tbl])

(defn no-index-only-scan
  "Forces to not do index only scan on the table."
  [tbl]
  [:'NoIndexOnlyScan tbl])

(defn no-bitmap-scan
  "Forces to not do bitmap scan on the table."
  [tbl]
  [:'NoBitmapScan tbl])

;; Join Methods
(defn nest-loop
  "Forces nested loop for the joins on the tables specified."
  [& tables]
  (into [:'NestLoop] tables))

(defn hash-join
  "Forces hash join for the joins on the tables specified."
  [& tables]
  (into [:'HashJoin] tables))

(defn merge-join
  "Forces merge join for the joins on the tables specified."
  [& tables]
  (into [:'MergeJoin] tables))

(defn no-nest-loop
  "Forces to *not* do nested loop for the joins on the tables specified."
  [& tables]
  (into [:'NoNestLoop] tables))

(defn no-hash-join
  "Forces to *not* do hash join for the joins on the tables specified."
  [& tables]
  (into [:'NoHashJoin] tables))

(defn no-merge-join
  "Forces to *not* do merge join for the joins on the tables specified."
  [& tables]
  (into [:'NoMergeJoin] tables))

;; Join Order
(defn leading
  "Forces join order as specified."
  [& tables]
  (into [:'Leading] tables))

;; Behavior control on Join
(defn memoize
  "Allows the topmost join of a join among the specified tables to Memoize the inner result. Not enforced."
  [& tables]
  (into [:'Memoize] tables))

(defn no-memoize
  "Inhibits the topmost join of a join among the specified tables from Memoizing the inner result."
  [& tables]
  (into [:'NoMemoize] tables))

;; Row number correction
(defn rows
  "Corrects row number of a result of the joins on the tables specified.
   Takes a list of tables, with the last argument being the correct row number."
  [& args]
  (assert (>= (count args) 2) "rows requires at least one table and a number")
  (let [tables (butlast args)
        correction (last args)]
    (assert (number? correction) "the last arg to rows should be a number")
    (into [:'Rows] (conj (vec tables) correction))))

;; Parallel query configuration
(defn parallel
  "Enforces or inhibits parallel execution of the specified table.
   num-workers is the desired number of parallel workers (0 inhibits).
  If the third parameter is soft (default), it just changes
  max_parallel_workers_per_gather and leaves everything else to the
  planner. Hard enforces the specified number of workers.
  Optional flag ('soft' or 'hard') defaults to 'soft'."
  [tbl num-workers & [flag]]
  (let [mode (or flag :soft)]
    (assert (or (= mode :soft) (= mode :hard))
            "Parallel flag must be 'soft' or 'hard'.")
    [:'Parallel tbl num-workers mode]))

;; GUC
;; We'll wait until we can validate these params before setting them
#_(defn set-guc
    "Sets GUC parameter to the value defined while planner is running."
    [param value]
    [:'Set param value])
