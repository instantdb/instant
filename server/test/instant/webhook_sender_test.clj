(ns instant.webhook-sender-test
  (:require
   [clojure.test :refer [deftest is]]
   [instant.util.crypt :as crypt-util]
   [instant.webhook-routes :as webhook-routes]
   [instant.webhook-sender :as webhook-sender])
  (:import
   (java.math BigInteger)
   (java.net UnknownHostException)
   (java.nio.charset StandardCharsets)
   (java.security KeyFactory PublicKey Signature)
   (java.security.spec EdECPoint EdECPublicKeySpec NamedParameterSpec)
   (java.util Base64)))

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
  (is (thrown? UnknownHostException
               (webhook-sender/send-webhook "https://127.0.0.1.nip.io" "{\"hello\": \"world\"}")))

  (is (thrown? UnknownHostException
               (webhook-sender/send-webhook "https://10.0.0.1.nip.io" "{\"hello\": \"world\"}")))

  (is (thrown? UnknownHostException
               (webhook-sender/send-webhook "https://169.254.169.254.nip.io" "{\"hello\": \"world\"}"))))
