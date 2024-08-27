(ns instant.config-edn
  (:require [clojure.edn :as edn]
            [clojure.java.io :as io]
            [clojure.spec.alpha :as s]
            [clojure.walk :as w]
            [clojure.tools.logging :as log])
  (:import (org.apache.commons.codec.binary Hex)))

(defn hex-encoded? [s]
  (try
    (Hex/decodeHex s)
    true
    (catch Exception _e
      false)))

(s/def ::hex-encoded (s/and string? hex-encoded?))

(s/def ::enc ::hex-encoded)

(s/def ::encoded (s/keys :req-un [::enc]))

(s/def ::config-value (s/or ::encoded ::encoded
                            ::plain string?))

(s/def ::client-id string?)
(s/def ::client-secret ::config-value)
(s/def ::oauth-client (s/keys :req-un [::client-id
                                       ::client-secret]))

(s/def ::postmark-token ::config-value)
(s/def ::postmark-account-token ::config-value)
(s/def ::secret-discord-token ::config-value)
(s/def ::database-url ::config-value)
(s/def ::stripe-secret ::config-value)
(s/def ::stripe-webhook-secret ::config-value)
(s/def ::honeycomb-api-key ::config-value)
(s/def ::google-oauth-client ::oauth-client)
(s/def ::instant-config-app-id uuid?)
(s/def ::kms-key-url string?)

(s/def ::encrypted? boolean?)
(s/def ::json string?)
(s/def ::public-key-json ::json)

(s/def ::aead-keyset (s/keys :req-un [::encrypted?
                                      ::json]
                             :opt-un [::kms-key-url]))
(s/def ::hybrid-keyset (s/keys :req-un [::kms-key-url
                                        ::json
                                        ::public-key-json]))

(s/def ::config (s/keys :opt-un [::instant-config-app-id
                                 ::database-url
                                 ::postmark-token
                                 ::postmark-account-token
                                 ::secret-discord-token
                                 ::stripe-secret
                                 ::stripe-webhook-secret
                                 ::honeycomb-api-key
                                 ::google-oauth-client
                                 ::hybrid-keyset]
                        :req-un [::aead-keyset]))

;; Prod config is more restrictive because we don't want to accidentally
;; forget to set one of these variables in prod
(s/def ::config-prod (s/keys :req-un [::aead-keyset
                                      ::database-url
                                      ::postmark-token
                                      ::postmark-account-token
                                      ::secret-discord-token
                                      ::stripe-secret
                                      ::stripe-webhook-secret
                                      ::honeycomb-api-key
                                      ::google-oauth-client
                                      ::hybrid-keyset]
                             :opt-un [::instant-config-app-id]))

(defn config-spec [prod?]
  (if prod?
    ::config-prod
    ::config))

(defn valid-config? [prod? config-edn]
  (s/valid? (config-spec prod?) config-edn))

(defn read-config [env]
  (let [override (io/resource "config/override.edn")
        overlay (some-> (io/resource "config/overlay.edn")
                        slurp
                        edn/read-string)]
    (when override
      ;; Can't use tracer because it requires config to be decoded before
      ;; it is initialized
      (log/infof "Using config at resources/config/override.edn"))
    (-> (or override
            (io/resource (format "config/%s.edn" (name env))))
        slurp
        edn/read-string
        (merge overlay))))

(def associated-data (.getBytes "config"))

(defn decrypted-config
  "Given a config edn, decrypts the config and obfsucates the secrets
  Takes `obfuscate`, `get-hybrid-decrypt-primitive`, and `hybrid-decrypt`
  as arguments so that we don't have a dependency on instant.util.crypt."
  [obfuscate get-hybrid-decrypt-primitive hybrid-decrypt prod? config-edn]
  (when (not (valid-config? prod? config-edn))
    (throw (ex-info "Invalid config" (s/explain-data (config-spec prod?)
                                                     config-edn))))
  (let [hybrid (when (:hybrid-keyset config-edn)
                 (get-hybrid-decrypt-primitive (:hybrid-keyset config-edn)))
        decrypt (fn [hex-string]
                  (when-not hybrid
                    (throw (ex-info "Config property is encrypted, but there is no :hybrid-keyset in the config."
                                    {:config config-edn})))
                  (hybrid-decrypt hybrid
                                  {:ciphertext (Hex/decodeHex hex-string)
                                   :associated-data associated-data}))]
    (w/postwalk
     (fn [x]
       (if-not (and (vector? x)
                    (keyword? (first x))
                    (= (namespace (first x))
                       (namespace ::test)))
         x
         (case (first x)
           ::plain (obfuscate (second x))
           ::encoded (-> (decrypt (-> x second :enc))
                         (String.)
                         obfuscate))))
     (s/conform ::config config-edn))))
