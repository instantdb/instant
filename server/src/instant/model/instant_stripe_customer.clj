(ns instant.model.instant-stripe-customer
  (:require
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql])
  (:import
   (com.stripe.model Customer)
   (java.util Map)))

(defn- create!
  ([params] (create! (aurora/conn-pool :write) params))
  ([conn {:keys [user]}]
   (let [{:keys [id email]} user
         opts {"metadata" {"instant_user_id" id}}
         with-email (if email
                      (assoc opts "email" email)
                      opts)
         customer (Customer/create ^Map with-email)
         customer-id (.getId customer)]
     (sql/execute-one! conn
                       ["INSERT INTO instant_stripe_customers (id, user_id) VALUES (?, ?::uuid)
                        ON CONFLICT (user_id) DO NOTHING RETURNING *"
                        customer-id id]))))

(defn- get-by-instant-user-id
  "Get a stripe customer information by instant user id."
  ([params] (get-by-instant-user-id (aurora/conn-pool :read) params))
  ([conn {:keys [user-id]}]
   (sql/select-one conn
                   ["SELECT * FROM instant_stripe_customers WHERE user_id = ?::uuid"
                    user-id])))

(defn get-or-create!
  "Get or create a stripe customer from an instant user."
  ([params] (get-or-create! (aurora/conn-pool :write) params))
  ([conn {:keys [user]}]
   (or (get-by-instant-user-id conn {:user-id (:id user)})
       (create! conn {:user user}))))
