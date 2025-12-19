(ns instant.util.posthog
  "Server-side analytics tracking via PostHog.
   Used to track CLI and Platform SDK usage."
  (:require [clojure.data.json :as json]
            [clojure.walk :as walk]
            [instant.config :as config]
            [instant.util.http :as http-util]
            [instant.util.tracer :as tracer])
  (:import [com.posthog.server PostHog PostHogConfig PostHogInterface PostHogCaptureOptions]))

(defonce ^:private client (atom nil))

(defn init!
  "Initialize PostHog client. Call once at server startup.
   Options:
     :api-key - PostHog project API key (required)"
  [{:keys [api-key]}]
  (when api-key
    (let [config (.build (PostHogConfig/builder api-key))]
      (reset! client (PostHog/with config))
      (tracer/record-info! {:name "posthog/initialized"}))))

(defn flush!
  "Force send queued events immediately."
  []
  (when-let [^PostHogInterface c @client]
    (.flush c)))

(defn shutdown!
  "Shutdown client gracefully. Call on server shutdown."
  []
  (when-let [^PostHogInterface c @client]
    (.close c)
    (reset! client nil)
    (tracer/record-info! {:name "posthog/shutdown"})))

(defn enabled?
  "Returns true if PostHog is initialized and ready to use."
  []
  (some? @client))

;; ---
;; Tracking Context Helpers

(defn extract-client-ip
  "Extract client IP from request, preferring x-forwarded-for header."
  [request]
  (or (get-in request [:headers "x-forwarded-for"])
      (:remote-addr request)))

(defn extract-source
  "Extract source identifier from request headers.
   e.g: instant-cli, create-instant-app, platform-sdk, dashboard, etc."
  [request]
  (or (get-in request [:headers "x-instant-source"])
      "unknown"))

(defn extract-tracking-context
  "Extract tracking context from a ring request.
   Automatically extracts auth user from request if present."
  [request]
  (let [headers (:headers request)
        {:keys [email id]} (http-util/req->auth-user request)]
    {:distinct-id (or email "anonymous")
     :email       email
     :user-id     id
     :source      (extract-source request)
     :version     (get headers "x-instant-version")
     :command     (get headers "x-instant-command")
     :ip          (extract-client-ip request)}))

(defn extract-metadata
  "Extract optional JSON metadata from X-Instant-Metadata header.
   Returns empty map if header is missing or invalid JSON.

   Clients can send arbitrary key-value pairs via this header, e.g.:
   X-Instant-Metadata: {'template': 'expo', 'aiTool': 'claude'}

   Callers should explicitly merge this into extra-properties"
  [request]
  (if-let [metadata-str (get-in request [:headers "x-instant-metadata"])]
    (try
      (json/read-str metadata-str :key-fn keyword)
      (catch Exception _
        {}))
    {}))

(defn- build-capture-options
  "Build PostHogCaptureOptions with properties map.
   Filters out nil values since PostHog SDK doesn't accept them."
  ^PostHogCaptureOptions [properties]
  (let [builder (PostHogCaptureOptions/builder)]
    (doseq [[k v] (walk/stringify-keys properties)
            :when (some? v)]
      (.property builder k v))
    (.build builder)))

(defn capture!
  "Raw event capture function. Use this when you want to explicitly specify
   user identifier and event properties.

   distinct-id: email for authenticated users, 'anonymous' otherwise
   event: event name string
   properties: Clojure map of event properties"
  [distinct-id event-name properties]
  (when-let [^PostHogInterface c @client]
    (try
      (.capture c
                (str distinct-id)
                (str event-name)
                (build-capture-options properties))
      (catch Exception e
        (tracer/record-exception-span! e {:name "posthog/capture-failed"
                                          :attributes {:event event-name}})))))

(defn track!
  "Capture an event with context extracted from the request. Use this instead
   of capture! unless you can't extract user-identifer from the request."
  [req event-name extra-properties]
  (let [ctx (extract-tracking-context req)]
    (capture! (:distinct-id ctx)
              event-name
              (merge (cond-> {:source      (:source ctx)
                              :environment (name (config/get-env))
                              :$ip         (:ip ctx)}
                       (:user-id ctx)
                       (assoc :user-id (str (:user-id ctx)))

                       (:email ctx)
                       (assoc :$email (:email ctx))

                       (:version ctx)
                       (assoc :version (:version ctx))

                       (:command ctx)
                       (assoc :command (:command ctx)))
                     extra-properties))))
