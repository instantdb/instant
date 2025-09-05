(ns instant.stripe-test
  (:require
   [clojure.test :as test :refer [deftest is]]
   [instant.config :as config]
   [instant.fixtures :refer [with-empty-app with-org with-user]]
   [instant.model.app :as app-model]
   [instant.model.instant-stripe-customer :as instant-stripe-customer-model]
   [instant.model.instant-subscription :as instant-subscription-model]
   [instant.model.org :as org-model]
   [instant.stripe :as stripe]))

(defn event-data [{:keys [app-id org-id user-id customer subscription-type-id]}]
  {:object {:customer customer,
            :subscription "sub_1P70xAL5BwOwpxgUX9Vepd6n",
            :metadata {:app-id (str app-id)
                       :user-id (str user-id)
                       :org-id (str org-id)
                       :subscription-type-id (str subscription-type-id)}}})

(defn with-stripe-customer [f]
  (when (config/stripe-secret)
    (with-empty-app
      (fn [{app-id :id creator-id :creator_id}]
        (let [customer (instant-stripe-customer-model/get-or-create-for-user! {:user {:id creator-id}})
              customer-id (:id customer)]
          (f (event-data {:app-id app-id
                          :user-id creator-id
                          :customer customer-id
                          :subscription-type-id stripe/PRO_SUBSCRIPTION_TYPE})))))))

(defn with-stripe-org-customer [f]
  (when (config/stripe-secret)
    (with-user
      (fn [u]
        (with-org
          (:id u)
          (fn [org]
            (let [customer (instant-stripe-customer-model/get-or-create-for-org!
                            {:org org
                             :user-email (:email u)})
                  customer-id (:id customer)]
              (f (event-data {:org-id (:id org)
                              :user-id (:id u)
                              :customer customer-id
                              :subscription-type-id stripe/STARTUP_SUBSCRIPTION_TYPE})))))))))

(deftest handle-stripe-events
  (with-stripe-customer
    (fn [data]
      (let [app-id (-> data :object :metadata :app-id parse-uuid)
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

(deftest handle-stripe-events-for-org
  (with-stripe-org-customer
    (fn [data]
      (let [org-id (-> data :object :metadata :org-id parse-uuid)
            upgrade-event {:type "checkout.session.completed"
                           :id "evt_upgrade"
                           :data data}
            downgrade-event {:type "customer.subscription.deleted"
                             :id "evt_downgrade"
                             :data data}]

        ;; No subscription exists at first
        (is (nil? (instant-subscription-model/get-by-org-id {:org-id org-id})))

        ;; Subscription is created
        (stripe/handle-stripe-webhook-event upgrade-event)
        (let [sub (instant-subscription-model/get-by-org-id {:org-id org-id})]
          (is (= "Startup" (:name sub)))
          (is (= (:id sub)
                 (:subscription_id (org-model/get-by-id! {:id org-id})))))

        ;; Subscription is downgraded
        (stripe/handle-stripe-webhook-event downgrade-event)
        (let [sub (instant-subscription-model/get-by-org-id {:org-id org-id})]
          (is (= "Free" (:name sub)))
          (is (= (:id sub)
                 (:subscription_id (org-model/get-by-id! {:id org-id})))))

        ;; Re-processing the upgrade event should not create a new subscription
        (stripe/handle-stripe-webhook-event upgrade-event)
        (is (= "Free"
               (:name (instant-subscription-model/get-by-org-id {:org-id org-id}))))))))
(comment
  (test/run-tests *ns*))
