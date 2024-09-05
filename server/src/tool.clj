(ns tool
  "Handy functions to use when you're in the REPL. 
   
   This is required in the `core` namespace, so you can use it anywhere. 

   The most popular: 
     (tool/def-locals)
     (tool/copy) 
     (tool/hsql-pretty ...) and more!"
  (:require
   [clojure.string :as str]
   [honey.sql :as hsql]
   [portal.api :as p])
  (:import
   (com.github.vertical_blank.sqlformatter SqlFormatter)
   (java.awt Toolkit)
   (java.awt.datatransfer StringSelection)))

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

(defn unsafe-sql-format-query
  "Use with caution: this inlines parameters in the query, so it could
   be used with sql injection.
   Useful for running queries in psql"
  [[q & params]]
  (let [idx (atom 0)]
    (sql-pretty
     (clojure.string/replace q
                             #"\?"
                             (fn [_] (let [i @idx
                                           v (nth params i)]
                                       (swap! idx inc)
                                       (str (if (int? v)
                                              (format "%s" v)
                                              (format "'%s'" v))
                                            (if (uuid? v)
                                              "::uuid"
                                              ""))))))))

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
  "Stringifies the argument and copies it to the clipboard."
  [x]
  (.. Toolkit
      (getDefaultToolkit)
      (getSystemClipboard)
      (setContents (StringSelection. (str x)) nil)))

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

(defn start-portal!
  "Lets you inspect data using Portal.

   (start-portal!)
   ;; all tap> calls will be sent to portal
   (tap> @instant.reactive.store/store-conn)

   For a guide, see:
   https://www.youtube.com/watch?v=Tj-iyDo3bq0"
  []
  (def portal (p/open))
  (add-tap #'p/submit))

(comment
  (start-portal!)
  (tap> {:hello [1 2 3]}))
