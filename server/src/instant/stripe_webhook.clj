(ns instant.stripe-webhook
  (:require
   [instant.config :as config]
   [instant.discord :as discord]
   [instant.model.app :as app-model]
   [instant.model.instant-subscription :as instant-subscription-model]
   [instant.model.instant-user :as instant-user-model]
   [instant.model.org :as org-model]
   [instant.plans :as plans]
   [instant.postmark :as postmark]
   [instant.util.exception :as ex]
   [instant.util.json :refer [<-json]]
   [instant.util.tracer :as tracer]
   [instant.util.uuid :as uuid-util]
   [ring.util.http-response :as response]
   [ring.util.request :refer [body-string]])
  (:import
   (com.stripe.model Event)
   (com.stripe.net Webhook)))

(defn send-discord! [msg]
  (if (config/prod?)
    (discord/send! config/discord-signups-channel-id
                   (str (:instateam discord/mention-constants) " " msg))
    (discord/send! config/discord-debug-channel-id
                   msg)))

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
    (send-discord! message)
    (when (config/prod?)
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
           </div>")}))))

(comment
  (def u (instant-user-model/get-by-email {:email "stopa@instantdb.com"}))
  (ping-js-on-new-customer (:id u)))

(defn ping-js-on-churned-customer [{:keys [user-id org-id app-id]}]
  (let [{email :email} (instant-user-model/get-by-id {:id user-id})
        title (cond app-id
                    (:title (app-model/get-by-id {:id app-id}))
                    org-id
                    (:title (org-model/get-by-id {:id org-id})))
        message (format "🪣 Churned customer for %s `%s`! `%s`"
                        (cond org-id "org"
                              app-id "app"
                              :else "unknown")
                        title
                        email)]
    (send-discord! message)
    (when (config/prod?)
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
           </div>")}))))

(defn ping-on-paid-app-tranferred-to-org [{:keys [user-id transfer-org-id app-id]}]
  (let [{email :email} (instant-user-model/get-by-id {:id user-id})
        app-title (:title (app-model/get-by-id {:id app-id}))
        org-title (:title (org-model/get-by-id {:id transfer-org-id}))
        message (format "Paid app `%s` by `%s` transferred to unpaid app in paid org `%s`."
                        app-title
                        email
                        org-title)]
    (send-discord! message)
    (when (config/prod?)
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
  )

(defn ping-on-balance-changed [{:keys [org-id previous-balance new-balance email]}]
  (let [org-title (when org-id
                    (when-let [org (org-model/get-by-id {:id org-id})]
                      (format "organization `%s`" (:title org))))
        message (format "Cutomer balance for %s `%s` went from %s to %s (negative numbers are credits)."
                        (or org-title "")
                        email
                        previous-balance
                        new-balance)]
    (send-discord! message)))

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
        (case type
          "checkout.session.completed"
          (let [{:keys [user-id app-id org-id]} shared
                opts (assoc shared :subscription-type-id (or subscription-type-id
                                                             ;; TODO(orgs): remove when backend
                                                             ;;             is fully deployed
                                                             plans/PRO_SUBSCRIPTION_TYPE))]
            (instant-subscription-model/create! opts)
            (ping-js-on-new-customer {:user-id user-id
                                      :app-id app-id
                                      :org-id org-id})
            (tracer/add-data! {:attributes opts}))

          "customer.subscription.deleted"
          (let [opts (assoc shared :subscription-type-id plans/FREE_SUBSCRIPTION_TYPE)
                {:keys [user-id app-id org-id]} opts]
            (when (and app-id (app-model/get-by-id {:id app-id}))
              (instant-subscription-model/create! opts))
            (when (and org-id (org-model/get-by-id  {:id org-id}))
              (instant-subscription-model/create! opts))
            (case (get-in data [:object :metadata :cancel-reason])
              "transfer-app-to-org"
              (ping-on-paid-app-tranferred-to-org {:user-id user-id
                                                   :app-id app-id
                                                   :transfer-org-id (some-> data
                                                                            :object
                                                                            :metadata
                                                                            :transfer-org-id
                                                                            parse-uuid)})

              (ping-js-on-churned-customer {:user-id user-id
                                            :app-id app-id
                                            :org-id org-id}))
            (tracer/add-data! {:attributes opts}))

          "customer.updated"
          (when-let [previous-balance (get-in data [:previous_attributes :balance])]
            (let [opts {:previous-balance previous-balance
                        :new-balance (get-in data [:object :balance])
                        :org-id (some-> data
                                        :object
                                        :metadata
                                        :instant_org_id
                                        (parse-uuid))
                        :email (get-in data [:object :email])}]
              (tracer/add-data! {:attributes opts})
              (ping-on-balance-changed opts)))

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
