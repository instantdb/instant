(ns instant.fixtures
  (:require [clojure.core.async :as a]
            [clojure.test :refer [report]]
            [instant.config :as config]
            [instant.data.bootstrap :as bootstrap]
            [instant.data.constants :refer [test-user-id]]
            [instant.data.resolvers :as resolvers]
            [instant.db.indexing-jobs :as indexing-jobs]
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
            [instant.util.coll :as ucoll]
            [instant.util.io :as io-util]
            [lambdaisland.uri :as uri]
            [next.jdbc.connection :as connection])
  (:import
   (java.io File)
   (java.util UUID)))

(defn mock-app-req
  ([a] (mock-app-req a (instant-user-model/get-by-id {:id (:creator_id a)})))
  ([a u]
   (let [r (instant-user-refresh-token-model/create! {:id (UUID/randomUUID) :user-id (:id u)})]
     {:headers {"authorization" (str "Bearer " (:id r))}
      :params {:app_id (:id a)}
      :body {}})))

(defmacro with-indexing-job-queue [job-queue & body]
  `(let [chan# (a/chan 1024)
         process# (future (indexing-jobs/start-process chan#))
         ~job-queue chan#]
     (try
       ~@body
       (finally
         (a/close! chan#)
         (when (= :timeout (deref process# 1000 :timeout))
           (throw (Exception. "Timeout in with-queue")))))))

(defn report-warn-io [^String file e]
  (let [target-file-name (some-> file
                                 (File.)
                                 (.getName))
        stack-line (some-> (ucoll/seek (fn [^StackTraceElement frame]
                                         (= target-file-name (.getFileName frame)))
                                       (.getStackTrace (Thread/currentThread)))
                           (StackTraceElement/.getLineNumber))]
    (report {:type :fail
             :message "something is doing IO when it shouldn't"
             :expected nil
             :actual {:io-call-source e}
             :file target-file-name
             :line stack-line})))

(defmacro with-fail-on-warn-io [& body]
  (let [file *file*]
    `(binding [io-util/*tap-io* (partial report-warn-io ~file)]
       ~@body)))

(defmacro ignore-warn-io [& body]
  `(binding [io-util/*tap-io* nil]
     ~@body))

(defmacro with-empty-app [f]
  `(let [app-id# (UUID/randomUUID)
         app# (app-model/create! {:title "test app"
                                  :creator-id ~test-user-id
                                  :id app-id#
                                  :admin-token (UUID/randomUUID)})]
     (try
       (with-fail-on-warn-io
         (~f app#))
       (finally
         (app-model/delete-immediately-by-id! {:id app-id#})))))

(defmacro with-movies-app [f]
  `(with-empty-app
     (fn [app#]
       (bootstrap/add-movies-to-app! (:id app#))
       (let [r# (resolvers/make-movies-resolver (:id app#))]
         (~f app# r#)))))

(defmacro with-zeneca-app [f]
  `(with-empty-app
     (fn [app#]
       (bootstrap/add-zeneca-to-app! (:id app#))
       (let [r# (resolvers/make-zeneca-resolver (:id app#))]
         (~f app# r#)))))

(defmacro with-zeneca-app-no-indexing [f]
  `(with-empty-app
     (fn [app#]
       (bootstrap/add-zeneca-to-app! {:checked-data? false
                                      :indexed-data? false}
                                     (:id app#))
       (let [r# (resolvers/make-zeneca-resolver (:id app#))]
         (~f app# r#)))))

(defmacro with-zeneca-checked-data-app [f]
  `(with-empty-app
     (fn [app#]
       (bootstrap/add-zeneca-to-app! {:checked-data? true
                                      :indexed-data? true}
                                     (:id app#))
       (let [r# (resolvers/make-zeneca-resolver (:id app#))]
         (~f app# r#)))))

(defn run-zeneca-byop [app f]
  (let [id (:id app)
        schema (str id)
        connection-string (-> (config/get-aurora-config)
                              (connection/jdbc-url)
                              (uri/assoc-query* {:currentSchema schema})
                              str)]
    (try
      (sql/execute! (aurora/conn-pool :write) [(format "create schema \"%s\"" schema)])
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
        (sql/execute! (aurora/conn-pool :write) [(format "drop schema \"%s\" cascade" schema)])))))

(defmacro with-zeneca-byop [f]
  `(with-empty-app
     (fn [app#]
       (run-zeneca-byop app# ~f))))

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
        (app-model/delete-immediately-by-id! {:id app-id})))))

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
        (app-model/delete-immediately-by-id! {:id app-id})
        (instant-app-members/delete-by-id! {:id (:id member)})
        (instant-app-member-invites/delete-by-id! {:id (:id invite)})))))
