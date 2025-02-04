(ns instant.admin.routes
  (:require
   [compojure.core :as compojure :refer [defroutes DELETE GET POST PUT]]
   [instant.admin.model :as admin-model]
   [instant.db.datalog :as d]
   [instant.db.instaql :as iq]
   [instant.db.model.attr :as attr-model]
   [instant.db.permissioned-transaction :as permissioned-tx]
   [instant.flags :as flags]
   [instant.jdbc.aurora :as aurora]
   [instant.model.app-admin-token :as app-admin-token-model]
   [instant.model.app-user :as app-user-model]
   [instant.model.app-user-magic-code :as app-user-magic-code-model]
   [instant.model.app-user-refresh-token :as app-user-refresh-token-model]
   [instant.model.rule :as rule-model]
   [instant.util.email :as email]
   [instant.util.exception :as ex]
   [instant.util.http :as http-util]
   [instant.util.instaql :refer [instaql-nodes->object-tree]]
   [instant.util.json :refer [->json <-json]]
   [instant.util.string :as string-util]
   [instant.util.uuid :as uuid-util]
   [ring.util.http-response :as response]
   [instant.model.schema :as schema-model]
   [clojure.string :as string]
   [instant.storage.coordinator :as storage-coordinator]
   [clojure.walk :as w])
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

(defn query-post [req]
  (let [query (ex/get-param! req [:body :query] #(when (map? %) %))
        inference? (-> req :body :inference? boolean)
        {:keys [app-id] :as perms} (get-perms! req)
        attrs (attr-model/get-by-app-id app-id)
        ctx (merge {:db {:conn-pool (aurora/conn-pool :read)}
                    :app-id app-id
                    :attrs attrs
                    :datalog-query-fn d/query
                    :datalog-loader (d/make-loader)
                    :inference? inference?}
                   perms)
        nodes (iq/permissioned-query ctx query)
        result (instaql-nodes->object-tree ctx nodes)]
    (response/ok result)))

(comment
  (def app-id  #uuid "386af13d-635d-44b8-8030-6a3958537db6")
  (def admin-token #uuid "87118d2f-0f7a-497f-adee-e38a6af3620a")
  (query-post {:body {:inference? true :query {:x {:y {}} :y {:x {}}}}
               :headers {"app-id" (str app-id)
                         "authorization" (str "Bearer " admin-token)}}))

(defn query-perms-check [req]
  (let [{:keys [app-id] :as perms} (get-perms! req)
        _ (ex/assert-valid! :non-admin "non-admin"
                            (when (:admin? perms)
                              [{:message "Cannot test perms as admin"}]))
        inference? (-> req :body :inference? boolean)
        rules-override (-> req :body :rules-override ->json <-json)
        query (ex/get-param! req [:body :query] #(when (map? %) %))
        attrs (attr-model/get-by-app-id app-id)
        ctx (merge {:db {:conn-pool (aurora/conn-pool :read)}
                    :app-id app-id
                    :attrs attrs
                    :datalog-query-fn d/query
                    :datalog-loader (d/make-loader)
                    :inference? inference?}
                   perms)
        {check-results :check-results nodes :nodes} (iq/permissioned-query-check ctx query rules-override)
        result (instaql-nodes->object-tree ctx nodes)]
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
        throw-on-missing-attrs? (ex/get-optional-param!
                                 req
                                 [:body :throw-on-missing-attrs?] boolean)
        {:keys [app-id] :as perms} (get-perms! req)
        attrs (attr-model/get-by-app-id app-id)
        ctx (merge {:db {:conn-pool (aurora/conn-pool :write)}
                    :app-id app-id
                    :attrs attrs
                    :datalog-query-fn d/query
                    :rules (rule-model/get-by-app-id {:app-id app-id})}
                   perms)
        tx-steps (admin-model/->tx-steps! {:attrs attrs
                                           :throw-on-missing-attrs? throw-on-missing-attrs?}
                                          steps)
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
        throw-on-missing-attrs? (ex/get-optional-param!
                                 req
                                 [:body :throw-on-missing-attrs?] boolean)
        attrs (attr-model/get-by-app-id app-id)
        rules (if rules-override
                {:app_id app-id :code rules-override}
                (rule-model/get-by-app-id {:app-id app-id}))
        ctx (merge {:db {:conn-pool (aurora/conn-pool :write)}
                    :app-id app-id
                    :attrs attrs
                    :datalog-query-fn d/query
                    :rules rules
                    :admin-check? true
                    :admin-dry-run? dry-run}
                   perms)
        tx-steps (admin-model/->tx-steps! {:attrs attrs
                                           :throw-on-missing-attrs? throw-on-missing-attrs?}
                                          steps)
        result (permissioned-tx/transact! ctx tx-steps)
        cleaned-result {:tx-id (:id result)
                        :all-checks-ok? (:all-checks-ok? result)
                        :committed? (:committed? result)
                        :check-results
                        (map (fn [r]
                               (-> r
                                   (dissoc :check)
                                   (update :program
                                           select-keys
                                           [:etype :action :code :display-code])))
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
         {:app-id app-id
          :id (UUID/randomUUID)
          :user-id user-id})]
    (response/ok {:user (assoc user :refresh_token refresh-token-id)})))

(defn sign-out-post [req]
  (let [{app-id :app_id} (req->admin-token! req)
        email (ex/get-param! req [:body :email] email/coerce)
        {user-id :id} (app-user-model/get-by-email! {:app-id app-id
                                                     :email email})]
    (app-user-refresh-token-model/delete-by-user-id! {:app-id app-id
                                                      :user-id user-id})
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
    (if user-id
      (response/ok {:deleted (app-user-model/delete-by-id! {:id user-id :app-id app-id})})
      (response/ok {:deleted nil}))))

(defn magic-code-post [req]
  (let [{app-id :app_id} (req->admin-token! req)
        email (ex/get-param! req [:body :email] email/coerce)
        {user-id :id} (app-user-model/get-or-create-by-email! {:email email :app-id app-id})
        {code :code} (app-user-magic-code-model/create!
                      {:app-id app-id
                       :id (UUID/randomUUID)
                       :code (app-user-magic-code-model/rand-code)
                       :user-id user-id})]
    (response/ok {:code code})))

(comment
  (magic-code-post {:body {:email "hi@marky.fyi"}}))

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

(defn upload-put [req]
  (let [{app-id :app_id} (req->admin-token! req)
        params (:headers req)
        path (ex/get-param! params ["path"] string-util/coerce-non-blank-str)
        file (ex/get-param! req [:body] identity)
        content-type (ex/get-optional-param! params [:content-type] string-util/coerce-non-blank-str)
        data (storage-coordinator/upload-file! {:app-id app-id
                                                :path path
                                                :content-type content-type
                                                :content-length (:content-length req)
                                                :skip-perms-check? true}
                                               file)]
    (response/ok {:data data})))

(defn file-delete [req]
  (let [{app-id :app_id} (req->admin-token! req)
        filename (ex/get-param! req [:params :filename] string-util/coerce-non-blank-str)
        data (storage-coordinator/delete-file! {:app-id app-id
                                                :path filename
                                                :skip-perms-check? true})]
    (response/ok {:data data})))

(defn files-delete [req]
  (let [{app-id :app_id} (req->admin-token! req)
        filenames (ex/get-param! req [:body :filenames] vec)
        data (storage-coordinator/delete-files! {:app-id app-id
                                                 :paths filenames})]
    (response/ok {:data data})))

(comment
  (def counters-app-id  #uuid "5f607e08-b271-489a-8430-108f8d0e22e7")
  (def admin-token #uuid "2483838a-166e-43dc-8a3b-03a224a07aa4")
  (query-post {:body {:query {:x {:y {}}}}
               :headers {"app-id" (str counters-app-id)
                         "authorization" (str "Bearer " admin-token)}})
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

;; Experimental. If we change this let the Kosmik folks know
(defn schema-get [req]
  (let [{app-id :app_id} (req->admin-token! req)
        current-attrs (attr-model/get-by-app-id app-id)
        current-schema (schema-model/attrs->schema current-attrs)]
    (response/ok {:schema (update current-schema
                                  :refs
                                  update-keys
                                  (partial string/join "-"))})))

(defn with-rate-limiting [handler]
  (fn [req]
    (let [app-id (req->app-id! req)]
      (if (flags/app-rate-limited? app-id)
        (ex/throw-rate-limited!)
        (handler req)))))

;; Deprecated storage routes
;; Leaving in for backwards compatibility (deprecated Jan 2025)
;; -------------------------

(defn signed-upload-url-post [req]
  (let [{app-id :app_id} (req->admin-token! req)
        filename (ex/get-param! req [:body :filename] string-util/coerce-non-blank-str)
        data (storage-coordinator/create-upload-url! {:app-id app-id
                                                      :path filename
                                                      :skip-perms-check? true})]
    (response/ok {:data data})))

(defn signed-download-url-get [req]
  (let [{app-id :app_id} (req->admin-token! req)
        filename (ex/get-param! req [:params :filename] string-util/coerce-non-blank-str)
        data (storage-coordinator/create-download-url {:app-id app-id
                                                       :path filename
                                                       :skip-perms-check? true})]
    (response/ok {:data data})))

;; Legacy StorageFile format that was only used by the list() endpoint
(defn legacy-storage-file-format
  [app-id object-metadata]
  {:key (str app-id "/" (:path object-metadata))
   :name (:path object-metadata)
   :size (:content-length object-metadata)
   :etag (:etag object-metadata)
   :last_modified (:last-modified object-metadata)})

(defn files-get [req]
  (let [{app-id :app_id} (req->admin-token! req)
        res (query-post (assoc-in req [:body :query] {:$files {}}))
        files (get-in res [:body "$files"])
        data (map (fn [item]
                    (->> (get item "metadata")
                         w/keywordize-keys
                         (legacy-storage-file-format app-id)))
                  files)]
    (response/ok {:data data})))

(defroutes routes
  (POST "/admin/query" []
    (with-rate-limiting query-post))
  (POST "/admin/transact" []
    (with-rate-limiting transact-post))
  (POST "/admin/query_perms_check" []
    (with-rate-limiting query-perms-check))
  (POST "/admin/transact_perms_check" []
    (with-rate-limiting transact-perms-check))

  (POST "/admin/sign_out" [] sign-out-post)
  (POST "/admin/refresh_tokens" [] refresh-tokens-post)
  (POST "/admin/magic_code" [] magic-code-post)

  (GET "/admin/users", [] app-users-get)
  (DELETE "/admin/users", [] app-users-delete)

  (POST "/admin/storage/signed-upload-url" []
    (with-rate-limiting signed-upload-url-post))
  (GET "/admin/storage/signed-download-url", []
    (with-rate-limiting signed-download-url-get))

  (PUT "/admin/storage/upload" []
    (with-rate-limiting upload-put))
  (GET "/admin/storage/files" []
    (with-rate-limiting files-get))
  (DELETE "/admin/storage/files" []
    (with-rate-limiting file-delete)) ;; single delete
  (POST "/admin/storage/files/delete" []
    (with-rate-limiting files-delete)) ;; bulk delete

  (GET "/admin/schema" [] schema-get))
