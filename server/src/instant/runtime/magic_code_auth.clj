(ns instant.runtime.magic-code-auth
  (:require
   [clojure.string :as string]
   [instant.flags :as flags]
   [instant.model.app :as app-model]
   [instant.model.app-email-template :as app-email-template-model]
   [instant.model.app-user :as app-user-model]
   [instant.model.app-user-magic-code :as app-user-magic-code-model]
   [instant.model.app-user-refresh-token :as app-user-refresh-token-model]
   [instant.model.instant-user :as instant-user-model]
   [instant.postmark :as postmark]
   [instant.rate-limit :as rate-limit]
   [instant.reactive.ephemeral :as eph]
   [instant.util.cache :as cache]
   [instant.util.exception :as ex]
   [instant.util.tracer :as tracer])
  (:import
   (java.util.concurrent.atomic AtomicLong)))

(def send-rate-limit-cache
  ;; each entry should be just app-id + email -> counter which should be small,
  ;; even with 100k entries, the cache should be on the order of 10s of MBs
  (cache/make {:max-size 100000
               :ttl (* 60 60 1000)}))

(defn check-send-rate-limit-caffeine! [{:keys [app-id email]}]
  (let [limit (flags/magic-code-rate-limit-per-hour)]
    (when (and limit (pos? limit))
      (let [k [app-id email]
            counter (cache/get send-rate-limit-cache k
                               (fn [_] (AtomicLong. 0)))
            count (.incrementAndGet ^AtomicLong counter)]
        (when (> count limit)
          (tracer/record-info! {:name "magic-code/rate-limited"
                                :attributes {:app-id app-id
                                             :email email
                                             :count count
                                             :limit limit
                                             :source "caffeine"}})
          (ex/throw-record-email-rate-limited!))))))

(defn check-send-rate-limit-bucket4j! [params]
  (when-not (rate-limit/try-consume-create-magic-code (eph/get-rate-limit) params)
    (tracer/record-info! {:name "magic-code/rate-limited"
                          :attributes {:app-id (:app-id params)
                                       :email (:email params)
                                       :source "bucket4j"}})
    (ex/throw-record-email-rate-limited!)))

(defn check-send-rate-limit! [params]
  (if (flags/toggled? :use-bucket4j true)
    (check-send-rate-limit-bucket4j! params)
    (check-send-rate-limit-caffeine! params)))

(defn check-verify-rate-limit! [params]
  (when (flags/toggled? :use-bucket4j true)
    (when-not (rate-limit/try-consume-consume-magic-code (eph/get-rate-limit) params)
      (tracer/record-info! {:name "magic-code/consume-rate-limited"
                            :attributes {:app-id (:app-id params)
                                         :email (:email params)
                                         :source "bucket4j"}})
      (ex/throw-record-email-rate-limited!))))

(def postmark-unconfirmed-sender-body-error-code 400)

(def postmark-not-found-sender-body-error-code 401)

(defn invalid-sender? [e]
  (let [code (-> e ex-data :body :ErrorCode)]
    (or (= code postmark-unconfirmed-sender-body-error-code)
        (= code postmark-not-found-sender-body-error-code))))

(defn default-body [{:keys [title code expiration]}]
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
         Note: This code will expire in " expiration ", and can only be used once. If you
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

(defn friendly-expiration [app]
  (let [minutes (app-model/get-magic-code-expiry-minutes (:id app))]
    (if (<= 60 minutes)
      (let [hours (int (Math/floor (/ minutes 60)))]
        (format "%s hour%s" hours (if (> hours 1) "s" "")))
      (format "%s minute%s" minutes (if (> minutes 1) "s" "")))))

(defn send! [{:keys [app-id email] :as req}]
  (check-send-rate-limit! req)
  (let [app             (app-model/get-by-id! {:id app-id})
        {:keys [code]}  (app-user-magic-code-model/create! (select-keys req [:app-id :email]))
        template        (app-email-template-model/get-by-app-id-and-email-type
                         {:app-id app-id
                          :email-type "magic-code"})
        template-params {:user_email email
                         :code code
                         :app_title (:title app)
                         :expiration (friendly-expiration app)}

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
                           :body (default-body template-params)})

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

(defn verify!
  "Consumes the code and if the code is good, upserts the user.

   If a guest-user-id is passed in, it will either upgrade the guest user
   or link it to the existing user for the email.

   Permission check runs before consuming the code so that a failed check
   doesn't burn the one-time code."
  [{:keys [app-id email code guest-user-id extra-fields admin?]}]
  (check-verify-rate-limit! {:app-id app-id
                             :email email})
  (let [existing-user (app-user-model/get-by-email
                       {:app-id app-id
                        :email  email})
        created? (nil? existing-user)
        user-id (or guest-user-id (random-uuid))]
    ;; Check before consuming the code so a failed check doesn't
    ;; burn the one-time code.
    (when created?
      (app-user-model/assert-signup!
       {:app-id app-id
        :email email
        :id user-id
        :extra-fields extra-fields
        :skip-perm-check? admin?}))
    (app-user-magic-code-model/consume!
     {:app-id app-id
      :code   code
      :email  email})
    (let [user (or existing-user
                   (app-user-model/create!
                    {:id user-id
                     :app-id app-id
                     :email  email
                     :type   "user"
                     :extra-fields extra-fields}))
          refresh-token-id (random-uuid)]
      (when (and guest-user-id
                 (not= (:id user)
                       guest-user-id))
        (app-user-model/link-guest {:app-id app-id
                                    :primary-user-id (:id user)
                                    :guest-user-id guest-user-id}))
      (app-user-refresh-token-model/create!
       {:app-id  app-id
        :id      refresh-token-id
        :user-id (:id user)})
      (assoc user :refresh_token refresh-token-id :created created?))))

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
