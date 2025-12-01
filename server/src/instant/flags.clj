;; The flags are populated and kept up to date by instant.flag-impl
;; We separate the namespaces so that this namespace has no dependencies
;; and can be required from anywhere.
(ns instant.flags
  (:require
   [clojure.walk :as w]
   [instant.config :as config]))

;; Map of query to {:result {result-tree}
;;                  :tx-id int}
(defonce query-results (atom {}))

(def query {:friend-emails {}
            :power-user-emails {}
            :storage-whitelist {}
            :storage-block-list {}
            :storage-migration {}
            :team-emails {}
            :test-emails {}
            :promo-emails {}
            :rate-limited-apps {}
            :log-sampled-apps {}
            :welcome-email-config {}
            :e2e-logging {}
            :query-flags {}
            :app-deletion-sweeper {}
            :rule-wheres {}
            :rule-where-testing {}
            :toggles {}
            :flags {}
            :handle-receive-timeout {}})

(def toggle-defaults {:pg-hints-by-default (= :test (config/get-env))})

(defn transform-query-result
  "Function that is called on the query result before it is stored in the
   query-result atom, to make look ups faster."
  [result]
  (let [emails
        (reduce-kv (fn [acc key values]
                     (if-let [email-key (case key
                                          "friend-emails" :friend
                                          "power-user-emails" :power-user
                                          "team-emails" :team
                                          "test-emails" :test
                                          nil)]
                       (assoc acc email-key (set (map #(get % "email") values)))
                       acc))
                   {:test #{}
                    :team #{}
                    :friend #{}
                    :power-user #{}}
                   result)

        storage-enabled-whitelist
        (set (keep (fn [o]
                     (when (get o "isEnabled")
                       (get o "appId")))
                   (get result "storage-whitelist")))

        storage-block-list
        (set (keep (fn [o]
                     (when (get o "isDisabled")
                       (get o "appId")))
                   (get result "storage-block-list")))

        promo-code-emails (set (keep (fn [o]
                                       (get o "email"))
                                     (get result "promo-emails")))
        rate-limited-apps (reduce (fn [acc {:strs [appId]}]
                                    (conj acc (parse-uuid appId)))
                                  #{}
                                  (get result "rate-limited-apps"))

        log-sampled-apps (reduce (fn [acc {:strs [appId sampleRate]}]
                                   (assoc acc appId sampleRate))
                                 {}
                                 (get result "log-sampled-apps"))

        app-deletion-sweeper (when-let [flag (->  (get result "app-deletion-sweeper")
                                                  first)]
                               {:disabled? (get flag "disabled" false)})
        e2e-logging (when-let [flag (-> (get result "e2e-logging")
                                        first)]
                      {:invalidator-every-n (try (/ 1 (get flag "invalidator-rate"))
                                                 (catch Exception _e
                                                   10000))})
        welcome-email-config (-> result (get "welcome-email-config") first w/keywordize-keys)
        storage-migration (-> result (get "storage-migration") first w/keywordize-keys)
        query-flags (reduce (fn [acc {:strs [query-hash setting value]}]
                              (update acc query-hash (fnil conj []) {:setting setting
                                                                     :value value}))
                            {}
                            (get result "query-flags"))
        toggles (reduce (fn [acc {:strs [setting toggled]}]
                          (assoc acc (keyword setting) toggled))
                        toggle-defaults
                        (get result "toggles"))
        flags (-> (reduce (fn [acc {:strs [setting value]}]
                            (assoc acc (keyword setting) value))
                          {}
                          (get result "flags"))
                  (update :always-materialize-attr-ids (fn [vs]
                                                         (set (map parse-uuid vs))))
                  (update :tika-enabled-apps (fn [vs]
                                               (set (map parse-uuid vs))))

                  (update :reserved-system-catalog-ident-names (fn [vs]
                                                                 (set vs)))
                  (update :disable-hint-query-hashes (fn [vs]
                                                       (set vs)))
                  (update :enable-store-batching-apps (fn [vs]
                                                        (set (map parse-uuid vs))))
                  (update :enable-admin-transact-queue-apps (fn [vs]
                                                              (set (map parse-uuid vs))))

                  (update :invalidator-drop-tx-skip-apps (fn [vs]
                                                           (set (map parse-uuid vs))))

                  (update :coarse-topics-apps (fn [vs]
                                                (set (map parse-uuid vs)))))
        handle-receive-timeout (reduce (fn [acc {:strs [appId timeoutMs]}]
                                         (assoc acc (parse-uuid appId) timeoutMs))
                                       {}
                                       (get result "handle-receive-timeout"))
        rule-wheres (if-let [rule-where-ent (-> result
                                                (get "rule-wheres")
                                                first)]
                      {:app-ids (set (keep (fn [x]
                                             (and (string? x)
                                                  (parse-uuid x)))
                                           (get rule-where-ent "app-ids")))
                       :query-hashes (set (get rule-where-ent "query-hashes"))
                       :query-hash-blacklist (set (get rule-where-ent "query-hash-blacklist"))}
                      {:app-ids #{}
                       :query-hashes #{}})
        rule-where-testing (-> result
                               (get "rule-where-testing")
                               first
                               (get "enabled")
                               (or false))]
    {:emails emails
     :storage-enabled-whitelist storage-enabled-whitelist
     :storage-block-list storage-block-list
     :promo-code-emails promo-code-emails
     :rate-limited-apps rate-limited-apps
     :log-sampled-apps log-sampled-apps
     :e2e-logging e2e-logging
     :welcome-email-config welcome-email-config
     :storage-migration storage-migration
     :query-flags query-flags
     :app-deletion-sweeper app-deletion-sweeper
     :rule-wheres rule-wheres
     :rule-where-testing rule-where-testing
     :toggles toggles
     :flags flags
     :handle-receive-timeout handle-receive-timeout}))

(def queries [{:query query :transform #'transform-query-result}])

(defn query-result []
  (get-in @query-results [query :result]))

(defn get-emails []
  (get (query-result) :emails))

(defn admin-email? [email]
  (contains? (:team (get-emails))
             email))

;; (TODO) After storage is public for awhile we can remove this
(defn storage-enabled-whitelist []
  (get (query-result) :storage-enabled-whitelist))

(defn storage-block-list []
  (get (query-result) :storage-block-list))

(defn promo-code-emails []
  (get (query-result) :promo-code-emails))

(defn welcome-email-config []
  (get (query-result) :welcome-email-config))

(defn storage-migration []
  (get (query-result) :storage-migration))

(defn promo-code-email? [email]
  (contains? (promo-code-emails)
             email))

(defn storage-disabled? [app-id]
  (let [app-id (str app-id)]
    (contains? (storage-block-list) app-id)))

(defn log-sampled-apps [app-id]
  (let [app-id (str app-id)]
    (get-in (query-result) [:log-sampled-apps app-id] nil)))

(defn app-rate-limited? [app-id]
  (contains? (:rate-limited-apps (query-result))
             app-id))

(defn e2e-should-honeycomb-publish? [^Long tx-id]
  (and tx-id
       (zero? (mod tx-id (or (get-in (query-result)
                                     [:e2e-logging :invalidator-every-n])
                             10000)))))

(defn query-flags
  "Takes a query hash and returns the query settings that we should apply
   to a query (e.g. set_nestloop = off) to work around bad query plans."
  [query-hash]
  (get-in (query-result) [:query-flags query-hash]))

(defn use-rule-wheres?
  "Returns true if either the app-id or the query hash is present in the
   rule-wheres flag"
  [{:keys [app-id query-hash]}]
  (and (not (contains? (get-in (query-result) [:rule-wheres :query-hash-blacklist])
                       query-hash))
       (or (contains? (get-in (query-result) [:rule-wheres :app-ids])
                      app-id)
           (contains? (get-in (query-result) [:rule-wheres :query-hashes])
                      query-hash))))

(defn test-rule-wheres? []
  (:rule-where-testing (query-result)))

(defn toggled? [key]
  (get-in (query-result) [:toggles key]))

(defn flag
  ([key] (get-in (query-result) [:flags key]))
  ([key not-found] (get-in (query-result) [:flags key] not-found)))

(defn handle-receive-timeout [app-id]
  (get-in (query-result) [:handle-receive-timeout app-id]))

(defn pg-hint-testing-toggles []
  (reduce-kv (fn [acc k v]
               (if (= (namespace k) "pg-hint-test")
                 (assoc acc k v)
                 acc))
             {}
             (get (query-result) :toggles)))

(defn hard-deletion-sweeper-disabled? []
  (toggled? :hard-deletion-sweeper-disabled?))

(defn rate-limit-tx-based-on-conn-pool? []
  (toggled? :rate-limit-tx-based-on-conn-pool?))

(defn rate-limit-tx-based-on-conn-pool-buffer []
  (flag :rate-limit-tx-based-on-conn-pool-buffer 5))

(defn admin-tx-queue-enabled? [app-id]
  (contains? (flag :enable-admin-transact-queue-apps) app-id))

(defn invalidator-drop-tx-enabled? []
  (toggled? :invalidator-drop-tx-enabled?))

(defn invalidator-drop-tx-latency-ms []
  (flag :invalidator-drop-tx-latency-ms 30000))

(defn invalidator-drop-tx-skip-app? [app-id]
  (contains? (flag :invalidator-drop-tx-skip-apps) app-id))

(defn use-coarse-topics? [app-id]
  (contains? (flag :coarse-topics-apps) app-id))

(defn use-datalog-topic-indexing? []
  (let [v (toggled? :use-datalog-topic-indexing)]
    (if (boolean? v)
      v
      true)))

(defn use-datalog-attr-index? []
  (let [v (toggled? :use-datalog-attr-index)]
    (if (boolean? v)
      v
      true)))
