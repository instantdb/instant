(ns instant.auth.oauth-providers
  "Centralized registry for OAuth provider configurations.
   This namespace defines provider-specific settings to avoid
   hardcoding provider logic throughout the codebase."
  (:require
   [clojure.walk :as walk]))

(defn github-email-fallback
  "Generate a noreply email for GitHub users when email is private.
   GitHub provides a format: {id}+{login}@users.noreply.github.com"
  [{:keys [id login]}]
  (when (and id login)
    (str id "+" login "@users.noreply.github.com")))

(def provider-configs
  "Registry of OAuth provider configurations.
   Each provider defines its type (OIDC or OAuth2), endpoints,
   and field mappings for consistent handling."
  {"github"
   {:type :oauth2
    :authorization-endpoint "https://github.com/login/oauth/authorize"
    :token-endpoint "https://github.com/login/oauth/access_token"
    :userinfo-endpoint "https://api.github.com/user"
    :scopes "read:user user:email"
    :accept-header "application/json"  ; Required for JSON responses from GitHub
    :user-agent "InstantDB OAuth"  ; GitHub requires User-Agent header
    :id-field :id  ; GitHub uses 'id' instead of 'sub'
    :email-field :email
    :login-field :login  ; GitHub-specific field for username
    :email-verified? false  ; GitHub doesn't provide email_verified field
    :email-fallback-fn github-email-fallback
    :requires-userinfo? true}

   "google"
   {:type :oidc
    :discovery-endpoint "https://accounts.google.com/.well-known/openid-configuration"
    :scopes "email openid"
    :response-mode "form_post"
    :id-field :sub
    :email-field :email
    :email-verified? true}

   "linkedin"
   {:type :oidc
    :discovery-endpoint "https://www.linkedin.com/oauth/.well-known/openid-configuration"
    :scopes "email openid"
    :response-mode "form_post"
    :id-field :sub
    :email-field :email
    :email-verified? true
    :userinfo-fallback? true}  ; LinkedIn sometimes needs userinfo endpoint

   "apple"
   {:type :oidc
    :discovery-endpoint "https://appleid.apple.com/.well-known/openid-configuration"
    :scopes "email name"
    :response-mode "form_post"
    :id-field :sub
    :email-field :email
    :email-verified? true
    :issuer-aliases ["https://appleid.apple.com" "https://account.apple.com"]}})  ; Apple uses multiple issuers

(defn get-provider-config
  "Get configuration for a specific provider.
   Returns nil if provider is not registered."
  [provider-name]
  (get provider-configs provider-name))

(defn get-provider-type
  "Get the type of a provider (:oidc or :oauth2).
   Returns :oidc as default for backward compatibility."
  [provider-name]
  (get-in provider-configs [provider-name :type] :oidc))

(defn is-oauth2-provider?
  "Check if a provider uses plain OAuth2 (not OIDC)."
  [provider-name]
  (= :oauth2 (get-provider-type provider-name)))

(defn get-provider-endpoints
  "Get OAuth endpoints for a non-OIDC provider.
   Returns nil for OIDC providers (they use discovery)."
  [provider-name]
  (when (is-oauth2-provider? provider-name)
    (let [config (get-provider-config provider-name)]
      {:authorization-endpoint (:authorization-endpoint config)
       :token-endpoint (:token-endpoint config)
       :userinfo-endpoint (:userinfo-endpoint config)})))

(defn get-provider-scopes
  "Get the OAuth scopes for a provider.
   Returns default 'email openid' if not specified."
  [provider-name]
  (get-in provider-configs [provider-name :scopes] "email openid"))

(defn get-response-mode
  "Get the response mode for a provider.
   Returns 'form_post' as default for OIDC providers."
  [provider-name]
  (let [config (get-provider-config provider-name)]
    (cond
      (= :oauth2 (:type config)) nil  ; OAuth2 providers typically don't use response_mode
      :else (get config :response-mode "form_post"))))

(defn extract-user-info
  "Extract user information based on provider configuration.
   Handles provider-specific field mappings and fallbacks."
  [provider-name token-data]
  (let [config (get-provider-config provider-name)
        normalized-data (walk/keywordize-keys token-data)

        id-field (:id-field config :sub)
        email-field (:email-field config :email)
        email-fallback-fn (:email-fallback-fn config)
        requires-verification? (:email-verified? config true)

        user-id (get normalized-data id-field)
        raw-email (get normalized-data email-field)
        email-verified (get normalized-data :email_verified)

        email (cond
                ;; Return verified email if required
                (and requires-verification? email-verified raw-email)
                raw-email

                ;; Return raw email if verification not required
                (and (not requires-verification?) raw-email)
                raw-email

                ;; GitHub private email fallback
                (= provider-name "github")
                (email-fallback-fn {:id user-id :login (get normalized-data :login)})

                :else
                nil)]

    {:sub (str user-id)
     :email email
     :raw-data token-data}))

(defn get-http-headers
  "Get HTTP headers required for a provider's API calls."
  [provider-name]
  (let [config (get-provider-config provider-name)
        headers {}]
    (cond-> headers
      (:accept-header config)
      (assoc "Accept" (:accept-header config))

      (:user-agent config)
      (assoc "User-Agent" (:user-agent config)))))
