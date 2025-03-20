(ns instant.util.crypt
  (:require [instant.util.uuid :as uuid-util])
  (:import
   (java.security MessageDigest)
   (java.util UUID)
   (javax.crypto Mac)
   (javax.crypto.spec SecretKeySpec)
   (com.google.crypto.tink Aead JsonKeysetReader TinkJsonProtoKeysetFormat
                           CleartextKeysetHandle HybridEncrypt HybridDecrypt
                           KeysetHandle
                           ;; Only used for bootstrapping for OSS
                           InsecureSecretKeyAccess)
   (com.google.crypto.tink.aead AeadConfig
                                PredefinedAeadParameters
                                AeadWrapper$WrappedAead)
   (com.google.crypto.tink.hybrid HybridConfig
                                  HybridDecryptWrapper$WrappedHybridDecrypt
                                  HybridEncryptWrapper$WrappedHybridEncrypt)
   (com.google.crypto.tink.integration.awskms AwsKmsClient)
   (com.google.crypto.tink.subtle Random)
   (org.apache.commons.codec.binary Hex)))

(defn uuid->sha256
  "Returns the sha256 of a java.util.UUID as a byte array"
  [^UUID uuid]
  (.digest (MessageDigest/getInstance "SHA-256") (uuid-util/->bytes uuid)))

(defn str->sha256
  "Returns the sha256 of a string as a byte array"
  [^String s]
  (.digest (MessageDigest/getInstance "SHA-256") (.getBytes s)))

(defn bytes->sha256
  "Returns the sha256 of a byte array as a byte array"
  [^bytes b]
  (.digest (MessageDigest/getInstance "SHA-256") b))

(defn str->md5
  "Returns the md5 of a string as a byte array"
  [^String s]
  (.digest (MessageDigest/getInstance "MD5") (.getBytes s)))

(defn str->utf-8-bytes
  "Converts a string to a byte array using UTF-8 encoding"
  [^String s]
  (.getBytes s "UTF-8"))

;; The md5 of json null in postgres
;; select md5('null') or (-> "null" str->md5 bytes->hex-string)
(def json-null-md5 "37a6259cc0c1dae299a7866489dff0bd")

(defn constant-bytes=
  "Constant time comparison to prevent timing attacks"
  [bytes-a bytes-b]
  (MessageDigest/isEqual bytes-a bytes-b))

(defn constant-uuid=
  "Constant time comparison to prevent timing attacks"
  [uuid-a uuid-b]
  (MessageDigest/isEqual (uuid-util/->bytes uuid-a) (uuid-util/->bytes uuid-b)))

(defn constant-string=
  "Constant time comparison to prevent timing attacks"
  [^String str-a ^String str-b]
  (MessageDigest/isEqual (.getBytes str-a) (.getBytes str-b)))

(defn bytes->hex-string [^bytes b]
  (String. (Hex/encodeHex b)))

(defn hex-string->bytes [^String s]
  (Hex/decodeHex s))

(defn random-bytes [^Long size]
  (Random/randBytes size))

(defn random-hex [^Long size]
  (bytes->hex-string (Random/randBytes size)))

(defn hmac-256 [^bytes secret-key ^bytes b]
  (let [mac (Mac/getInstance "HmacSHA256")]
    (.init mac (SecretKeySpec. secret-key "HmacSHA256"))
    (.doFinal mac b)))

(defonce default-aead (atom nil))

(defn assert-default-aead []
  (if-let [aead @default-aead]
    aead
    (throw (Exception. "default-aead is nil"))))

(defn aead-encrypt
  "Encrypts plaintext with associated data:
   https://developers.google.com/tink/encrypt-data#aead"
  ([input]
   (aead-encrypt (assert-default-aead) input))
  ([^AeadWrapper$WrappedAead aead {:keys [^bytes plaintext ^bytes associated-data] :as _input}]
   (.encrypt aead plaintext associated-data)))

(defn aead-decrypt
  "Decrypts ciphertext encrypted with aead-encrypt"
  (^bytes [input]
   (aead-decrypt (assert-default-aead) input))
  (^bytes [^AeadWrapper$WrappedAead aead {:keys [^bytes ciphertext ^bytes associated-data] :as _input}]
   (.decrypt aead ciphertext associated-data)))

(defn hybrid-encrypt
  "Encrypts plaintext with associated data:
   https://developers.google.com/tink/exchange-data#hybrid_encryption"
  [^HybridEncryptWrapper$WrappedHybridEncrypt hybrid {:keys [^bytes plaintext ^bytes associated-data] :as _input}]
  (.encrypt hybrid plaintext associated-data))

(defn hybrid-decrypt
  "Decrypts ciphertext encrypted with hybrid-encrypt:
  https://developers.google.com/tink/exchange-data#hybrid_encryption"
  [^HybridDecryptWrapper$WrappedHybridDecrypt hybrid
   {:keys [^bytes ciphertext ^bytes associated-data] :as _input}]
  (.decrypt hybrid ciphertext associated-data))

;; A type for encapsulating sensitive information. When printed,
;; it displays "<secret>" instead of the actual value.
(deftype Secret [value]
  Object
  (toString [_this] "<secret>"))

(defn secret-value [^Secret secret]
  (.value secret))

(defn obfuscate
  "Helper function so you don't have to import the Secret type to
  wrap a value with Secret"
  [v]
  (Secret. v))

(defn get-aead-primitive [aead-config]
  (if-not (:encrypted? aead-config)
    (-> (:json aead-config)
        (JsonKeysetReader/withString)
        (CleartextKeysetHandle/read)
        (.getPrimitive Aead))
    (let [encrypted-keyset (:json aead-config)
          client (AwsKmsClient.)
          key-url (:kms-key-url aead-config)
          aead (.getAead client key-url)]
      (-> (TinkJsonProtoKeysetFormat/parseEncryptedKeyset encrypted-keyset
                                                          aead
                                                          (byte-array 0))
          (.getPrimitive Aead)))))

(defn get-hybrid-decrypt-primitive [hybrid-config]
  (let [client (AwsKmsClient.)
        key-url (:kms-key-url hybrid-config)
        aead (.getAead client key-url)]
    (-> (TinkJsonProtoKeysetFormat/parseEncryptedKeyset (:json hybrid-config)
                                                        aead
                                                        (byte-array 0))
        (.getPrimitive HybridDecrypt))))

(defn get-hybrid-encrypt-primitive [hybrid-config]
  (-> (:public-key-json hybrid-config)
      (JsonKeysetReader/withString)
      (CleartextKeysetHandle/read)
      (.getPrimitive HybridEncrypt)))

(defn register-aead []
  (AeadConfig/register))

(defn init-aead [aead-config]
  (register-aead)
  (let [primitive (get-aead-primitive aead-config)]
    (reset! default-aead primitive)))

(defn register-hybrid []
  (HybridConfig/register))

(defn init-hybrid []
  (register-hybrid))

(defn init [aead-config]
  (init-aead aead-config)
  (init-hybrid))

;; Utilities for bootstrap

(defn generate-unencrypted-aead-keyset []
  (-> (KeysetHandle/generateNew PredefinedAeadParameters/AES128_GCM)
      (TinkJsonProtoKeysetFormat/serializeKeyset (InsecureSecretKeyAccess/get))))
