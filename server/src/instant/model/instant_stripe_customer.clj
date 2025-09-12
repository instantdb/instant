(ns instant.model.instant-stripe-customer
  (:require
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.stripe :as stripe])
  (:import
   (java.util Map)))

(defn- create-stripe-customer
  "Creates a customer on Stripe, returns the customer id.
   opts should be a map."
  [^Map opts]
  (stripe/create-customer opts))

(defn- create-for-user!
  ([params] (create-for-user! (aurora/conn-pool :write) params))
  ([conn {:keys [user]}]
   (let [{:keys [id email]} user
         opts {"metadata" {"instant_user_id" id}}
         with-email (if email
                      (assoc opts "email" email)
                      opts)
         customer-id (create-stripe-customer with-email)]
     (sql/execute-one! conn
                       ["INSERT INTO instant_stripe_customers (id, user_id) VALUES (?, ?::uuid)
                        ON CONFLICT (user_id) DO NOTHING RETURNING *"
                        customer-id id]))))

(defn- create-for-org!
  ([params] (create-for-org! (aurora/conn-pool :write) params))
  ([conn {:keys [org user-email]}]
   (let [opts {"metadata" {"instant_org_id" (:id org)}}
         email (or (:billing_email org) user-email)
         with-email (if email
                      (assoc opts "email" email)
                      opts)
         customer-id (create-stripe-customer with-email)]
     (sql/execute-one! conn
                       ["INSERT INTO instant_stripe_customers (id, org_id) VALUES (?, ?::uuid)
                        ON CONFLICT (org_id) DO NOTHING RETURNING *"
                        customer-id (:id org)]))))

(defn- get-by-instant-user-id
  "Get a stripe customer information by instant user id."
  ([params] (get-by-instant-user-id (aurora/conn-pool :read) params))
  ([conn {:keys [user-id]}]
   (sql/select-one conn
                   ["SELECT * FROM instant_stripe_customers WHERE user_id = ?::uuid"
                    user-id])))

(defn- get-by-org-id
  ([params] (get-by-org-id (aurora/conn-pool :read) params))
  ([conn {:keys [org-id]}]
   (sql/select-one conn
                   ["select * from instant_stripe_customers where org_id = ?::uuid"
                    org-id])))

(defn get-or-create-for-user!
  "Get or create a stripe customer from an instant user."
  ([params] (get-or-create-for-user! (aurora/conn-pool :write) params))
  ([conn {:keys [user]}]
   (or (get-by-instant-user-id conn {:user-id (:id user)})
       (create-for-user! conn {:user user}))))

(defn get-or-create-for-org!
  "Get or create a stripe customer from an instant user."
  ([params] (get-or-create-for-org! (aurora/conn-pool :write) params))
  ([conn {:keys [org user-email]}]
   (or (get-by-org-id conn {:org-id (:id org)})
       (create-for-org! conn {:org org
                              :user-email user-email}))))
