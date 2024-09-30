;; XXX: probably need two namespaces, one that
;;      does the fetching and one that actually does the writing

(ns instant.flags)

;; Map of query to {:result {result-tree}
;;                  :tx-id int}
(defonce query-results (atom {}))

(def query {:friend-emails {}
            :power-user-emails {}
            :storage-whitelist {}
            :team-emails {}
            :test-emails {}})

(def queries [query])

(def null-emails {:test #{}
                  :team #{}
                  :friend #{}
                  :power-user #{}})

(defn get-emails []
  (reduce-kv (fn [acc key values]
               (if-let [email-key (case key
                                    "friend-emails" :friend
                                    "power-user-emails" :power-user
                                    "team-emails" :team
                                    "test-emails" :test
                                    nil)]
                 (assoc acc email-key (set (map #(get % "email") values)))
                 acc))
             null-emails
             (get-in query-results [query :result])))

(defn admin-email? [email]
  (contains? (:team (get-emails))
             email))

(defn storage-enabled-whitelist []
  (set (keep (fn [o]
               (when (get o "isEnabled")
                 (get o "appId")))
             (get-in @query-results [query :result "storage-whitelist"]))))

(defn storage-enabled? [app-id]
  (let [app-id (str app-id)]
    (boolean (some (fn [o]
                     (and (get o "isEnabled")
                          (= app-id (get o "appId"))))
                   (get-in @query-results [query :result "storage-whitelist"])))))
