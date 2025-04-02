(ns instant.system-catalog-ops
  (:require
   [clojure.string :as string]
   [instant.db.datalog :as d]
   [instant.db.instaql :as i]
   [instant.db.model.attr :as attr-model]
   [instant.db.model.attr-pat :as attr-pat]
   [instant.db.model.entity :as entity-model]
   [instant.db.transaction :as tx]
   [instant.util.crypt :as crypt-util]
   [instant.util.instaql :refer [instaql-nodes->object-tree]]
   [instant.util.uuid :as uuid-util]
   [next.jdbc :as next-jdbc])
  (:import
   (java.util Date UUID)))

;; TODO: Write migration that removes the users_in_triples column

(defn lock-hash [^UUID app-id]
  (.getMostSignificantBits app-id))

(defn triples->db-format [app-id attrs etype triples]
  (reduce (fn [acc [_e a v t]]
            (let [attr (attr-model/seek-by-id a attrs)]
              (if-not (= etype (attr-model/fwd-etype attr))
                acc
                (let [k (-> attr
                            (attr-model/fwd-label)
                            keyword)

                      v (cond
                          (string/starts-with? (name k) "$")
                          (uuid-util/coerce v)

                          (= k :id) (uuid-util/coerce v)

                          (= k :encryptedClientSecret)
                          (when v
                            (crypt-util/hex-string->bytes v))
                          :else v)

                      ;; Translate keywords
                      k (case k
                          :$user :user_id
                          :$oauthProvider :provider_id
                          :$oauthClient :client_id
                          :clientId :client_id
                          :encryptedClientSecret :client_secret
                          :discoveryEndpoint :discovery_endpoint
                          :codeChallengeMethod :code_challenge_method
                          :codeChallenge :code_challenge
                          :stateHash :state_hash
                          :cooke-hash :cookie_hash
                          :redirectUrl :redirect_url
                          :name (case etype
                                  "$oauthProviders" :provider_name
                                  "$oauthClients" :client_name
                                  k)
                          k)]
                  (cond-> acc
                    true (assoc k v)
                    (= k :id) (assoc :created_at (Date. (long t))))))))
          {:app_id app-id}
          triples))

(defn delete-entity!
  "Deletes and returns the deleted entity (if it was deleted)."
  [tx-conn attrs app-id etype lookup opts]
  (some->> (tx/transact-without-tx-conn! tx-conn
                                         attrs
                                         app-id
                                         [[:delete-entity lookup etype]]
                                         opts)
           :results
           :delete-entity
           seq
           (map (juxt :entity_id
                      :attr_id
                      :value
                      :created_at))
           (triples->db-format app-id attrs etype)))

(defn delete-entities!
  "Deletes and returns entities that were deleted."
  [tx-conn attrs app-id etype lookups opts]
  (some->> (tx/transact-without-tx-conn! tx-conn
                                         attrs
                                         app-id
                                         (mapv (fn [lookup]
                                                 [:delete-entity lookup etype])
                                               lookups)
                                         opts)
           :results
           :delete-entity
           seq
           (map (juxt :entity_id
                      :attr_id
                      :value
                      :created_at))
           (group-by first)
           vals
           (map #(triples->db-format app-id attrs etype %))))

(defn collect-iql-result
  ([iql-res]
   (collect-iql-result {:symbol-values {}
                        :triples []}
                       iql-res))
  ([acc iql-res]
   (reduce (fn [acc {:keys [data child-nodes]}]
             (let [{:keys [join-rows symbol-values]} (:datalog-result data)]
               (-> acc
                   (update :triples into (mapcat identity join-rows))
                   (update :symbol-values
                           (partial merge-with (fnil into #{}))
                           symbol-values)
                   (collect-iql-result child-nodes))))
           acc
           iql-res)))

(defn get-entity [conn app-id attrs etype eid]
  (let [triples (entity-model/get-triples {:app-id app-id
                                           :attrs attrs
                                           :datalog-query-fn d/query
                                           :db {:conn-pool conn}}
                                          etype
                                          eid)]
    (when (seq triples)
      (triples->db-format app-id attrs etype triples))))

(defn get-entities [conn app-id attrs etype eids]
  (let [triples (entity-model/get-triples {:app-id app-id
                                           :attrs attrs
                                           :datalog-query-fn d/query
                                           :db {:conn-pool conn}}
                                          etype
                                          eids)

        groups (group-by first triples)]
    (->> eids
         (map (fn [eid]
                (let [triples (get groups eid)]
                  [eid (when (seq triples)
                         (triples->db-format app-id attrs etype triples))])))

         (into {}))))

(defn get-entity-where [conn app-id attrs etype where]
  (let [iql-res (i/query {:app-id app-id
                          :attrs attrs
                          :datalog-query-fn d/query
                          :db {:conn-pool conn}}
                         {etype {:$ {:where where}}})
        {:keys [symbol-values triples]} (collect-iql-result iql-res)
        eid (-> symbol-values
                (get (attr-pat/default-level-sym etype 0))
                first)
        triples (filter (fn [[e]]
                          (= e eid))
                        triples)]
    (when (seq triples)
      (triples->db-format app-id attrs etype triples))))

(defn get-entities-where [conn app-id attrs etype where]
  (let [iql-res (i/query {:app-id app-id
                          :attrs attrs
                          :datalog-query-fn d/query
                          :db {:conn-pool conn}}
                         {etype {:$ {:where where}}})
        {:keys [symbol-values triples]} (collect-iql-result iql-res)
        eids (-> symbol-values
                 (get (attr-pat/default-level-sym etype 0)))
        triple-groups (group-by first triples)]
    (keep (fn [eid]
            (when-let [triples (seq (get triple-groups eid))]
              (triples->db-format app-id attrs etype triples)))
          eids)))

(defn admin-query [conn app-id attrs q]
  (let [ctx {:app-id app-id
             :attrs attrs
             :datalog-query-fn d/query
             :db {:conn-pool conn}
             :inference? true
             :include-server-created-at? true}
        nodes (i/query ctx q)]
    (instaql-nodes->object-tree ctx
                                nodes)))

(defn update-op [conn-pool {:keys [app-id
                                   etype]}
                 op]
  (next-jdbc/with-transaction [tx-conn conn-pool]
    (let [attrs (attr-model/get-by-app-id tx-conn app-id)]
      (op
       {:resolve-id
        (fn [label] (attr-model/resolve-attr-id attrs etype label))

        :transact!
        (fn
          ([tx-steps]
           (tx/transact-without-tx-conn! tx-conn attrs app-id tx-steps {}))
          ([tx-steps opts]
           (tx/transact-without-tx-conn! tx-conn attrs app-id tx-steps opts)))

        :delete-entity!
        (fn
          ([lookup]
           (delete-entity! tx-conn attrs app-id etype lookup {}))
          ([lookup opts]
           (delete-entity! tx-conn attrs app-id etype lookup opts)))

        :delete-entities!
        (fn
          ([lookups]
           (delete-entities! tx-conn attrs app-id etype lookups {}))
          ([lookups opts]
           (delete-entities! tx-conn attrs app-id etype lookups opts)))

        :get-entity
        (fn [eid] (get-entity tx-conn app-id attrs etype eid))

        :get-entities
        (fn [eids] (get-entities tx-conn app-id attrs etype eids))

        :get-entity-where
        (fn [where] (get-entity-where tx-conn app-id attrs etype where))

        :get-entities-where
        (fn [where]
          (get-entities-where tx-conn app-id attrs etype where))}))))

(defn query-op [conn-pool
                {:keys [app-id
                        etype]}
                op]
  (let [attrs (attr-model/get-by-app-id conn-pool app-id)]
    (op {:resolve-id
         (fn [label] (attr-model/resolve-attr-id attrs etype label))

         :get-entity
         (fn [eid] (get-entity conn-pool app-id attrs etype eid))

         :get-entities
         (fn [eids] (get-entities conn-pool app-id attrs etype eids))

         :get-entity-where
         (fn [where] (get-entity-where conn-pool app-id attrs etype where))

         :get-entities-where
         (fn [where]
           (get-entities-where conn-pool app-id attrs etype where))

         :admin-query
         (fn [q] (admin-query conn-pool app-id attrs q))})))
