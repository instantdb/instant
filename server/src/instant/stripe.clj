(ns instant.stripe
  (:require
   [instant.config :as config]
   [instant.plans :as plans]
   [instant.util.crypt :as crypt-util]
   [instant.util.date :as date]
   [instant.util.tracer :as tracer])
  (:import
   (com.stripe Stripe StripeClient)
   (com.stripe.exception InvalidRequestException)
   (com.stripe.model Customer CustomerBalanceTransaction Discount Subscription SubscriptionItem)
   (com.stripe.net RequestOptions)
   (com.stripe.param CustomerBalanceTransactionCollectionCreateParams CustomerUpdateParams CustomerUpdateParams$InvoiceSettings InvoiceCreatePreviewParams InvoiceCreatePreviewParams$SubscriptionDetails InvoiceCreatePreviewParams$SubscriptionDetails$ProrationBehavior SetupIntentConfirmParams SetupIntentCreateParams SetupIntentCreateParams$AutomaticPaymentMethods SetupIntentCreateParams$AutomaticPaymentMethods$AllowRedirects SubscriptionCancelParams SubscriptionCreateParams SubscriptionCreateParams$Discount SubscriptionCreateParams$Item SubscriptionListParams SubscriptionListParams$Status SubscriptionRetrieveParams SubscriptionUpdateParams)
   (java.util HashMap Map)))

(set! *warn-on-reflection* true)

(def stripe-client* (delay (StripeClient. ^String (config/stripe-secret))))

(defn stripe-client ^StripeClient []
  @stripe-client*)

(def ^:dynamic *create-fake-objects* false)

(defn create-fake-objects? []
  (and *create-fake-objects* (not (config/prod?))))

(defn create-customer [^Map opts]
  (if (create-fake-objects?)
    (str "cus_fake_" (crypt-util/random-hex 8))
    (.getId (Customer/create opts))))

(def cancel-now-preview-details
  (.. (InvoiceCreatePreviewParams$SubscriptionDetails/builder)
      (setCancelNow true)
      (setProrationBehavior InvoiceCreatePreviewParams$SubscriptionDetails$ProrationBehavior/CREATE_PRORATIONS)
      (build)))

(defn map->metadata ^Map [m]
  (let [metadata (HashMap.)]
    (doseq [[k v] m]
      (.put metadata (name k) (str v)))
    metadata))

(defn credit-customer ^CustomerBalanceTransaction [{:keys [customer-id amount currency description metadata]}]
  (tracer/with-span! {:name "stripe/credit-customer"
                      :attributes {:customer-id customer-id
                                   :amount amount
                                   :currency currency}}
    (-> (stripe-client)
        (.customers)
        (.retrieve customer-id)
        (.balanceTransactions)
        (.create (.. (CustomerBalanceTransactionCollectionCreateParams/builder)
                     (setAmount amount)
                     (setCurrency currency)
                     (setDescription description)
                     (putAllMetadata (map->metadata metadata))
                     (build))))))

(defn remaining-credit-on-subscription [subscription-id]
  (try
    (let [preview (.createPreview (.invoices (stripe-client))
                                  (.. (InvoiceCreatePreviewParams/builder)
                                      (setSubscription subscription-id)
                                      (setSubscriptionDetails cancel-now-preview-details)
                                      (build)))]
      {:amount (.getTotal preview)
       :currency (.getCurrency preview)})
    (catch InvalidRequestException e
      (when (not= (.getCode e) "invoice_upcoming_none")
        (throw e)))))

(defn cancel-subscription-and-credit-customer
  "Cancels the app's subscription and gives a credit to the org
   for the remaining prorated balance of the app subscription."
  [{:keys [app-customer-id
           app-subscription-id
           org-id
           org-customer-id
           org-subscription-id]}]
  (let [client (stripe-client)
        subscription (.retrieve (.subscriptions client)
                                app-subscription-id)
        ;; The prorated credit the user would get if we canceled their app subscription
        ;; A credit will return a negative number.
        credit-amount (when (= "active" (.getStatus subscription))
                        (remaining-credit-on-subscription (.getId subscription)))
        cancel-metadata (map->metadata {"cancel-reason" "transfer-app-to-org"
                                        "transfer-org-id" (str org-id)
                                        "transfer-org-customer-id" org-customer-id
                                        "transfer-org-subscription-id" org-subscription-id})
        canceled-subscription (tracer/with-span! {:name "stripe/cancel-app-subscription"}
                                (.update subscription
                                         (.. (SubscriptionUpdateParams/builder)
                                             (putAllMetadata cancel-metadata)
                                             (build)))
                                (.cancel subscription
                                         (-> (SubscriptionCancelParams/builder)
                                             (.setProrate false)
                                             (.build))))
        credit (when (and credit-amount
                          (neg? (:amount credit-amount)))
                 (credit-customer {:customer-id org-customer-id
                                   :amount (:amount credit-amount)
                                   :currency (:currency credit-amount)
                                   :description (str "Credit from " (.getDescription subscription))
                                   :metadata {"credit-reason" "transfer-app-to-org"
                                              "app-subscription-id" (str app-subscription-id)
                                              "app-customer-id" (str app-customer-id)}}))]
    {:credit (some-> credit (.getAmount))
     :canceled-subscription canceled-subscription}))

(defn customer-balance-by-subscription [^String subscription-id]
  (let [client (stripe-client)]
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

(defn customer ^Customer [customer-id]
  (-> (stripe-client)
      (.customers)
      (.retrieve customer-id)))

(defn subscription ^Subscription [subscription-id]
  (-> (stripe-client)
      (.subscriptions)
      (.retrieve subscription-id)))

(defn subscriptions []
  (let [params (-> (SubscriptionListParams/builder)
                   (.addExpand "data.discounts")
                   (.setStatus SubscriptionListParams$Status/ACTIVE)
                   (.setLimit 100)
                   (.build))]
    (-> (stripe-client)
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
  [{:keys [customer-id user app free?]}]
  (if (create-fake-objects?)
    {:id (str "sub_fake_" (crypt-util/random-hex 8))}
    (let [sub (-> (stripe-client)
                  (.subscriptions)
                  (.create (let [builder (.. (SubscriptionCreateParams/builder)
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
                                             (putMetadata "source" "backend"))]
                             (when free?
                               (.addDiscount builder (.. (SubscriptionCreateParams$Discount/builder)
                                                         (setCoupon "i33t1l5x")
                                                         (build))))
                             (.build builder))))]
      {:id (.getId sub)
       :subscription sub})))

(defn create-startup-subscription
  "Intended for use in dev and tests, will create a stripe subscription
  for a customer that matches the subscription that would have been created
  through the checkout process."
  [{:keys [customer-id org free?]}]
  (if (create-fake-objects?)
    {:id (str "sub_fake_" (crypt-util/random-hex 8))}
    (let [sub (-> (stripe-client)
                  (.subscriptions)
                  (.create (let [builder (.. (SubscriptionCreateParams/builder)
                                             (setCustomer customer-id)
                                             (setDescription (str "Org name: " (:title org)))
                                             (addItem (.. (SubscriptionCreateParams$Item/builder)
                                                          (setPrice (config/stripe-startup-subscription))
                                                          (setQuantity 1)
                                                          (build)))
                                             (setBillingCycleAnchor (.toEpochSecond (date/first-of-next-month-est)))
                                             (putMetadata "org-id" (str (:id org)))
                                             (putMetadata "subscription-type-id" (str plans/STARTUP_SUBSCRIPTION_TYPE))
                                             (putMetadata "source" "backend"))]
                             (when free?
                               (.addDiscount builder (.. (SubscriptionCreateParams$Discount/builder)
                                                         (setCoupon "i33t1l5x")
                                                         (build))))
                             (.build builder))))]
      {:id (.getId sub)
       :subscription sub})))

(defn add-payment-method-for-test-customer
  "Adds a default payment method for a customer in test mode."
  [customer-id]
  (when-not (create-fake-objects?)
    (assert (not (config/prod?)))
    (let [client (stripe-client)
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
