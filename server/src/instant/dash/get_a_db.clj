(ns instant.dash.get-a-db
  (:require
   [clojure.walk :as w]
   [instant.model.app :as app-model]
   [instant.model.instant-user :as instant-user-model]
   [instant.model.rule :as rule-model]
   [instant.model.schema :as schema-model]
   [instant.util.exception :as ex]
   [instant.util.posthog :as posthog]
   [instant.util.string :as string-util]
   [instant.util.uuid :as uuid-util]
   [instant.superadmin.routes :refer [req->superadmin-user!]]
   [ring.util.http-response :as response])
  (:import
   (java.util UUID)))

(def get-a-db-creator-email "hello+getadbapps@instantdb.com")

(def get-a-db-creator
  (delay
    (instant-user-model/get-by-email {:email get-a-db-creator-email})))

(defn create!
  [{:keys [title]}]
  (app-model/create!
   {:id (random-uuid)
    :title title
    :creator-id (:id @get-a-db-creator)
    :admin-token (UUID/randomUUID)}))

;; -----------
;; HTTP Handler

(defn http-post-handler [req]
  (let [{user-id :id} (req->superadmin-user! :apps/write req)
        _ (ex/assert-permitted!
           :get-a-db-user?
           user-id
           (= user-id (:id @get-a-db-creator)))
        title (ex/get-param! req [:body :title] string-util/coerce-non-blank-str)
        schema (get-in req [:body :schema])
        rules-code (ex/get-optional-param! req [:body :rules :code] w/stringify-keys)
        _ (when rules-code
            (ex/assert-valid! :rule rules-code (rule-model/validation-errors
                                                rules-code)))
        app (create! {:title title})]
    (when rules-code
      (rule-model/put! {:app-id (:id app)
                        :code rules-code}))
    (when schema
      (->> schema
           (schema-model/plan! {:app-id (:id app)
                                :check-types? true
                                :background-updates? false})
           (schema-model/apply-plan! (:id app))))
    (posthog/track! req
                    "app:create-get-a-db-app"
                    {:app-id (str (:id app))})
    (response/ok {:app app})))

(defn http-get-handler [req]
  (let [app-id (ex/get-param! req [:params :app_id] uuid-util/coerce)
        {app-creator-id :creator_id :as app} (app-model/get-by-id! {:id app-id})]
    (ex/assert-permitted!
     :claimable-app?
     app-id
     (= (:id @get-a-db-creator) app-creator-id))
    (response/ok {:app app})))

(comment
  (def res (http-post-handler {:body {:title "my-app"}}))
  (http-get-handler {:params {:app_id (-> res :body :app :id str)}}))
