(ns instant.config
  (:require [clojure.string :as string]
            [clojure.tools.logging :as log]
            [instant.config-edn :as config-edn]
            [instant.util.crypt :as crypt-util]
            [lambdaisland.uri :as uri])
  (:import
   (java.net InetAddress)
   (java.util UUID)))

(defn get-hostname []
  (try
    (.getHostName (InetAddress/getLocalHost))
    (catch Exception e
      (log/error "Error getting hostname" e)
      "unknown")))

(defn get-env []
  (if (= "true" (System/getenv "PRODUCTION"))
    :prod
    (if (= "true" (System/getenv "TEST"))
      :test
      :dev)))

(def config-map
  (delay (do
           ;; init-hybrid because we might need it to decrypt the config
           (crypt-util/init-hybrid)

           (config-edn/decrypted-config crypt-util/obfuscate
                                        crypt-util/get-hybrid-decrypt-primitive
                                        crypt-util/hybrid-decrypt
                                        (= :prod (get-env))
                                        (config-edn/read-config (get-env))))))

(defn instant-config-app-id []
  (-> @config-map :instant-config-app-id))

(defn postmark-token []
  (some-> @config-map :postmark-token (.value)))

(defn postmark-account-token []
  (some-> @config-map :postmark-account-token (.value)))

(defn postmark-send-enabled? []
  (not (string/blank? (postmark-token))))

(defn postmark-admin-enabled? []
  (not (string/blank? (postmark-account-token))))

(defn secret-discord-token []
  (some-> @config-map :secret-discord-token (.value)))

(defn discord-enabled? []
  (not (string/blank? (secret-discord-token))))

(def discord-signups-channel-id
  "1235663275144908832")

(def discord-debug-channel-id
  "1235659966627582014")

(def discord-errors-channel-id
  "1235713531018612896")

(def instant-on-instant-app-id
  (when-let [app-id (System/getenv "INSTANT_ON_INSTANT_APP_ID")]
    (parse-uuid app-id)))

(def drop-refresh-spam? (= "true" (System/getenv "DROP_REFRESH_SPAM")))

(defn db-url->config [url]
  (cond (string/starts-with? url "jdbc")
        {:jdbcUrl url}

        (string/starts-with? url "postgresql")
        (let [{:keys [user password host port path]} (uri/parse url)]
          {:dbtype "postgres"
           :dbname (if (string/starts-with? path "/")
                     (subs path 1)
                     path)
           :username user
           :password password
           :host host
           :port (when port
                   (Integer/parseInt port))})

        :else
        (throw (Exception. "Invalid database connection string. Expected either a JDBC url or a postgres url."))))

(defn get-aurora-config
  ([] (get-aurora-config {:env (get-env)}))
  ([{:keys [env]}]
   (let [application-name (uri/query-encode (format "instant server; host: %s, env: %s"
                                                    (get-hostname)
                                                    (name env)))
         url (or (System/getenv "DATABASE_URL")
                 (some-> @config-map :database-url (.value))
                 "jdbc:postgresql://localhost:5432/instant")]
     (assoc (db-url->config url)
            :ApplicationName application-name))))

;; ---
;; Stripe
(defn stripe-secret []
  ;; Add an override from the environment because we need
  ;; it for the tests (populated at https://github.com/jsventures/instant/settings/secrets/actions)
  (or (System/getenv "STRIPE_API_KEY")
      (some-> @config-map :stripe-secret (.value))))

(defn stripe-webhook-secret []
  (-> @config-map :stripe-webhook-secret (.value)))

(defn stripe-success-url
  ([] (stripe-success-url {:env (get-env)}))
  ([{:keys [env]}]
   (case env
     :prod "https://instantdb.com/dash?t=billing"
     "http://localhost:3000/dash?t=billing")))

(defn stripe-cancel-url
  ([] (stripe-cancel-url {:env (get-env)}))
  ([{:keys [env]}]
   (case env
     :prod "https://instantdb.com/dash?t=billing"
     "http://localhost:3000/dash?t=billing")))

(def test-pro-subscription "price_1P4ocVL5BwOwpxgU8Fe6oRWy")
(def prod-pro-subscription "price_1P4nokL5BwOwpxgUpWoidzdL")
(defn stripe-pro-subscription
  ([] (stripe-pro-subscription {:env (get-env)}))
  ([{:keys [env]}]
   (case env
     :prod prod-pro-subscription
     test-pro-subscription)))

(defn get-honeycomb-api-key []
  (some-> @config-map :honeycomb-api-key (.value)))

(defn get-honeycomb-endpoint []
  (or (System/getenv "HONEYCOMB_ENDPOINT")
      "https://api.honeycomb.io:443"))

(defn get-google-oauth-client []
  (-> @config-map :google-oauth-client))

(def server-origin (case (get-env)
                     :prod "https://api.instantdb.com"
                     "http://localhost:8888"))

(defn dashboard-origin
  ([] (dashboard-origin {:env (get-env)}))
  ([{:keys [env]}]
   (case env
     :prod "https://instantdb.com"
     "http://localhost:3000")))

(defonce process-id
  (delay
    (str (name (get-env))
         "_"
         (string/replace (UUID/randomUUID) #"-" "_"))))

(defn get-connection-pool-size []
  (if (= :prod (get-env)) 400 20))

(defn env-integer [var-name]
  (when (System/getenv var-name)
    (Integer/parseInt (System/getenv var-name))))

(defn get-server-port []
  (or (env-integer "PORT") (env-integer "BEANSTALK_PORT") 8888))

(defn get-nrepl-port []
  (or (env-integer "NREPL_PORT") 6005))

(defn get-nrepl-bind-address []
  (or (System/getenv "NREPL_BIND_ADDRESS")
      (case (get-env)
        :prod "0.0.0.0"
        nil)))

(defn init []
  ;; instantiate the config-map so we can fail early if it's not
  ;; valid
  @config-map)
