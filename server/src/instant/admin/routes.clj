(ns instant.admin.routes
  (:require [compojure.core :refer [defroutes POST GET DELETE] :as compojure]
            [ring.util.http-response :as response]
            [instant.model.app-admin-token :as app-admin-token-model]
            [instant.db.model.attr :as attr-model]
            [instant.jdbc.aurora :as aurora]
            [instant.db.permissioned-transaction :as permissioned-tx]
            [instant.util.uuid :as uuid-util]
            [instant.db.instaql :as iq]
            [instant.util.email :as email]
            [instant.model.app-user :as app-user-model]
            [instant.model.app-user-refresh-token :as app-user-refresh-token-model]
            [instant.db.datalog :as d]
            [instant.model.rule :as rule-model]
            [instant.util.exception :as ex]
            [instant.util.string :as string-util]
            [instant.util.http :as http-util]
            [instant.admin.model :as admin-model]
            [instant.util.json :refer [<-json ->json]]
            [instant.db.model.entity :as entity-model]
            [instant.storage.beta :as storage-beta]
            [instant.util.storage :as storage-util])

  (:import
   (java.util UUID)))

(defn req->app-id! [req]
  (ex/get-param! req [:headers "app-id"] uuid-util/coerce))

(defn req->admin-token! [req]
  (app-admin-token-model/fetch! {:app-id (req->app-id! req)
                                 :token (http-util/req->bearer-token! req)}))

(defn get-perms! [{:keys [headers] :as req}]
  (let [{app-id :app_id} (req->admin-token! req)
        as-token (get headers "as-token")
        as-email (get headers "as-email")
        as-guest (get headers "as-guest")]
    (cond
      as-token
      {:app-id app-id :admin? false
       :current-user (app-user-model/get-by-refresh-token!
                      {:app-id app-id :refresh-token as-token})}

      as-email
      {:app-id app-id :admin? false
       :current-user (app-user-model/get-by-email!
                      {:app-id app-id :email as-email})}

      as-guest
      {:app-id app-id :admin? false :current-user nil}

      :else
      {:app-id app-id :admin? true})))

(comment
  (def counters-app-id  #uuid "137ace7a-efdd-490f-b0dc-a3c73a14f892")
  (def admin-token #uuid "82900c15-faac-495b-b385-9f9e7743b629")

  (get-perms! {:headers {"app-id" (str counters-app-id)
                         "authorization" (format "Bearer %s" admin-token)}})
  (get-perms! {:headers {"app-id" (str counters-app-id)
                         "authorization" (format "Bearer %s" admin-token)
                         "as-email" "stopa@instantdb.com"}})
  (def refresh-token
    (app-user-refresh-token-model/create!
     {:id (UUID/randomUUID)
      :user-id (:id (app-user-model/get-by-email {:app-id counters-app-id :email "stopa@instantdb.com"}))}))

  (get-perms! {:headers {"app-id" (str counters-app-id)
                         "authorization" (format "Bearer %s" admin-token)
                         "as-token" (str (:id refresh-token))}})

  (get-perms! {:headers {"app-id" (str counters-app-id)}})
  (get-perms! {:headers {"app-id" (str counters-app-id)
                         "authorization" "foo"}}))

;; ------
;; Query

(declare instaql-nodes->object-tree)

(defn obj-node [attrs node]
  (let [datalog-result (-> node :data :datalog-result)
        m (entity-model/datalog-result->map {:attrs attrs} datalog-result)
        children (some->>  node
                           :child-nodes
                           (instaql-nodes->object-tree attrs))]
    (merge m children)))

(defn instaql-nodes->object-tree [attrs nodes]
  (reduce
   (fn [acc node]
     (let [{:keys [child-nodes data]} node]
       (assoc acc (:k data)
              (map (partial obj-node attrs)  child-nodes))))

   {}
   nodes))

(defn query-post [req]
  (let [query (ex/get-param! req [:body :query] #(when (map? %) %))
        {:keys [app-id] :as perms} (get-perms! req)
        attrs (attr-model/get-by-app-id aurora/conn-pool app-id)
        ctx (merge {:db {:conn-pool aurora/conn-pool}
                    :app-id app-id
                    :attrs attrs
                    :datalog-query-fn d/query
                    :datalog-loader (d/make-loader)}
                   perms)
        result (instaql-nodes->object-tree
                attrs
                (iq/permissioned-query ctx query))]
    (response/ok result)))

(defn query-perms-check [req]
  (let [{:keys [app-id] :as perms} (get-perms! req)
        _ (ex/assert-valid! :non-admin "non-admin"
                            (when (:admin? perms)
                              [{:message "Cannot test perms as admin"}]))
        rules-override (-> req :body :rules-override ->json <-json)
        query (ex/get-param! req [:body :query] #(when (map? %) %))
        attrs (attr-model/get-by-app-id aurora/conn-pool app-id)
        ctx (merge {:db {:conn-pool aurora/conn-pool}
                    :app-id app-id
                    :attrs attrs
                    :datalog-query-fn d/query
                    :datalog-loader (d/make-loader)}
                   perms)

        {check-results :check-results nodes :nodes} (iq/permissioned-query-check ctx query rules-override)
        result (instaql-nodes->object-tree attrs nodes)]
    (response/ok {:check-results check-results :result result})))

(comment
  (do (def app-id  #uuid "10ed6fc7-faa4-4f95-b364-9a2a4d445abe")
      (def admin-token #uuid "0ed50f87-16e9-43eb-ae99-31507df37637")
      (def rules-override {"foos" {"allow" {"view" "data.ref('bars.a')"}}})
      (def foo-id "b0840195-0a02-4bc1-9f00-0ee9f5200480")
      (def query {:foos {}}))
  (query-perms-check {:body {:rules-override rules-override
                             :query query}
                      :headers {"app-id" (str app-id)
                                "authorization" (str "Bearer " admin-token)
                                "as-guest" "true"}}))

;; ------
;; Transact

(defn transact-post [req]
  (let [steps (ex/get-param! req [:body :steps] #(when (coll? %) %))
        {:keys [app-id] :as perms} (get-perms! req)
        attrs (attr-model/get-by-app-id aurora/conn-pool app-id)
        ctx (merge {:db {:conn-pool aurora/conn-pool}
                    :app-id app-id
                    :attrs attrs
                    :datalog-query-fn d/query
                    :rules (rule-model/get-by-app-id aurora/conn-pool
                                                     {:app-id app-id})}
                   perms)
        tx-steps (admin-model/->tx-steps! attrs steps)
        {tx-id :id} (permissioned-tx/transact! ctx tx-steps)]
    (cond
      :else
      (response/ok {:tx-id tx-id}))))

(defn transact-perms-check [req]
  (let [{:keys [app-id] :as perms} (get-perms! req)
        _ (ex/assert-valid! :non-admin "non-admin"
                            (when (:admin? perms)
                              [{:message "Cannot test perms as admin"}]))
        rules-override (-> req :body :rules-override ->json <-json)
        commit-tx (-> req :body :dangerously-commit-tx)
        dry-run (not commit-tx)
        steps (ex/get-param! req [:body :steps] #(when (coll? %) %))
        attrs (attr-model/get-by-app-id aurora/conn-pool app-id)
        rules (if rules-override
                {:app_id app-id :code rules-override}
                (rule-model/get-by-app-id
                 aurora/conn-pool
                 {:app-id app-id}))
        ctx (merge {:db {:conn-pool aurora/conn-pool}
                    :app-id app-id
                    :attrs attrs
                    :datalog-query-fn d/query
                    :rules rules
                    :admin-check? true
                    :admin-dry-run? dry-run}
                   perms)
        tx-steps (admin-model/->tx-steps! attrs steps)
        result (permissioned-tx/transact! ctx tx-steps)
        cleaned-result {:tx-id (:id result)
                        :all-checks-ok? (:all-checks-ok? result)
                        :committed? (:committed? result)
                        :check-results
                        (map (fn [r]
                               (dissoc r :check))
                             (:check-results result))}]
    (response/ok cleaned-result)))

(comment
  (do (def app-id  #uuid "10ed6fc7-faa4-4f95-b364-9a2a4d445abe")
      (def admin-token #uuid "0ed50f87-16e9-43eb-ae99-31507df37637")
      (def rules-override {"foos" {"allow" {"update" "false"}}})
      (def update-step ["update"
                        "foos"
                        "b0840195-0a02-4bc1-9f00-0ee9f5200480"
                        {"x" 1}])
      (def steps [update-step]))
  (transact-perms-check {:body {:rules-override rules-override
                                :dangerously-commit-tx true
                                :steps steps}
                         :headers {"app-id" (str app-id)
                                   "authorization" (str "Bearer " admin-token)
                                   "as-guest" "true"}}))

;; -------- 
;; Refresh tokens

(defn refresh-tokens-post [req]
  (let [{app-id :app_id} (req->admin-token! req)
        email (ex/get-param! req [:body :email] email/coerce)
        {user-id :id :as user}
        (or (app-user-model/get-by-email {:app-id app-id
                                          :email email})

            (app-user-model/create!
             {:id (UUID/randomUUID)
              :app-id app-id
              :email email}))

        {refresh-token-id :id}
        (app-user-refresh-token-model/create!
         {:id (UUID/randomUUID)
          :user-id user-id})]
    (response/ok {:user (assoc user :refresh_token refresh-token-id)})))

(defn sign-out-post [req]
  (let [{app-id :app_id} (req->admin-token! req)
        email (ex/get-param! req [:body :email] email/coerce)
        {user-id :id} (app-user-model/get-by-email! {:app-id app-id
                                                     :email email})]
    (app-user-refresh-token-model/delete-by-user-id! {:user-id user-id})
    (response/ok {:ok true})))

(defn req->app-user! [{:keys [params] :as req}]
  (let [{app-id :app_id} (req->admin-token! req)
        {:keys [email refresh_token id]} params]
    (cond
      email
      (app-user-model/get-by-email
       {:app-id app-id
        :email (ex/get-param! req [:params :email] email/coerce)})

      refresh_token
      (app-user-model/get-by-refresh-token
       {:app-id app-id
        :refresh-token (ex/get-param! req [:params :refresh_token] uuid-util/coerce)})

      id
      (app-user-model/get-by-id
       {:app-id app-id
        :id (ex/get-param! req [:params :id] uuid-util/coerce)})

      :else
      (ex/throw-validation-err!
       :params
       params
       [{:message "Please provide a user id, email, or refresh_token"}]))))

(defn app-users-get [req]
  (let [user (req->app-user! req)]
    (response/ok {:user user})))

(defn app-users-delete [req]
  (let [{user-id :id app-id :app_id} (req->app-user! req)]
    (response/ok {:deleted (app-user-model/delete-by-id! {:id user-id :app-id app-id})})))

(comment
  ;; Set up test data
  (def counters-app-id  #uuid "137ace7a-efdd-490f-b0dc-a3c73a14f892")
  (def admin-token #uuid "82900c15-faac-495b-b385-9f9e7743b629")
  (def email "test@example.com")
  (def user (app-user-model/create! {:id (UUID/randomUUID)
                                     :app-id counters-app-id
                                     :email email}))
  (def refresh-token (app-user-refresh-token-model/create!
                      {:id (UUID/randomUUID)
                       :user-id (:id user)}))

  ;; GET /admin/users
  (tool/copy (tool/req->curl {:method :get
                              :path "/admin/users"
                              :params {:email email}
                              :headers {"authorization" (str "Bearer " admin-token)
                                        "app-id" (str counters-app-id)}}))

  (app-users-get {:params {:email email}
                  :headers {"authorization" (str "Bearer " admin-token)
                            "app-id" (str counters-app-id)}})

  (app-users-get {:params {:id (str (:id user))}
                  :headers {"authorization" (str "Bearer " admin-token)
                            "app-id" (str counters-app-id)}})

  (app-users-get {:params {:refresh_token (str (:id refresh-token))}
                  :headers {"authorization" (str "Bearer " admin-token)
                            "app-id" (str counters-app-id)}})

  (app-users-get {:params {:foo "bar"}
                  :headers {"authorization" (str "Bearer " admin-token)
                            "app-id" (str counters-app-id)}})

  (app-users-get {:params {:id "moop"}
                  :headers {"authorization" (str "Bearer " admin-token)
                            "app-id" (str counters-app-id)}})

  ;; DELETE /admin/users
  (tool/copy (tool/req->curl {:method :delete
                              :path "/admin/users"
                              :params {:email email}
                              :headers {"authorization" (str "Bearer " admin-token)
                                        "app-id" (str counters-app-id)}}))

  (app-users-delete {:params {:email email}
                     :headers {"authorization" (str "Bearer " admin-token)
                               "app-id" (str counters-app-id)}})

  (app-users-delete {:params {:id (str (:id user))}
                     :headers {"authorization" (str "Bearer " admin-token)
                               "app-id" (str counters-app-id)}})

  (app-users-delete {:params {:refresh_token (str (:id refresh-token))}
                     :headers {"authorization" (str "Bearer " admin-token)
                               "app-id" (str counters-app-id)}})

  (app-users-delete {:params {:foo "bar"}
                     :headers {"authorization" (str "Bearer " admin-token)
                               "app-id" (str counters-app-id)}})


  (app-users-delete {:params {:id "moop"}
                     :headers {"authorization" (str "Bearer " admin-token)
                               "app-id" (str counters-app-id)}}))


;; ---
;; Storage

(defn signed-download-url-get [req]
  (let [{app-id :app_id} (req->admin-token! req)
        filename (ex/get-param! req [:params :filename] string-util/coerce-non-blank-str)
        data (storage-util/create-signed-download-url! app-id filename)]
    (response/ok {:data data})))

(defn signed-upload-url-post [req]
  (let [{app-id :app_id} (req->admin-token! req)
        filename (ex/get-param! req [:body :filename] string-util/coerce-non-blank-str)
        data (storage-util/create-signed-upload-url! app-id filename)]
    (response/ok {:data data})))

;; Retrieves all files that have been uploaded via Storage APIs
(defn files-get [req]
  (let [{app-id :app_id} (req->admin-token! req)
        _ (storage-beta/assert-storage-enabled! app-id)
        subdirectory (-> req :params :subdirectory)
        data (storage-util/list-files! app-id subdirectory)]
    (response/ok {:data data})))

;; Deletes a single file by name/path (e.g. "demo.png", "profiles/me.jpg")
(defn file-delete [req]
  (let [{app-id :app_id} (req->admin-token! req)
        filename (-> req :params :filename)
        data (storage-util/delete-file! app-id filename)]
    (response/ok {:data data})))

;; Deletes a multiple files by name/path (e.g. "demo.png", "profiles/me.jpg")
(defn files-delete [req]
  (let [{app-id :app_id} (req->admin-token! req)
        filenames (-> req :body :filenames)
        data (storage-util/bulk-delete-files! app-id filenames)]
    (response/ok {:data data})))

(comment
  (def counters-app-id  #uuid "137ace7a-efdd-490f-b0dc-a3c73a14f892")
  (def admin-token #uuid "82900c15-faac-495b-b385-9f9e7743b629")
  (query-post {:body {:query {:goals {:todos {}}}}
               :headers {"app-id" (str counters-app-id)
                         "authorization" (str "Bearer " admin-token)
                         "as-email" "stopa@instantdb.com"}})
  (def steps [["update"
               "goals"
               "8aa64e4c-64f9-472e-8a61-3fa28870e6cb"
               {"title" "moop" "name" "flippy" "creatorId" "3c32701d-f4a2-40e8-b83c-077dd4cb5cec"}]])
  (transact-post {:body {:steps steps}
                  :headers {"app-id" (str counters-app-id)
                            "authorization" (str "Bearer " admin-token)}})

  (refresh-tokens-post {:body {:email "stopa@instantdb.com"}
                        :headers {"app-id" (str counters-app-id)
                                  "authorization" (str "Bearer " admin-token)}}))

(defn schema-experimental-get [req]
  (let [{app-id :app_id} (req->admin-token! req)
        attrs (attr-model/get-by-app-id aurora/conn-pool app-id)]
    (response/ok {:attrs attrs})))

(comment
  (def counters-app-id  #uuid "137ace7a-efdd-490f-b0dc-a3c73a14f892")
  (def admin-token #uuid "82900c15-faac-495b-b385-9f9e7743b629")
  (schema-experimental-get {:headers {"app-id" (str counters-app-id)
                                      "authorization" (str "Bearer " admin-token)}}))

(defroutes routes
  (POST "/admin/query" [] query-post)
  (POST "/admin/transact" [] transact-post)
  (POST "/admin/query_perms_check" [] query-perms-check)
  (POST "/admin/transact_perms_check" [] transact-perms-check)
  (POST "/admin/sign_out" [] sign-out-post)
  (POST "/admin/refresh_tokens" [] refresh-tokens-post)

  (GET "/admin/users", [] app-users-get)
  (DELETE "/admin/users", [] app-users-delete)

  (POST "/admin/storage/signed-upload-url" [] signed-upload-url-post)
  (GET "/admin/storage/signed-download-url", [] signed-download-url-get)
  (GET "/admin/storage/files" [] files-get)
  (DELETE "/admin/storage/files" [] file-delete) ;; single delete
  (POST "/admin/storage/files/delete" [] files-delete) ;; bulk delete

  (GET "/admin/schema_experimental" [] schema-experimental-get))
