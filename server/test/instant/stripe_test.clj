(ns instant.stripe-test
  (:require
   [clojure.test :as test :refer [deftest is]]
   [instant.config :as config]
   [instant.fixtures :refer [with-empty-app]]
   [instant.model.app :as app-model]
   [instant.model.instant-stripe-customer :as instant-stripe-customer-model]
   [instant.model.instant-subscription :as instant-subscription-model]
   [instant.stripe :as stripe]))

(defn event-data [{:keys [app-id user-id customer]}]
  {:object {:customer customer,
            :subscription "sub_1P70xAL5BwOwpxgUX9Vepd6n",
            :metadata {:app-id app-id,
                       :user-id user-id}}})

(defn with-stripe-customer [f]
  (when (config/stripe-secret)
    (with-empty-app
      (fn [{app-id :id creator-id :creator_id}]
        (stripe/init)
        (let [customer (instant-stripe-customer-model/get-or-create! {:user {:id creator-id}})
              customer-id (:id customer)]
          (f (event-data {:app-id app-id
                          :user-id creator-id
                          :customer customer-id})))))))

(deftest handle-stripe-events
  (with-stripe-customer
    (fn [data]
      (let [{:keys [app-id]} (-> data :object :metadata)
            upgrade-event {:type "checkout.session.completed"
                           :id "evt_upgrade"
                           :data data}
            downgrade-event {:type "customer.subscription.deleted"
                             :id "evt_downgrade"
                             :data data}]

        ;; No subscription exists at first
        (is (nil? (instant-subscription-model/get-by-app-id {:app-id app-id})))

        ;; Subscription is created
        (stripe/handle-stripe-webhook-event upgrade-event)
        (let [sub (instant-subscription-model/get-by-app-id {:app-id app-id})]
          (is (= "Pro" (:name sub)))
          (is (= (:id sub)
                 (:subscription_id (app-model/get-by-id! {:id app-id})))))

        ;; Subscription is downgraded
        (stripe/handle-stripe-webhook-event downgrade-event)
        (let [sub (instant-subscription-model/get-by-app-id {:app-id app-id})]
          (is (= "Free" (:name sub)))
          (is (= (:id sub)
                 (:subscription_id (app-model/get-by-id! {:id app-id})))))

        ;; Re-processing the upgrade event should not create a new subscription
        (stripe/handle-stripe-webhook-event upgrade-event)
        (is (= "Free"
               (:name (instant-subscription-model/get-by-app-id {:app-id app-id}))))))))
(comment
  (test/run-tests *ns*))
