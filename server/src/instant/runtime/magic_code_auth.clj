(ns instant.runtime.magic-code-auth
  (:require
   [instant.postmark :as postmark]
   [clojure.string :as string]
   [instant.model.app :as app-model]
   [instant.model.app-user :as app-user-model]
   [instant.model.app-user-magic-code :as app-user-magic-code-model]
   [instant.model.app-email-template :as app-email-template-model]
   [instant.util.tracer :as tracer]
   [instant.model.instant-user :as instant-user-model]
   [instant.model.app-user-refresh-token :as app-user-refresh-token-model]))

(def postmark-unconfirmed-sender-body-error-code 400)

(def postmark-not-found-sender-body-error-code 401)

(defn invalid-sender? [e]
  (let [code (-> e ex-data :body :ErrorCode)]
    (or (= code postmark-unconfirmed-sender-body-error-code)
        (= code postmark-not-found-sender-body-error-code))))

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

(defn magic-code-email [to params]
  (let [{:keys [sender-name sender-email subject body]} params]
    {:from {:name sender-name
            :email sender-email}
     :to [{:email to}]
     :subject subject
     :reply-to sender-email
     :html
     body}))

(defn template-replace [template params]
  (reduce
   (fn [acc [k v]]
     (string/replace acc (str "{" (name k) "}") v))
   template
   params))

(comment
  (template-replace "Hello {name}, your code is {code}" {:name "Stepan" :code "123"}))

(defn send! [{:keys [app-id email] :as req}]
  (let [app             (app-model/get-by-id! {:id app-id})
        {:keys [code]}  (app-user-magic-code-model/create! (select-keys req [:app-id :email]))
        template        (app-email-template-model/get-by-app-id-and-email-type
                         {:app-id app-id
                          :email-type "magic-code"})
        template-params {:user_email email
                         :code code
                         :app_title (:title app)}

        default-sender  "verify@auth-pm.instantdb.com"

        sender-email    (or (:email template) default-sender)
        email-params    (if template
                          {:sender-email sender-email
                           :sender-name (or (:name template) (:title app))
                           :subject (template-replace (:subject template) template-params)
                           :body (template-replace (:body template) template-params)}
                          {:sender-name (:title app)
                           :sender-email default-sender
                           :subject (str code " is your verification code for " (:title app))
                           :body (default-body (:title app) code)})

        email-req       (magic-code-email email email-params)
        email-res       (try
                          (postmark/send-structured! email-req)
                          (catch clojure.lang.ExceptionInfo e
                            (if (invalid-sender? e)
                              (do
                                (tracer/record-info! {:name "magic-code/unconfirmed-or-unknown-sender" :attributes {:email sender-email :app-id app-id}})
                                (postmark/send-structured! (magic-code-email email (assoc email-params :sender-email default-sender))))
                              (throw e))))]
    {:code code
     :sent-email email-res}))

(comment
  (def instant-user (instant-user-model/get-by-email
                     {:email "stopa@instantdb.com"}))
  (def app (first (app-model/get-all-for-user {:user-id (:id instant-user)})))
  (def runtime-user (app-user-model/get-by-email {:app-id (:id app)
                                                  :email "stopa@instantdb.com"}))

  (send! {:app-id (:id app) :email "stopa@instantdb.com"}))

(defn verify! [{:keys [app-id email code user-id]}]
  (app-user-magic-code-model/consume!
   {:app-id app-id
    :code   code
    :email  email})
  (let [user (or (app-user-model/get-by-email
                  {:app-id app-id
                   :email email})
                 (app-user-model/create!
                  {:id     user-id
                   :app-id app-id
                   :email  email}))
        refresh-token-id (random-uuid)]
    (app-user-refresh-token-model/create!
     {:app-id  app-id
      :id      refresh-token-id
      :user-id (:id user)})
    (assoc user :refresh_token refresh-token-id)))

(comment
  (def instant-user (instant-user-model/get-by-email
                     {:email "stopa@instantdb.com"}))
  (def app (first (app-model/get-all-for-user {:user-id (:id instant-user)})))
  (def runtime-user (app-user-model/get-by-email {:app-id (:id app)
                                                  :email "stopa@instantdb.com"}))
  (def m
    (:magic-code (app-user-magic-code-model/create! {:app-id (:id app) :email "stopa@instantdb.com"})))

  (verify! {:app-id (:id app) :email "stopa@instantdb.com" :code "0"})

  (verify! {:app-id (:id app) :email "stopa@instantdb.com" :code (:code m)}))

