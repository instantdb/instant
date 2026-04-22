(ns instant.model.shared-oauth-client
  "Shared OAuth credentials that Instant provides to app developers so
   they can test OAuth (Google, etc.) without setting up their own
   client in the provider's console.

   Rows live in the `shared-oauth-clients` entity on the instant-config
   app, keyed by provider name (e.g. \"google\"). The runtime reads
   those rows via `get-shared-credential!` when an app's
   `app-oauth-client` has `meta.useSharedCredentials = true`.

   Two parallel entities live on instant-config:

   - `shared-oauth-clients` — used by apps in every env. Registered
     with the provider against
     `https://api.instantdb.com/runtime/oauth/callback`.

   - `shared-oauth-clients-instant-dev` — parallel entity, registered
     against `http://localhost:8888/runtime/oauth/callback`. Used by
     Instant engineers running the server locally. Pulled into a dev's
     local `shared-oauth-clients` via `import-from-prod!` so the
     runtime code stays provider-agnostic (it just reads
     `shared-oauth-clients`).

   KMS key ARN is the same across envs, so ciphertext produced in any
   JVM decrypts in any other. `instant-config-app-id` is also the same
   across envs."
  (:require
   [instant.config :as config]
   [instant.flags :as flags]
   [instant.jdbc.aurora :as aurora]
   [instant.model.app-user :as app-user-model]
   [instant.system-catalog-ops :as sco]
   [instant.util.crypt :as crypt-util]
   [instant.util.exception :as ex]
   [instant.util.uuid :as uuid-util]))

;; --------------------------------------------------------------
;; Runtime reads

(defn get-shared-credential [provider-name]
  (first (get (flags/shared-oauth-clients) provider-name)))

(defn get-shared-credential! [provider-name]
  (ex/assert-record! (get-shared-credential provider-name)
                     :shared-oauth-client
                     {:provider-name provider-name}))

;; --------------------------------------------------------------
;; Cap enforcement

(def shared-credentials-user-limit 100)

(defn assert-shared-credentials-allowed!
  "Shared dev credentials are strictly meant for development. Once an
   app has `shared-credentials-user-limit` users signed up, we refuse
   new sign-ups and new shared-credential clients so apps don't quietly
   ride on our shared OAuth client in production. At that point the
   user is expected to add their own client_id and client_secret."
  [app-id]
  (when (app-user-model/users-at-least? {:app-id app-id
                                         :n shared-credentials-user-limit})
    (ex/throw-validation-err!
     :shared-credentials
     app-id
     [{:message (str "Shared dev credentials are limited to "
                     shared-credentials-user-limit
                     " users. Please add your own client_id and client_secret in the dashboard.")}])))

;; --------------------------------------------------------------
;; Ops helpers

(defn make-row
  "Build a row map ready to paste into instant-config's
   `shared-oauth-clients` (or `shared-oauth-clients-instant-dev`) 
   via the dashboard Explorer."
  [{:keys [provider-name client-id client-secret]}]
  (assert (and provider-name client-id client-secret)
          "make-row needs :provider-name, :client-id, :client-secret")
  (let [id (random-uuid)]
    {:id id
     :providerName provider-name
     :clientId client-id
     :encryptedClientSecretHexString (crypt-util/aead-encrypt-hex
                                      client-secret
                                      (uuid-util/->bytes id))}))

(defn import-from-prod!
  "Copy the `shared-oauth-clients-instant-dev` row for `provider-name`
   from prod into the caller's local instant-config app's
   `shared-oauth-clients` entity.

   Run this once when setting up a local server so the shared-creds
   flow works end-to-end"
  [{:keys [provider-name prod-conn-pool]}]
  (assert (and provider-name prod-conn-pool)
          "import-from-prod! needs :provider-name and :prod-conn-pool")
  (let [prod-row (sco/query-op
                  prod-conn-pool
                  {:app-id (config/instant-config-app-id)
                   :etype "shared-oauth-clients-instant-dev"}
                  (fn [{:keys [get-entity-where]}]
                    (get-entity-where {:providerName provider-name})))
        _ (assert prod-row
                  (str "No shared-oauth-clients-instant-dev row for "
                       provider-name " in prod"))
        local-pool (aurora/conn-pool :write)]
    (sco/update-op
     local-pool
     {:app-id (config/instant-config-app-id)
      :etype "shared-oauth-clients"}
     (fn [{:keys [transact! resolve-id get-entity delete-entity!]}]
       ;; Replace any existing local row so the import is idempotent.
       (delete-entity! [(resolve-id :providerName) provider-name])
       ;; Reads come back with snake_case `:client_id` (system-catalog-
       ;; ops remaps `:clientId` on output). Writes still use the
       ;; original label via `resolve-id :clientId`.
       (let [id (:id prod-row)]
         (transact!
          [[:add-triple id (resolve-id :id) id]
           [:add-triple id (resolve-id :providerName) provider-name]
           [:add-triple id (resolve-id :clientId) (:client_id prod-row)]
           [:add-triple id (resolve-id :encryptedClientSecretHexString)
            (:encryptedClientSecretHexString prod-row)]])
         (dissoc (get-entity id) :encryptedClientSecretHexString))))))

(comment
  ;; Evaluate these from inside this ns in the REPL.
  
  ;; ---- Adding a new shared credential ----
  
  (make-row {:provider-name "google"
             :client-id     "1234567890-abc.apps.googleusercontent.com"
             :client-secret "GOCSPX-example-secret"})
  ;; You can now paste the result in instant-config
  
  ;; ---- Local dev setup ----
  ;;
  ;; Pull the Instant-dev variant out of prod so shared-creds work
  ;; against your locally-running server. 
  
  (tool/with-prod-conn [prod-conn]
    (import-from-prod! {:provider-name "google"
                        :prod-conn-pool prod-conn})))
  
