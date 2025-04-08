(ns tasks
  (:require [tool]
            [clojure.java.io :as io]
            [clojure.java.process :as process]
            [instant.util.crypt :as crypt-util]
            [instant.config-edn :as config-edn]
            [instant.config :as config]
            [lambdaisland.uri :as uri]
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
    (println "Writing config file to server/resources/config/override.edn")
    (spit "resources/config/override.edn"
          (pr-str
           {:aead-keyset {:encrypted? false
                          :json (crypt-util/generate-unencrypted-aead-keyset)}}))))

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
