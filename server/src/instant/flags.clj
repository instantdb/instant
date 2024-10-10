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
            :view-checks {}
            :hazelcast {}
            :promo-emails {}})

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

        view-check (when-let [view-check-flag (-> (get result "view-checks")
                                                  first)]
                     (let [disabled-apps (-> view-check-flag
                                             (get "disabled-apps")
                                             set)
                           enabled-apps (-> view-check-flag
                                            (get "enabled-apps")
                                            set)
                           default-value (get view-check-flag "default-value" false)]
                       {:disabled-apps disabled-apps
                        :enabled-apps enabled-apps
                        :default-value default-value}))

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
                                     (get result "promo-emails")))]
    {:emails emails
     :storage-enabled-whitelist storage-enabled-whitelist
     :view-check view-check
     :hazelcast hazelcast
     :promo-code-emails promo-code-emails}))

(def queries [{:query query :transform #'transform-query-result}])

(defn get-emails []
  (get-in @query-results [query :result :emails]))

(defn admin-email? [email]
  (contains? (:team (get-emails))
             email))

(defn storage-enabled-whitelist []
  (get-in @query-results [query :result :storage-enabled-whitelist]))

(defn promo-code-emails []
  (get-in @query-results [query :result :promo-code-emails]))

(defn promo-code-email? [email]
  (contains? (promo-code-emails)
             email))

(defn storage-enabled? [app-id]
  (let [app-id (str app-id)]
    (contains? (storage-enabled-whitelist) app-id)))

(defn run-view-checks? [app-id]
  (if-let [view-check (get-in @query-results [query :result :view-check])]
    (let [{:keys [disabled-apps enabled-apps default-value]} view-check]
      (cond (contains? disabled-apps (str app-id))
            false

            (contains? enabled-apps (str app-id))
            true

            :else default-value))
    ;; Default false
    false))

(defn use-hazelcast? [app-id]
  (if-let [hz-flag (get-in @query-results [query :result :hazelcast])]
    (let [{:keys [disabled-apps enabled-apps default-value disabled?]} hz-flag]
      (cond disabled? false

            (contains? disabled-apps app-id)
            false

            (contains? enabled-apps app-id)
            true

            :else default-value))
    ;; Default false
    false))

(defn hazelcast-disabled? []
  (get-in @query-results
          [query :result :hazelcast :disabled]
          false))
