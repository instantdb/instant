(ns instant.util.number)

(defn parse-int [s default]
  (try
    (Integer/parseInt s)
    (catch Exception _ default)))

(comment
  (parse-int "123" 0)
  (parse-int "abc" 0)
  (parse-int 123 0))
