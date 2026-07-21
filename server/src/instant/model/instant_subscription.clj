(ns instant.model.instant-subscription
  (:require
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.model.app :as app-model]
   [instant.plans :as plans]
   [instant.util.hsql :as uhsql]
   [next.jdbc :as next-jdbc]))

(def create-q
  (uhsql/preformat
   {:with [[:subscription {:insert-into :instant-subscriptions
                           :values [{:id :?id
                                     :user-id [:cast :?user-id :uuid]
                                     :app-id [:cast :?app-id :uuid]
                                     :org-id [:cast :?org-id :uuid]
                                     :subscription-type-id :?subscription-type-id
                                     :source :?source
                                     :stripe-customer-id :?stripe-customer-id
                                     :stripe-subscription-id :?stripe-subscription-id
                                     :stripe-event-id :?stripe-event-id}]
                           :returning :*}]
           ;; Will update either the app or org, depending on whether
           ;; app-id or org-id is provided.
           ;; There is a constraint on the subscription that prevents
           ;; adding both
           [:app-update {:update :apps
                         :set {:subscription-id :?id}
                         :where [:= :id :?app-id]}]
           [:org-update {:update :orgs
                         :set {:subscription-id :?id}
                         :where [:= :id :?org-id]}]]
    :select :*
    :from :subscription}))

(defn create!
  "Creates a subscription on either an app or an org. Pass one of org-id or app-id."
  ([params] (create! (aurora/conn-pool :write) params))
  ([conn {:keys [user-id org-id app-id subscription-type-id
                 source stripe-customer-id stripe-subscription-id stripe-event-id]}]
   (app-model/with-cache-invalidation app-id
     (sql/execute-one! ::create!
                       conn
                       (uhsql/formatp create-q
                                      {:id (random-uuid)
                                       :user-id user-id
                                       :app-id app-id
                                       :org-id org-id
                                       :subscription-type-id subscription-type-id
                                       :source (or source "stripe")
                                       :stripe-customer-id stripe-customer-id
                                       :stripe-subscription-id stripe-subscription-id
                                       :stripe-event-id stripe-event-id})))))

(defn get-by-event-id
  ([params] (get-by-event-id (aurora/conn-pool :read) params))
  ([conn {:keys [event-id]}]
   (sql/select-one ::get-by-event-id
                   conn
                   ["SELECT * FROM instant_subscriptions WHERE stripe_event_id = ?"
                    event-id])))

(defn get-by-app-id
  ([params] (get-by-app-id (aurora/conn-pool :read) params))
  ([conn {:keys [app-id]}]
   (sql/select-one ::get-by-app-id
                   conn
                   ["SELECT s.id, s.app_id, s.stripe_subscription_id, s.source, t.name, s.subscription_type_id
                    FROM apps a
                    JOIN instant_subscriptions s ON s.id = a.subscription_id
                    JOIN instant_subscription_types t on s.subscription_type_id = t.id
                    WHERE a.id = ?::uuid"
                    app-id])))

(def get-by-org-id-q
  (uhsql/preformat {:select [:s.id
                             :s.org_id
                             :s.stripe_subscription_id
                             :s.source
                             :t.name
                             :s.subscription_type_id]
                    :from :orgs
                    :join [[:instant_subscriptions :s] [:= :s.id :orgs.subscription_id]
                           [:instant_subscription_types :t] [:= :s.subscription_type_id :t.id]]
                    :where [:= :orgs.id :?org-id]}))

(defn get-by-org-id
  ([params] (get-by-org-id (aurora/conn-pool :read) params))
  ([conn {:keys [org-id]}]
   (sql/select-one ::get-by-org-id
                   conn
                   (uhsql/formatp get-by-org-id-q {:org-id org-id}))))

(defn- activate-self-hosted!
  [conn {:keys [user-id app-id org-id subscription-type-id]}]
  (next-jdbc/with-transaction [tx-conn conn]
    (if app-id
      (sql/select-one ::lock-app tx-conn
                      ["SELECT id FROM apps WHERE id = ?::uuid FOR UPDATE" app-id])
      (sql/select-one ::lock-org tx-conn
                      ["SELECT id FROM orgs WHERE id = ?::uuid FOR UPDATE" org-id]))
    (let [subscription (if app-id
                         (get-by-app-id tx-conn {:app-id app-id})
                         (get-by-org-id tx-conn {:org-id org-id}))]
      (if (and subscription
               (not= plans/FREE_SUBSCRIPTION_TYPE
                     (:subscription_type_id subscription)))
        subscription
        (create! tx-conn {:user-id user-id
                          :app-id app-id
                          :org-id org-id
                          :subscription-type-id subscription-type-id
                          :source "self-hosted"})))))

(defn activate-self-hosted-app!
  ([params] (activate-self-hosted-app! (aurora/conn-pool :write) params))
  ([conn {:keys [user-id app-id]}]
   (app-model/with-cache-invalidation app-id
     (activate-self-hosted! conn {:user-id user-id
                                  :app-id app-id
                                  :subscription-type-id plans/PRO_SUBSCRIPTION_TYPE}))))

(defn activate-self-hosted-org!
  ([params] (activate-self-hosted-org! (aurora/conn-pool :write) params))
  ([conn {:keys [user-id org-id]}]
   (activate-self-hosted! conn {:user-id user-id
                                :org-id org-id
                                :subscription-type-id plans/STARTUP_SUBSCRIPTION_TYPE})))

(defn plan-supports-members?
  "Takes a stripe_subscription"
  [{:keys [subscription_type_id]}]
  (or (= subscription_type_id plans/PRO_SUBSCRIPTION_TYPE)
      (= subscription_type_id plans/STARTUP_SUBSCRIPTION_TYPE)))

(comment
  (get-by-app-id {:app-id "b40b42d5-d857-431b-90f5-f0cf36b146dd"}))
