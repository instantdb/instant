(ns instant.stripe-test
  (:require
   [clojure.test :as test :refer [deftest is]]
   [instant.fixtures :refer [with-empty-app]]
   [instant.model.instant-stripe-customer :as instant-stripe-customer-model]
   [instant.model.instant-subscription :as instant-subscription-model]
   [instant.stripe :as stripe]))

(defn event-data [{:keys [app-id user-id customer]}]
  {:object {:customer customer,
            :subscription "sub_1P70xAL5BwOwpxgUX9Vepd6n",
            :metadata {:app-id app-id,
                       :user-id user-id}}})

(defn with-stripe-customer [f]
  (with-empty-app
    (fn [{app-id :id creator-id :creator_id}]
      (stripe/init)
      (let [customer (instant-stripe-customer-model/get-or-create! {:user {:id creator-id}})
            customer-id (:id customer)]
        (f (event-data {:app-id app-id
                        :user-id creator-id
                        :customer customer-id}))))))

(deftest handle-stripe-events
  (with-stripe-customer
    (fn [data]
      (let [{:keys [app-id user-id]} (-> data :object :metadata)
            upgrade-event {:type "checkout.session.completed"
                           :id "evt_upgrade"
                           :data data}
            downgrade-event {:type "customer.subscription.deleted"
                             :id "evt_downgrade"
                             :data data}]

        ; No subscription exists at first
        (is (nil? (instant-subscription-model/get-by-user-app {:user-id user-id
                                                               :app-id app-id})))
        ; Subscription is created
        (stripe/handle-stripe-webhook-event upgrade-event)
        (is (= "Pro"
               (:name (instant-subscription-model/get-by-user-app {:user-id user-id :app-id app-id}))))

        ; Subscription is downgraded
        (stripe/handle-stripe-webhook-event downgrade-event)
        (is (= "Free"
               (:name (instant-subscription-model/get-by-user-app {:user-id user-id
                                                                   :app-id app-id}))))

        ; Re-processing the upgrade event should not create a new subscription
        (stripe/handle-stripe-webhook-event upgrade-event)
        (is (= "Free"
               (:name (instant-subscription-model/get-by-user-app {:user-id user-id
                                                                   :app-id app-id}))))))))

(comment
  (test/run-tests *ns*))
