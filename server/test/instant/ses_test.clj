(ns instant.ses-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [instant.config :as config]
   [instant.email-identity :as email-identity]
   [instant.ses :as ses])
  (:import
   (software.amazon.awssdk.services.sesv2.model DkimAttributes DkimStatus
                                                GetEmailIdentityResponse
                                                IdentityType
                                                SendEmailRequest
                                                VerificationStatus)))

(defn domain-response []
  (let [^DkimAttributes dkim (-> (DkimAttributes/builder)
                                 (.status DkimStatus/SUCCESS)
                                 (.tokens ["token-one" "token-two" "token-three"])
                                 (.build))]
    (-> (GetEmailIdentityResponse/builder)
        (.identityType IdentityType/DOMAIN)
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
  (testing "dedicated SES credentials do not enable SES on Instant Cloud"
    (with-redefs [config/aws-env? (constantly true)
                  config/aws-ses-access-key-id (constantly "AKIAEXAMPLE")
                  config/aws-ses-secret-access-key (constantly "secret")]
      (is (false? (config/aws-ses-enabled?))))))

(deftest sender-status-keeps-the-app-email-address-test
  (with-redefs [ses/get-formatted-identity
                (fn [identity]
                  {:Provider "ses"
                   :Identity identity
                   :IdentityType "DOMAIN"
                   :EmailAddress nil})]
    (is (= {:Provider "ses"
            :Identity "example.com"
            :IdentityType "DOMAIN"
            :EmailAddress "sender@example.com"}
           (email-identity/get-sender!
            {:email "sender@example.com"
             :email_provider "ses"
             :provider_id "example.com"})))))

(deftest identity-for-email-test
  (is (= "example.com"
         (ses/identity-for-email "sender@example.com" :domain)))
  (is (= "sender@example.com"
         (ses/identity-for-email "sender@example.com" :email)))
  (is (thrown-with-msg? clojure.lang.ExceptionInfo
                        #"Unsupported SES identity type"
                        (ses/identity-for-email "sender@example.com" :other))))

(deftest ensure-identity-creates-missing-identity-test
  (let [lookups (atom 0)
        created (atom nil)
        response (domain-response)]
    (with-redefs [ses/get-identity (fn [_]
                                    (when (> (swap! lookups inc) 1)
                                      response))
                  ses/create-identity! #(reset! created %)]
      (let [result (ses/ensure-identity! {:email "sender@example.com"
                                          :identity-type :domain})]
        (is (= "example.com" @created))
        (is (= "example.com" (:identity result)))
        (is (= response (:response result)))))))

(deftest format-domain-identity-test
  (let [formatted (ses/format-identity "example.com" (domain-response))]
    (is (= "ses" (:Provider formatted)))
    (is (= "DOMAIN" (:IdentityType formatted)))
    (is (true? (:Confirmed formatted)))
    (is (= [{:Type "CNAME"
             :Name "token-one._domainkey.example.com"
             :Value "token-one.dkim.amazonses.com"}
            {:Type "CNAME"
             :Name "token-two._domainkey.example.com"
             :Value "token-two.dkim.amazonses.com"}
            {:Type "CNAME"
             :Name "token-three._domainkey.example.com"
             :Value "token-three.dkim.amazonses.com"}]
           (:DnsRecords formatted)))))

(deftest build-send-request-test
  (testing "structured email fields map to an SES v2 simple message"
    (with-redefs [config/email-reply-to (constantly "reply@example.com")]
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

(deftest build-raw-send-request-test
  (testing "custom headers use a raw message without exposing BCC recipients"
    (with-redefs [config/email-reply-to (constantly "reply@example.com")
                  config/aws-ses-configuration-set (constantly "transactional")]
      (let [^SendEmailRequest request
            (ses/build-send-request
             {:from {:name "Example" :email "from@example.com"}
              :to [{:email "to@example.com"}]
              :bcc [{:email "hidden@example.com"}]
              :subject "Product update"
              :html "<p>Hello</p>"
              :text "Hello"
              :headers {"List-Unsubscribe" "<https://example.com/unsubscribe>"}
              :configuration-set "marketing"})
            raw (.. request content raw data asUtf8String)]
        (is (= ["hidden@example.com"]
               (vec (.. request destination bccAddresses))))
        (is (= "marketing" (.configurationSetName request)))
        (is (re-find #"List-Unsubscribe: <https://example.com/unsubscribe>" raw))
        (is (not (re-find #"(?im)^Bcc:" raw)))
        (is (nil? (.. request content simple)))))))
