(ns tool
  "Handy functions to use when you're in the REPL.

   This is required in the `core` namespace, so you can use it anywhere.

   The most popular:
     (tool/def-locals)
     (tool/copy)
     (tool/hsql-pretty ...) and more!"
  (:require
   [clojure.pprint :as pprint]
   [clojure.string :as str]
   [clojure.walk :as walk]
   [honey.sql :as hsql]
   [portal.api :as p]
   [clj-async-profiler.core :as prof])
  (:import
   (clojure.lang Compiler TaggedLiteral)
   (com.github.vertical_blank.sqlformatter SqlFormatter)
   (java.util UUID)))

(defmacro def-locals*
  [prefix]
  (let [env# &env]
    `(do
       ~@(->> env#
              keys
              (map (fn [k]
                     (list 'def (symbol (str prefix (name k))) k)))))))

(defmacro def-locals
  "Defines all locals from wherever this is called, prefixed by a `-`.

   (defn f [a] (let [b 2]
      (def-locals)
      (+ a b)))
  (f 1)
  -a ;; => 1
  -b ;; => 2"
  []
  `(def-locals* "-"))

(defmacro def-locals!
  "Defines all locals from wherever this is called

   (defn f [a] (let [b 2]
      (def-locals)
      (+ a b)))
  (f 1)
  a ;; => 1
  b ;; => 2

  Note: be careful when using this, as it can lead you to hard to catch bugs.
  For example:

  If you call def-locals and then update the function to remove the parameter,
  you might not realize what you've done until you restart the server
  "
  []
  `(def-locals* ""))

#_{:clj-kondo/ignore [:unresolved-symbol]}
(comment
  (defn f [a]
    (let [b 2]
      (def-locals)
      (+ a b)))
  (f 1)

  -a
  -b
  (defn f! [a]
    (let [b 2]
      (def-locals!)
      (+ a b)))
  (f! 1)
  a
  b)

(defn sql-pretty [sql-str]
  (-> (SqlFormatter/of "PostgreSql")
      (.format sql-str)))

(defn hsql-pretty [x]
  (-> x
      hsql/format
      first
      sql-pretty
      println))

(comment
  (hsql-pretty
   {:with [[:foo {:select :* :from :foo}]
           [:bar {:select :* :from :bar}]]
    :select :* :from :bar}))


;; Copied from sql.clj
(defn ->pg-text-array
  "Formats as text[] in pg, i.e. {item-1, item-2, item3}"
  [col]
  (format
   "{%s}"
   (str/join
    ","
    (map (fn [s] (format "\"%s\""
                         ;; Escape quotes (but don't double esc)
                         (str/replace s #"(?<!\\)\"" "\\\"")))
         col))))

;; Copied from sql.clj
(defn ->pg-uuid-array
  "Formats as uuid[] in pg, i.e. {item-1, item-2, item3}"
  [uuids]
  (let [s (StringBuilder. "{")]
    (doseq [^UUID uuid uuids]
      (when (not= 1 (.length s))
        (.append s \,))
      (.append s (.toString uuid)))
    (.append s "}")
    (.toString s)))

(defn unsafe-sql-format-query
  "Use with caution: this inlines parameters in the query, so it could
   be used with sql injection.
   Useful for running queries in psql"
  [[q & params]]
  (let [idx (atom 0)]
    (-> q
        (clojure.string/replace #"\?"
                                (fn [_] (let [i @idx
                                              v (nth params i)]
                                          (swap! idx inc)
                                          (str (cond
                                                 (int? v) (format "%s" v)
                                                 (string? v) (format "'%s'" (-> v
                                                                                (.replace "'" "''")))
                                                 (= "uuid[]"
                                                    (-> v
                                                        meta
                                                        :pgtype)) (format "'%s'"
                                                                          (->pg-uuid-array v))

                                                 (= "text[]"
                                                    (-> v
                                                        meta
                                                        :pgtype)) (format "'%s'"
                                                                          (->pg-text-array v))
                                                 :else (format "'%s'" v))
                                               (if (uuid? v)
                                                 "::uuid"
                                                 "")))))
        sql-pretty
        ;; Fix a bug with the pretty printer where the || operator gets a space
        (.replace "| |" "||"))))

(defn unsafe-hsql-format
  "Use with caution: this inlines parameters in the query, so it could
   be used with sql injection.
   Useful for running queries in psql"
  [x]
  (unsafe-sql-format-query (hsql/format x)))

(defn req->curl [{:keys [method path params headers]}]
  (let [param-str (str/join "&" (map #(str (name (key %)) "=" (val %)) params))
        header-str (str/join " " (map #(str "-H \"" (name (key %)) ": " (val %) "\"") headers))]
    (str "curl -X " (str/upper-case (name method))
         " http://localhost:8888" path " "
         header-str
         " -d \"" param-str "\"")))

(defn copy
  "Stringifies the argument and copies it to the clipboard"
  [x]
  (let [pb (ProcessBuilder. ["pbcopy"])
        p (.start pb)
        os (.getOutputStream p)]
    (.write os (.getBytes (str x)))
    (.close os)
    (.waitFor p)
    x))

(def ^:dynamic *time-tracker* nil)

(defmacro track-time [label & body]
  `(let [start# (. System (nanoTime))
         ret# ~@body
         ms# (/ (double (- (. System (nanoTime)) start#)) 1000000.0)]
     (when *time-tracker*
       (swap! *time-tracker* (fn [tt#]
                               (let [time# (+ (get-in tt# [~label :time] 0)
                                              ms#)
                                     counts# (+ (get-in tt# [~label :counts] 0)
                                                1)
                                     avg# (/ time# counts#)]
                                 (-> tt#
                                     (assoc-in [~label :time] time#)
                                     (assoc-in [~label :counts] counts#)
                                     (assoc-in [~label :avg] avg#))))))
     ret#))

(def ^:dynamic *time-indent*
  "")

(def time-enabled?
  false)

(defmacro time* [msg & body]
  (if time-enabled?
    `(let [msg# ~msg
           t#   (System/nanoTime)
           res# (binding [*time-indent* (str "┌╴" *time-indent*)]
                  ~@body)
           dt#  (-> (System/nanoTime) (- t#) (/ 1000000.0))]
       (println (format "%s[ %8.3f ms ] %s" *time-indent* dt# msg#))
       res#)
    (cons 'do body)))

(defn start-portal!
  "Lets you inspect data using Portal.

   (start-portal!)
   ;; all tap> calls will be sent to portal
   (tap> @instant.reactive.store/store)

   For a guide, see:
   https://www.youtube.com/watch?v=Tj-iyDo3bq0"
  []
  (def portal (p/open))
  (add-tap #'p/submit))

(comment
  (start-portal!)
  (tap> {:hello [1 2 3]}))

(def ^:private p-lock
  (Object.))

(defn p-pos []
  (let [trace (->> (Thread/currentThread)
                   (.getStackTrace)
                   (seq))
        el    ^StackTraceElement (nth trace 4)]
    (str "[" (Compiler/demunge (.getClassName el)) " " (.getFileName el) ":" (.getLineNumber el) "]")))

(defn pprint [o]
  (->>
   (binding [pprint/*print-right-margin* 120]
     (with-out-str (pprint/pprint o)))
   (str/split-lines)
   (map #(str "   " %))
   (str/join "\n")
   (#(subs % 3))))

(defn p-impl [position form res]
  (let [form (walk/postwalk
              (fn [form]
                (if (and
                     (list? form)
                     (= 'tool/p-impl (first form)))
                  (TaggedLiteral/create 'p (nth form 3))
                  form))
              form)]
    (locking p-lock
      (println (str "#p " form " " position "\n=> " (pprint res))))
    res))

(defn p
  "Add #p before any form to quickly print its value to output next time
   it is evaluated. Dev only"
  [form]
  `(p-impl (p-pos) '~form ~form))

(defmacro profile [options? & body]
  `(prof/profile ~options? ~body))

(def prof-serve-ui prof/serve-ui)

(defmacro bench [& body]
  `(do
     (require 'criterium.core)
     (criterium.core/quick-bench ~@body)
     (flush)))

(defmacro with-prod-conn
  "Usage: (with-prod-conn [my-conn]
            (sql/select my-conn [\"select 1\"]))"
  [[conn-name] & body]
  `(let [cluster-id# (-> (clojure.java.io/resource "config/prod.edn")
                         slurp
                         clojure.edn/read-string
                         :database-cluster-id)
         rds-cluster-id->db-config# (requiring-resolve 'instant.aurora-config/rds-cluster-id->db-config)
         start-pool# (requiring-resolve 'instant.jdbc.aurora/start-pool)]
     (with-open [~conn-name (start-pool# 1 (rds-cluster-id->db-config# cluster-id#))]
       ~@body)))
