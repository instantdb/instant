;; The flags are populated and kept up to date by instant.flag-impl
;; We separate the namespaces so that this namespace has no dependencies
;; and can be required from anywhere.
(ns instant.flags)

;; Map of query to {:result {result-tree}
;;                  :tx-id int}
(defonce query-results (atom {}))

(def query {:friend-emails {}
            :power-user-emails {}
            :storage-whitelist {}
            :team-emails {}
            :test-emails {}
            :hazelcast {}
            :drop-refresh-spam {}
            :promo-emails {}
            :rate-limited-apps {}})

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

        hazelcast (when-let [hz-flag (-> (get result "hazelcast")
                                         first)]
                    (let [disabled-apps (-> hz-flag
                                            (get "disabled-apps")
                                            (#(map parse-uuid %))
                                            set)
                          enabled-apps (-> hz-flag
                                           (get "enabled-apps")
                                           (#(map parse-uuid %))
                                           set)
                          default-value (get hz-flag "default-value" false)
                          disabled? (get hz-flag "disabled" false)]
                      {:disabled-apps disabled-apps
                       :enabled-apps enabled-apps
                       :default-value default-value
                       :disabled? disabled?}))
        promo-code-emails (set (keep (fn [o]
                                       (get o "email"))
                                     (get result "promo-emails")))
        drop-refresh-spam (when-let [hz-flag (-> (get result "drop-refresh-spam")
                                                 first)]
                            (let [disabled-apps (-> hz-flag
                                                    (get "disabled-apps")
                                                    (#(map parse-uuid %))
                                                    set)
                                  enabled-apps (-> hz-flag
                                                   (get "enabled-apps")
                                                   (#(map parse-uuid %))
                                                   set)
                                  default-value (get hz-flag "default-value" false)]
                              {:disabled-apps disabled-apps
                               :enabled-apps enabled-apps
                               :default-value default-value}))
        rate-limited-apps (reduce (fn [acc {:strs [appId]}]
                                    (conj acc (parse-uuid appId)))
                                  #{}
                                  (get result "rate-limited-apps"))]
    {:emails emails
     :storage-enabled-whitelist storage-enabled-whitelist
     :hazelcast hazelcast
     :promo-code-emails promo-code-emails
     :drop-refresh-spam drop-refresh-spam
     :rate-limited-apps rate-limited-apps}))

(def queries [{:query query :transform #'transform-query-result}])

(defn query-result []
  (get-in @query-results [query :result]))

(defn get-emails []
  (get (query-result) :emails))

(defn admin-email? [email]
  (contains? (:team (get-emails))
             email))

(defn storage-enabled-whitelist []
  (get (query-result) :storage-enabled-whitelist))

(defn promo-code-emails []
  (get (query-result) :promo-code-emails))

(defn promo-code-email? [email]
  (contains? (promo-code-emails)
             email))

(defn storage-enabled? [app-id]
  (let [app-id (str app-id)]
    (contains? (storage-enabled-whitelist) app-id)))

(defn use-hazelcast? [app-id]
  (if-let [hz-flag (get (query-result) :hazelcast)]
    (let [{:keys [disabled-apps enabled-apps default-value disabled?]} hz-flag]
      (cond disabled? false

            (contains? disabled-apps app-id)
            false

            (contains? enabled-apps app-id)
            true

            :else default-value))
    ;; Default true
    true))

(defn hazelcast-disabled? []
  (get-in (query-result) [:hazelcast :disabled?] false))

(defn drop-refresh-spam? [app-id]
  (if-let [flag (get (query-result) :drop-refresh-spam)]
    (let [{:keys [disabled-apps enabled-apps default-value]} flag]
      (cond (contains? disabled-apps app-id)
            false

            (contains? enabled-apps app-id)
            true

            :else default-value))
    ;; Default false
    false))

(defn app-rate-limited? [app-id]
  (contains? (:rate-limited-apps (query-result))
             app-id))
