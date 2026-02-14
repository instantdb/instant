(ns instant.config
  (:require [clojure.string :as string]
            [clojure.tools.logging :as log]
            [instant.config-edn :as config-edn]
            [instant.util.crypt :as crypt-util]
            [instant.util.aws :as aws-util]
            [instant.aurora-config :as aurora-config]
            [lambdaisland.uri :as uri]
            [lambdaisland.uri.normalize :as normalize])
  (:import
   (java.net InetAddress)
   (java.time ZoneId ZonedDateTime)))

(defonce hostname
  (delay
    (try
      (.getHostName (InetAddress/getLocalHost))
      (catch Exception e
        (log/error "Error getting hostname" e)
        "unknown"))))

(def ^:dynamic *env*
  nil)

(def staging-env (System/getenv "STAGING"))
(def prod-env (System/getenv "PRODUCTION"))

(defn get-env []
  (cond
    (some? *env*)                                 *env*
    ;; n.b. make sure this the staging check is first so that we can
    ;;      override it in the eb env vars
    (= "true" staging-env)                        :staging
    (= "true" prod-env)                           :prod
    (= "test" (System/getProperty "instant.env")) :test
    (= "true" (System/getenv "TEST"))             :test
    :else                                         :dev))

(defn prod? [] (= :prod (get-env)))

(defn dev? [] (= :dev (get-env)))

(defn test? [] (= :test (get-env)))

(defn aws-env? []
  (contains? #{:prod :staging} (get-env)))

(defonce instance-id
  (delay
    (when (aws-env?)
      (aws-util/get-instance-id))))

(defonce machine-id (random-uuid))

(defonce process-id
  (delay
    (string/replace
     (string/join "_"
                  [(name (get-env))
                   (or @instance-id
                       (crypt-util/random-hex 8))
                   (crypt-util/random-hex 8)])
     #"-" "_")))

(def config-map
  (delay (do
           ;; init-hybrid because we might need it to decrypt the config
           (crypt-util/init-hybrid)

           (config-edn/decrypted-config crypt-util/obfuscate
                                        crypt-util/get-hybrid-decrypt-primitive
                                        crypt-util/hybrid-decrypt
                                        (aws-env?)
                                        (config-edn/read-config (get-env))))))

(defn instant-config-app-id []
  (-> @config-map :instant-config-app-id))

(defn s3-storage-access-key []
  (some-> @config-map :s3-storage-access-key crypt-util/secret-value))

(defn s3-storage-secret-key []
  (some-> @config-map :s3-storage-secret-key crypt-util/secret-value))

(defn postmark-token []
  (some-> @config-map :postmark-token crypt-util/secret-value))

(defn sendgrid-token []
  (some-> @config-map :sendgrid-token crypt-util/secret-value))

(defn postmark-account-token []
  (some-> @config-map :postmark-account-token crypt-util/secret-value))

(defn sendgrid-send-disabled? []
  (not (string/blank? (sendgrid-token))))

(defn postmark-send-enabled? []
  (not (string/blank? (postmark-token))))

(defn postmark-admin-enabled? []
  (not (string/blank? (postmark-account-token))))

(defn secret-discord-token []
  (some-> @config-map :secret-discord-token crypt-util/secret-value))

(defn discord-enabled? []
  (not (string/blank? (secret-discord-token))))

(def discord-signups-channel-id
  "1235663275144908832")

(def discord-teams-channel-id
  "1196584090552512592")

(def discord-debug-channel-id
  "1235659966627582014")

(def discord-errors-channel-id
  "1235713531018612896")

(def instant-on-instant-app-id
  (when-let [app-id (System/getenv "INSTANT_ON_INSTANT_APP_ID")]
    (parse-uuid app-id)))

(defn db-url->config [url]
  (cond (string/starts-with? url "jdbc")
        {:jdbcUrl url}

        (string/starts-with? url "postgresql")
        (let [{:keys [user password host port path]} (uri/parse url)]
          {:dbtype "postgres"
           :dbname (if (string/starts-with? path "/")
                     (subs path 1)
                     path)
           :user user
           :password (normalize/percent-decode password)
           :host host
           :port (when port
                   (Integer/parseInt port))})

        :else
        (throw (Exception. "Invalid database connection string. Expected either a JDBC url or a postgres url."))))

(defn aurora-config-from-database-url []
  (let [url (or (System/getenv "DATABASE_URL")
                (some-> @config-map :database-url crypt-util/secret-value)
                "jdbc:postgresql://localhost:5432/instant")]
    (db-url->config url)))

(defn aurora-config-from-cluster-id [application-name]
  (when-let [cluster-id (or (System/getenv "DATABASE_CLUSTER_ID")
                            (some-> @config-map :database-cluster-id))]
    (aurora-config/rds-cluster-id->db-config cluster-id application-name)))

(defn get-aurora-config []
  (let [application-name (uri/query-encode (format "%s, %s"
                                                   @hostname
                                                   @process-id))
        config (or (aurora-config-from-cluster-id application-name)
                   (aurora-config-from-database-url))]
    (assoc config
           :ApplicationName application-name)))

(defn get-next-aurora-config []
  (when-let [cluster-id (or (System/getenv "NEXT_DATABASE_CLUSTER_ID")
                            (some-> @config-map :next-database-cluster-id))]
    (let [application-name (uri/query-encode (format "%s, %s"
                                                     @hostname
                                                     @process-id))]
      (assoc (aurora-config/rds-cluster-id->db-config cluster-id application-name)
             :ApplicationName application-name))))

(defn dashboard-origin
  ([] (dashboard-origin {:env (get-env)}))
  ([{:keys [env]}]
   (case env
     :prod "https://www.instantdb.com"
     :staging "https://staging.instantdb.com"
     "http://localhost:3000")))

;; ---
;; Stripe
(defn stripe-secret []
  ;; Add an override from the environment because we need
  ;; it for the tests (populated at https://github.com/jsventures/instant/settings/secrets/actions)
  (or (System/getenv "STRIPE_API_KEY")
      (some-> @config-map :stripe-secret crypt-util/secret-value)))

(defn stripe-webhook-secret []
  (-> @config-map :stripe-webhook-secret crypt-util/secret-value))

(defn stripe-return-url [type obj-id]
  (case type
    :app (str (dashboard-origin)
              "/dash?t=billing&app="
              obj-id)
    :org (str (dashboard-origin)
              "/dash/org?tab=billing&org="
              obj-id)))

(def test-pro-subscription "price_1P4ocVL5BwOwpxgU8Fe6oRWy")
(def prod-pro-subscription "price_1P4nokL5BwOwpxgUpWoidzdL")
(defn stripe-pro-subscription
  ([] (stripe-pro-subscription {:env (get-env)}))
  ([{:keys [env]}]
   (case env
     :prod prod-pro-subscription
     test-pro-subscription)))

(def test-startup-subscription "price_1RvkYbL5BwOwpxgUoDyhZtzN")
(def prod-startup-subscription "price_1RvkPZL5BwOwpxgUSVW7f2dd")
(defn stripe-startup-subscription
  ([] (stripe-startup-subscription {:env (get-env)}))
  ([{:keys [env]}]
   (case env
     :prod prod-startup-subscription
     test-startup-subscription)))

(defn get-honeycomb-api-key []
  (some-> @config-map :honeycomb-api-key crypt-util/secret-value))

(defn get-honeycomb-endpoint []
  (or (System/getenv "HONEYCOMB_ENDPOINT")
      "https://api.honeycomb.io:443"))

;; ---
;; PostHog
(defn get-posthog-api-key []
  (some-> @config-map :posthog-api-key crypt-util/secret-value))

(defn posthog-enabled? []
  (not (string/blank? (get-posthog-api-key))))

(defn get-google-oauth-client []
  (-> @config-map :google-oauth-client))

(def s3-bucket-name
  (case (get-env)
    :prod "instant-storage"
    :staging "instant-storage-staging"
    "instantdb-test-bucket"))

(def cloudfront-s3-bucket-url
  (case [(get-env) s3-bucket-name]
    [:dev "instantdb-test-bucket"] "https://files-dev.instantdb.com"
    [:staging "instant-storage-staging"] "https://files-staging.instantdb.com"
    [:prod "instant-storage"] "https://files.instantdb.com"
    nil))

(def cloudfront-signing-key
  (delay (when-let [{:keys [key-id private-key]} (-> @config-map
                                                     :cloudfront-signing-key)]
           {:key-id key-id
            :private-key (-> private-key
                             crypt-util/secret-value
                             crypt-util/cloudfront-key-from-bytes)})))

(defn get-connection-pool-size []
  (if (or (= :prod (get-env))
          (= :staging (get-env)))
    400
    20))

(defn env-integer [var-name]
  (when-let [envvar (System/getenv var-name)]
    (Integer/parseInt envvar)))

(defn get-server-port []
  (or (env-integer "PORT")
      (env-integer "BEANSTALK_PORT")
      (if-not (= :test (get-env))
        8888
        8886)))

(defn get-server-ssl-port []
  (or (env-integer "SSL_PORT")
      (if-not (= :test (get-env))
        8889
        8887)))

(def server-origin
  (case (get-env)
    :prod "https://api.instantdb.com"
    :staging "https://api-staging.instantdb.com"
    (str "http://localhost:" (get-server-port))))

(defn get-nrepl-port []
  (or (env-integer "NREPL_PORT") 6005))

(defn get-hz-port []
  (if-let [env-port (env-integer "HZ_PORT")]
    (if (<= 5701 env-port 5708)
      env-port
      (do
        (log/error "Invalid HZ_PORT" env-port)
        5701))
    5701))

(def grpc-port-offset 100)

(defn get-grpc-server-port []
  (+ (get-hz-port) grpc-port-offset))

(defn get-nrepl-bind-address []
  (or (System/getenv "NREPL_BIND_ADDRESS")
      (case (get-env)
        (:prod :staging) "0.0.0.0"
        nil)))

;; Should be increased by 1 every time we move the slot to a new
;; machine. This gives us a way to have a consistent ordering of LSNs
;; across database upgrades.
(def invalidator-slot-num 0)

;; Cuts off when the calendar turns to March in every time zone on Earth
(def free-teams-cutoff (-> (ZonedDateTime/of 2026 3 1 0 0 0 0 (ZoneId/of "Etc/GMT+12"))
                           (.toInstant)))

(defn init []
  ;; instantiate the config-map so we can fail early if it's not
  ;; valid
  @config-map)

(defonce fewer-vfutures? true)
