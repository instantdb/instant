(ns instant.grab
  "A handy lib that makes sure some function only runs _once_,
  across processes and time."
  (:require
   [instant.jdbc.sql :as sql]
   [instant.jdbc.aurora :as aurora])
  (:import
   (java.time LocalDate)))

(defn- try-grab!
  "If INSERT succeeds, we'll get back a row with a single item.
   If INSERT fails, it means the key already exists, the query
   will return an empty seq."
  [conn k]
  (boolean
   (seq
    (sql/execute! conn ["INSERT INTO grabs (id)
                       VALUES (?)
                       ON CONFLICT (id)
                       DO NOTHING RETURNING id" k]))))

(defn run-once! [k f]
  (if (try-grab! (aurora/conn-pool :write) k)
    (f)
    :no-op))

(comment
  (run-once! (str (LocalDate/now)) (fn [] (println "grabbed foo"))))
