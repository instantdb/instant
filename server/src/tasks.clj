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
            [instant.data.constants :refer [test-user-id]]
            [instant.jdbc.sql :as sql]
            [instant.model.app :as app-model]
            [instant.model.instant-user :as instant-user-model]
            [instant.util.tracer :as tracer]
            [lambdaisland.uri :as uri]
            [next.jdbc :as next-jdbc]
            [next.jdbc.connection :refer [jdbc-url]])
  (:import (java.io BufferedReader InputStreamReader)
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

(def override-config-path
  "resources/config/override.edn")

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
                 override-config-path)]
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
  "Creates an OSS override config when one does not exist."
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

(defn superuser-email []
  (when-let [value (some-> (System/getenv "INSTANT_SUPERUSER_EMAIL")
                           string/trim
                           not-empty)]
    (or (email/coerce value)
        (throw (ex-info
                "INSTANT_SUPERUSER_EMAIL must be a valid email address."
                {:value value})))))

(def ^:private self-hosted-bundled-user-emails
  ["system-catalog-user@instantdb.com"
   "testuser@instantdb.com"
   "hello+ephemeralappsdev@instantdb.com"
   "hello+ephemeralapps@instantdb.com"
   "stopa@instantdb.com"
   "hello+getadbapps@instantdb.com"])

(defn- disable-self-hosted-bundled-user-logins! []
  (let [configured-superuser-email (superuser-email)]
    (next-jdbc/with-transaction [conn (config/get-aurora-config)]
      (doseq [user-email self-hosted-bundled-user-emails
              :when (not= user-email configured-superuser-email)]
        (sql/execute-one!
         conn
         ["INSERT INTO user_flags (id, user_id, flag_name)
           SELECT gen_random_uuid(), id, 'dashboard-login-disabled'
           FROM instant_users
           WHERE email = ?
           ON CONFLICT (user_id, flag_name) DO NOTHING"
          user-email]))
      (when configured-superuser-email
        (sql/execute-one!
         conn
         ["DELETE FROM user_flags
           USING instant_users
           WHERE user_flags.user_id = instant_users.id
             AND user_flags.flag_name = 'dashboard-login-disabled'
             AND instant_users.email = ?"
          configured-superuser-email])))))

(defn bootstrap-config-app! []
  (next-jdbc/with-transaction [conn (config/get-aurora-config)]
    (sql/execute-one!
     ::bootstrap-config-app-lock
     conn
     ["SELECT pg_advisory_xact_lock(hashtext(?))"
      "instant-config-bootstrap"])
    (let [email (superuser-email)
          user (if email
                 (or (instant-user-model/get-by-email conn {:email email})
                     (instant-user-model/create!
                      conn
                      {:id (random-uuid)
                       :email email}))
                 (instant-user-model/get-by-id! conn {:id test-user-id}))
          app (app-model/get-by-id conn {:id config/instant-config-app-id})]
      (cond
        (nil? app)
        (do
          (config-app/create! conn {:id config/instant-config-app-id
                                    :creator-id (:id user)})
          (println "Created Instant Config for" (:email user)))

        (not= (:creator_id app) (:id user))
        (do
          (app-model/change-creator!
           conn
           {:id config/instant-config-app-id
            :new-creator-id (:id user)})
          (println "Changed Instant Config owner to" (:email user)))

        :else
        (println "Instant Config is owned by" (:email user))))))

(defn bootstrap-for-oss
  "Helper to setup everything the server needs for its initial run."
  [_args]
  (ensure-override-config)
  (println "Migrating database")
  (migrate-database)
  (tracer/init)
  (try
    (disable-self-hosted-bundled-user-logins!)
    (bootstrap-config-app!)
    (finally
      (tracer/shutdown))))
