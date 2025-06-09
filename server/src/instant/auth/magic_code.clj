(ns instant.auth.magic-code
  (:require
   [clojure.string :as string]
   [instant.jdbc.aurora :as aurora]
   [instant.model.app :as app-model]
   [instant.model.app-email-template :as app-email-template-model]
   [instant.model.app-user :as app-user-model]
   [instant.model.app-user-magic-code :as app-user-magic-code-model]
   [instant.model.app-user-refresh-token :as app-user-refresh-token-model]
   [instant.model.transaction :as transaction-model]
   [instant.postmark :as postmark]
   [instant.util.tracer :as tracer]
   [next.jdbc :as next-jdbc])
  (:import
   (java.util UUID)))

;; --------
;; Constants and Helper Functions

(def postmark-unconfirmed-sender-body-error-code 400)
(def postmark-not-found-sender-body-error-code 401)

(defn invalid-sender? [e]
  (let [code (-> e ex-data :body :ErrorCode)]
    (or (= code postmark-unconfirmed-sender-body-error-code)
        (= code postmark-not-found-sender-body-error-code))))

(defn template-replace [template params]
  (reduce
   (fn [acc [k v]]
     (string/replace acc (str "{" (name k) "}") v))
   template
   params))

(defn default-body [title code]
  (postmark/standard-body "<p><strong>Welcome,</strong></p>
        <p>
          You asked to join " title ". To complete your registration, use this
          verification code:
        </p>
        <h2 style=\"text-align: center\"><strong>" code "</strong></h2>
       <p>
         Copy and paste this into the confirmation box, and you'll be on your way.
       </p>
       <p>
         Note: This code will expire in 24 hours, and can only be used once. If you
         didn't request this code, please reply to this email.
       </p>"))

(defn magic-code-email [{:keys [user params]}]
  (let [{:keys [email]} user
        {:keys [sender-name sender-email subject body]} params]
    {:from {:name sender-name
            :email sender-email}
     :to [{:email email}]
     :subject subject
     :reply-to sender-email
     :html
     body}))

;; --------
;; Core Magic Code Logic

(defn send-magic-code!
  "Sends a magic code email to the given user.
   
   Parameters:
   - app-id: UUID of the app
   - email: email address to send to
   - opts: optional map with:
     - :conn - database connection (if in transaction)
   
   Returns: {:sent true}"
  [{:keys [app-id email conn]}]
  (let [app (app-model/get-by-id! {:id app-id})
        {user-id :id :as u} (or (app-user-model/get-by-email {:app-id app-id :email email})
                                (if conn
                                  (let [user (app-user-model/create! conn {:id (UUID/randomUUID)
                                                                           :app-id app-id
                                                                           :email email})]
                                    (transaction-model/create! conn {:app-id app-id})
                                    user)
                                  (next-jdbc/with-transaction [new-conn (aurora/conn-pool :write)]
                                    (let [user (app-user-model/create! new-conn {:id (UUID/randomUUID)
                                                                                 :app-id app-id
                                                                                 :email email})]
                                      (transaction-model/create! new-conn {:app-id app-id})
                                      user))))
        magic-code (app-user-magic-code-model/create!
                    {:app-id app-id
                     :id (UUID/randomUUID)
                     :code (app-user-magic-code-model/rand-code)
                     :user-id user-id})
        template (app-email-template-model/get-by-app-id-and-email-type
                  {:app-id app-id
                   :email-type "magic-code"})
        template-params {:user_email (:email u)
                         :code (:code magic-code)
                         :app_title (:title app)}

        default-sender "verify@auth-pm.instantdb.com"

        sender-email (or (:email template) default-sender)
        email-params (if template
                       {:sender-email sender-email
                        :sender-name (or (:name template) (:title app))
                        :subject (template-replace (:subject template) template-params)
                        :body (template-replace (:body template) template-params)}
                       {:sender-name (:title app)
                        :sender-email default-sender
                        :subject (str (:code magic-code) " is your verification code for " (:title app))
                        :body (default-body (:title app) (:code magic-code))})

        email-req (magic-code-email {:user u
                                     :params email-params})]
    (try
      (postmark/send-structured! email-req)
      (catch clojure.lang.ExceptionInfo e
        (if (invalid-sender? e)
          (do
            (tracer/record-info! {:name "magic-code/unconfirmed-or-unknown-sender" :attributes {:email sender-email :app-id app-id}})
            (postmark/send-structured! (magic-code-email {:user u
                                                          :params (assoc email-params :sender-email default-sender)})))
          (throw e))))
    {:sent true}))

(defn verify-magic-code!
  "Verifies a magic code and returns user + refresh token.
   
   Parameters:
   - app-id: UUID of the app
   - email: email address 
   - code: magic code to verify
   
   Returns: {:user user-map :token refresh-token-uuid}"
  [{:keys [app-id email code]}]
  (let [m (app-user-magic-code-model/consume!
           {:app-id app-id
            :code code
            :email email})
        {user-id :user_id} m
        {refresh-token-id :id} (app-user-refresh-token-model/create! {:app-id app-id
                                                                      :id (UUID/randomUUID)
                                                                      :user-id user-id})
        user (app-user-model/get-by-id {:app-id app-id :id user-id})]
    {:user (assoc user :refresh_token refresh-token-id)
     :token refresh-token-id})) 
