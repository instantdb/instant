(ns instant.email-router
  (:require
   [instant.flags :as flags]
   [instant.postmark :as postmark]
   [instant.sendgrid :as sendgrid]))

(def sendgrid-froms
  {"verify@auth-pm.instantdb.com" "verify@auth-sg.instantdb.com"
   "verify@dash-pm.instantdb.com" "verify@auth-sg.instantdb.com"})

(defn send-structured! [req]
  (if (and (flags/send-with-sendgrid?)
           (contains? sendgrid-froms (-> req :from :email)))
    (sendgrid/send! (update-in req [:from :email] sendgrid-froms))
    (postmark/send-structured! req)))
