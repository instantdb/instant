(ns instant.storage.routes
  (:require [compojure.core :refer [defroutes POST GET] :as compojure]
            [ring.util.http-response :as response]
            [instant.util.exception :as ex]
            [instant.util.uuid :as uuid-util]
            [instant.util.string :as string-util]
            [instant.util.http :as http-util]
            [instant.model.app :as app-model]
            [instant.model.app-user :as app-user-model]
            [instant.model.rule :as rule-model]
            [instant.storage.s3 :as s3-util]
            [instant.storage.beta :as beta]
            [instant.db.cel :as cel]
            [instant.util.json :refer [->json <-json]]))

(defn buckets-get [_req]
  (let [buckets (s3-util/list-buckets)]
    (response/ok {:data (map #(select-keys % [:name]) buckets)})))

(defn objects-get [req]
  (let [bucket (-> req :params :bucket)
        objects-resp (s3-util/list-objects bucket)
        objects (:object-summaries objects-resp)]
    (response/ok {:data (map #(select-keys % [:key :size :owner :etag]) objects)})))


(comment
  (def b s3-util/default-bucket)
  (buckets-get {})
  (objects-get {:params {:bucket b}}))

(comment
  (def rules {:code
              {"$files" {"bind" ["isLoggedIn" "auth.id != null"]
                         "allow" {"view" "isLoggedIn"
                                  "create" "data.path.contains('demo')"}}}})
  (def program (rule-model/get-program! rules "$files" "create"))
  (cel/eval-program! program {"auth" (cel/->cel-map {"id" "alex"})
                              "data" (cel/->cel-map {"path" "demo/image.png"})}))

(defn assert-storage-permission! [action {:keys [app-id refresh-token filepath]}]
  (let [rules (rule-model/get-by-app-id {:app-id app-id})
        current-user (when refresh-token
                       (app-user-model/get-by-refresh-token {:app-id app-id
                                                             :refresh-token refresh-token}))
        program (rule-model/get-program! rules "$files" action)]
    (ex/assert-permitted!
     :has-storage-permission?
     ["$files" action]
     (if-not program
       ;; deny access by default if no permissions are currently set
       false
       ;; otherwise, evaluate the permissions code
       (cel/eval-program! program
                          {"auth" (cel/->cel-map (<-json (->json current-user)))
                           "data" (cel/->cel-map {"path" filepath})})))))

(defn signed-download-url-get [req]
  (let [app-id-param (ex/get-param! req [:params :app_id] uuid-util/coerce)
        {app-id :id} (app-model/get-by-id! {:id app-id-param})
        _ (beta/assert-storage-enabled! app-id)
        filename (ex/get-param! req [:params :filename] string-util/coerce-non-blank-str)
        refresh-token (http-util/req->bearer-token req)
        expiration (+ (System/currentTimeMillis) (* 1000 60 60 24 7)) ;; 7 days
        object-key (s3-util/->object-key app-id filename)]
    (assert-storage-permission! "view" {:app-id app-id
                                        :refresh-token refresh-token
                                        :filepath filename})
    (response/ok {:data (str (s3-util/signed-download-url object-key expiration))})))

(defn signed-upload-url-post [req]
  (let [app-id-param (ex/get-param! req [:body :app_id] uuid-util/coerce)
        {app-id :id} (app-model/get-by-id! {:id app-id-param})
        _ (beta/assert-storage-enabled! app-id)
        filename (ex/get-param! req [:body :filename] string-util/coerce-non-blank-str)
        refresh-token (http-util/req->bearer-token req)
        object-key (s3-util/->object-key app-id filename)]
    (assert-storage-permission! "create" {:app-id app-id
                                          :refresh-token refresh-token
                                          :filepath filename})
    (response/ok {:data (str (s3-util/signed-upload-url object-key))})))

(defroutes routes
  (POST "/storage/signed-upload-url" [] signed-upload-url-post)
  (GET "/storage/signed-download-url", [] signed-download-url-get))
