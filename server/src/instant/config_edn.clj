(ns instant.config-edn
  (:require [clojure.edn :as edn]
            [clojure.java.io :as io]
            [clojure.spec.alpha :as s]
            [clojure.string]
            [clojure.walk :as w]
            [clojure.tools.logging :as log])
  (:import (org.apache.commons.codec.binary Hex)))

(defn hex-encoded? [^String s]
  (try
    (Hex/decodeHex s)
    true
    (catch Exception _e
      false)))

(s/def ::hex-encoded (s/and string? hex-encoded?))

(s/def ::enc ::hex-encoded)
(s/def ::enc-bytes ::hex-encoded)

(s/def ::encoded (s/keys :req-un [::enc]))

(s/def ::config-value (s/or ::encoded ::encoded
                            ::plain string?))

(s/def ::client-id string?)
(s/def ::client-secret ::config-value)
(s/def ::oauth-client (s/keys :req-un [::client-id
                                       ::client-secret]))

(s/def ::provider_name string?)
(s/def ::client_id string?)
(s/def ::client_secret ::config-value)
(s/def ::shared-oauth-client (s/keys :req-un [::provider_name
                                              ::client_id
                                              ::client_secret]))
(s/def ::shared-oauth-clients (s/coll-of ::shared-oauth-client))

(s/def ::private-key (s/or ::encoded-bytes (s/keys :req-un [::enc-bytes])))
(s/def ::key-id string?)
(s/def ::cloudfront-signing-key (s/keys :req-un [::key-id ::private-key]))
(s/def ::s3-storage-access-key ::config-value)
(s/def ::s3-storage-secret-key ::config-value)
(s/def ::s3-endpoint string?)
(s/def ::s3-public-endpoint string?)
(s/def ::s3-region string?)
(s/def ::s3-bucket-name string?)
(s/def ::postmark-token ::config-value)
(s/def ::sendgrid-token ::config-value)
(s/def ::resend-token ::config-value)
(s/def ::postmark-account-token ::config-value)
(s/def ::secret-discord-token ::config-value)
(s/def ::database-url ::config-value)
(s/def ::next-database-url ::config-value)
(s/def ::database-cluster-id string?)
(s/def ::next-database-cluster-id string?)
(s/def ::stripe-secret ::config-value)
(s/def ::stripe-webhook-secret ::config-value)
(s/def ::honeycomb-api-key ::config-value)
(s/def ::posthog-api-key ::config-value)
(s/def ::google-oauth-client ::oauth-client)
(s/def ::kms-key-url string?)
(s/def ::rate-limit-hmac-key ::config-value)

(s/def ::encrypted? boolean?)
(s/def ::json string?)
(s/def ::public-key-json ::json)

(s/def ::aead-keyset (s/keys :req-un [::encrypted?
                                      ::json]
                             :opt-un [::kms-key-url]))
(s/def ::hybrid-keyset (s/keys :req-un [::kms-key-url
                                        ::json
                                        ::public-key-json]))
(s/def ::webhook-keyset (s/keys :req-un [::encrypted?
                                         ::json]
                                :opt-un [::kms-key-url]))

(s/def ::config (s/keys :opt-un [::cloudfront-signing-key
                                 ::s3-storage-access-key
                                 ::s3-storage-secret-key
                                 ::s3-endpoint
                                 ::s3-public-endpoint
                                 ::s3-region
                                 ::s3-bucket-name
                                 ::database-url
                                 ::next-database-cluster-id
                                 ::postmark-token
                                 ::sendgrid-token
                                 ::resend-token
                                 ::postmark-account-token
                                 ::secret-discord-token
                                 ::stripe-secret
                                 ::stripe-webhook-secret
                                 ::honeycomb-api-key
                                 ::posthog-api-key
                                 ::google-oauth-client
                                 ::shared-oauth-clients
                                 ::hybrid-keyset
                                 ::rate-limit-hmac-key
                                 ::webhook-keyset]
                        :req-un [::aead-keyset]))

;; Prod config is more restrictive because we don't want to accidentally
;; forget to set one of these variables in prod
(s/def ::config-prod (s/keys :req-un [::aead-keyset
                                      ::cloudfront-signing-key
                                      ::s3-storage-access-key
                                      ::s3-storage-secret-key
                                      ::database-cluster-id
                                      ::postmark-token
                                      ::postmark-account-token
                                      ::sendgrid-token
                                      ::secret-discord-token
                                      ::stripe-secret
                                      ::stripe-webhook-secret
                                      ::honeycomb-api-key
                                      ::google-oauth-client
                                      ::hybrid-keyset
                                      ::rate-limit-hmac-key
                                      ::webhook-keyset]
                             :opt-un [::next-database-cluster-id
                                      ::shared-oauth-clients]))

(defn config-spec [prod?]
  (if prod?
    ::config-prod
    ::config))

(defn valid-config? [prod? config-edn]
  (or
   (s/valid? (config-spec prod?) config-edn)
   (s/explain (config-spec prod?) config-edn)))

(defn read-config [env]
  (let [override (when (= :dev env)
                   (io/resource "config/override.edn"))
        overlay (some-> (io/resource "config/overlay.edn")
                        slurp
                        edn/read-string)]
    (when override
      ;; Can't use tracer because it requires config to be decoded before
      ;; it is initialized
      (log/info "Using config at resources/config/override.edn"))
    (-> (or override
            (io/resource (format "config/%s.edn" (name env))))
        slurp
        edn/read-string
        (merge overlay))))

(def associated-data (.getBytes "config"))

(defn- keys-spec-keys
  "Returns the unqualified config keys declared by an `s/keys` spec."
  [spec-kw]
  (let [opts (apply hash-map (rest (s/form spec-kw)))]
    (map (comp keyword name)
         (concat (:req-un opts) (:opt-un opts)))))

(def config-keys
  "Every config key known to the spec, whether it's required in dev or prod."
  (delay (distinct (concat (keys-spec-keys ::config)
                           (keys-spec-keys ::config-prod)))))

(defn- overridable-key-type
  "Classifies a config key as :secret (a `::config-value`, stored obfuscated),
   :plain (a bare string), or nil for structured keys we can't represent as a
   single env var (keysets, oauth clients, etc.)."
  [config-key]
  (let [spec-kw (keyword (namespace ::config) (name config-key))]
    (when (s/get-spec spec-kw)
      (let [form (s/form spec-kw)]
        (cond
          (= form 'clojure.core/string?) :plain
          (= form (s/form ::config-value)) :secret)))))

(defn config-env-var-name
  "The env var that overrides `config-key`, e.g. :s3-endpoint ->
   INSTANT_CONFIG_S3_ENDPOINT."
  [config-key]
  (str "INSTANT_CONFIG_"
       (-> (name config-key)
           (clojure.string/upper-case)
           (clojure.string/replace "-" "_"))))

(defn env-overrides
  "Reads INSTANT_CONFIG_* env vars for every string-valued config key, so any
   such setting in the edn file can be overridden from the environment. Secrets
   are obfuscated so they read back like the decrypted config."
  [obfuscate]
  (reduce (fn [acc k]
            (if-let [t (overridable-key-type k)]
              (if-let [v (System/getenv (config-env-var-name k))]
                (assoc acc k (if (= t :secret) (obfuscate v) v))
                acc)
              acc))
          {}
          @config-keys))

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
                                  {:ciphertext (Hex/decodeHex ^String hex-string)
                                   :associated-data associated-data}))]
    (merge
     (w/postwalk
      (fn [x]
        (if-not (and (vector? x)
                     (keyword? (first x))
                     (= (namespace (first x))
                        (namespace ::test)))
          x
          (case (first x)
            ::plain (obfuscate (second x))
            ::encoded (-> ^bytes (decrypt (-> x second :enc))
                          (String.)
                          obfuscate)
            ::encoded-bytes (-> ^bytes (decrypt (-> x second :enc-bytes))
                                obfuscate))))
      (s/conform ::config config-edn))
     ;; Any string-valued config key can be overridden from the environment
     ;; via INSTANT_CONFIG_<SNAKE_CASE_KEY>.
     (env-overrides obfuscate))))
