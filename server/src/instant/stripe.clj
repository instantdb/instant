(ns instant.stripe
  (:require
   [instant.config :as config]
   [instant.discord :as discord]
   [instant.model.app :as app-model]
   [instant.model.instant-subscription :as instant-subscription-model]
   [instant.model.instant-user :as instant-user-model]
   [instant.model.org :as org-model]
   [instant.postmark :as postmark]
   [instant.util.exception :as ex]
   [instant.util.json :refer [<-json]]
   [instant.util.tracer :as tracer]
   [instant.util.uuid :as uuid-util]
   [ring.util.http-response :as response]
   [ring.util.request :refer [body-string]])
  (:import
   (com.stripe Stripe StripeClient)
   (com.stripe.model Discount Event Subscription SubscriptionItem)
   (com.stripe.net RequestOptions Webhook)
   (com.stripe.param SubscriptionListParams)))

(def FREE_SUBSCRIPTION_TYPE 1)
(def PRO_SUBSCRIPTION_TYPE 2)
(def STARTUP_SUBSCRIPTION_TYPE 3)

(defn pro-plan? [{:keys [name]}]
  (= name "Pro"))

(defn ping-js-on-new-customer [{:keys [user-id org-id app-id]}]
  (let [{email :email} (instant-user-model/get-by-id {:id user-id})
        title (cond app-id
                    (:title (app-model/get-by-id {:id app-id}))
                    org-id
                    (:title (org-model/get-by-id {:id org-id})))
        message (format "💖 A user subscribed for %s `%s`! Say thank you to `%s`"
                        (cond org-id "org"
                              app-id "app"
                              :else "unknown")
                        title
                        email)]
    (discord/send! config/discord-signups-channel-id
                   (str (:instateam discord/mention-constants) " " message))
    (postmark/send!
     {:from "Instant Assistant <hello@pm.instantdb.com>"
      :to "founders@instantdb.com"
      :subject message
      :html
      (str
       "<div>
             <p>Hey hey! We just got a new paying customer!</p>
             <p>Email: " email "</p>
             <p>Woohoo! Send them a ping as a token of appreciation!</p>
           </div>")})))

(comment
  (def u (instant-user-model/get-by-email {:email "stopa@instantdb.com"}))
  (ping-js-on-new-customer (:id u)))

(defn ping-js-on-churned-customer [{:keys [user-id org-id app-id]}]
  (let [{email :email} (instant-user-model/get-by-id {:id user-id})
        title (cond app-id
                    (:title (app-model/get-by-id {:id app-id}))
                    org-id
                    (:title (org-model/get-by-id {:id org-id})))
        message (format "🪣 Churned customer for %s `%s`! %s"
                        (cond org-id "org"
                              app-id "app"
                              :else "unknown")
                        title
                        email)]
    (discord/send! config/discord-signups-channel-id
                   (str (:instateam discord/mention-constants) " " message))
    (postmark/send!
     {:from "Instant Assistant <hello@pm.instantdb.com>"
      :to "founders@instantdb.com"
      :subject message
      :html
      (str
       "<div>
             <p>Looks like one of our customers churned!</p>
             <p>Email: " email "</p>
             <p>Maybe we should send them a ping to learn why they churned?</p>
           </div>")})))

(comment
  (def u (instant-user-model/get-by-email {:email "stopa@instantdb.com"}))
  (ping-js-on-churned-customer (:id u)))

(defn- processed-event?
  [event-id]
  (instant-subscription-model/get-by-event-id {:event-id event-id}))

(defn handle-stripe-webhook-event
  [{:keys [id type data] :as _event}]
  (tracer/with-span! {:name "stripe-webhook/handle-event"
                      :attributes {:event-id id
                                   :event-type type}}
    (if (processed-event? id)
      (tracer/add-data! {:attributes {:already-processed? true}})
      (let [{customer-id :customer
             subscription-id :subscription
             metadata :metadata}
            (:object data)

            shared {:user-id (uuid-util/coerce (:user-id metadata))
                    :app-id (uuid-util/coerce (:app-id metadata))
                    :org-id (uuid-util/coerce (:org-id metadata))
                    :stripe-customer-id customer-id
                    :stripe-subscription-id subscription-id
                    :stripe-event-id id}

            subscription-type-id (when (string? (:subscription-type-id metadata))
                                   (parse-long (:subscription-type-id metadata)))]
        (condp = type
          "checkout.session.completed"
          (let [{:keys [user-id app-id org-id]} shared
                opts (assoc shared :subscription-type-id (or subscription-type-id
                                                             ;; TODO(orgs): remove when backend
                                                             ;;             is fully deployed
                                                             PRO_SUBSCRIPTION_TYPE))]
            (instant-subscription-model/create! opts)
            (when (= :prod (config/get-env))
              (ping-js-on-new-customer {:user-id user-id
                                        :app-id app-id
                                        :org-id org-id}))
            (tracer/add-data! {:attributes opts}))

          "customer.subscription.deleted"
          (let [opts (assoc shared :subscription-type-id FREE_SUBSCRIPTION_TYPE)
                {:keys [user-id app-id org-id]} opts]
            (when (and app-id (app-model/get-by-id {:id app-id}))
              (instant-subscription-model/create! opts))
            (when (and org-id (org-model/get-by-id  {:id org-id}))
              (instant-subscription-model/create! opts))
            (when (= :prod (config/get-env))
              (ping-js-on-churned-customer {:user-id user-id
                                            :app-id app-id
                                            :org-id org-id}))
            (tracer/add-data! {:attributes opts}))

          (tracer/add-data! {:attributes {:skipped-event? true}}))))))

(defn webhook
  [{:keys [headers] :as req}]
  (let [sig (get headers "stripe-signature")
        body-str (body-string req)
        ^Event event (Webhook/constructEvent
                      body-str
                      sig
                      (config/stripe-webhook-secret))]
    (when-not event
      (ex/throw-validation-err! :stripe-webhook-body
                                {:sig sig
                                 :body-str body-str}
                                [{:message "Could not construct event"}]))
    (let [clj-event (<-json body-str true)]
      (handle-stripe-webhook-event clj-event)
      (response/ok {:received true}))))

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
                   (.build))]
    (-> (StripeClient. ^String (config/stripe-secret))
        (.subscriptions)
        (.list params (RequestOptions/getDefault))
        (.autoPagingIterable)
        (.iterator)
        (iterator-seq)
        (#(map format-subscription %)))))

;; Init

(defn init []
  (if-let [stripe-secret (config/stripe-secret)]
    (set! (. Stripe -apiKey) stripe-secret)
    (tracer/record-info!
     {:name "missing-stripe-secret"
      :attributes {:msg "There is no stripe-secret in config, Stripe will be disabled."}})))
