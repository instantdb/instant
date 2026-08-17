(ns instant.ses-test
  (:require
   [clojure.test :refer [deftest is testing thrown-with-msg?]]
   [instant.config :as config]
   [instant.model.app-email-sender :as app-email-sender]
   [instant.ses :as ses])
  (:import
   (software.amazon.awssdk.services.sesv2.model DkimAttributes
                                                DkimStatus
                                                GetEmailIdentityResponse
                                                SendEmailRequest
                                                VerificationStatus)))

(defn domain-response []
  (let [^DkimAttributes dkim (-> (DkimAttributes/builder)
                                 (.status DkimStatus/SUCCESS)
                                 (.tokens ["token-one" "token-two" "token-three"])
                                 (.build))]
    (-> (GetEmailIdentityResponse/builder)
        (.verifiedForSendingStatus true)
        (.verificationStatus VerificationStatus/SUCCESS)
        (.dkimAttributes dkim)
        (.build))))

(deftest email-send-enabled-test
  (testing "SES credentials satisfy the provider-neutral delivery check"
    (with-redefs [config/email-provider (constantly :ses)
                  config/aws-ses-enabled? (constantly true)]
      (is (true? (config/email-send-enabled?)))))
  (testing "an explicitly selected provider without credentials stays disabled"
    (with-redefs [config/email-provider (constantly :ses)
                  config/aws-ses-enabled? (constantly false)]
      (is (false? (config/email-send-enabled?)))))
  (testing "legacy provider auto-detection is preserved when no override is set"
    (with-redefs [config/email-provider (constantly nil)
                  config/postmark-send-enabled? (constantly false)
                  config/sendgrid-send-enabled? (constantly true)
                  config/aws-ses-enabled? (constantly false)]
      (is (true? (config/email-send-enabled?))))))

(deftest ses-stays-disabled-on-instant-cloud-test
  (with-redefs [config/aws-env? (constantly true)
                config/aws-ses-access-key-id (constantly "AKIAEXAMPLE")
                config/aws-ses-secret-access-key (constantly "secret")]
    (is (false? (config/aws-ses-enabled?)))
    (is (false? (config/ses-selected?)))))

(deftest sender-status-keeps-the-app-email-address-test
  (with-redefs [#'ses/get-identity (fn [_] (domain-response))]
    (is (= {:Provider "ses"
            :EmailAddress "sender@example.com"
            :Confirmed true
            :DnsRecords [{:Type "CNAME"
                          :Name "token-one._domainkey.example.com"
                          :Value "token-one.dkim.amazonses.com"}
                         {:Type "CNAME"
                          :Name "token-two._domainkey.example.com"
                          :Value "token-two.dkim.amazonses.com"}
                         {:Type "CNAME"
                          :Name "token-three._domainkey.example.com"
                          :Value "token-three.dkim.amazonses.com"}]}
           (ses/sender-status
            {:email "sender@example.com"
             :provider_id "example.com"}))))
  (is (nil? (app-email-sender/get-sender-status nil))))

(deftest send-throws-when-ses-is-not-configured-test
  (with-redefs [config/aws-ses-enabled? (constantly false)]
    (is (thrown? Exception
                 (ses/send! {:from {:email "from@example.com"}
                             :to [{:email "to@example.com"}]
                             :subject "Subject"})))))

(deftest unverified-identity-test
  (is (true? (ses/unverified-identity?
              (ex-info "SES sender is not verified."
                       {:type :ses-unverified-sender}))))
  (is (false? (ses/unverified-identity?
               (ex-info "other" {:type :other})))))

(deftest domain-test
  (is (= "example.com" (ses/domain "sender@example.com")))
  (is (thrown-with-msg? clojure.lang.ExceptionInfo
                        #"missing a domain"
                        (ses/domain "not-an-email"))))

(deftest format-domain-identity-test
  (let [formatted (#'ses/dkim-records "example.com" (domain-response))]
    (is (= [{:Type "CNAME"
             :Name "token-one._domainkey.example.com"
             :Value "token-one.dkim.amazonses.com"}
            {:Type "CNAME"
             :Name "token-two._domainkey.example.com"
             :Value "token-two.dkim.amazonses.com"}
            {:Type "CNAME"
             :Name "token-three._domainkey.example.com"
             :Value "token-three.dkim.amazonses.com"}]
           formatted))))

(deftest build-send-request-test
  (testing "structured email fields map to an SES v2 simple message"
    (with-redefs [config/email-reply-to (constantly "reply@example.com")
                  config/aws-ses-configuration-set (constantly nil)]
      (let [^SendEmailRequest request
            (ses/build-send-request
             {:from {:name "Example" :email "from@example.com"}
              :to [{:email "to@example.com"}]
              :cc [{:email "cc@example.com"}]
              :bcc [{:email "bcc@example.com"}]
              :subject "Subject"
              :html "<p>Hello</p>"
              :text "Hello"})]
        (is (= "Example <from@example.com>" (.fromEmailAddress request)))
        (is (= ["to@example.com"]
               (vec (.. request destination toAddresses))))
        (is (= ["cc@example.com"]
               (vec (.. request destination ccAddresses))))
        (is (= ["bcc@example.com"]
               (vec (.. request destination bccAddresses))))
        (is (= ["reply@example.com"] (vec (.replyToAddresses request))))
        (is (= "Subject" (.. request content simple subject data)))
        (is (= "<p>Hello</p>" (.. request content simple body html data)))
        (is (= "Hello" (.. request content simple body text data)))))))

(deftest build-send-request-encodes-non-ascii-display-names-test
  (with-redefs [config/email-reply-to (constantly "reply@example.com")
                config/aws-ses-configuration-set (constantly nil)]
    (let [^SendEmailRequest request
          (ses/build-send-request
           {:from {:name "München" :email "from@example.com"}
            :to [{:name "José" :email "to@example.com"}]
            :subject "Subject"
            :html "<p>Hello</p>"})]
      (is (= "=?UTF-8?B?TcO8bmNoZW4=?= <from@example.com>"
             (.fromEmailAddress request)))
      (is (= ["=?UTF-8?B?Sm9zw6k=?= <to@example.com>"]
             (vec (.. request destination toAddresses)))))))
