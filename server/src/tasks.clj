(ns tasks
  (:require [tool]
            [clojure.java.io :as io]
            [clojure.java.process :as process]
            [clojure.string :as string]
            [instant.util.crypt :as crypt-util]
            [instant.util.email :as email]
            [instant.config-edn :as config-edn]
            [instant.config :as config]
            [instant.config-app :as config-app]
            [instant.db.model.attr :as attr-model]
            [instant.db.transaction :as tx]
            [instant.jdbc.sql :as sql]
            [instant.model.app :as app-model]
            [instant.model.instant-user :as instant-user-model]
            [instant.model.rule :as rule-model]
            [instant.model.schema :as schema-model]
            [instant.util.tracer :as tracer]
            [lambdaisland.uri :as uri]
            [next.jdbc :as next-jdbc]
            [next.jdbc.connection :refer [jdbc-url]])
  (:import (java.io BufferedReader InputStreamReader)
           (java.util UUID)
           (sun.misc Signal SignalHandler)))

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

(defn generate-override-config
  "Writes a fresh OSS override config. Set OVERRIDE_CONFIG_PATH to write outside
  resources/config/override.edn, e.g. when creating a Docker Swarm secret."
  [_args]
  (let [path (or (System/getenv "OVERRIDE_CONFIG_PATH")
                 "resources/config/override.edn")]
    (io/make-parents path)
    (crypt-util/register-aead)
    (crypt-util/register-signature)
    (println "Writing config file to" path)
    (spit path
          (pr-str
           {:aead-keyset {:encrypted? false
                          :json (crypt-util/generate-unencrypted-aead-keyset)}
            :webhook-keyset {:encrypted? false
                             :json (crypt-util/generate-webhook-signing-key)}}))))

(defn ensure-override-config
  "Creates a config file that will override the default `dev.edn` config,
  since an oss developer won't be able to decode the dev.edn file."
  []
  (when-not (io/resource "config/override.edn")
    (generate-override-config nil)))

(defn migrate-database []
  (config/init)
  (let [database-url (-> (config/get-aurora-config)
                         (jdbc-url)
                         (jdbc-url->postgres-url {:sslmode "disable"}))]
    (process/exec "migrate"
                  "-database" database-url
                  "-path" "resources/migrations"
                  "up")))

(defn bootstrap-superuser-email []
  (when-let [value (some-> (System/getenv "INSTANT_BOOTSTRAP_SUPERUSER_EMAIL")
                           string/trim
                           not-empty)]
    (or (email/coerce value)
        (throw (ex-info
                "INSTANT_BOOTSTRAP_SUPERUSER_EMAIL must be a valid email address."
                {:value value})))))

(defn ensure-config-app-schema! [conn app-id]
  (let [current-attrs (attr-model/get-by-app-id conn app-id)
        current-schema (schema-model/attrs->schema current-attrs)
        new-schema (schema-model/defs->schema config-app/schema)
        steps (schema-model/schemas->ops
               {:check-types? true
                :background-updates? false}
               current-schema
               new-schema)]
    (when (seq steps)
      (tx/transact-without-tx-conn!
       conn
       current-attrs
       app-id
       steps
       {:skip-app-status-write-check? true}))
    (when-not (rule-model/get-by-app-id conn {:app-id app-id})
      (rule-model/put! conn {:app-id app-id
                             :code config-app/rules}))))

(defn bootstrap-config-app! []
  (let [app-id (config/instant-config-app-id)
        superuser-email (bootstrap-superuser-email)]
    (when-not app-id
      (throw (ex-info
              "INSTANT_CONFIG_APP_ID is required to bootstrap Instant Config."
              {})))
    (next-jdbc/with-transaction [conn (config/get-aurora-config)]
      (sql/execute-one!
       ::bootstrap-config-app-lock
       conn
       ["SELECT pg_advisory_xact_lock(hashtext(?))"
        "instant-config-bootstrap"])
      (if-let [app (app-model/get-by-id conn {:id app-id})]
        (do
          (when (and superuser-email
                     (not= superuser-email
                           (:email
                            (instant-user-model/get-by-id
                             conn
                             {:id (:creator_id app)}))))
            (println
             "Instant Config already has a different owner."
             "INSTANT_BOOTSTRAP_SUPERUSER_EMAIL only applies when the app is created."))
          (ensure-config-app-schema! conn app-id)
          (println "Instant Config is ready."))
        (if-not superuser-email
          (println
           "Skipping Instant Config bootstrap."
           "Set INSTANT_BOOTSTRAP_SUPERUSER_EMAIL to create it.")
          (let [user (or (instant-user-model/get-by-email
                          conn
                          {:email superuser-email})
                         (instant-user-model/create!
                          conn
                          {:id (UUID/randomUUID)
                           :email superuser-email}))]
            (app-model/create!
             conn
             {:id app-id
              :title "Instant Config"
              :creator-id (:id user)
              :admin-token (UUID/randomUUID)})
            (ensure-config-app-schema! conn app-id)
            (println
             "Created Instant Config for bootstrap superuser"
             superuser-email)))))))

(defn bootstrap-for-oss
  "Helper to setup everything the server needs for its initial run."
  [_args]
  (ensure-override-config)
  (println "Migrating database")
  (migrate-database)
  (tracer/init)
  (try
    (bootstrap-config-app!)
    (finally
      (tracer/shutdown))))
