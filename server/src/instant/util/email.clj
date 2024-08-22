(ns instant.util.email
  (:require
   [clojure.string :as string]))

;; -----
;; Email 

(def email-pattern #"(?i)[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?")

(defn valid?
  [email]
  (and (string? email)
       (boolean (re-matches email-pattern email))))

(defn coerce [maybe-email]
  (let [coerced (some-> maybe-email
                        string/lower-case
                        string/trim)]
    (and coerced
         (valid? coerced)
         coerced)))

(defn concatenate-emails
  [& email-lists]
  (string/join ", " (map #(str "'" % "'") (apply concat email-lists))))

(comment (coerce "totally an email bro"))
(comment (coerce "hi@instantdb.com"))
