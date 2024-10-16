(ns instant.util.$users
  (:require [clojure.string :as string]
            [honey.sql :as hsql]
            [instant.db.model.attr :as attr-model]
            [instant.db.model.transaction :as transaction-model]
            [instant.model.app :as app-model]
            [instant.jdbc.aurora :as aurora]
            [instant.jdbc.sql :as sql]
            [instant.util.tracer :as tracer]
            [next.jdbc :as next-jdbc]))

;; Steps to migrate:
;; 1. create the namespace attrs if they don't already exist
;;    a. $users
;;    b. $users-magic-codes
;;    c. $users-refresh-tokens
;;    d. $users-oauth-links
;;    e. $oauth-codes
;; 2. put all of the tables into triples
;; 3. make some annotation on the app that users are in triples
;; 4. Maybe have some `locking` thing so that we don't insert
;;    users into the app_users table while the migration is ongoing
;;      a. Alternatively, we could have a second-round migration that handles that

;; XXX: Should we use camelCase for all of the property names?


;; XXX: Need to add here any fields I didn't already add
;;      Probably better to have a single source of truth?
(def attr-mappings
  {"$users" {:table :app_users
             :app-id-join nil
             :fields {"id" {:col :id}
                      "email" {:col :email}}}
   "$magic-codes" {:table :app_user_magic_codes
                   :app-id-join {:table :app_users
                                 :col :user_id}
                   :fields {"id" {:col :id}
                            "code" {:col :code}
                            "$user" {:col :user_id}}}
   "$user-refresh-tokens" {:table :app_user_refresh_tokens
                           :app-id-join {:table :app_users
                                         :col :user_id}
                           :needs-id? true
                           :fields {"id" {:col :entity-id}
                                    "hashed-token"
                                    {:col :token
                                     :transform [:encode
                                                 [:digest [:uuid_send :id]
                                                  [:inline "sha256"]]
                                                 [:inline "hex"]]}}}
   "$oauth-providers" {:table :app_oauth_service_providers
                       :app-id-join nil
                       :fields {"id" {:col :id}
                                "name" {:col :provider_name}}}
   "$user-oauth-links" {:table :app_user_oauth_links
                        :app-id-join nil
                        :fields
                        {"id" {:col :id}
                         "sub" {:col :sub}
                         "$user" {:col :user_id}
                         "$oauth-provider" {:col :provider_id}
                         "sub+$oauth-provider" {:col :sub
                                                :transform [:||
                                                            :sub
                                                            [:inline "+"]
                                                            :provider_id]}}}
   "$oauth-clients" {:table :app_oauth_clients
                     :app-id-join nil
                     :fields
                     {"id" {:col :id}
                      "$oauth-provider" {:col :provider_id}
                      "name" {:col :client_name}
                      "client-id" {:col :client_id}
                      "encrypted-client-secret" {:col :client_secret
                                                 :transform [:encode
                                                             :client_secret
                                                             [:inline "hex"]]}
                      "discovery-endpoint" {:col :discovery_endpoint}
                      "meta" {:col :meta}}}
   "$oauth-codes" {:table :app_oauth_codes
                   :app-id-join nil
                   :needs-id? true
                   :fields {"id" {:col :entity-id}
                            "code-hash" {:col :lookup_key
                                         :transform [:encode
                                                     :lookup_key
                                                     [:inline "hex"]]}
                            "$user" {:col :user_id}
                            "code-challenge-method" {:col :code_challenge_method}
                            ;; XXX: Need to support a hashed code challenge
                            "code-challenge-hash" {:col :code_challenge
                                                   :transform [:encode
                                                               [:digest :code_challenge
                                                                [:inline "sha256"]]
                                                               [:inline "hex"]]}}}
   "$oauth-redirects" {:table :app_oauth_redirects
                       :app-id-join {:table :app_oauth_clients
                                     :col :client_id}
                       :needs-id? true
                       :fields {"id" {:col :entity-id}
                                "state-hash" {:col :lookup_key
                                              :transform [:encode
                                                          :lookup_key
                                                          [:inline "hex"]]}
                                "cookie-hash" {:col :cookie
                                               :transform [:encode
                                                           [:digest [:uuid_send :cookie]
                                                            [:inline "sha256"]]
                                                           [:inline "hex"]]}
                                "redirect-url" {:col :redirect_url}
                                "$oauth-client" {:col :client_id}
                                "code-challenge-method" {:col :code_challenge_method}
                                ;; XXX: Need to support a hashed code challenge
                                "code-challenge-hash" {:col :code_challenge
                                                       :transform [:encode
                                                                   [:digest :code_challenge
                                                                    [:inline "sha256"]]
                                                                   [:inline "hex"]]}}}})

(defn qualify [table col]
  {:pre [(keyword? table) (keyword? col)]}
  (keyword (format "%s.%s" (name table) (name col))))

(defn triples-insert-query
  "Returns a query that will translate the table into triples and insert them into the database."
  [app-id etype attrs]
  (let [{:keys [table fields app-id-join needs-id?]} (get attr-mappings etype)
        values (mapv (fn [[label {:keys [col]}]]
                       (let [attr (attr-model/seek-by-fwd-ident-name
                                   [etype label]
                                   attrs)]
                         (assert attr (format "Expected to find an attr for `%s.%s`" etype label))
                         [[:inline (name col)]         ; col
                          (:id attr)                   ; attr-id
                          (= :one (:cardinality attr)) ; ea
                          (= :ref (:value-type attr))  ; eav
                          (:unique? attr)              ; av
                          (:index? attr)               ; ave
                          (= :ref (:value-type attr))  ; vae
                          ]))
                     fields)]
    {:with
     [[:attr-mapping {:select :*
                      :from [[{:values values}
                              [:mapping {:columns [:col
                                                   :attr-id
                                                   :ea
                                                   :eav
                                                   :av
                                                   :ave
                                                   :vae]}]]]}]
      ;; First get all fields up the value-md5, because we need to get the
      ;; value to calculate the md5
      [:triples-up-to-md5 {:select [:app-id
                                    (if needs-id?
                                      :entity-id
                                      [:id :entity-id])
                                    [:attr-mapping.attr-id :attr-id]
                                    [(concat [:case-expr :attr-mapping.col]
                                             (mapcat (fn [{:keys [col transform]}]
                                                       [[:inline (name col)]
                                                        [:coalesce [:to_jsonb (or transform
                                                                                  col)]
                                                         [:inline "\"null\""]]])
                                                     (vals fields))
                                             [:else nil]) :value]
                                    [:attr-mapping.ea :ea]
                                    [:attr-mapping.eav :eav]
                                    [:attr-mapping.av :av]
                                    [:attr-mapping.ave :ave]
                                    [:attr-mapping.vae :vae]
                                    :created-at]
                           :from [(if app-id-join
                                    [{:select (concat (when needs-id?
                                                        [[[:gen_random_uuid] :entity-id]])
                                                      [(qualify table :*)
                                                       (qualify (:table app-id-join) :app_id)])
                                      :from table
                                      :join [(:table app-id-join)
                                             [:= (qualify table (:col app-id-join))
                                              (qualify (:table app-id-join) :id)]]}
                                     table]
                                    (if needs-id?
                                      [{:select [[[:gen_random_uuid] :entity-id]
                                                 (qualify table :*)]
                                        :from table}
                                       table]
                                      table))
                                  :attr-mapping]
                           :where [:= :app-id app-id]}]]

     :insert-into [:triples
                   {:select [:app-id
                             :entity-id
                             :attr-id
                             :value
                             [[:md5 [:cast :value :text]] :value-md5]
                             :ea
                             :eav
                             :av
                             :ave
                             :vae
                             [[:cast [:* 1000 [:extract [:epoch-from :created-at]]] :bigint] :created-at]]
                    :from :triples-up-to-md5}]}))

(defn gen-$users-attrs []
  [{:id (random-uuid)
    :forward-identity [(random-uuid) "$users" "id"]
    :unique? true
    :index? false
    :value-type :blob
    :cardinality :one
    :inferred-types #{:string}}
   {:id (random-uuid)
    :forward-identity [(random-uuid) "$users" "email"]
    :unique? true
    :index? false
    :value-type :blob
    :cardinality :one
    :inferred-types #{:string}}])

(defn gen-$magic-code-attrs []
  [{:id (random-uuid)
    :forward-identity [(random-uuid) "$magic-codes" "id"]
    :unique? true
    :index? false
    :value-type :blob
    :cardinality :one
    :inferred-types #{:string}}
   {:id (random-uuid)
    :forward-identity [(random-uuid) "$magic-codes" "code"]
    :unique? false
    :index? true
    :value-type :blob
    :cardinality :one
    :inferred-types #{:number}}
   {:id (random-uuid)
    :forward-identity [(random-uuid) "$magic-codes" "$user"]
    :reverse-identity [(random-uuid) "$users" "$magic-codes"]
    :unique? false
    :index? true
    :value-type :ref
    :cardinality :one
    :inferred-types #{:string}}])

(defn gen-$user-refresh-token-attrs []
  [{:id (random-uuid)
    :forward-identity [(random-uuid) "$user-refresh-tokens" "id"]
    :unique? true
    :index? false
    :value-type :blob
    :cardinality :one
    :inferred-types #{:string}}
   {:id (random-uuid)
    :forward-identity [(random-uuid) "$user-refresh-tokens" "hashed-token"]
    :unique? true
    :index? true
    :value-type :blob
    :cardinality :one
    :inferred-types #{:string}}
   {:id (random-uuid)
    :forward-identity [(random-uuid) "$user-refresh-tokens" "$user"]
    :reverse-identity [(random-uuid) "$users" "$user-refresh-tokens"]
    :unique? false
    :index? true
    :value-type :ref
    :cardinality :one
    :inferred-types #{:string}}])

(defn gen-$oauth-provider-attrs []
  [{:id (random-uuid)
    :forward-identity [(random-uuid) "$oauth-providers" "id"]
    :unique? true
    :index? false
    :value-type :blob
    :cardinality :one
    :inferred-types #{:string}}
   {:id (random-uuid)
    :forward-identity [(random-uuid) "$oauth-providers" "name"]
    :unique? true
    :index? true
    :value-type :blob
    :cardinality :one
    :inferred-types #{:string}}])

(defn gen-$user-oauth-link-attrs []
  [{:id (random-uuid)
    :forward-identity [(random-uuid) "$user-oauth-links" "id"]
    :unique? true
    :index? false
    :value-type :blob
    :cardinality :one
    :inferred-types #{:string}}
   {:id (random-uuid)
    ;; XXX: Are we sure sub is a string?
    :forward-identity [(random-uuid) "$user-oauth-links" "sub"]
    :unique? false
    :index? true
    :value-type :blob
    :cardinality :one
    :inferred-types #{:string}}
   {:id (random-uuid)
    :forward-identity [(random-uuid) "$user-oauth-links" "$user"]
    :reverse-identity [(random-uuid) "$users" "$user-oauth-links"]
    :unique? false
    :index? true
    :value-type :ref
    :cardinality :one
    :inferred-types #{:string}}
   {:id (random-uuid)
    :forward-identity [(random-uuid) "$user-oauth-links" "$oauth-provider"]
    :reverse-identity [(random-uuid) "$oauth-providers" "$user-oauth-links"]
    :unique? false
    :index? true
    :value-type :ref
    :cardinality :one
    :inferred-types #{:string}}
   {:id (random-uuid)
    ;; Trick to get a unique key on multiple attrs
    ;; We have to manually set it, but it would be nice if instant provided
    ;; some sort of computed column to do this automatically
    :forward-identity [(random-uuid) "$user-oauth-links" "sub+$oauth-provider"]
    :unique? true
    :index? true
    :value-type :blob
    :cardinality :one
    :inferred-types #{:string}}])

(defn gen-$oauth-client-attrs []
  [{:id (random-uuid)
    :forward-identity [(random-uuid) "$oauth-clients" "id"]
    :unique? true
    :index? false
    :value-type :blob
    :cardinality :one
    :inferred-types #{:string}}
   {:id (random-uuid)
    :forward-identity [(random-uuid) "$oauth-clients" "$oauth-provider"]
    :reverse-identity [(random-uuid) "$oauth-providers" "$oauth-clients"]
    :unique? false
    :index? false
    :value-type :ref
    :cardinality :one
    :inferred-types #{:string}}
   {:id (random-uuid)
    :forward-identity [(random-uuid) "$oauth-clients" "name"]
    :unique? true
    :index? true
    :value-type :blob
    :cardinality :one
    :inferred-types #{:string}}
   {:id (random-uuid)
    :forward-identity [(random-uuid) "$oauth-clients" "client-id"]
    :unique? false
    :index? true
    :value-type :blob
    :cardinality :one
    :inferred-types #{:string}}
   {:id (random-uuid)
    :forward-identity [(random-uuid) "$oauth-clients" "encrypted-client-secret"]
    :unique? false
    :index? false
    :value-type :blob
    :cardinality :one
    :inferred-types #{:string}}
   {:id (random-uuid)
    :forward-identity [(random-uuid) "$oauth-clients" "discovery-endpoint"]
    :unique? false
    :index? false
    :value-type :blob
    :cardinality :one
    :inferred-types #{:string}}
   {:id (random-uuid)
    :forward-identity [(random-uuid) "$oauth-clients" "meta"]
    :unique? false
    :index? false
    :value-type :blob
    :cardinality :one
    :inferred-types #{:json}}])

(defn gen-$oauth-code-attrs []
  [{:id (random-uuid)
    :forward-identity [(random-uuid) "$oauth-codes" "id"]
    :unique? true
    :index? false
    :value-type :blob
    :cardinality :one
    :inferred-types #{:string}}
   {:id (random-uuid)
    :forward-identity [(random-uuid) "$oauth-codes" "code-hash"]
    :unique? true
    :index? true
    :value-type :blob
    :cardinality :one
    :inferred-types #{:string}}
   {:id (random-uuid)
    :forward-identity [(random-uuid) "$oauth-codes" "$user"]
    :reverse-identity [(random-uuid) "$users" "$oauth-codes"]
    :unique? false
    :index? false
    :value-type :ref
    :cardinality :one
    :inferred-types #{:string}}
   {:id (random-uuid)
    :forward-identity [(random-uuid) "$oauth-codes" "code-challenge-method"]
    :unique? false
    :index? false
    :value-type :blob
    :cardinality :one
    :inferred-types #{:string}}
   {:id (random-uuid)
    :forward-identity [(random-uuid) "$oauth-codes" "code-challenge-hash"]
    :unique? false
    :index? false
    :value-type :blob
    :cardinality :one
    :inferred-types #{:string}}])

(defn gen-$oauth-redirects []
  [{:id (random-uuid)
    :forward-identity [(random-uuid) "$oauth-redirects" "id"]
    :unique? true
    :index? false
    :value-type :blob
    :cardinality :one
    :inferred-types #{:string}}
   {:id (random-uuid)
    :forward-identity [(random-uuid) "$oauth-redirects" "state-hash"]
    :unique? true
    :index? true
    :value-type :blob
    :cardinality :one
    :inferred-types #{:string}}
   {:id (random-uuid)
    :forward-identity [(random-uuid) "$oauth-redirects" "cookie-hash"]
    :unique? false
    :index? false
    :value-type :blob
    :cardinality :one
    :inferred-types #{:string}}
   {:id (random-uuid)
    :forward-identity [(random-uuid) "$oauth-redirects" "redirect-url"]
    :unique? false
    :index? false
    :value-type :blob
    :cardinality :one
    :inferred-types #{:string}}
   {:id (random-uuid)
    :forward-identity [(random-uuid) "$oauth-redirects" "$oauth-client"]
    :reverse-identity [(random-uuid) "$oauth-clients" "$oauth-redirects"]
    :unique? false
    :index? false
    :value-type :ref
    :cardinality :one
    :inferred-types #{:string}}
   {:id (random-uuid)
    :forward-identity [(random-uuid) "$oauth-redirects" "code-challenge-method"]
    :unique? false
    :index? false
    :value-type :blob
    :cardinality :one
    :inferred-types #{:string}}
   {:id (random-uuid)
    :forward-identity [(random-uuid) "$oauth-redirects" "code-challenge-hash"]
    :unique? false
    :index? false
    :value-type :blob
    :cardinality :one
    :inferred-types #{:string}}])

(defn gen-attrs [existing-attrs]
  (filter (fn [attr]
            (let [fwd-ident-name (->> attr
                                      :forward-identity
                                      (drop 1))]
              (not (attr-model/seek-by-fwd-ident-name fwd-ident-name existing-attrs))))
          (concat (gen-$users-attrs)
                  (gen-$magic-code-attrs)
                  (gen-$user-refresh-token-attrs)
                  (gen-$oauth-provider-attrs)
                  (gen-$user-oauth-link-attrs)
                  (gen-$oauth-client-attrs)
                  (gen-$oauth-code-attrs)
                  (gen-$oauth-redirects))))

(defn migrate-app [app-id]
  (let [existing-attrs (attr-model/get-by-app-id aurora/conn-pool app-id)
        new-attrs (gen-attrs existing-attrs)]
    (tracer/with-span! {:name "$users/migrate-app"
                        :attributes {:app-id app-id}}
      (next-jdbc/with-transaction [tx-conn aurora/conn-pool]
        ;; XXX: Probably need a lock so that we're not inserting users from elsewhere
        (tracer/with-span! {:name "$users/create-attrs"}
          (let [ids (attr-model/insert-multi! tx-conn
                                              app-id
                                              new-attrs
                                              {:allow-reserved-names? true})]
            (tracer/add-data! {:attributes {:created-attr-count (count ids)}})))
        (let [attrs (attr-model/get-by-app-id tx-conn app-id)]
          (doseq [etype ["$users"
                         "$magic-codes"
                         "$user-refresh-tokens"
                         "$oauth-providers"
                         "$user-oauth-links"
                         "$oauth-clients"
                         "$oauth-redirects"
                         "$oauth-codes"]
                  :let [query (hsql/format (triples-insert-query app-id
                                                                 etype
                                                                 attrs))]]
            (tracer/with-span! {:name "$users/insert-triples"
                                :attributes {:etype etype}}
              (let [res (sql/do-execute! tx-conn query)]
                (tracer/add-data!
                 {:attributes {:update-count
                               (:next.jdbc/update-count (first res))}})))))
        (app-model/set-users-in-triples! tx-conn {:app-id app-id
                                                  :users-in-triples true})
        (transaction-model/create! tx-conn {:app-id app-id})))))

(defn undo-migrate [app-id]
  (let [attrs (attr-model/get-by-app-id aurora/conn-pool app-id)
        to-delete (filter (fn [attr]
                            (or (some-> (attr-model/fwd-etype attr)
                                        (string/starts-with? "$"))
                                (some-> (attr-model/rev-etype attr)
                                        (string/starts-with? "$"))))
                          attrs)]
    (when (seq to-delete)
      (next-jdbc/with-transaction [tx-conn aurora/conn-pool]
        (attr-model/delete-multi! aurora/conn-pool app-id (map :id to-delete))
        (app-model/set-users-in-triples! tx-conn {:app-id app-id
                                                  :users-in-triples false})
        (transaction-model/create! tx-conn {:app-id app-id})))))

;; XXX: Need default permissions
;;      I think we can just add view, update, etc. false for all of them for now
;;      and hide them from the dashboard

;; Open questions:

;; XXX: I probably need something that will delete stuff in the background
;;      Maybe we should add ttl for objects?

;; [ ] Need to generate the $users tables when you create an app
;; [ ] Should delete the data in the other tables eventually
;;      - We could wait for a while and drop the tables later
