(ns instant.ses
  "Amazon SES v2 client for self-hosted Instant.

  Instant Cloud never enables this path; see `config/aws-ses-enabled?`."
  (:require
   [clojure.string :as string]
   [instant.config :as config]
   [instant.util.exception :as ex]
   [instant.util.tracer :as tracer])
  (:import
   (software.amazon.awssdk.auth.credentials AwsBasicCredentials
                                            StaticCredentialsProvider)
   (software.amazon.awssdk.regions Region)
   (software.amazon.awssdk.services.sesv2 SesV2Client)
   (software.amazon.awssdk.services.sesv2.model Body
                                                Content
                                                CreateEmailIdentityRequest
                                                Destination
                                                DkimAttributes
                                                EmailContent
                                                GetEmailIdentityRequest
                                                GetEmailIdentityResponse
                                                Message
                                                SendEmailRequest
                                                SesV2Exception)))

(set! *warn-on-reflection* true)

(defn- credentials-provider []
  (StaticCredentialsProvider/create
   (AwsBasicCredentials/create (config/aws-ses-access-key-id)
                               (config/aws-ses-secret-access-key))))

(defonce ^:private client*
  (delay (-> (SesV2Client/builder)
             (.region (Region/of (config/aws-ses-region)))
             (.credentialsProvider (credentials-provider))
             (.build))))

(defn- client ^SesV2Client [] @client*)

(defn- ascii? [s]
  (every? #(<= (int %) 127) s))

(defn- encoded-word [s]
  (str "=?UTF-8?B?"
       (.encodeToString (java.util.Base64/getEncoder)
                        (.getBytes ^String s java.nio.charset.StandardCharsets/UTF_8))
       "?="))

(defn- address [{:keys [name email]}]
  (let [display (some-> name (string/replace #"[\r\n]+" " ") string/trim)]
    (cond
      (string/blank? display) email
      (ascii? display) (str display " <" email ">")
      ;; SES does not accept raw Unicode in address strings.
      :else (str (encoded-word display) " <" email ">"))))

(defn- addresses [values]
  (mapv address values))

(defn- utf8 ^Content [value]
  (-> (Content/builder)
      (.charset "UTF-8")
      (.data value)
      (.build)))

(defn build-send-request
  ^SendEmailRequest
  [{:keys [from to cc bcc subject html text reply-to]}]
  (let [destination (cond-> (Destination/builder)
                      (seq to) (.toAddresses ^java.util.Collection (addresses to))
                      (seq cc) (.ccAddresses ^java.util.Collection (addresses cc))
                      (seq bcc) (.bccAddresses ^java.util.Collection (addresses bcc))
                      true (.build))
        body (cond-> (Body/builder)
               html (.html (utf8 html))
               text (.text (utf8 text))
               true (.build))
        message (-> (Message/builder)
                    (.subject (utf8 subject))
                    (.body body)
                    (.build))
        content (-> (EmailContent/builder)
                    (.simple message)
                    (.build))]
    (cond-> (SendEmailRequest/builder)
      true (.fromEmailAddress (address from))
      true (.destination destination)
      true (.content content)
      true (.replyToAddresses
            ^java.util.Collection
            [(or reply-to (config/email-reply-to))])
      (config/aws-ses-configuration-set)
      (.configurationSetName (config/aws-ses-configuration-set))
      true (.build))))

(defn- aws-error-code [e]
  (when (instance? SesV2Exception e)
    (some-> ^SesV2Exception e .awsErrorDetails .errorCode)))

(defn unverified-identity?
  "True when SES rejected the From identity. magic-code-auth retries
   with the default sender, same as Postmark signature problems."
  [e]
  (or (= :ses-unverified-sender (:type (ex-data e)))
      (contains? #{"MessageRejected" "MailFromDomainNotVerifiedException"}
                 (aws-error-code e))))

(defn send! [{:keys [from to subject] :as structured-email}]
  (if-not (config/aws-ses-enabled?)
    (ex/throw-email-send-failed!
     "Amazon SES is selected, but AWS_SES_ACCESS_KEY_ID and AWS_SES_SECRET_ACCESS_KEY are not configured."
     {:recipient (:email (first to))})
    (tracer/with-span! {:name "ses/send"
                        :attributes {:from from :to to :subject subject}}
      (try
        (.sendEmail (client) (build-send-request structured-email))
        (catch Exception e
          (if (unverified-identity? e)
            (throw (ex-info "SES sender is not verified."
                            {:type :ses-unverified-sender}
                            e))
            (do
              (tracer/add-data! {:attributes {:ses-error-code (aws-error-code e)}})
              (ex/throw-email-send-failed!
               "We weren't able to send the email."
               {:recipient (:email (first to))}
               e))))))))

(defn- not-found? [^SesV2Exception e]
  (= 404 (.statusCode e)))

(defn- get-identity ^GetEmailIdentityResponse [identity]
  (try
    (.getEmailIdentity
     (client)
     (-> (GetEmailIdentityRequest/builder)
         (.emailIdentity identity)
         (.build)))
    (catch SesV2Exception e
      (when-not (not-found? e)
        (throw e)))))

(defn domain [email]
  (or (second (string/split (str email) #"@" 2))
      (throw (ex-info "Sender email is missing a domain." {:email email}))))

(defn ensure-domain!
  "Create the SES domain identity for `email` if it is missing, then
   return the domain name used as Instant's provider id."
  [email]
  (let [identity (domain email)]
    (or (get-identity identity)
        (.createEmailIdentity
         (client)
         (-> (CreateEmailIdentityRequest/builder)
             (.emailIdentity identity)
             (.build))))
    identity))

(defn- dkim-records [identity ^GetEmailIdentityResponse response]
  (when-let [^DkimAttributes dkim (.dkimAttributes response)]
    (mapv (fn [token]
            {:Type "CNAME"
             :Name (str token "._domainkey." identity)
             :Value (str token ".dkim.amazonses.com")})
          (.tokens dkim))))

(defn sender-status
  "Dashboard/CLI shape for a custom sender stored against SES."
  [{:keys [email provider_id]}]
  (when-let [identity (or provider_id (when email (domain email)))]
    (when-let [response (get-identity identity)]
      {:Provider "ses"
       :EmailAddress email
       :Confirmed (true? (.verifiedForSendingStatus response))
       :DnsRecords (dkim-records identity response)})))
