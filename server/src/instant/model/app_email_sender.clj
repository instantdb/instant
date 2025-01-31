(ns instant.model.app-email-sender
  (:require [instant.jdbc.aurora :as aurora]
            [instant.jdbc.sql :as sql]
            [instant.postmark :as postmark]
            [instant.util.exception :as ex])
  (:import (java.util UUID)))

(defn get-by-email
  ([params] (get-by-email (aurora/conn-pool :read) params))
  ([conn {:keys [email]}]
   (sql/select-one conn
                   ["SELECT *
                     FROM app_email_senders
                     WHERE email = ?"
                    email])))

(defn put!
  ([params] (put! (aurora/conn-pool :write) params))
  ([conn {:keys [email name user-id postmark-id]}]
   (sql/execute-one!
    conn
    ["INSERT INTO
        app_email_senders
        (id, email, name, user_id, postmark_id)
      VALUES
        (?::uuid, ?, ?, ?, ?)
      ON CONFLICT (email)
      DO UPDATE SET
        name = EXCLUDED.name"
     (UUID/randomUUID) email name user-id postmark-id])))

;; https://postmarkapp.com/developer/api/overview#error-codes

(def postmark-out-of-sync-error-message "Failed to add Postmark Sender Signature because it already exists on Postmark's side but not in our DB. Need to manually fix.  Hint: Is the signature in the prod DB?")

(def postmark-public-domain-error-message "Cannot use public domain email address (e.g. gmail.com) as sender email.")

(def sender-claimed-error-message "We can't use this email address; it's already been claimed by a different user.")

(defn sync-sender!
  "Given an email and an app id, we do our best to sync to postmark. There are a few cases to consider: 
      1. The sender exists, but belongs to a different user
            a. In this case we throw
      2. The sender exists in our database, but not in postmark
            a. In this case, we try add to postmark
      3. The sender exists in postmark, but not in our database
            a. In this case, we reach an invariant. This can happen when we add a sender in development
      "
  [{:keys [app-id user-id email name]}]
  (let [sender (get-by-email {:email email})
        _ (when (and sender (not= user-id (:user_id sender)))
            (ex/throw-validation-err! :sender-user user-id [{:message sender-claimed-error-message}]))
        postmark-id (:postmark_id sender)
        postmark-sender (when sender
                          (try
                            (postmark/get-sender! {:id postmark-id})
                            (catch clojure.lang.ExceptionInfo e
                              (if (postmark/signature-not-found? (-> e ex-data :body :ErrorCode))
                                ;; continue, add the sender
                                nil
                                ;; unexpected error
                                (throw e)))))
        postmark-response (if postmark-sender
                            (postmark/edit-sender! {:id postmark-id :name name})
                            (try
                              (postmark/add-sender! {:email email :name name})
                              (catch clojure.lang.ExceptionInfo e
                                (cond
                                  ;; This is bad - it means a signature exists on Postmark's side
                                  ;; but it's ID isn't in our DB
                                  ;; Postmark doesn't allow us to lookup senders via email, only ID
                                  ;; so we need to manually address this
                                  (postmark/signature-exists? e)
                                  (throw (ex-info postmark-out-of-sync-error-message
                                                  {:type :postmark-sync-error
                                                   :message postmark-out-of-sync-error-message
                                                   :e e}))

                                  (postmark/public-domain-email? e)
                                  (ex/throw-validation-err! :sender-email email [{:message postmark-public-domain-error-message}])

                                  :else
                                  (throw e)))))
        postmark-id  (-> postmark-response :body :ID)]
    (put! {:email email
           :name name
           :app-id app-id
           :user-id user-id
           :postmark-id postmark-id})))

(comment
  (postmark/add-sender! {:email "hi@marky.fyi" :name "Marky"})
  (ex-data *e)
  (def r (postmark/list-senders! 50 0))
  (def ss (get-in r [:body :SenderSignatures]))
  (def s (first ss))
  ss
  s
  (postmark/delete-sender! {:id 4718901}))
