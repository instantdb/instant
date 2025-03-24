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

(defn standard-body [& body]
  (str
   "<div style='background:#f6f6f6;font-family:Helvetica,Arial,sans-serif;line-height:1.6;font-size:18px'>"
   "<div style='max-width:650px;margin:0 auto;background:white;padding:20px'>"
   (apply str body)
   "</div>"
   "</div>"))
