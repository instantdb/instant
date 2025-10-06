(ns instant.model.app
  (:require
   [clojure.set :refer [rename-keys]]
   [honey.sql :as hsql]
   [instant.db.model.attr :as attr-model]
   [instant.db.model.transaction :as transaction-model]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.model.instant-user :as instant-user-model]
   [instant.model.rule :as rule-model]
   [instant.system-catalog-ops :refer [query-op]]
   [instant.util.cache :as cache]
   [instant.util.crypt :as crypt-util]
   [instant.util.exception :as ex]
   [instant.util.hsql :as uhsql]
   [instant.util.uuid :as uuid-util]
   [next.jdbc :as next-jdbc])
  (:import
   (java.util UUID)))

(def app-cache
  (cache/make {:max-size 512}))

(defn evict-app-id-from-cache [app-id]
  (cache/invalidate app-cache app-id))

(defmacro with-cache-invalidation [app-id-or-ids & body]
  `(let [input# ~app-id-or-ids
         ids# (if (coll? input#)
                input#
                [input#])]
     (cache/invalidate-all app-cache ids#)
     (let [res# ~@body]
       (cache/invalidate-all app-cache ids#)
       res#)))

(defn create!
  ([params] (create! (aurora/conn-pool :write) params))
  ([conn {:keys [id title creator-id org-id admin-token]}]
   (let [query {:with [[:app_insert
                        {:insert-into :apps
                         :values [{:id id
                                   :title title
                                   :creator-id creator-id
                                   :org-id org-id}]
                         :returning :*}]
                       [:token_insert
                        {:insert-into :app_admin_tokens
                         :values [{:app-id id
                                   :token admin-token}]
                         :returning :*}]]
                :select [:app_insert.* [:token_insert.token :admin-token]]
                :from :app_insert
                :join [:token_insert [:= :token_insert.app_id :app_insert.id]]}
         app-with-token (sql/execute-one! ::create! conn (hsql/format query))]
     (rename-keys app-with-token {:admin_token :admin-token}))))

(defn get-by-id*
  ([id]
   (get-by-id* (aurora/conn-pool :read) id))
  ([conn id]
   (sql/select-one ::get-by-id*
                   conn
                   ["SELECT * FROM apps WHERE apps.id = ?::uuid AND apps.deletion_marked_at IS NULL" id])))

(defn get-by-id
  ([{:keys [id]}]
   (cache/get app-cache id get-by-id*))
  ([conn {:keys [id] :as params}]
   (if (= conn (aurora/conn-pool :read))
     (get-by-id params)
     ;; Don't cache if we're using a custom connection
     (get-by-id* conn id))))

(defn get-by-id!
  ([params]
   (get-by-id! (aurora/conn-pool :read) params))
  ([conn params]
   (ex/assert-record! (get-by-id conn params) :app {:args [params]})))

(defn get-by-admin-token
  ([params]
   (get-by-admin-token (aurora/conn-pool :read) params))
  ([conn {:keys [token]}]
   (sql/select-one ::get-by-admin-token
                   conn
                   (hsql/format {:select :*
                                 :from :apps
                                 :where [:= :id {:select :app_id
                                                 :from :app_admin_tokens
                                                 :where [:= :token token]}]}))))

(defn list-by-creator-id
  ([user-id] (list-by-creator-id (aurora/conn-pool :read) user-id))
  ([conn user-id]
   (sql/select ::list-by-creator-id
               conn
               ["SELECT a.*
                 FROM apps a
                 WHERE a.creator_id = ?::uuid AND a.deletion_marked_at IS NULL"
                user-id])))

(comment
  (def user-id "6412d553-2749-4f52-898a-0b3ec42ffd28")
  (list-by-creator-id user-id))

(defn get-by-id-and-creator
  ([params] (get-by-id-and-creator (aurora/conn-pool :read) params))
  ([conn {:keys [user-id app-id]}]
   (sql/select-one ::get-by-id-and-creator
                   conn
                   ["SELECT a.*
                      FROM apps a
                      WHERE
                      a.id = ?::uuid AND
                      a.creator_id = ?::uuid AND 
                      a.deletion_marked_at IS NULL"
                    app-id user-id])))

(defn get-by-id-and-creator! [params]
  (ex/assert-record! (get-by-id-and-creator params) :app {:args [params]}))

(comment
  (def user-id "6412d553-2749-4f52-898a-0b3ec42ffd28")
  (def app-id "68b75bac-3ff7-4efe-9596-97ac0d03ab65")
  (get-by-id-and-creator {:user-id user-id :app-id app-id}))

(defn get-app-ids-created-before
  ([params] (get-app-ids-created-before (aurora/conn-pool :read) params))
  ([conn {:keys [creator-id created-before]}]
   (map :id (sql/select
             ::get-app-ids-created-before
             conn
             ["SELECT
                a.id
                FROM apps a
                WHERE
                  a.creator_id = ?::uuid AND
                  a.created_at < ? AND 
                  a.deletion_marked_at IS NULL"
              creator-id created-before]))))

(defn get-with-creator-by-ids
  ([params] (get-with-creator-by-ids (aurora/conn-pool :read) params))
  ([conn app-ids]
   (sql/select ::get-with-creator-by-ids
               conn ["SELECT a.*, u.email AS creator_email
                      FROM apps a
                      JOIN instant_users u ON a.creator_id = u.id
                      WHERE a.id in (select unnest(?::uuid[])) AND 
                            a.deletion_marked_at IS NULL"
                     (-> app-ids
                         vec
                         (with-meta {:pgtype "uuid[]"})
                         into-array)])))

(comment
  (get-with-creator-by-ids ["41c12a82-f769-42e8-aad8-53bf33bbaba9"
                            "59aafa92-a900-4b3d-aaf1-45032ee8d415"]))

(defn make-apps-q [app-ids-select]
  (uhsql/preformat
   {:with [[:app-ids app-ids-select]
           [:members {:select [:m.app-id
                               [[:json_agg
                                 [:json_build_object
                                  [:inline "id"] :m.id
                                  [:inline "email"] :u.email
                                  [:inline "role"] :m.member-role]]
                                :members]]
                      :from [[:app-members :m]]
                      :join [[:instant-users :u] [:= :u.id :m.user-id]]
                      :group-by :m.app-id}]
           [:member-invites {:select [:i.app-id
                                      [[:json_agg
                                        [:json_build_object
                                         [:inline "id"] :i.id
                                         [:inline "email"] :i.invitee_email
                                         [:inline "role"] :i.invitee_role
                                         [:inline "status"] :i.status
                                         [:inline "sent_at"] :i.sent_at
                                         [:inline "expired"] [:< :i.sent_at [:- :%now [:interval "3 days"]]]]]
                                       :invites]]
                             :from [[:app-member-invites :i]]
                             :group-by :i.app-id}]]
    :select [:a.*
             [:at.token :admin_token]
             [:r.code :rules]
             [[:case [:= nil :org.id] nil
               :else [:json_build_object
                      [:inline "id"] :org.id
                      [:inline "title"] :org.title]]
              :org]
             [[:coalesce [:= :2 :sub.subscription_type_id] :false] :pro]
             [[:case [:= :a.creator-id :?user-id] [:inline "owner"]
               :else {:select :m.member_role
                      :from [[:app-members :m]]
                      :where [:and
                              [:= :m.app-id :a.id]
                              [:= :m.user_id :?user-id]]}] :user_app_role]
             [[:coalesce :m.members [:cast [:inline "[]"] :json]] :members]
             [[:coalesce :i.invites [:cast [:inline "[]"] :json]] :invites]
             [[:case [:= nil :template.id] nil
               :else [:json_build_object
                      [:inline "id"] :template.id
                      [:inline "subject"] :template.subject
                      [:inline "body"] :template.body
                      [:inline "name"] :template.name
                      [:inline "email"] :sender.email]] :magic_code_email_template]]
    :from :app-ids
    :join [[:apps :a] [:= :a.id :app-ids.id]
           [:app_admin_tokens :at] [:= :at.app-id :a.id]]
    :left-join [[:rules :r] [:= :r.app_id :a.id]
                [:orgs :org] [:= :org.id :a.org-id]
                [:instant_subscriptions :sub] [:= :sub.id :a.subscription_id]
                [:members :m] [:= :m.app_id :a.id]
                [:member-invites :i] [:= :i.app_id :a.id]
                [:app-email-templates :template] [:and
                                                  [:= :template.app_id :a.id]
                                                  [:= :template.email-type [:inline "magic-code"]]]
                [:app-email-senders :sender] [:= :template.sender_id :sender.id]]}))

(def all-for-user-q
  (make-apps-q {:union [{:select :a.id
                         :from [[:apps :a]]
                         :where [:and
                                 [:= nil :a.deletion-marked-at]
                                 [:= nil :a.org_id]
                                 [:= :a.creator-id :?user-id]]}
                        {:select :a.id
                         :from [[:apps :a]]
                         :join [[:app_members :m] [:and
                                                   [:= :m.user_id :?user-id]
                                                   [:= :m.app_id :a.id]]
                                [:instant_subscriptions :sub] [:= :sub.id :a.subscription_id]]
                         :where [:and
                                 [:= nil :a.deletion-marked-at]
                                 [:= nil :a.org_id]
                                 [:= :2 :sub.subscription_type_id]]}]}))

(defn get-all-for-user
  ([params] (get-all-for-user (aurora/conn-pool :read) params))
  ([conn {:keys [user-id]}]
   (let [params {:user-id user-id}
         query (uhsql/formatp all-for-user-q params)]
     (sql/select ::get-all-for-user conn query))))

(defn get-dash-auth-data
  ([params] (get-dash-auth-data (aurora/conn-pool :read) params))
  ([conn {:keys [app-id]}]
   (query-op
    conn
    {:app-id app-id}
    (fn [{:keys [admin-query]}]
      (let [redirect-origins
            (-> (sql/select-one
                 ::get-dash-auth-data
                 conn
                 ["SELECT json_build_object(
                      'authorized_redirect_origins', (
                        SELECT json_agg(json_build_object(
                          'id', ro.id,
                          'service', ro.service,
                          'params', ro.params,
                          'created_at', ro.created_at
                        ))
                        FROM (SELECT * from app_authorized_redirect_origins ro
                               WHERE ro.app_id = a.id
                               ORDER BY ro.created_at desc)
                        AS ro
                      )
                    ) AS data
                    FROM apps a
                    WHERE a.id = ?::uuid AND a.deletion_marked_at IS NULL"
                  app-id])
                (get-in [:data "authorized_redirect_origins"]))

            {:strs [$oauthProviders
                    $oauthClients]}
            (admin-query {:$oauthProviders {}
                          :$oauthClients {}})

            providers (map (fn [provider]
                             {"id" (get provider "id")
                              "provider_name" (get provider "name")
                              "created_at" (get provider "$serverCreatedAt")})
                           $oauthProviders)

            clients (map (fn [client]
                           {"id" (get client "id")
                            "client_name" (get client "name")
                            "client_id" (get client "clientId")
                            "provider_id" (get client "$oauthProvider")
                            "meta" (get client "meta")
                            "discovery_endpoint" (get client "discovery_endpoint")
                            "created_at" (get client "$serverCreatedAt")})
                         $oauthClients)]
        {:data {"oauth_service_providers" providers
                "oauth_clients" clients
                "authorized_redirect_origins" redirect-origins}})))))

(defn mark-for-deletion!
  ([params] (mark-for-deletion! (aurora/conn-pool :write) params))
  ([conn {:keys [id]}]
   (with-cache-invalidation id
     (sql/execute-one! ::delete-by-id!
                       conn ["UPDATE apps SET deletion_marked_at = NOW() WHERE id = ?::uuid" id]))))

(defn get-apps-to-hard-delete
  ([params] (get-apps-to-hard-delete (aurora/conn-pool :read) params))
  ([conn {:keys [maximum-deletion-marked-at]}]
   (sql/select ::get-apps-to-delete
               conn
               ["SELECT a.* 
                 FROM apps a WHERE a.deletion_marked_at IS NOT NULL AND a.deletion_marked_at <= ?"
                maximum-deletion-marked-at])))

(defn delete-immediately-by-id!
  ([params] (delete-immediately-by-id! (aurora/conn-pool :write) params))
  ([conn {:keys [id]}]
   (with-cache-invalidation id
     (sql/execute-one! ::delete-by-id!
                       conn ["DELETE FROM apps WHERE id = ?::uuid" id]))))

(defn rename-by-id!
  ([params] (rename-by-id! (aurora/conn-pool :write) params))
  ([conn {:keys [id title]}]
   (with-cache-invalidation id
     (sql/execute-one! ::rename-by-id!
                       conn ["UPDATE apps SET title = ? WHERE id = ?::uuid " title id]))))

(defn change-creator!
  ([params] (change-creator! (aurora/conn-pool :write) params))
  ([conn {:keys [id new-creator-id]}]
   (instant-user-model/with-cache-invalidation id
     (with-cache-invalidation id
       (sql/execute-one! ::change-creator!
                         conn ["UPDATE apps a
                                 SET creator_id = ?::uuid
                                 WHERE a.id = ?::uuid"
                               new-creator-id id])))))

(defn clear-by-id!
  "Deletes attrs, rules, and triples for the specified app_id"
  ([params] (clear-by-id! (aurora/conn-pool :write) params))
  ([conn {:keys [id]}]
   (next-jdbc/with-transaction [tx-conn conn]
     (attr-model/hard-delete-by-app-id! tx-conn id)
     (rule-model/delete-by-app-id! tx-conn {:app-id id})
     (transaction-model/create! tx-conn {:app-id id}))))

(comment
  (clear-by-id! {:id "9a6d8f38-991d-4264-9801-4a05d8b1eab1"}))

(defn delete-by-ids!
  ([params] (delete-by-ids! (aurora/conn-pool :write) params))
  ([conn {:keys [creator-id ids]}]
   (with-cache-invalidation ids
     (sql/execute-one! ::delete-by-ids!
                       conn
                       (hsql/format
                        {:delete-from [:apps]
                         :where [:and [:= :creator-id [:cast creator-id :uuid]]
                                 [:in :id (mapv (fn [x] [:cast x :uuid]) ids)]]})))))

(comment
  (def u (instant-user-model/get-by-email {:email "stopa@instantdb.com"}))
  (def a (create! {:title "TestingRepl!" :id (UUID/randomUUID) :creator-id (:id u)}))
  (get-all-for-user {:user-id (:id u)})
  (get-dash-auth-data {:app-id "3cc5c5c8-07df-42b2-afdc-6a04cbf0c40a"})
  (delete-immediately-by-id! (select-keys a [:id])))

(defn app-usage
  "Estimates amount of bytes used for an app's triples.

  Usage is comprised of both raw data and overhead data (indexes, toast tables, etc.).

  sum(pg_triples_size) calculates the total data size for the specified app_id.
  pg_total_relation_size('triples') / pg_relation_size('triples') calculates
  the ratio of the total table size to the actual data size. This ratio
  represents the overhead factor.

  Multiplying the app_id data size by the overhead factor gives an estimate of
  real usage"
  ([params] (app-usage (aurora/conn-pool :read) params))
  ([conn {:keys [app-id]}]
   (sql/select-one
    ::app-usage
    conn
    ["SELECT
     (sum(s.triples_pg_size) *
        CASE
            WHEN pg_relation_size('triples') = 0 THEN 1
            ELSE pg_total_relation_size('triples')::numeric / pg_relation_size('triples')
        END) as num_bytes
     FROM attr_sketches s WHERE s.app_id = ?::uuid" app-id])))

(defn decrypt-connection-string [app-id encrypted-connection-string]
  (-> (crypt-util/aead-decrypt {:ciphertext encrypted-connection-string
                                :associated-data (uuid-util/->bytes app-id)})
      (String. "UTF-8")))

(defn set-connection-string!
  ([params] (set-connection-string! (aurora/conn-pool :write) params))
  ([conn {:keys [app-id connection-string]}]
   (with-cache-invalidation app-id
     (sql/execute-one! ::set-connection-string!
                       conn
                       ["update apps set connection_string = ?::bytea where id = ?::uuid"
                        (crypt-util/aead-encrypt {:plaintext (.getBytes ^String connection-string)
                                                  :associated-data (uuid-util/->bytes app-id)})
                        app-id]))))

(comment
  (app-usage (aurora/conn-pool :read) {:app-id "5cb86bd5-5dfb-4489-a455-78bb86cd3da3"}))
