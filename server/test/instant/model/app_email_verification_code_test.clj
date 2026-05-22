(ns instant.model.app-email-verification-code-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [instant.fixtures :refer [random-email with-empty-app with-user]]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.model.app-email-verification :as verification]
   [instant.model.app-email-verification-code :as verification-code]))

(defn- create-sender! [{:keys [user-id email]}]
  (sql/execute-one!
   (aurora/conn-pool :write)
   ["INSERT INTO app_email_senders
     (id, user_id, postmark_id, email, name)
     VALUES (?::uuid, ?::uuid, ?, ?, ?)
     RETURNING *"
    (random-uuid) user-id 123456 email "Test Sender"]))

(deftest consume-verification-code-once
  (with-user
    (fn [user]
      (with-empty-app
        (:id user)
        (fn [app]
          (let [sender (create-sender! {:user-id (:id user)
                                        :email (random-email)})
                verification (verification/put! {:app-id (:id app)
                                                 :sender-id (:id sender)
                                                 :verified false})
                code (verification-code/put! {:app-id (:id app)
                                              :verification-id (:id verification)
                                              :code "123456"})]
            (testing "matching code is consumed"
              (is (= (:id code)
                     (:id (verification-code/consume!
                           {:verification-id (:id verification)
                            :app-id (:id app)
                            :code "123456"
                            :expiry-minutes 10})))))

            (testing "consumed codes cannot be reused"
              (is (nil? (verification-code/consume!
                         {:verification-id (:id verification)
                          :app-id (:id app)
                          :code "123456"
                          :expiry-minutes 10}))))))))))

(deftest consume-verification-code-rejects-expired-codes
  (with-user
    (fn [user]
      (with-empty-app
        (:id user)
        (fn [app]
          (let [sender (create-sender! {:user-id (:id user)
                                        :email (random-email)})
                verification (verification/put! {:app-id (:id app)
                                                 :sender-id (:id sender)
                                                 :verified false})]
            (verification-code/put! {:app-id (:id app)
                                     :verification-id (:id verification)
                                     :code "123456"})
            (sql/execute!
             (aurora/conn-pool :write)
             ["UPDATE app_email_verification_codes
               SET created_at = NOW() - INTERVAL '11 minutes'
               WHERE verification_id = ?::uuid"
              (:id verification)])

            (is (nil? (verification-code/consume!
                       {:verification-id (:id verification)
                        :app-id (:id app)
                        :code "123456"
                        :expiry-minutes 10})))))))))
