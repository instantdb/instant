(ns instant.webhook-sender-test
  (:require
   [clojure.string :as string]
   [clojure.test :refer [deftest is]]
   [instant.smokescreen :as smokescreen]
   [instant.util.crypt :as crypt-util]
   [instant.webhook-routes :as webhook-routes]
   [instant.webhook-sender :as webhook-sender])
  (:import
   (java.math BigInteger)
   (java.nio.charset StandardCharsets)
   (java.security KeyFactory PublicKey Signature)
   (java.security.spec EdECPoint EdECPublicKeySpec NamedParameterSpec)
   (java.util Base64)
   (mockwebserver3 MockResponse$Builder MockWebServer)))

(defn jwk->public-key ^PublicKey [{:keys [x]}]
  (let [key-bytes (.decode (Base64/getUrlDecoder) ^String x)
        x-odd? (not (zero? (bit-and (aget key-bytes 31) 0x80)))
        y-bytes (byte-array key-bytes)
        _ (aset y-bytes 31 (byte (bit-and (aget y-bytes 31) 0x7F)))
        be-bytes (byte-array (reverse y-bytes))
        y (BigInteger. 1 be-bytes)
        spec (EdECPublicKeySpec. NamedParameterSpec/ED25519
                                 (EdECPoint. x-odd? y))]
    (.generatePublic (KeyFactory/getInstance "Ed25519") spec)))

(deftest sign-webhook-signature-verifies
  (let [body "{\"event\":\"create\"}"
        body-bytes (.getBytes body StandardCharsets/UTF_8)
        {:keys [kid signature t]} (webhook-sender/sign-webhook body-bytes)
        jwk (->> (webhook-routes/get-signing-keys nil)
                 :body
                 :keys
                 (filter #(= kid (:kid %)))
                 first)
        pub-key (jwk->public-key jwk)
        sig-bytes (crypt-util/hex-string->bytes signature)
        verifier (doto (Signature/getInstance "Ed25519")
                   (.initVerify pub-key)
                   (.update (.getBytes (str t "." body)
                                       StandardCharsets/UTF_8)))

        verifies? (.verify verifier sig-bytes)]
    (is verifies?)))

;; Tests against nip.io, which will return the IP we put before the hostname
(deftest dns-resolver-filters-bad-ips
  (is (= {:success? false
          :error-type "dns"
          :error-message "Could not resolve hostname."}
         (select-keys (webhook-sender/send-webhook "https://127.0.0.1.nip.io"
                                                   (random-uuid)
                                                   0
                                                   (.getBytes "{\"hello\": \"world\"}" "UTF-8"))
                      [:error-type :error-message :success?])))

  (is (= {:success? false
          :error-type "dns"
          :error-message "Could not resolve hostname."}
         (select-keys (webhook-sender/send-webhook "https://10.0.0.1.nip.io"
                                                   (random-uuid)
                                                   0
                                                   (.getBytes "{\"hello\": \"world\"}" "UTF-8"))
                      [:error-type :error-message :success?])))

  (is (= {:success? false
          :error-type "dns"
          :error-message "Could not resolve hostname."}
         (select-keys (webhook-sender/send-webhook "https://169.254.169.254.nip.io"
                                                   (random-uuid)
                                                   0
                                                   (.getBytes "{\"hello\": \"world\"}" "UTF-8"))
                      [:error-type :error-message :success?]))))

(deftest send-webhook-delivers-valid-signature
  ;; Bypass smokescreen so we can route to a local MockWebServer via 127.0.0.1.nip.io.
  ;; The DoH resolver still does a real lookup against the nip.io wildcard.
  (with-redefs [smokescreen/bad-ip? (constantly false)]
    (let [server (doto (MockWebServer.) (.start))]
      (try
        (.enqueue server (.build (MockResponse$Builder.)))
        (let [body "{\"event\":\"create\"}"
              body-bytes (.getBytes body StandardCharsets/UTF_8)
              url (str "http://127.0.0.1.nip.io:" (.getPort server) "/hook")
              _ (webhook-sender/send-webhook url (random-uuid) 0 body-bytes)
              recorded (.takeRequest server)
              sig-header (.. recorded (getHeaders) (get "Instant-Signature"))
              {:strs [t kid v1]} (into {} (for [pair (string/split sig-header #",")
                                                :let [[k v] (string/split pair #"=" 2)]]
                                            [k v]))
              jwk (->> (webhook-routes/get-signing-keys nil)
                       :body
                       :keys
                       (filter #(= kid (:kid %)))
                       first)
              pub-key (jwk->public-key jwk)
              sig-bytes (crypt-util/hex-string->bytes v1)
              recorded-body (.. recorded (getBody) (utf8))
              verifier (doto (Signature/getInstance "Ed25519")
                         (.initVerify pub-key)
                         (.update (.getBytes (str t "." recorded-body)
                                             StandardCharsets/UTF_8)))]
          (is (= body recorded-body))
          (is (= "InstantDB Webhook Sender"
                 (.. recorded (getHeaders) (get "User-Agent"))))
          (is (.verify verifier sig-bytes)))
        (finally
          (.close server))))))

(deftest validate-url-test
  (is (nil? (webhook-sender/validate-url "https://example.com/hook"))
      "valid public url succeeds")

  (is (thrown-with-msg? clojure.lang.ExceptionInfo
                        #"Could not resolve URL"
                        (webhook-sender/validate-url "https://127.0.0.1.nip.io"))
      "loopback IP via nip.io is rejected")

  (is (thrown-with-msg? clojure.lang.ExceptionInfo
                        #"Could not resolve URL"
                        (webhook-sender/validate-url "https://10.0.0.1.nip.io"))
      "private IP via nip.io is rejected")

  (is (thrown-with-msg? clojure.lang.ExceptionInfo
                        #"Could not resolve URL"
                        (webhook-sender/validate-url "https://169.254.169.254.nip.io"))
      "ec2 metadata IP via nip.io is rejected")

  (is (thrown-with-msg? clojure.lang.ExceptionInfo
                        #"Could not resolve URL"
                        (webhook-sender/validate-url
                         (str "https://"
                              (crypt-util/random-hex 16) "."
                              (crypt-util/random-hex 16))))
      "non-resolvable host is rejected"))
