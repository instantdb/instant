(ns instant.model.app-email-sender
  (:require [instant.jdbc.aurora :as aurora]
            [instant.jdbc.sql :as sql]
            [instant.email-identity :as email-identity]
            [instant.model.app-email-verification :as verification])
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
  ([conn {:keys [email name postmark-id email-provider provider-id]}]
   (sql/execute-one!
    conn
    ["INSERT INTO
        app_email_senders
        (id, email, name, postmark_id, email_provider, provider_id)
      VALUES
        (?::uuid, ?, ?, ?, ?, ?)
      ON CONFLICT (email)
      DO UPDATE SET
        name = EXCLUDED.name,
        postmark_id = EXCLUDED.postmark_id,
        email_provider = EXCLUDED.email_provider,
        provider_id = EXCLUDED.provider_id"
     (UUID/randomUUID) email name postmark-id email-provider provider-id])))

(def sender-claimed-error-message "We can't use this email address; it's already been claimed by a different user.")

(defn sync-sender!
  [{:keys [app-id email name identity-type]}]
  (let [sender (get-by-email {:email email})
        identity (email-identity/sync-sender! {:email email
                                               :name name
                                               :sender sender
                                               :identity-type identity-type})
        sender (put! {:email email
                      :name name
                      :app-id app-id
                      :postmark-id (:postmark-id identity)
                      :email-provider (:email-provider identity)
                      :provider-id (:provider-id identity)})
        _ (verification/put! {:app-id app-id
                              :sender-id (:id sender)
                              :verified false})]
    {:sender sender}))

(comment
  (sync-sender! {:app-id (random-uuid)
                 :email "hi@example.com"
                 :name "Example"
                 :identity-type :domain}))
