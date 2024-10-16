(ns instant.util.$users-ops
  (:require
   [clojure.string :as string]
   [instant.db.datalog :as d]
   [instant.db.instaql :as i]
   [instant.db.model.attr :as attr-model]
   [instant.db.model.attr-pat :as attr-pat]
   [instant.db.model.entity :as entity-model]
   [instant.db.model.transaction :as transaction-model]
   [instant.db.transaction :as tx]
   [instant.jdbc.sql :as sql]
   [instant.util.crypt :as crypt-util]
   [instant.util.exception :as ex]
   [instant.util.instaql :refer [instaql-nodes->object-tree]]
   [instant.util.uuid :as uuid-util]
   [next.jdbc :as next-jdbc])
  (:import
   (java.util Date)))

;; We write out own get-app function so that we don't get
;; a cyclic dependency with the instant.model.app ns
(defn get-app! [conn id]
  (ex/assert-record!
   (sql/select-one conn ["select * from apps where id = ?::uuid" id])
   :app {:args [{:id id}]}))

(defn triples->db-format [app-id attrs etype triples]
  (reduce (fn [acc [_e a v t]]
            (let [k (-> a
                        (attr-model/seek-by-id attrs)
                        (attr-model/fwd-label)
                        keyword)

                  v (cond
                      (string/starts-with? (name k) "$")
                      (uuid-util/coerce v)

                      (= k :id) (uuid-util/coerce v)

                      (= k :encrypted-client-secret)
                      (when v
                        (crypt-util/hex-string->bytes v))
                      :else v)

                  ;; Translate keywords
                  k (case k
                      :$user :user_id
                      :$oauth-provider :provider_id
                      :$oauth-client :client_id
                      :client-id :client_id
                      :encrypted-client-secret :client_secret
                      :discovery-endpoint :discovery_endpoint
                      :code-challenge-method :code_challenge_method
                      :code-challenge-hash :code_challenge_hash
                      :state-hash :state_hash
                      :cooke-hash :cookie_hash
                      :redirect-url :redirect_url
                      :name (case etype
                              "$oauth-providers" :provider_name
                              "$oauth-clients" :client_name
                              k)
                      k)]
              (cond-> acc
                true (assoc k v)
                (= k :id) (assoc :created_at (Date. t)))))
          {:app_id app-id}
          triples))

(defn delete-entity!
  "Deletes and returns the deleted entity (if it was deleted)."
  [tx-conn attrs app-id etype lookup]
  (some->> (tx/transact-without-tx-conn! tx-conn
                                         attrs
                                         app-id
                                         [[:delete-entity lookup etype]])
           :results
           :delete-entity
           seq
           (map (juxt :triples/entity_id
                      :triples/attr_id
                      :triples/value
                      :triples/created_at))
           (triples->db-format app-id attrs etype)))

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

(defn resolve-attr-id [attrs etype label]
  {:post [(uuid? %)]}
  (let [n [(name etype) (name label)]]
    (:id (or (attr-model/seek-by-fwd-ident-name n attrs)
             (attr-model/seek-by-rev-ident-name n attrs)))))

(defn get-entity [conn app-id attrs etype eid]
  (let [triples (entity-model/get-triples {:app-id app-id
                                           :attrs attrs
                                           :datalog-query-fn d/query
                                           :db {:conn-pool conn}}
                                          etype
                                          eid)]
    (when (seq triples)
      (triples->db-format app-id attrs etype triples))))

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

(defn $user-update [conn-pool {:keys [app-id
                                      etype
                                      legacy-op
                                      $users-op]}]
  (next-jdbc/with-transaction [tx-conn conn-pool]
    ;; XXX: add a lock to prevent losing changes if we migrate
    (let [app (get-app! tx-conn app-id)]
      (if-not (:users_in_triples app)
        (legacy-op tx-conn)
        (let [attrs (attr-model/get-by-app-id tx-conn app-id)]
          ($users-op
           {:resolve-id
            (fn [label] (resolve-attr-id attrs etype label))

            :transact!
            (fn [tx-steps]
              (tx/transact-without-tx-conn! tx-conn attrs app-id tx-steps))

            :delete-entity!
            (fn [lookup]
              (delete-entity! tx-conn attrs app-id etype lookup))

            :get-entity
            (fn [eid] (get-entity tx-conn app-id attrs etype eid))

            :get-entity-where
            (fn [where] (get-entity-where tx-conn app-id attrs etype where))

            :get-entities-where
            (fn [where]
              (get-entities-where tx-conn app-id attrs etype where))

            :triples->db-format
            (fn [triples]
              (triples->db-format app-id attrs etype triples))}))))))

(defn $user-query [conn-pool {:keys [app-id
                                     etype
                                     legacy-op
                                     $users-op]}]
  ;; XXX: add a lock to prevent losing changes if we migrate
  (let [app (get-app! conn-pool app-id)]
    (if-not (:users_in_triples app)
      (legacy-op)
      (let [attrs (attr-model/get-by-app-id conn-pool app-id)]
        ($users-op {:resolve-id
                    (fn [label] (resolve-attr-id attrs etype label))

                    :get-entity
                    (fn [eid] (get-entity conn-pool app-id attrs etype eid))

                    :get-entity-where
                    (fn [where] (get-entity-where conn-pool app-id attrs etype where))

                    :get-entities-where
                    (fn [where]
                      (get-entities-where conn-pool app-id attrs etype where))

                    :admin-query
                    (fn [q] (admin-query conn-pool app-id attrs q))})))))
