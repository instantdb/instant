(ns instant.ses
  (:require
   [clojure.string :as string]
   [instant.config :as config]
   [instant.util.tracer :as tracer])
  (:import
   (software.amazon.awssdk.core SdkBytes)
   (software.amazon.awssdk.auth.credentials AwsBasicCredentials AwsCredentialsProvider
                                             AwsSessionCredentials
                                             StaticCredentialsProvider)
   (software.amazon.awssdk.regions Region)
   (software.amazon.awssdk.services.sesv2 SesV2Client SesV2ClientBuilder)
   (software.amazon.awssdk.services.sesv2.model Body Body$Builder Content
                                                CreateEmailIdentityRequest
                                                Destination Destination$Builder
                                                DkimAttributes EmailContent EmailContent$Builder
                                                GetEmailIdentityRequest GetEmailIdentityResponse
                                                Message Message$Builder RawMessage
                                                SendEmailRequest SendEmailRequest$Builder
                                                SesV2Exception)))

(set! *warn-on-reflection* true)

(defn- credentials-provider ^AwsCredentialsProvider []
  (StaticCredentialsProvider/create
   (if-let [session-token (config/aws-ses-session-token)]
     (AwsSessionCredentials/create (config/aws-ses-access-key-id)
                                   (config/aws-ses-secret-access-key)
                                   session-token)
     (AwsBasicCredentials/create (config/aws-ses-access-key-id)
                                 (config/aws-ses-secret-access-key)))))

(defn build-client ^SesV2Client []
  (let [^SesV2ClientBuilder builder (SesV2Client/builder)]
    (.region builder (Region/of (config/aws-ses-region)))
    (.credentialsProvider builder (credentials-provider))
    (.build builder)))

(defonce ^:private client* (delay (build-client)))

(defn client ^SesV2Client [] @client*)

(defn- address [{:keys [name email]}]
  (if (string/blank? name)
    email
    (str "\"" (string/replace (str name) #"[\r\n\"]+" " ") "\" <" email ">")))

(defn- addresses [values]
  (mapv address (or values [])))

(defn- safe-header [value]
  (string/replace (str value) #"[\r\n]+" " "))

(defn- encoded-subject [subject]
  (str "=?UTF-8?B?"
       (.encodeToString (java.util.Base64/getEncoder)
                        (.getBytes (str subject) java.nio.charset.StandardCharsets/UTF_8))
       "?="))

(defn- raw-message [{:keys [from to cc bcc subject html text reply-to headers]}]
  (let [boundary (str "instant-" (random-uuid))
        encode (fn [value]
                 (.encodeToString (java.util.Base64/getMimeEncoder)
                                  (.getBytes ^String (str (or value "")) java.nio.charset.StandardCharsets/UTF_8)))
        line (fn [header-name value] (str header-name ": " (safe-header value) "\r\n"))
        recipients (fn [xs] (string/join ", " (addresses xs)))
        body (str
              (line "From" (address from))
              (line "To" (recipients to))
              (when (seq cc) (line "Cc" (recipients cc)))
              ;; BCC recipients belong only in the SES destination envelope.
              ;; Including them in the MIME headers would reveal the list to
              ;; every recipient of a raw message.
              (line "Reply-To" (or reply-to (config/email-reply-to)))
              (line "Subject" (encoded-subject subject))
              (apply str (map (fn [[header-name value]] (line header-name value)) headers))
              "MIME-Version: 1.0\r\n"
              (line "Content-Type" (str "multipart/alternative; boundary=\"" boundary "\""))
              "\r\n"
              "--" boundary "\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n"
              (encode (or text (string/replace (or html "") #"<[^>]+>" " "))) "\r\n"
              "--" boundary "\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n"
              (encode html) "\r\n--" boundary "--\r\n")]
    (-> (RawMessage/builder)
        (.data (SdkBytes/fromUtf8String body))
        (.build))))

(defn build-send-request
  ^SendEmailRequest
  [{:keys [from to cc bcc subject html text reply-to headers configuration-set]
    :as message-data}]
  (let [^Destination$Builder destination-builder (Destination/builder)
        _ (when (seq to)
            (.toAddresses destination-builder
                          ^java.util.Collection (addresses to)))
        _ (when (seq cc)
            (.ccAddresses destination-builder
                          ^java.util.Collection (addresses cc)))
        _ (when (seq bcc)
            (.bccAddresses destination-builder
                           ^java.util.Collection (addresses bcc)))
        ^Body$Builder body-builder (Body/builder)
        _ (when html
            (let [^Content content (-> (Content/builder)
                                       (.charset "UTF-8")
                                       (.data html)
                                       (.build))]
              (.html body-builder content)))
        _ (when text
            (let [^Content content (-> (Content/builder)
                                       (.charset "UTF-8")
                                       (.data text)
                                       (.build))]
              (.text body-builder content)))
        ^Message$Builder message-builder (Message/builder)
        ^Content subject-content (-> (Content/builder)
                                     (.charset "UTF-8")
                                     (.data subject)
                                     (.build))
        _ (.subject message-builder subject-content)
        ^Body body (.build body-builder)
        _ (.body message-builder body)
        ^Message message (.build message-builder)
        ^Destination destination (.build destination-builder)
        ^EmailContent$Builder email-content-builder (EmailContent/builder)
        _ (if (seq headers)
            (.raw email-content-builder ^RawMessage (raw-message message-data))
            (.simple email-content-builder message))
        ^EmailContent email-content (.build email-content-builder)
        ^SendEmailRequest$Builder request-builder (SendEmailRequest/builder)
        _ (.fromEmailAddress request-builder (address from))
        _ (.destination request-builder destination)
        _ (.content request-builder email-content)
        _ (.replyToAddresses request-builder
                             ^java.util.Collection
                             (java.util.Collections/singletonList
                              (or reply-to (config/email-reply-to))))
        _ (when-let [selected-set (or configuration-set
                                      (config/aws-ses-configuration-set))]
            (.configurationSetName request-builder selected-set))
        ^SendEmailRequest request (.build request-builder)]
    request))

(defn send! [{:keys [from to subject] :as structured-email}]
  (let [request (build-send-request structured-email)]
    (if-not (config/aws-ses-enabled?)
      (tracer/with-span! {:name "ses/send-disabled"
                          :attributes {:from from
                                       :to to
                                       :subject subject}}
        (tracer/record-info!
         {:name "ses-disabled"
          :attributes
          {:msg "Amazon SES is disabled; set AWS_SES_ACCESS_KEY_ID and AWS_SES_SECRET_ACCESS_KEY to enable it"}}))
      (tracer/with-span! {:name "ses/send"
                          :attributes {:from from
                                       :to to
                                       :subject subject}}
        (.sendEmail (client) request)))))

(defn- not-found? [^SesV2Exception e]
  (= 404 (.statusCode e)))

(defn get-identity ^GetEmailIdentityResponse [identity]
  (try
    (let [^GetEmailIdentityRequest request
          (-> (GetEmailIdentityRequest/builder)
              (.emailIdentity identity)
              (.build))]
      (.getEmailIdentity (client) request))
    (catch SesV2Exception e
      (if (not-found? e)
        nil
        (throw e)))))

(defn create-identity! [identity]
  (let [^CreateEmailIdentityRequest request
        (-> (CreateEmailIdentityRequest/builder)
            (.emailIdentity identity)
            (.build))]
    (.createEmailIdentity (client) request)))

(defn email-domain [email]
  (second (string/split email #"@" 2)))

(defn identity-for-email [email identity-type]
  (case identity-type
    :email email
    :domain (or (email-domain email)
                (throw (ex-info "Cannot derive an SES domain identity from the sender email"
                                {:email email})))
    (throw (ex-info "Unsupported SES identity type"
                    {:identity-type identity-type}))))

(defn ensure-identity! [{:keys [email identity-type]
                         :or {identity-type :domain}}]
  (let [identity (identity-for-email email identity-type)
        response (or (get-identity identity)
                     (do
                       (create-identity! identity)
                       (get-identity identity)))]
    {:identity identity
     :identity-type identity-type
     :response response}))

(defn- dkim-records [identity ^GetEmailIdentityResponse response]
  (when-let [^DkimAttributes dkim (.dkimAttributes response)]
    (mapv (fn [token]
            {:Type "CNAME"
             :Name (str token "._domainkey." identity)
             :Value (str token ".dkim.amazonses.com")})
          (.tokens dkim))))

(defn format-identity [identity ^GetEmailIdentityResponse response]
  (let [identity-type (some-> response .identityTypeAsString)
        verified? (true? (.verifiedForSendingStatus response))]
    {:Provider "ses"
     :Identity identity
     :IdentityType identity-type
     :EmailAddress (when (= "EMAIL_ADDRESS" identity-type) identity)
     :Confirmed verified?
     :VerifiedForSendingStatus verified?
     :VerificationStatus (.verificationStatusAsString response)
     :DKIMStatus (some-> response .dkimAttributes .statusAsString)
     :DnsRecords (dkim-records identity response)}))

(defn get-formatted-identity [identity]
  (when-let [response (get-identity identity)]
    (format-identity identity response)))
