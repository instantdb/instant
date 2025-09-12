(ns instant.stripe
  (:require
   [instant.config :as config]
   [instant.plans :as plans]
   [instant.util.crypt :as crypt-util]
   [instant.util.date :as date]
   [instant.util.tracer :as tracer])
  (:import
   (com.stripe Stripe StripeClient)
   (com.stripe.model Customer Discount Subscription SubscriptionItem)
   (com.stripe.net RequestOptions)
   (com.stripe.param CustomerBalanceTransactionCollectionCreateParams CustomerUpdateParams CustomerUpdateParams$InvoiceSettings InvoiceCreatePreviewParams InvoiceCreatePreviewParams$SubscriptionDetails InvoiceCreatePreviewParams$SubscriptionDetails$ProrationBehavior SetupIntentConfirmParams SetupIntentCreateParams SetupIntentCreateParams$AutomaticPaymentMethods SetupIntentCreateParams$AutomaticPaymentMethods$AllowRedirects SubscriptionCancelParams SubscriptionCancelParams$CancellationDetails SubscriptionCreateParams SubscriptionCreateParams$Item SubscriptionListParams SubscriptionRetrieveParams SubscriptionUpdateParams)
   (java.util Map)))

(set! *warn-on-reflection* true)

(def ^:dynamic *create-fake-objects* false)

(defn create-fake-objects? []
  (and *create-fake-objects* (not (config/prod?))))

(defn create-customer [^Map opts]
  (if (create-fake-objects?)
    (str "cus_fake_" (crypt-util/random-hex 8))
    (.getId (Customer/create opts))))

(defn transfer-app-cancel-details [{:keys [org-customer-id
                                           org-subscription-id]}]
  (.. (SubscriptionCancelParams$CancellationDetails/builder)
      (putExtraParam "reason" "transfer-app-to-org")
      (putExtraParam "org-customer-id" org-customer-id)
      (putExtraParam "org-subscription-id" org-subscription-id)
      (build)))

(def cancel-now-preview-details
  (.. (InvoiceCreatePreviewParams$SubscriptionDetails/builder)
      (setCancelNow true)
      (setProrationBehavior InvoiceCreatePreviewParams$SubscriptionDetails$ProrationBehavior/CREATE_PRORATIONS)
      (build)))

(defn cancel-subscription-and-credit-customer
  "Cancels the app's subscription and gives a credit to the org
   for the remaining prorated balance of the app subscription."
  [{:keys [app-customer-id
           app-subscription-id
           org-customer-id
           org-subscription-id]}]
  (let [client (StripeClient. ^String (config/stripe-secret))
        subscription (.retrieve (.subscriptions client)
                                app-subscription-id)
        ;; The prorated credit the user would get if we canceled their app subscription
        ;; A credit will return a negative number.
        credit-amount (when (or true  (= "active" (.getStatus subscription)))
                        ;; XXX: catch error if no upcoming invoices
                        (let [preview (.createPreview (.invoices client)
                                                      (.. (InvoiceCreatePreviewParams/builder)
                                                          (setSubscription (.getId subscription))
                                                          (setSubscriptionDetails cancel-now-preview-details)
                                                          (build)))]
                          {:amount (.getTotal preview)
                           :currency (.getCurrency preview)}))
        org-customer (.retrieve (.customers client)
                                org-customer-id)
        _ (.update subscription
                   (.. (SubscriptionUpdateParams/builder)
                       (putMetadata "cancel-reason" "transfer-app-to-org")
                       (putMetadata "org-customer-id" (str org-customer-id))
                       (putMetadata "org-subscription-id" (str org-subscription-id))
                       (build)))]
    (tool/def-locals)
    (.cancel subscription
             (-> (SubscriptionCancelParams/builder)
                 (.setProrate false)
                 (.build)))

    (when (and credit-amount
               (neg? (:amount credit-amount)))
      (.create (.balanceTransactions org-customer)
               (.. (CustomerBalanceTransactionCollectionCreateParams/builder)
                   (setAmount (:amount credit-amount))
                   (setCurrency (:currency credit-amount))
                   (setDescription (str "Credit from " (.getDescription subscription)))
                   (putMetadata "credit-reason" "transfer-app-to-org")
                   (putMetadata "app-subscription-id" (str app-subscription-id))
                   (putMetadata "app-customer-id" (str app-customer-id))
                   (build))))))

(defn customer-balance-by-subscription [^String subscription-id]
  (let [client (StripeClient. ^String (config/stripe-secret))]
    (-> (.subscriptions client)
        (.retrieve subscription-id (.. (SubscriptionRetrieveParams/builder)
                                       (addExpand "customer")
                                       (build)))
        (.getCustomerObject)
        (.getBalance))))

;; Admin Helpers

(defn item-monthly-revenue [^SubscriptionItem item]
  (let [recurring (-> item
                      (.getPrice)
                      (.getRecurring))
        multiple (* (.getIntervalCount recurring)
                    (case (.getInterval recurring)
                      "month" 1
                      "day" 30
                      "week" 4.3
                      "year" (/ 1 12)))
        price (-> item
                  (.getPrice)
                  (.getUnitAmount))]
    (* multiple price)))

(defn discount-amount [items-revenue ^Discount discount]
  (let [amount-off (-> discount
                       (.getCoupon)
                       (.getAmountOff)
                       (or 0))
        percent-off (-> discount
                        (.getCoupon)
                        (.getPercentOff)
                        (or 0))]
    (+ amount-off
       (* percent-off (max 0
                           (- items-revenue amount-off))))))

(defn format-subscription [^Subscription subscription]
  (let [items (.getData (.getItems subscription))
        items-revenue (reduce + (map item-monthly-revenue items))
        discount (reduce + (map (partial discount-amount items-revenue)
                                (.getDiscountObjects subscription)))]
    {:subscription-id (.getId subscription)
     :customer-id (.getCustomer subscription)
     :monthly-revenue (max 0 (- items-revenue discount))
     :start-timestamp (.getStartDate subscription)}))

(defn subscriptions []
  (let [params (-> (SubscriptionListParams/builder)
                   (.addExpand "data.discounts")
                   (.setLimit 100)
                   (.build))]
    (-> (StripeClient. ^String (config/stripe-secret))
        (.subscriptions)
        (.list params (RequestOptions/getDefault))
        (.autoPagingIterable)
        (.iterator)
        (iterator-seq)
        (#(map format-subscription %)))))

;; Test and dev helpers

(defn create-pro-subscription
  "Intended for use in dev and tests, will create a stripe subscription
  for a customer that matches the subscription that would have been created
  through the checkout process."
  [{:keys [customer-id user app]}]
  (if (create-fake-objects?)
    (str "sub_fake_" (crypt-util/random-hex 8))
    (let [sub (-> (StripeClient. ^String (config/stripe-secret))
                  (.subscriptions)
                  (.create (.. (SubscriptionCreateParams/builder)
                               (setCustomer customer-id)
                               (setDescription (str "App name: " (:title app)))
                               (addItem (.. (SubscriptionCreateParams$Item/builder)
                                            (setPrice (config/stripe-pro-subscription))
                                            (setQuantity 1)
                                            (build)))
                               (setBillingCycleAnchor (.toEpochSecond (date/first-of-next-month-est)))
                               (putMetadata "app-id" (str (:id app)))
                               (putMetadata "user-id" (str (:id user)))
                               (putMetadata "subscription-type-id" (str plans/PRO_SUBSCRIPTION_TYPE))
                               (putMetadata "source" "backend")
                               (build))))]
      (.getId sub))))

(defn add-payment-method-for-test-customer
  "Adds a default payment method for a customer in test mode."
  [customer-id]
  (when-not (create-fake-objects?)
    (assert (not (config/prod?)))
    (let [client (StripeClient. ^String (config/stripe-secret))
          setup-intent (-> client
                           (.setupIntents)
                           (.create (.. (SetupIntentCreateParams/builder)
                                        (setCustomer customer-id)
                                        (setAutomaticPaymentMethods (.. (SetupIntentCreateParams$AutomaticPaymentMethods/builder)
                                                                        (setAllowRedirects SetupIntentCreateParams$AutomaticPaymentMethods$AllowRedirects/NEVER)
                                                                        (setEnabled true)
                                                                        (build)))
                                        (build)))
                           (.confirm (.. (SetupIntentConfirmParams/builder)
                                         (setPaymentMethod "pm_card_visa")
                                         (build))))]
      (-> (.customers client)
          (.update ^String customer-id
                   (.. (CustomerUpdateParams/builder)
                       (setInvoiceSettings (.. (CustomerUpdateParams$InvoiceSettings/builder)
                                               (setDefaultPaymentMethod (.getPaymentMethod setup-intent))
                                               (build)))
                       (build)))))))

;; Init

(defn init []
  (if-let [stripe-secret (config/stripe-secret)]
    (set! (. Stripe -apiKey) stripe-secret)
    (tracer/record-info!
      {:name "missing-stripe-secret"
       :attributes {:msg "There is no stripe-secret in config, Stripe will be disabled."}})))
