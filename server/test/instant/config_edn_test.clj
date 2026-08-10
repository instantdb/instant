(ns instant.config-edn-test
  (:require [instant.config-edn :as config-edn]
            [instant.util.crypt :as crypt-util]
            [instant.util.json :refer [<-json]]
            [clojure.test :refer [deftest testing is]]
            [clojure.walk :as w]))

(defn key-id->int
  "Converts a 4-byte key ID to an unsigned 32-bit integer"
  [^bytes key-id]
  (when key-id
    (let [b0 (bit-and (aget key-id 0) 0xFF)
          b1 (bit-and (aget key-id 1) 0xFF)
          b2 (bit-and (aget key-id 2) 0xFF)
          b3 (bit-and (aget key-id 3) 0xFF)]
      (bit-or (bit-shift-left b0 24)
              (bit-shift-left b1 16)
              (bit-shift-left b2 8)
              b3))))

(defn ciphertext-key-id [^String cipherhex]
  (let [ciphertext (crypt-util/hex-string->bytes cipherhex)
        version-byte (aget ciphertext 0)]
    (assert (= version-byte (byte 1)))
    (key-id->int (byte-array (take 4 (drop 1 ciphertext))))))

(defn check-data-encrypted-with-correct-key [config]
  (let [keyids (-> config
                   :hybrid-keyset
                   :public-key-json
                   (<-json true)
                   :key
                   (#(map (fn [k] (:keyId k)) %))
                   set)]
    (w/postwalk (fn [x]
                  (when (and (map? x)
                             (:enc x))
                    (is (contains? keyids
                                   (ciphertext-key-id (:enc x)))
                        (str "Data was encrypted with unknown key id " (ciphertext-key-id (:enc x)))))
                  x)
                config)))

(deftest env-override-naming
  (is (= "INSTANT_CONFIG_S3_ENDPOINT"
         (config-edn/config-env-var-name :s3-endpoint)))
  (is (= "INSTANT_CONFIG_POSTMARK_TOKEN"
         (config-edn/config-env-var-name :postmark-token))))

(deftest env-overrides-obfuscate-secrets-only
  ;; With no INSTANT_CONFIG_* env vars set, there's nothing to override.
  (is (= {} (config-edn/env-overrides crypt-util/obfuscate)))
  ;; A string-valued config key is overridable; a structured one is not.
  (let [overridable? #(some? (#'config-edn/overridable-key-type %))]
    (is (overridable? :s3-endpoint))
    (is (overridable? :postmark-token))
    (is (not (overridable? :google-oauth-client)))
    (is (not (overridable? :aead-keyset)))))

(deftest config-smoketest
  (testing "dev config"
    ;; If this test fails, then there is either something wrong
    ;; with the types in instant.config-edn or with the config in
    ;; resources/config/dev.edn
    (is (config-edn/valid-config? false (config-edn/read-config :dev)))
    (check-data-encrypted-with-correct-key (config-edn/read-config :dev)))
  (testing "prod config"
    ;; If this test fails, then there is either something wrong
    ;; with the types in instant.config-edn or with the config in
    ;; resources/config/prod.edn
    (is (config-edn/valid-config? true (config-edn/read-config :prod)))
    (check-data-encrypted-with-correct-key (config-edn/read-config :prod)))
  (testing "staging config"
    ;; If this test fails, then there is either something wrong
    ;; with the types in instant.config-edn or with the config in
    ;; resources/config/staging.edn
    (is (config-edn/valid-config? true (config-edn/read-config :staging)))
    (check-data-encrypted-with-correct-key (config-edn/read-config :staging))))
