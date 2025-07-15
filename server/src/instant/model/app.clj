(ns instant.model.app
  (:require
   [clojure.core.cache.wrapped :as cache]
   [clojure.set :refer [rename-keys]]
   [honey.sql :as hsql]
   [instant.db.model.attr :as attr-model]
   [instant.db.model.transaction :as transaction-model]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.model.instant-user :as instant-user-model]
   [instant.model.rule :as rule-model]
   [instant.system-catalog-ops :refer [query-op]]
   [instant.util.crypt :as crypt-util]
   [instant.util.exception :as ex]
   [instant.util.uuid :as uuid-util]
   [next.jdbc :as next-jdbc])
  (:import
   (java.util UUID)))

(def app-cache (cache/lru-cache-factory {} :threshold 256))

(defn evict-app-id-from-cache [app-id]
  (cache/evict app-cache app-id))

(defn evict-app-ids-from-cache [app-ids]
  (doseq [app-id app-ids]
    (evict-app-id-from-cache app-id)))

(defmacro with-cache-invalidation [app-id-or-ids & body]
  `(let [input# ~app-id-or-ids
         ids# (if (coll? input#)
                input#
                [input#])]
     (evict-app-ids-from-cache ids#)
     (let [res# ~@body]
       (evict-app-ids-from-cache ids#)
       res#)))

(defn create!
  ([params] (create! (aurora/conn-pool :write) params))
  ([conn {:keys [id title creator-id admin-token]}]
   (let [query {:with [[:app_insert
                        {:insert-into :apps
                         :values [{:id id
                                   :title title
                                   :creator-id creator-id}]
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

(defn get-by-id* [conn id]
  (sql/select-one ::get-by-id*
                  conn
                  ["SELECT * FROM apps WHERE apps.id = ?::uuid AND apps.deletion_marked_at IS NULL" id]))

(defn get-by-id
  ([{:keys [id]}]
   (cache/lookup-or-miss app-cache id (partial get-by-id* (aurora/conn-pool :read))))
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

(defn get-all-for-user
  ([params] (get-all-for-user (aurora/conn-pool :read) params))
  ([conn {:keys [user-id]}]
   (sql/select ::get-all-for-user
               conn ["WITH s AS (
                        SELECT
                          app_id,
                          subscription_type_id
                        FROM (
                          SELECT
                            app_id,
                            subscription_type_id,
                            ROW_NUMBER() OVER (
                              PARTITION BY app_id ORDER BY created_at DESC
                            ) AS row_num
                          FROM instant_subscriptions
                        ) s
                        WHERE row_num = 1
                      )

                      SELECT
                        a.*,
                        at.token AS admin_token,
                        r.code AS rules,

                        (
                          s.subscription_type_id IS NOT NULL
                          AND s.subscription_type_id = 2
                        ) AS pro,

                        CASE
                          WHEN a.creator_id = ?::uuid THEN 'owner'
                          ELSE m.member_role
                        END AS user_app_role,

                        (
                          SELECT
                          CASE
                            WHEN count(m) = 0 THEN '[]'
                            ELSE json_agg(
                              json_build_object(
                                'id', m.id,
                                'email', mu.email,
                                'role', m.member_role
                              )
                            )
                          END
                          FROM app_members m
                          LEFT JOIN instant_users mu ON mu.id = m.user_id
                          WHERE m.app_id = a.id
                        ) AS members,

                        (
                          SELECT
                          CASE
                            WHEN count(i) = 0 THEN '[]'
                            ELSE json_agg(
                              json_build_object(
                                'id', i.id,
                                'email', i.invitee_email,
                                'role', i.invitee_role,
                                'status', i.status,
                                'sent_at', i.sent_at,
                                'expired', i.sent_at < NOW() - INTERVAL '3 days'
                              )
                            )
                          END
                          FROM app_member_invites i
                          WHERE i.app_id = a.id
                        ) AS invites,

                        (
                          SELECT
                            json_build_object(
                              'id', et.id,
                              'subject', et.subject,
                              'body', et.body,
                              'name', et.name,
                              'email', es.email
                            )
                            FROM app_email_templates et
                                LEFT JOIN app_email_senders es ON et.sender_id = es.id
                            WHERE et.app_id = a.id
                        ) AS magic_code_email_template

                      FROM apps a
                        JOIN app_admin_tokens at ON at.app_id = a.id
                        LEFT JOIN rules r ON r.app_id = a.id
                        LEFT JOIN app_members m ON (
                          m.user_id = ?::uuid
                          AND m.app_id = a.id
                        )
                        LEFT JOIN s ON a.id = s.app_id

                      WHERE
                        ( 
                          a.creator_id = ?::uuid
                          OR (m.user_id = ?::uuid AND s.subscription_type_id = 2)
                        ) AND a.deletion_marked_at IS NULL
                      GROUP BY
                        a.id,
                        admin_token,
                        rules,
                        m.member_role,
                        s.subscription_type_id"
                     user-id user-id user-id user-id])))

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

(defn get-apps-to-delete
  ([params] (get-apps-to-delete (aurora/conn-pool :read) params))
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
     (attr-model/delete-by-app-id! tx-conn id)
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
  "Estimates amount of bytes used for an app's triples. This is intended to be
  used as a final step in a transaction to update the app's total_app_bytes.
  If we want to record this usage elsewhere it's better to read the cached value
  from the transactions table instead.

  Usage is comprised of both raw data and overhead data (indexes, toast tables, etc.).

  sum(pg_column_size(t)) calculates the total data size for the specified app_id.
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
     (sum(pg_column_size(t)) *
        CASE
            WHEN pg_relation_size('triples') = 0 THEN 1
            ELSE pg_total_relation_size('triples') / pg_relation_size('triples')
        END) as num_bytes
     FROM triples t WHERE t.app_id = ?::uuid" app-id])))

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
