(ns instant.stripe-test
  (:require
   [clojure.test :as test :refer [deftest is]]
   [instant.config :as config]
   [instant.fixtures :refer [with-empty-app with-org with-user with-pro-app]]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.model.app :as app-model]
   [instant.model.instant-stripe-customer :as instant-stripe-customer-model]
   [instant.model.instant-subscription :as instant-subscription-model]
   [instant.model.org :as org-model]
   [instant.util.crypt :as crypt-util]
   [instant.util.json :refer [->json <-json <-json-stream]]
   [instant.util.tracer :as tracer]
   [instant.plans :as plans]
   [instant.stripe :as stripe]
   [instant.stripe-webhook :as stripe-webhook])
  (:import (com.stripe.model Subscription)
           (io.undertow.io UndertowInputStream)
           (java.io InputStreamReader)))

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
                          :subscription-type-id plans/PRO_SUBSCRIPTION_TYPE})))))))

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
                              :subscription-type-id plans/STARTUP_SUBSCRIPTION_TYPE})))))))))

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
        (stripe-webhook/handle-stripe-webhook-event upgrade-event)
        (let [sub (instant-subscription-model/get-by-app-id {:app-id app-id})]
          (is (= "Pro" (:name sub)))
          (is (= (:id sub)
                 (:subscription_id (app-model/get-by-id! {:id app-id})))))

        ;; Subscription is downgraded
        (stripe-webhook/handle-stripe-webhook-event downgrade-event)
        (let [sub (instant-subscription-model/get-by-app-id {:app-id app-id})]
          (is (= "Free" (:name sub)))
          (is (= (:id sub)
                 (:subscription_id (app-model/get-by-id! {:id app-id})))))

        ;; Re-processing the upgrade event should not create a new subscription
        (stripe-webhook/handle-stripe-webhook-event upgrade-event)
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
        (stripe-webhook/handle-stripe-webhook-event upgrade-event)
        (let [sub (instant-subscription-model/get-by-org-id {:org-id org-id})]
          (is (= "Startup" (:name sub)))
          (is (= (:id sub)
                 (:subscription_id (org-model/get-by-id! {:id org-id})))))

        ;; Subscription is downgraded
        (stripe-webhook/handle-stripe-webhook-event downgrade-event)
        (let [sub (instant-subscription-model/get-by-org-id {:org-id org-id})]
          (is (= "Free" (:name sub)))
          (is (= (:id sub)
                 (:subscription_id (org-model/get-by-id! {:id org-id})))))

        ;; Re-processing the upgrade event should not create a new subscription
        (stripe-webhook/handle-stripe-webhook-event upgrade-event)
        (is (= "Free"
               (:name (instant-subscription-model/get-by-org-id {:org-id org-id}))))))))

(defn with-setup-credits-subscriptions-for-paid-org [f]
  (with-redefs [stripe-webhook/webhook
                (fn [req]
                  (let [^UndertowInputStream body (:body req)
                        event (->(InputStreamReader. body "UTF-8")
                                 <-json-stream)]
                    (tracer/with-span! {:name "ignore-stripe-webhook-during-test"
                                        :attributes {:event-id (get event "id")
                                                     :type (get event "type")}}
                      {:status 200
                       :body "skipped for test"})))]
    (with-user
      (fn [u]
        (with-org
          (:id u)
          (fn [org]
            (with-pro-app
              {:create-fake-objects? false}
              u
              (fn [app-1-data]
                (with-pro-app
                  {:create-fake-objects? false}
                  u
                  (fn [app-2-data]
                    (sql/execute! (aurora/conn-pool :write)
                                  ["update apps set org_id = ?::uuid, creator_id = null where id in (?::uuid, ?::uuid)"
                                   (:id org)
                                   (:id (:app app-1-data))
                                   (:id (:app app-2-data))])
                    (f {:user u
                        :org org
                        :app-1-data app-1-data
                        :app-2-data app-2-data})))))))))))

(deftest credits-subscriptions-for-paid-org
  (when (config/stripe-secret)
    (with-setup-credits-subscriptions-for-paid-org
      (fn [{:keys [user org app-1-data app-2-data]}]
        (let [customer (instant-stripe-customer-model/get-or-create-for-org!
                        {:org org
                         :user-email (:email user)})
              _ (stripe/add-payment-method-for-test-customer (:id customer))

              {:keys [^Subscription subscription]}
              (stripe/create-startup-subscription {:customer-id (:id customer)
                                                   :org org})

              event (-> {:data {:object {:customer (:id customer)
                                         :subscription (.getId subscription)
                                         :metadata (.getMetadata subscription)}}
                         :id (str "test_evt_" (crypt-util/random-hex 8))
                         :type "checkout.session.completed"}
                        ->json
                        (<-json true))]
          (stripe-webhook/handle-stripe-webhook-event event)
          (is (neg? (.getBalance (stripe/customer (:id customer)))))
          (is (= "canceled" (.getStatus (stripe/subscription (:stripe-subscription-id app-1-data)))))
          (is (= "canceled" (.getStatus (stripe/subscription (:stripe-subscription-id app-2-data))))))))))


(comment
  (test/run-tests *ns*))
