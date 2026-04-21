(ns instant.dash.claimable-app
  (:require
   [instant.config :as config]
   [instant.model.app :as app-model]
   [instant.model.instant-user :as instant-user-model]
   [instant.model.rule :as rule-model]
   [instant.model.schema :as schema-model]
   [instant.util.exception :as ex]
   [instant.util.string :as string-util]
   [instant.util.posthog :as posthog]
   [instant.util.uuid :as uuid-util]
   [ring.util.http-response :as response]
   [clojure.walk :as w])
  (:import
   (java.util UUID)))

(def claimable-creator-email (if (= (config/get-env) :dev)
                               "hello+claimableappsdev@instantdb.com"
                               "hello+claimableapps@instantdb.com"))

(def claimable-creator
  (delay
    (instant-user-model/get-by-email {:email claimable-creator-email})))

(defn create!
  [{:keys [title]}]
  (app-model/create!
   {:id (UUID/randomUUID)
    :title title
    :creator-id (:id @claimable-creator)
    :admin-token (UUID/randomUUID)}))

;; -----------
;; HTTP Handler

(defn http-post-handler [req]
  (let [title (ex/get-param! req [:body :title] string-util/coerce-non-blank-str)
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
                    "app:create-claimable"
                    {:app-id (str (:id app))})
    (response/ok {:app app})))

(comment
  (http-post-handler {:body {:title "my-app"}})
  (http-post-handler {:body {:title "my-app"
                             :rules {:code {:ns {:bind ["auth"]}}}}}))

(defn http-get-handler [req]
  (let [app-id (ex/get-param! req [:params :app_id] uuid-util/coerce)
        {app-creator-id :creator_id :as app} (app-model/get-by-id! {:id app-id})]
    (ex/assert-permitted!
     :claimable-app?
     app-id
     (= (:id @claimable-creator) app-creator-id))
    (response/ok {:app app})))

(comment
  (def res (http-post-handler {:body {:title "my-app"}}))
  (http-get-handler {:params {:app_id (-> res :body :app :id str)}}))
