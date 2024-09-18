(ns instant.model.app
  (:require [instant.jdbc.aurora :as aurora]
            [instant.jdbc.sql :as sql]
            [instant.model.instant-user :as instant-user-model]
            [next.jdbc :as next-jdbc]
            [honey.sql :as hsql]
            [instant.model.app-admin-token :as app-admin-token-model]
            [instant.util.crypt :as crypt-util]
            [instant.util.exception :as ex]
            [instant.util.uuid :as uuid-util])
  (:import
   (java.util UUID)))

(defn create!
  ([params] (create! aurora/conn-pool params))
  ([conn {:keys [id title creator-id admin-token]}]

   (next-jdbc/with-transaction [tx-conn conn]
     (let [app (sql/execute-one!
                tx-conn
                ["INSERT INTO apps (id, title, creator_id) VALUES (?::uuid, ?, ?::uuid)"
                 id title creator-id])
           {:keys [token]} (app-admin-token-model/create! tx-conn {:app-id id
                                                                   :token admin-token})]
       (assoc app :admin-token token)))))

(defn get-by-id
  ([params] (get-by-id aurora/conn-pool params))
  ([conn {:keys [id]}]
   (sql/select-one conn
                   ["SELECT
                       a.*
                     FROM apps a
                     WHERE a.id = ?::uuid" id])))

(defn get-by-id! [params]
  (ex/assert-record! (get-by-id params) :app {:args [params]}))

(defn list-by-creator-id
  ([user-id] (list-by-creator-id aurora/conn-pool user-id))
  ([conn user-id]
   (sql/select conn
               ["SELECT a.*
                FROM apps a
                WHERE a.creator_id = ?::uuid"
                user-id])))

(comment
  (def user-id "6412d553-2749-4f52-898a-0b3ec42ffd28")
  (list-by-creator-id user-id))

(defn get-by-id-and-creator
  ([params] (get-by-id-and-creator aurora/conn-pool params))
  ([conn {:keys [user-id app-id]}]
   (sql/select-one conn
                   ["SELECT a.*
                      FROM apps a
                      WHERE
                      a.id = ?::uuid AND
                      a.creator_id = ?::uuid"
                    app-id user-id])))

(defn get-by-id-and-creator! [params]
  (ex/assert-record! (get-by-id-and-creator params) :app {:args [params]}))

(comment
  (def user-id "6412d553-2749-4f52-898a-0b3ec42ffd28")
  (def app-id "68b75bac-3ff7-4efe-9596-97ac0d03ab65")
  (get-by-id-and-creator {:user-id user-id :app-id app-id}))

(defn get-app-ids-created-before
  ([params] (get-app-ids-created-before aurora/conn-pool params))
  ([conn {:keys [creator-id created-before]}]
   (map :id (sql/select
             conn
             ["SELECT
                a.id
                FROM apps a
                WHERE
                  a.creator_id = ?::uuid AND
                  a.created_at < ?"
              creator-id created-before]))))

(defn get-with-creator-by-ids
  ([params] (get-with-creator-by-ids aurora/conn-pool params))
  ([conn app-ids]
   (sql/select conn ["SELECT a.*, u.email AS creator_email
                      FROM apps a
                      JOIN instant_users u ON a.creator_id = u.id
                      WHERE a.id in (select unnest(?::uuid[]))"
                     (-> app-ids
                         vec
                         (with-meta {:pgtype "uuid[]"})
                         into-array)])))

(comment
  (get-with-creator-by-ids ["41c12a82-f769-42e8-aad8-53bf33bbaba9"
                            "59aafa92-a900-4b3d-aaf1-45032ee8d415"]))

(defn get-all-for-user
  ([params] (get-all-for-user aurora/conn-pool params))
  ([conn {:keys [user-id]}]
   (sql/select conn ["WITH s AS (
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
                        a.creator_id = ?::uuid
                        OR (
                          m.user_id = ?::uuid
                          AND s.subscription_type_id = 2
                        )

                      GROUP BY
                        a.id,
                        admin_token,
                        rules,
                        m.member_role,
                        s.subscription_type_id
                      "
                     user-id user-id user-id user-id])))

(defn get-dash-auth-data
  ([params] (get-dash-auth-data aurora/conn-pool params))
  ([conn {:keys [app-id]}]
   (sql/select-one
    conn
    ["SELECT json_build_object(
        'oauth_service_providers', (
          SELECT json_agg(json_build_object(
            'id', osp.id,
            'provider_name', osp.provider_name,
            'created_at', osp.created_at
          ))
          FROM (SELECT * FROM app_oauth_service_providers osp
                  WHERE osp.app_id = a.id
                  ORDER BY osp.created_at desc)
          AS osp
        ),
        'oauth_clients', (
          SELECT json_agg(json_build_object(
            'id', oc.id,
            'client_name', oc.client_name,
            'client_id', oc.client_id,
            'provider_id', oc.provider_id,
            'created_at', oc.created_at,
            'meta', oc.meta,
            'discovery_endpoint', oc.discovery_endpoint
          ))
          FROM (SELECT * FROM app_oauth_clients oc
                 WHERE oc.app_id = a.id
                 ORDER BY oc.created_at desc)
          AS oc
        ),
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
      WHERE a.id = ?::uuid"
     app-id])))

(defn delete-by-id!
  ([params] (delete-by-id! aurora/conn-pool params))
  ([conn {:keys [id]}]
   (sql/execute-one! conn ["DELETE FROM apps WHERE id = ?::uuid" id])))

(defn rename-by-id!
  ([params] (rename-by-id! aurora/conn-pool params))
  ([conn {:keys [id title]}]
   (sql/execute-one! conn ["UPDATE apps SET title = ? WHERE id = ?::uuid " title id])))

(defn change-creator!
  ([params] (change-creator! aurora/conn-pool params))
  ([conn {:keys [id new-creator-id]}]
   (sql/execute-one! conn ["UPDATE apps a
                            SET creator_id = ?::uuid
                            WHERE a.id = ?::uuid"
                           new-creator-id id])))

(defn delete-by-ids!
  ([params] (delete-by-ids! aurora/conn-pool params))
  ([conn {:keys [creator-id ids]}]
   (sql/execute-one! conn
                     (hsql/format
                      {:delete-from [:apps]
                       :where [:and [:= :creator-id [:cast creator-id :uuid]]
                               [:in :id (mapv (fn [x] [:cast x :uuid]) ids)]]}))))

(comment
  (def u (instant-user-model/get-by-email {:email "stopa@instantdb.com"}))
  (def a (create! {:title "TestingRepl!" :id (UUID/randomUUID) :creator-id (:id u)}))
  (get-all-for-user {:user-id (:id u)})
  (get-dash-auth-data {:app-id "3cc5c5c8-07df-42b2-afdc-6a04cbf0c40a"})
  (delete-by-id! (select-keys a [:id])))

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
  ([params] (app-usage aurora/conn-pool params))
  ([conn {:keys [app-id]}]
   (sql/select-one
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
  ([params] (set-connection-string! aurora/conn-pool params))
  ([conn {:keys [app-id connection-string]}]
   (sql/execute-one! conn
                     ["update apps set connection_string = ?::bytea where id = ?::uuid"
                      (crypt-util/aead-encrypt {:plaintext (.getBytes connection-string)
                                                :associated-data (uuid-util/->bytes app-id)})
                      app-id])))

(comment
  (app-usage aurora/conn-pool {:app-id "5cb86bd5-5dfb-4489-a455-78bb86cd3da3"}))
