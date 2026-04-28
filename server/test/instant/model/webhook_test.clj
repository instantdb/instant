(ns instant.model.webhook-test
  (:require
   [clojure.test :refer [deftest is]]
   [instant.model.webhook :as webhook]
   [instant.util.crypt :as crypt-util]
   [instant.webhook-routes :as webhook-routes])
  (:import
   (java.math BigInteger)
   (java.nio.charset StandardCharsets)
   (java.security KeyFactory PublicKey Signature)
   (java.security.spec EdECPoint EdECPublicKeySpec NamedParameterSpec)
   (java.util Base64)))

(defn- jwk->public-key ^PublicKey [{:keys [x]}]
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
        {:keys [kid signature t]} (webhook/sign-webhook body)
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
