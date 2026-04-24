(ns instant.model.shared-oauth-client
  "Shared OAuth credentials that Instant provides to app developers so
   they can test OAuth (Google, etc.) without setting up their own
   client in the provider's console.

   Credentials live in the per-env config files
   (`resources/config/{dev,staging,prod}.edn`) under
   `:shared-oauth-clients`. They are decrypted once at startup alongside
   every other config secret, so the runtime lookup is an in-process
   read with no DB round-trip.

   Each entry has the shape:

     {:provider_name \"google\"
      :client_id     \"...apps.googleusercontent.com\"
      :client_secret <Secret>}  ;; already decrypted by config-edn

   Keys are snake_case so they line up with the oauth-client row we
   read from Postgres, letting callers mix the two without renaming.

   The dev/staging/prod variants are registered with the OAuth provider
   under different callback URLs (localhost for dev, api-staging /
   api.instantdb.com for staging / prod), so the same provider name can
   point at different `:client_id` values per env.

   To add a new provider's secret to a config file, run
   `make encrypt-secret-dev` (or `-staging` / `-prod`), paste the
   plaintext, and drop the resulting `{:enc \"...\"}` into the
   relevant `*.edn`."
  (:require
   [instant.config :as config]
   [instant.model.app-user :as app-user-model]
   [instant.util.exception :as ex]))

(defn get-shared-credential [provider-name]
  (->> (config/shared-oauth-clients)
       (filter #(= (:provider_name %) provider-name))
       first))

(defn get-shared-credential! [provider-name]
  (ex/assert-record! (get-shared-credential provider-name)
                     :shared-oauth-client
                     {:provider-name provider-name}))

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
