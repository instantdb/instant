(ns instant.fixtures
  (:require [instant.config :as config]
            [instant.data.bootstrap :as bootstrap]
            [instant.data.constants :refer [test-user-id]]
            [instant.data.resolvers :as resolvers]
            [instant.model.app :as app-model]
            [instant.model.app-member-invites :as instant-app-member-invites]
            [instant.model.app-members :as instant-app-members]
            [instant.model.instant-stripe-customer :as instant-stripe-customer-model]
            [instant.model.instant-subscription :as instant-subscription-model]
            [instant.model.instant-user-refresh-token :as instant-user-refresh-token-model]
            [instant.stripe :refer [PRO_SUBSCRIPTION_TYPE]]
            [instant.model.instant-user :as instant-user-model]
            [instant.db.pg-introspect :as pg-introspect]
            [instant.jdbc.sql :as sql]
            [instant.jdbc.aurora :as aurora]
            [lambdaisland.uri :as uri]
            [next.jdbc.connection :as connection])
  (:import (java.util UUID)))

(defn mock-app-req
  ([a] (mock-app-req a (instant-user-model/get-by-id {:id (:creator_id a)})))
  ([a u]
   (let [r (instant-user-refresh-token-model/create! {:id (UUID/randomUUID) :user-id (:id u)})]
     {:headers {"authorization" (str "Bearer " (:id r))}
      :params {:app_id (:id a)}
      :body {}})))

(defn with-empty-app [f]
  (let [app-id (UUID/randomUUID)
        app (app-model/create! {:title "test app"
                                :creator-id test-user-id
                                :id app-id
                                :admin-token (UUID/randomUUID)})]
    (try
      (f app)
      (finally
        (app-model/delete-by-id! {:id app-id})))))

(defn with-movies-app [f]
  (with-empty-app
    (fn [{:keys [id] :as app}]
      (let [_ (bootstrap/add-movies-to-app! id)
            r (resolvers/make-movies-resolver id)]
        (f app r)))))

(defn with-zeneca-app [f]
  (with-empty-app
    (fn [{:keys [id] :as app}]
      (let [_ (bootstrap/add-zeneca-to-app! id)
            r (resolvers/make-zeneca-resolver id)]
        (f app r)))))

(defn with-zeneca-checked-data-app [f]
  (with-empty-app
    (fn [{:keys [id] :as app}]
      (let [_ (bootstrap/add-zeneca-to-app! true id)
            r (resolvers/make-zeneca-resolver id)]
        (f app r)))))

(defn with-zeneca-byop [f]
  (with-empty-app
    (fn [{:keys [id] :as app}]
      (let [schema (str id)
            connection-string (-> (config/get-aurora-config)
                                  (connection/jdbc-url)
                                  (uri/assoc-query* {:currentSchema schema})
                                  str)]
        (try
          (sql/execute! (aurora/conn-pool) [(format "create schema \"%s\"" schema)])
          (app-model/set-connection-string!
           {:app-id id
            :connection-string connection-string})
          (with-open [conn (sql/start-pool {:jdbcUrl connection-string
                                            :currentSchema schema
                                            :maximumPoolSize 1})]

            (bootstrap/add-zeneca-to-byop-app! conn)
            (let [r (resolvers/make-zeneca-byop-resolver conn schema)
                  {:keys [attrs table-info]} (pg-introspect/introspect conn schema)]

              (f {:db {:conn-pool conn}
                  :app-id id
                  :attrs attrs
                  :table-info table-info}
                 app
                 r)))
          (finally
            (sql/execute! (aurora/conn-pool) [(format "drop schema \"%s\" cascade" schema)])))))))

(defn with-pro-app [owner f]
  (let [app-id (UUID/randomUUID)
        app (app-model/create!
             {:title "test team app"
              :creator-id (:id owner)
              :id app-id
              :admin-token (UUID/randomUUID)})
        stripe-customer (instant-stripe-customer-model/get-or-create! {:user owner})
        owner-req (mock-app-req app owner)
        _ (instant-subscription-model/create!
           {:user-id (:id owner)
            :app-id app-id
            :subscription-type-id 2 ;; Pro
            :stripe-customer-id (:id stripe-customer)
            :stripe-subscription-id (str "fake_sub_" (UUID/randomUUID))
            :stripe-event-id (str "fake_evt_" (UUID/randomUUID))})]
    (try
      (f {:app app
          :owner owner
          :owner-req owner-req})
      (finally
        (app-model/delete-by-id! {:id app-id})))))

(defn with-team-app [owner invitee role f]
  (let [app-id (UUID/randomUUID)
        app (app-model/create!
             {:title "test team app"
              :creator-id (:id owner)
              :id app-id
              :admin-token (UUID/randomUUID)})
        invite (instant-app-member-invites/create!
                {:app-id app-id
                 :inviter-id (:creator_id app)
                 :role role
                 :email (:email invitee)})
        member (instant-app-members/create!
                {:app-id app-id
                 :user-id (:id invitee)
                 :role role})
        owner-req (mock-app-req app owner)
        invitee-req (mock-app-req app invitee)
        stripe-customer (instant-stripe-customer-model/get-or-create! {:user owner})
        _ (instant-subscription-model/create!
           {:user-id (:id owner)
            :app-id app-id
            :subscription-type-id PRO_SUBSCRIPTION_TYPE
            :stripe-customer-id (:id stripe-customer)
            :stripe-subscription-id (str "fake_sub_" (UUID/randomUUID))
            :stripe-event-id (str "fake_evt_" (UUID/randomUUID))})
        _ (instant-app-member-invites/accept-by-id! {:id (:id invite)})]
    (try
      (f {:app app
          :owner owner
          :invitee invitee
          :invite invite
          :member member
          :owner-req owner-req
          :invitee-req invitee-req})
      (finally
        (app-model/delete-by-id! {:id app-id})
        (instant-app-members/delete-by-id! {:id (:id member)})
        (instant-app-member-invites/delete-by-id! {:id (:id invite)})))))
