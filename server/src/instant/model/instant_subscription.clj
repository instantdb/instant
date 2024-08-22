(ns instant.model.instant-subscription
  (:require
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]))

(defn create!
  ([params] (create! aurora/conn-pool params))
  ([conn {:keys [user-id app-id subscription-type-id
                 stripe-customer-id stripe-subscription-id stripe-event-id]}]
   (sql/execute-one! conn
                     ["INSERT INTO instant_subscriptions
                      (user_id, app_id, subscription_type_id,
                                stripe_customer_id, stripe_subscription_id, stripe_event_id)
                      VALUES (?::uuid, ?::uuid, ?::smallint,
                                       ?, ?, ?)"
                      user-id app-id subscription-type-id
                      stripe-customer-id stripe-subscription-id stripe-event-id])))

(defn get-by-event-id
  ([params] (get-by-event-id aurora/conn-pool params))
  ([conn {:keys [event-id]}]
   (sql/select-one conn
                   ["SELECT * FROM instant_subscriptions WHERE stripe_event_id = ?"
                    event-id])))

(defn get-by-user-app
  ([params] (get-by-user-app aurora/conn-pool params))
  ([conn {:keys [user-id app-id]}]
   (sql/select-one conn
                   ["SELECT s.user_id, s.app_id, s.stripe_subscription_id, t.name
                    FROM instant_subscriptions s
                    JOIN instant_subscription_types t on s.subscription_type_id = t.id
                    WHERE s.user_id = ?::uuid AND s.app_id = ?::uuid
                    ORDER BY s.created_at DESC
                    LIMIT 1"
                    user-id app-id])))

(comment
  (get-by-user-app {:user-id "7b395905-3f8f-4fcf-be54-be0c66ad687c"
                    :app-id "b40b42d5-d857-431b-90f5-f0cf36b146dd"}))
