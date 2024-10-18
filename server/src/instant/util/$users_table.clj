(ns instant.util.$users-table
  (:require
   [clojure.string :as string]
   [honey.sql :as hsql]
   [instant.db.model.attr :as attr-model]
   [instant.db.model.transaction :as transaction-model]
   [instant.flags-impl
    :refer [mark-end-migrating-app-users mark-start-migrating-app-users]]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.model.app :as app-model]
   [instant.system-catalog :refer [system-catalog-app-id]]
   [instant.system-catalog-ops :refer [lock-hash]]
   [instant.util.tracer :as tracer]
   [next.jdbc :as next-jdbc]))

;; XXX: camelCase
(def attr-mappings
  {"$users" {:table :app_users
             :app-id-join nil
             :fields {"id" {:col :id}
                      "email" {:col :email}}}
   "$magicCodes" {:table :app_user_magic_codes
                   :app-id-join {:table :app_users
                                 :col :user_id}
                   :fields {"id" {:col :id}
                            "codeHash" {:col :code
                                         :transform [:encode
                                                     [:digest :code
                                                      [:inline "sha256"]]
                                                     [:inline "hex"]]}
                            "$user" {:col :user_id}}}
   "$userRefreshTokens" {:table :app_user_refresh_tokens
                           :app-id-join {:table :app_users
                                         :col :user_id}
                           :needs-id? true
                           :fields {"id" {:col :entity-id}
                                    "hashedToken"
                                    {:col :token
                                     :transform [:encode
                                                 [:digest [:uuid_send :id]
                                                  [:inline "sha256"]]
                                                 [:inline "hex"]]}}}
   "$oauthProviders" {:table :app_oauth_service_providers
                       :app-id-join nil
                       :fields {"id" {:col :id}
                                "name" {:col :provider_name}}}
   "$oauthUserLinks" {:table :app_user_oauth_links
                      :app-id-join nil
                      :fields
                      {"id" {:col :id}
                       "sub" {:col :sub}
                       "$user" {:col :user_id}
                       "$oauthProvider" {:col :provider_id}
                       "sub+$oauthProvider" {:col :sub
                                             :transform [:||
                                                         :sub
                                                         [:inline "+"]
                                                         :provider_id]}}}
   "$oauthClients" {:table :app_oauth_clients
                     :app-id-join nil
                     :fields
                     {"id" {:col :id}
                      "$oauthProvider" {:col :provider_id}
                      "name" {:col :client_name}
                      "clientId" {:col :client_id}
                      "encryptedClientSecret" {:col :client_secret
                                                 :transform [:encode
                                                             :client_secret
                                                             [:inline "hex"]]}
                      "discoveryEndpoint" {:col :discovery_endpoint}
                      "meta" {:col :meta}}}
   "$oauthCodes" {:table :app_oauth_codes
                   :app-id-join nil
                   :needs-id? true
                   :fields {"id" {:col :entity-id}
                            "codeHash" {:col :lookup_key
                                         :transform [:encode
                                                     :lookup_key
                                                     [:inline "hex"]]}
                            "$user" {:col :user_id}
                            "codeChallengeMethod" {:col :code_challenge_method}
                            "codeChallengeHash" {:col :code_challenge
                                                   :transform [:encode
                                                               [:digest :code_challenge
                                                                [:inline "sha256"]]
                                                               [:inline "hex"]]}}}
   "$oauthRedirects" {:table :app_oauth_redirects
                       :app-id-join {:table :app_oauth_clients
                                     :col :client_id}
                       :needs-id? true
                       :fields {"id" {:col :entity-id}
                                "stateHash" {:col :lookup_key
                                              :transform [:encode
                                                          :lookup_key
                                                          [:inline "hex"]]}
                                "cookieHash" {:col :cookie
                                               :transform [:encode
                                                           [:digest [:uuid_send :cookie]
                                                            [:inline "sha256"]]
                                                           [:inline "hex"]]}
                                "redirectUrl" {:col :redirect_url}
                                "$oauthClient" {:col :client_id}
                                "codeChallengeMethod" {:col :code_challenge_method}
                                "codeChallengeHash" {:col :code_challenge
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

(defn migrate-app [app-id]
  (try
    (mark-start-migrating-app-users app-id)
    (let [system-attrs (attr-model/get-by-app-id system-catalog-app-id)]
      (attr-model/with-cache-invalidation app-id
        (tracer/with-span! {:name "$users/migrate-app" :attributes {:app-id app-id}}
          (next-jdbc/with-transaction [tx-conn aurora/conn-pool]
            (sql/select tx-conn (hsql/format {:select [[[:pg_advisory_xact_lock (lock-hash app-id)]]]}))
            (app-model/set-users-in-triples! tx-conn {:app-id app-id
                                                      :users-in-triples true})
            (doseq [etype ["$users"
                           "$magicCodes"
                           "$userRefreshTokens"
                           "$oauthProviders"
                           "$oauthUserLinks"
                           "$oauthClients"
                           "$oauthRedirects"
                           "$oauthCodes"]
                    :let [query (hsql/format (triples-insert-query app-id
                                                                   etype
                                                                   system-attrs))]]
              (tracer/with-span! {:name "$users/insert-triples"
                                  :attributes {:etype etype}}
                (let [res (sql/do-execute! tx-conn query)]
                  (tracer/add-data!
                   {:attributes {:update-count
                                 (:next.jdbc/update-count (first res))}}))))

            ;; XXX: TODO: put the shims somewhere in case this causes problems
            (tracer/with-span! {:name "$users/delete-$users-shims"}
              (let [shim-ids
                    (keep (fn [attr]
                            (when (and (= :user (:catalog attr))
                                       (string/starts-with?
                                        (attr-model/fwd-etype attr)
                                        "$"))
                              (:id attr)))
                          (attr-model/get-by-app-id tx-conn app-id))]
                (when (seq shim-ids)
                  (let [res (attr-model/delete-multi! tx-conn app-id shim-ids)]
                    (tracer/add-data!
                     {:attributes {:delete-count
                                   (:next.jdbc/update-count (first res))}})))))

            (transaction-model/create! tx-conn {:app-id app-id})))))
    (finally
      (mark-end-migrating-app-users app-id))))

(defn undo-migrate
  "Don't use in production, because it deletes everything."
  [app-id]
  (attr-model/with-cache-invalidation app-id
    (let [system-attr-ids (map :id (attr-model/get-by-app-id system-catalog-app-id))]
      (next-jdbc/with-transaction [tx-conn aurora/conn-pool]
        (app-model/set-users-in-triples! tx-conn {:app-id app-id
                                                  :users-in-triples false})
        (sql/execute! tx-conn (hsql/format {:delete-from :triples
                                            :where [:and
                                                    [:= :app-id app-id]
                                                    [:in :attr-id system-attr-ids]]}))
        (transaction-model/create! tx-conn {:app-id app-id})))))

;; XXX: Need default permissions
;;      I think we can just add view, update, etc. false for all of them for now
;;      and hide them from the dashboard

;; Open questions:

;; XXX: We probably need something that will delete stuff in the background
;;      Maybe we should add ttl for objects?
