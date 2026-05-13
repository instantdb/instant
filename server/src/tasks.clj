(ns tasks
  (:require [tool]
            [clojure.java.io :as io]
            [clojure.java.process :as process]
            [clojure.string :as string]
            [instant.util.crypt :as crypt-util]
            [instant.config-edn :as config-edn]
            [instant.config :as config]
            [lambdaisland.uri :as uri]
            [next.jdbc.connection :refer [jdbc-url]])
  (:import (java.io BufferedReader File InputStreamReader)
           (java.nio.file Path Paths)
           (sun.misc Signal SignalHandler)
           (software.amazon.awssdk.core.sync RequestBody)
           (software.amazon.awssdk.regions Region)
           (software.amazon.awssdk.services.s3 S3Client)
           (software.amazon.awssdk.services.s3.model HeadObjectRequest
                                                    NoSuchKeyException
                                                    PutObjectRequest
                                                    S3Exception)))

(defn read-input ^String []
  (let [reader (BufferedReader. (InputStreamReader. System/in))]
    (.readLine reader)))

(defn setup-signal-handler []
  (Signal/handle (Signal. "INT")
                 (proxy [SignalHandler] []
                   (handle [_] (System/exit 0)))))

(defn println-err
  "Use println-err for system messages to allow piping in the shell."
  [& more]
  (binding [*out* *err*]
    (apply println more)))

(defn encrypt-config-secret
  "Encrypts secret with the public key. Used for encrypting
   config secrets."
  [{:keys [env]}]
  (setup-signal-handler)
  (println-err "Paste in your secret (enter to continue):")
  (crypt-util/register-hybrid)
  (let [secret (.getBytes (read-input))
        config (config-edn/read-config env)
        hybrid (crypt-util/get-hybrid-encrypt-primitive (:hybrid-keyset config))
        ciphertext (crypt-util/hybrid-encrypt
                    hybrid
                    {:plaintext secret
                     :associated-data config-edn/associated-data})
        cipherhex (crypt-util/bytes->hex-string ciphertext)]

    (println-err "Your encrypted secret (also copied to your clipboard):")
    (tool/copy cipherhex)
    (println cipherhex)))

(defn generate-cloudfront-key [{:keys [env]}]
  (setup-signal-handler)
  (crypt-util/register-hybrid)
  (let [key (crypt-util/generate-cloudfront-key)
        config (config-edn/read-config env)
        hybrid (crypt-util/get-hybrid-encrypt-primitive (:hybrid-keyset config))
        ciphertext (crypt-util/hybrid-encrypt
                    hybrid
                    {:plaintext (.getEncoded (.getPrivate key))
                     :associated-data config-edn/associated-data})
        cipherhex (crypt-util/bytes->hex-string ciphertext)]
    (println-err "Public Key:")
    (println-err (crypt-util/print-rsa-public-key key))
    (tool/copy (crypt-util/print-rsa-public-key key))
    (println-err "Your encrypted private key (also copied to your clipboard):")
    (tool/copy cipherhex)
    (println cipherhex)))

;; OSS bootstrap

(defn jdbc-url->postgres-url [url & params]
  (let [{:keys [host port path query]} (uri/parse (subs url (count "jdbc:")))
        {:keys [user username password]} (uri/query-string->map query)]
    (uri/uri-str (merge {:scheme "postgresql"
                         :host host
                         :port port
                         :user (or user username)
                         :password password
                         :path path}
                        (when params
                          {:query (uri/map->query-string (first params))})))))

(defn ensure-override-config
  "Creates a config file that will override the default `dev.edn` config,
  since an oss developer won't be able to decode the dev.edn file."
  []
  (when-not (io/resource "config/override.edn")
    (crypt-util/register-aead)
    (crypt-util/register-signature)
    (println "Writing config file to server/resources/config/override.edn")
    (spit "resources/config/override.edn"
          (pr-str
           {:aead-keyset {:encrypted? false
                          :json (crypt-util/generate-unencrypted-aead-keyset)}
            :webhook-keyset {:encrypted? false
                             :json (crypt-util/generate-webhook-signing-key)}}))))

(defn migrate-database []
  (config/init)
  (let [database-url (-> (config/get-aurora-config)
                         (jdbc-url)
                         (jdbc-url->postgres-url {:sslmode "disable"}))]
    (process/exec "migrate"
                  "-database" database-url
                  "-path" "resources/migrations"
                  "up")))

(defn bootstrap-for-oss
  "Helper to setup everything the server needs for its initial run."
  [_args]
  (ensure-override-config)
  (println "Migrating database")
  (migrate-database))

;; Maven dependency mirror -> S3
;;
;; tools.deps ships with a built-in Maven Resolver Transporter that reads
;; from `s3://` URLs in :mvn/repos (Cognitect aws-api under the hood). That
;; transporter is read-only, so we upload artifacts ourselves with the AWS
;; SDK. Reading side is wired up in scripts/clj-deps-mirror.

(def ^:private mirror-skip-name-prefixes
  ["_"])

(def ^:private mirror-skip-suffixes
  [".lastUpdated" ".repositories" "resolver-status.properties"])

(defn- mirror-include? [^String name]
  (and (not (some (fn [^String p] (.startsWith name p)) mirror-skip-name-prefixes))
       (not (some (fn [^String s] (.endsWith name s)) mirror-skip-suffixes))))

(defn- m2-root ^Path []
  (Paths/get (System/getProperty "user.home")
             (into-array String [".m2" "repository"])))

(defn- s3-key [^Path m2 ^Path file ^String prefix]
  (let [rel (-> (.relativize m2 file)
                .toString
                (.replace File/separatorChar \/))]
    (if (string/blank? prefix) rel (str prefix "/" rel))))

(defn- s3-has-key? [^S3Client s3 bucket key]
  (try
    (.headObject s3 (-> (HeadObjectRequest/builder)
                        (.bucket bucket)
                        (.key key)
                        ^HeadObjectRequest (.build)))
    true
    (catch NoSuchKeyException _ false)
    (catch S3Exception e
      (if (= 404 (.statusCode e))
        false
        (throw e)))))

(defn- s3-put [^S3Client s3 bucket key ^File file]
  (.putObject s3
              (-> (PutObjectRequest/builder)
                  (.bucket bucket)
                  (.key key)
                  ^PutObjectRequest (.build))
              (RequestBody/fromFile file)))

(defn- mirror-version-dirs
  "Returns the set of Maven version directories (paths like
   ~/.m2/repository/<g>/<a>/<v>) corresponding to the basis libs that were
   resolved from a Maven repo (skipping git deps)."
  [basis]
  (let [m2 (.toAbsolutePath (m2-root))]
    (->> (:libs basis)
         (keep (fn [[_lib coord]]
                 (when (:mvn/version coord)
                   (first (:paths coord)))))
         (keep (fn [^String jar-path]
                 (let [p (.toAbsolutePath (Paths/get jar-path (into-array String [])))]
                   (when (.startsWith p m2)
                     (.getParent p)))))
         distinct)))

(defn mirror-deps-to-s3
  "Resolves the project basis and uploads every Maven artifact in it to an
   S3 bucket using the standard Maven 2 layout.

   Args (passed via -X):
     :bucket   string, required. S3 bucket to upload to.
     :prefix   string, optional. Key prefix in the bucket (no leading or
               trailing slash). Default \"\" (bucket root).
     :region   string, optional. Default \"us-east-1\".
     :aliases  vector of keywords, optional. deps.edn aliases whose deps
               should also be mirrored. Default [:dev :test :build].

   Idempotent: skips objects already in the bucket (HeadObject check).

   Run after `clojure -P` (with the same aliases) so the artifacts are
   actually present in ~/.m2/repository."
  [{:keys [bucket prefix region aliases]
    :or   {prefix  ""
           region  "us-east-1"
           aliases [:dev :test :build]}}]
  (assert (and (string? bucket) (seq bucket)) "Missing :bucket")
  (require 'clojure.tools.build.api)
  (let [create-basis (resolve 'clojure.tools.build.api/create-basis)
        _ (assert create-basis "io.github.clojure/tools.build must be on the classpath")
        basis        (create-basis {:project "deps.edn" :aliases aliases})
        m2           (.toAbsolutePath (m2-root))
        dirs         (mirror-version-dirs basis)
        s3           (-> (S3Client/builder)
                         (.region (Region/of region))
                         ^S3Client (.build))
        counters     (atom {:put 0 :skip 0})]
    (println-err (format "[mirror] %d Maven version dirs to consider -> s3://%s%s"
                         (count dirs)
                         bucket
                         (if (string/blank? prefix) "" (str "/" prefix))))
    (try
      (doseq [^Path dir dirs
              ^File f   (file-seq (.toFile dir))
              :when     (.isFile f)
              :let      [name (.getName f)]
              :when     (mirror-include? name)
              :let      [key (s3-key m2 (.toPath f) prefix)]]
        (if (s3-has-key? s3 bucket key)
          (do (swap! counters update :skip inc)
              ;; quieter: only log skips at trace-level. comment if too noisy.
              )
          (do (println-err "[mirror] put" key)
              (s3-put s3 bucket key f)
              (swap! counters update :put inc))))
      (let [{:keys [put skip]} @counters]
        (println-err (format "[mirror] done. uploaded=%d already-present=%d" put skip)))
      (finally
        (.close s3)))))
